import { api, session, icon, esc, money, num, fmtDateTime, shortAddr, toastErr, toastOk, setBusy, modal, pinBox, alertBox, copyText, emptyHTML, errorHTML, loadingHTML } from '../core.js';
import { go } from '../app.js';

const backBtn = (href) => `<a class="back" href="#${href}" aria-label="Quay lại">${icon('back')}</a>`;
const PENDING_KEY = 'carbook_pending_vnpay';
const NO_WALLET = (a) => !a || /^0x0+$/.test(a);

async function getAddress() {
  try { const d = await api(`/api/wallet/userId/${session.userId}`); return NO_WALLET(d.walletAddress) ? null : d.walletAddress; } catch { return null; }
}
async function getBalance(addr) {
  const d = await api(`/api/wallet/balance/${addr}`);
  return { balance: Number(d.balance) || 0, available: Number(d.availableBalance ?? d.balance) || 0 };
}
const txIcon = { 'Nạp tiền': ['down', 'green'], 'Rút tiền': ['up', 'red'], 'Thanh toán': ['bus', 'red'], 'Hoàn tiền': ['refresh', 'green'], 'Mua vé lại': ['ticket', 'red'], 'Bán vé lại': ['ticket', 'green'] };
function txRow(t) {
  const [ic, col] = txIcon[t.type] || ['card', 'gray'];
  const pos = String(t.amount).startsWith('+');
  const ok = /Thành công|Hoàn tất/.test(t.status);
  return `<div class="item"><span class="ico ${col}">${icon(ic)}</span>
    <div class="grow"><b>${esc(t.title || t.type)}</b>
      <div class="hint">${fmtDateTime(t.time)} · <span style="color:var(--${ok ? 'success' : 'danger'})">${esc(t.status)}</span></div>
      ${t.txHash ? `<div class="hint mono">Mã GD ${esc(shortAddr(t.txHash))}</div>` : ''}</div>
    <div class="money tx-amt ${pos ? 'pos' : 'neg'}">${esc(t.amount)}</div></div>`;
}

// =====================================================================
//  Ví CarbookPay
// =====================================================================
export async function wallet(ctx) {
  ctx.title('Ví CarbookPay');
  const addr = await getAddress();
  if (!ctx.isCurrent()) return;
  if (!addr) return activation(ctx);

  ctx.wide('mid');
  let bal = { balance: 0, available: 0 };
  try { api('/api/token/deposit/reconcile-pending', { method: 'POST', body: { userWallet: addr } }).catch(() => {}); bal = await getBalance(addr); } catch { /* hiển thị 0 */ }
  ctx.el.innerHTML = `
    <div class="page-head"><div class="grow"><h1>Ví CarbookPay</h1><div class="sub">Ví nội CARBOOK — số dư tính bằng VNĐ.</div></div></div>
    <div class="split">
      <section class="stack">
        <div class="wallet-card">
          <div class="lab">Số dư khả dụng</div>
          <div class="amt">${money(bal.available)}</div>
          ${bal.balance !== bal.available ? `<div class="lab">Tổng số dư ${money(bal.balance)} · đang khóa ${money(bal.balance - bal.available)}</div>` : ''}
          <div class="mt"><span class="addr mono" id="addr">${icon('wallet', 'sm')} Mã ví ${esc(addr)} <button class="link-btn" id="cp" style="color:#fff;padding:0" aria-label="Sao chép">${icon('copy', 'sm')}</button></span></div>
        </div>
        <div class="action-grid">
          <a class="action" href="#/wallet/deposit"><span class="ico green">${icon('down')}</span>Nạp tiền</a>
          <a class="action" href="#/wallet/withdraw"><span class="ico red">${icon('up')}</span>Rút tiền</a>
          <a class="action" href="#/wallet/pin"><span class="ico warn">${icon('key')}</span>Mã PIN</a>
          <a class="action" href="#/wallet/history"><span class="ico">${icon('history')}</span>Lịch sử</a>
        </div>
        <div class="card pad-0"><div class="row between" style="padding:16px 18px 6px"><h3 style="margin:0">Giao dịch gần đây</h3><a href="#/wallet/history">Xem tất cả</a></div>
          <div class="list" id="recent">${loadingHTML}</div></div>
      </section>
      <aside class="sticky-side stack">
        <div class="card"><div class="row"><span class="ico">${icon('ticket')}</span><div><h3 style="margin:0">Vé xe là NFT</h3><div class="hint">Blockchain chứng nhận quyền sở hữu vé</div></div></div>
          <p class="muted mt" style="font-size:14px">Tiền trong ví được quản lý trong hệ thống CARBOOK. Mỗi vé đã thanh toán là một NFT: bạn có thể rao bán lại trên chợ vé (giá tối đa 110% giá gốc) và kiểm chứng công khai trên blockchain.</p>
          <a class="btn block mt" href="#/market">${icon('swap')} Chợ vé NFT</a>
          <a class="btn ghost block mt-s" href="#/blockchain">${icon('shield')} Vé NFT của tôi &amp; hợp đồng</a></div>
      </aside>
    </div>`;
  ctx.el.querySelector('#cp').addEventListener('click', () => copyText(addr, 'Đã sao chép địa chỉ ví.'));
  api(`/api/token/history/${addr}`).then((d) => {
    const el = ctx.el.querySelector('#recent'); if (!el) return;
    const arr = (d.transactions || []).slice(0, 4);
    el.innerHTML = arr.length ? arr.map(txRow).join('') : emptyHTML('history', 'Chưa có giao dịch', 'Hãy nạp tiền để bắt đầu.');
  }).catch((e) => { const el = ctx.el.querySelector('#recent'); if (el) el.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; });
}

// ---------- Chưa có ví: kích hoạt / liên kết ----------
function activation(ctx) {
  ctx.wide('narrow');
  ctx.el.innerHTML = `
    <div class="page-head"><div class="grow"><h1>Ví CarbookPay</h1></div></div>
    <div class="card center"><span class="ico" style="margin:0 auto 12px;width:64px;height:64px;border-radius:20px">${icon('wallet', 'lg')}</span>
      <h2>Kích hoạt ví để thanh toán</h2>
      <p class="muted mt-s">Ví nội CARBOOK giúp bạn nạp tiền một lần qua VNPay và thanh toán vé nhanh bằng mã PIN, hoàn tiền về ví ngay khi hủy vé.</p>
      <label class="check mt" style="text-align:left"><input type="checkbox" id="agree"><span>Tôi đồng ý với điều khoản sử dụng ví CarbookPay.</span></label>
      <div class="err-msg hidden mt-s" id="err"></div>
      <button class="btn primary lg block mt" id="act" disabled>Kích hoạt ví</button>
    </div>`;
  const agree = ctx.el.querySelector('#agree'), act = ctx.el.querySelector('#act'), err = ctx.el.querySelector('#err');
  agree.addEventListener('change', () => { act.disabled = !agree.checked; });
  const showErr = (m) => { err.textContent = m; err.classList.toggle('hidden', !m); };

  act.addEventListener('click', async () => {
    showErr('');
    const maPin = await pinBox({ title: 'Đặt mã PIN ví', desc: 'Mã PIN gồm 6 chữ số, dùng để xác nhận mỗi lần thanh toán vé bằng ví.', confirm: true });
    if (!maPin) return;
    setBusy(act, true, 'Đang tạo ví…');
    try {
      const r = await api('/api/wallet/create', { method: 'POST', body: { userId: session.userId } });
      try { await api('/api/wallet-pin/setup', { method: 'POST', body: { maPin } }); } catch (e) { toastErr(new Error('Chưa lưu được mã PIN, hãy đặt lại ở mục Mã PIN. ' + e.message)); }
      await alertBox({ title: 'Kích hoạt ví thành công!', html: '<p class="muted">Ví của bạn đã sẵn sàng. Hãy nạp tiền để trải nghiệm thanh toán vé xe nhanh chóng.</p>', ok: 'Tuyệt vời' });
      ctx.reload();
    } catch (e) { showErr(e.message); setBusy(act, false); }
  });

}

// =====================================================================
//  Nạp tiền (VNPay)
// =====================================================================
const PRESETS = [100000, 200000, 500000, 1000000, 2000000, 5000000];
const LIMIT = [100000, 5000000];

export async function deposit(ctx) {
  ctx.title('Nạp tiền');
  ctx.wide('narrow');
  const addr = await getAddress();
  if (!addr) return go('/wallet', { replace: true });
  let bal = 0; try { bal = (await getBalance(addr)).balance; } catch { /* */ }
  ctx.el.innerHTML = `
    <div class="page-head">${backBtn('/wallet')}<div class="grow"><h1>Nạp tiền</h1><div class="sub">Số dư hiện tại: <b>${money(bal)}</b></div></div></div>
    <div class="card stack">
      <div class="field"><label for="amt">Số tiền nạp (VNĐ)</label>
        <input class="in" id="amt" inputmode="numeric" placeholder="Nhập số tiền" style="font-size:22px;font-weight:700;height:56px" autocomplete="off">
        <div class="hint">Tối thiểu ${num(LIMIT[0])}đ · tối đa ${num(LIMIT[1])}đ mỗi lần</div></div>
      <div class="amount-presets">${PRESETS.map((p) => `<button type="button" data-p="${p}">${num(p)}</button>`).join('')}</div>
      <div class="method on"><span class="ico green">${icon('card')}</span><div class="grow"><b>VNPAY Sandbox</b><div class="hint">Thẻ ATM/ngân hàng nội địa — thử nghiệm</div></div>${icon('check')}</div>
      <div class="info-msg">Tiền được cộng vào ví CarbookPay ngay sau khi VNPay xác nhận thanh toán.</div>
      <div class="err-msg hidden" id="err"></div>
      <button class="btn primary lg block" id="go">Nạp tiền qua VNPay</button>
    </div>`;
  const inp = ctx.el.querySelector('#amt'), err = ctx.el.querySelector('#err'), btn = ctx.el.querySelector('#go');
  const val = () => Number(inp.value.replace(/\D/g, '')) || 0;
  const sync = () => { const v = val(); inp.value = v ? num(v) : ''; ctx.el.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('on', +b.dataset.p === v)); };
  inp.addEventListener('input', sync);
  ctx.el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { inp.value = num(b.dataset.p); sync(); }));
  btn.addEventListener('click', async () => {
    const v = val(); err.classList.add('hidden');
    if (v < LIMIT[0] || v > LIMIT[1]) { err.textContent = `Số tiền nạp tối thiểu ${num(LIMIT[0])}đ và tối đa ${num(LIMIT[1])}đ.`; err.classList.remove('hidden'); return; }
    setBusy(btn, true, 'Đang chuyển tới VNPay…');
    try {
      const r = await api('/api/token/deposit', { method: 'POST', body: { userWallet: addr, amount: v } });
      if (!r.paymentUrl) throw new Error(r.message || 'Không thể tạo liên kết thanh toán VNPay.');
      localStorage.setItem(PENDING_KEY, JSON.stringify({ kind: 'deposit', orderId: String(r.orderId || ''), amount: v }));
      location.href = r.paymentUrl;
    } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); setBusy(btn, false); }
  });
}

// =====================================================================
//  Rút tiền
// =====================================================================
const BANKS = ['Vietcombank', 'MB Bank', 'Techcombank', 'BIDV', 'Agribank', 'VietinBank', 'ACB', 'TPBank'];
export async function withdraw(ctx) {
  ctx.title('Rút tiền');
  ctx.wide('narrow');
  const addr = await getAddress();
  if (!addr) return go('/wallet', { replace: true });
  let bal = { balance: 0, available: 0 }; try { bal = await getBalance(addr); } catch { /* */ }
  ctx.el.innerHTML = `
    <div class="page-head">${backBtn('/wallet')}<div class="grow"><h1>Rút tiền</h1><div class="sub">Số dư khả dụng: <b>${money(bal.available)}</b></div></div></div>
    <form class="card stack" id="wf" novalidate>
      <div class="field"><label for="amt">Số tiền rút (VNĐ)</label><input class="in" id="amt" inputmode="numeric" placeholder="Nhập số tiền" style="font-size:22px;font-weight:700;height:56px" autocomplete="off">
        <div class="hint">Tối thiểu ${num(LIMIT[0])}đ · tối đa ${num(LIMIT[1])}đ mỗi lần</div></div>
      <div class="field"><label>Ngân hàng nhận</label><select class="in" id="bank">${BANKS.map((b) => `<option>${b}</option>`).join('')}</select></div>
      <div class="field"><label>Số tài khoản</label><input class="in" id="acc" inputmode="numeric" autocomplete="off"></div>
      <div class="field"><label>Tên chủ tài khoản</label><input class="in" id="name" autocomplete="off" style="text-transform:uppercase"></div>
      <div class="err-msg hidden" id="err"></div>
      <button class="btn primary lg block" type="submit">Tiếp tục</button>
    </form>`;
  const f = ctx.el.querySelector('#wf'), err = ctx.el.querySelector('#err'), amt = f.querySelector('#amt');
  amt.addEventListener('input', () => { const v = Number(amt.value.replace(/\D/g, '')) || 0; amt.value = v ? num(v) : ''; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Number(amt.value.replace(/\D/g, '')) || 0, bad = (m) => { err.textContent = m; err.classList.remove('hidden'); };
    if (v < LIMIT[0] || v > LIMIT[1]) return bad(`Số tiền rút tối thiểu ${num(LIMIT[0])}đ và tối đa ${num(LIMIT[1])}đ.`);
    if (v > bal.available) return bad('Số tiền rút vượt quá số dư khả dụng trong ví.');
    if (!f.acc.value.trim()) return bad('Vui lòng nhập số tài khoản ngân hàng nhận tiền.');
    if (!f.name.value.trim()) return bad('Vui lòng nhập tên chủ tài khoản nhận tiền.');
    err.classList.add('hidden');
    const btn = f.querySelector('[type=submit]'); setBusy(btn, true);
    try {
      const r = await api('/api/token/withdraw/request', { method: 'POST', body: { userWallet: addr, amount: v, bankName: f.bank.value, bankAccount: f.acc.value.trim(), bankAccountName: f.name.value.trim() } });
      if (!r.requireOtp) throw new Error(r.message || 'Yêu cầu rút tiền không thành công.');
      setBusy(btn, false);
      askOtp(r.withdrawId, v, `${f.bank.value} (${f.acc.value.trim()})`);
    } catch (e2) { bad(e2.message); setBusy(btn, false); }
  });

  function askOtp(withdrawId, amount, dest) {
    const m = modal(`<h2>Xác nhận rút tiền</h2><p class="muted mt-s">Nhập mã OTP đã được gửi tới email của bạn để xác nhận rút <b>${money(amount)}</b>.</p>
      <div class="field mt"><input class="in center" id="otp" inputmode="numeric" maxlength="6" placeholder="••••••" style="font-size:24px;letter-spacing:.3em;font-weight:700;height:56px" autocomplete="one-time-code"></div>
      <div class="err-msg hidden mt-s" id="oe"></div>
      <div class="actions"><button class="btn ghost" data-close="false">Hủy</button><button class="btn primary" id="ok">Xác nhận</button></div>`);
    const otp = m.box.querySelector('#otp'), oe = m.box.querySelector('#oe'), ok = m.box.querySelector('#ok');
    otp.focus();
    const submit = async () => {
      if (otp.value.trim().length !== 6) { oe.textContent = 'Mã OTP gồm 6 chữ số.'; oe.classList.remove('hidden'); return; }
      setBusy(ok, true);
      try {
        const r = await api('/api/token/withdraw/confirm', { method: 'POST', body: { withdrawId, otp: otp.value.trim() } });
        if (r.success === false) throw new Error(r.message);
        m.close(true);
        ctx.wide('narrow');
        ctx.el.innerHTML = `<div class="success-hero"><div class="tick">${icon('check')}</div><h1>Rút tiền thành công!</h1><p class="muted mt-s">Yêu cầu rút tiền của bạn đã được xử lý.</p></div>
          <div class="card mt"><div class="kv"><span>Số tiền</span><span class="money">${money(amount)}</span></div><div class="kv"><span>Ngân hàng nhận</span><span>${esc(dest)}</span></div>
          <div class="kv"><span>Mã giao dịch</span><span class="mono">${esc(withdrawId)}</span></div></div>
          <div class="stack mt"><a class="btn primary lg block" href="#/wallet">Về ví CarbookPay</a></div>`;
      } catch (e) { oe.textContent = e.message; oe.classList.remove('hidden'); setBusy(ok, false); }
    };
    ok.addEventListener('click', submit);
    otp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }
}

// =====================================================================
//  Lịch sử giao dịch ví
// =====================================================================
export async function txHistory(ctx) {
  ctx.title('Lịch sử giao dịch');
  ctx.wide('mid');
  const addr = await getAddress();
  if (!addr) return go('/wallet', { replace: true });
  const tabs = ['Tất cả', 'Nạp tiền', 'Rút tiền', 'Thanh toán', 'Hoàn tiền', 'Mua vé lại', 'Bán vé lại'];
  let tab = 'Tất cả', all = [];
  ctx.el.innerHTML = `<div class="page-head">${backBtn('/wallet')}<div class="grow"><h1>Lịch sử giao dịch</h1><div class="sub">Mọi biến động số dư đều có dòng sổ cái đi kèm.</div></div></div>
    <div class="tabs" id="tabs">${tabs.map((t) => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="card pad-0 mt"><div class="list" id="list">${loadingHTML}</div></div>`;
  const list = ctx.el.querySelector('#list');
  const draw = () => { const a = all.filter((t) => tab === 'Tất cả' || t.type === tab); list.innerHTML = a.length ? a.map(txRow).join('') : emptyHTML('history', 'Không có giao dịch', ''); };
  ctx.el.querySelector('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; ctx.el.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  try { all = (await api(`/api/token/history/${addr}`)).transactions || []; draw(); }
  catch (e) { list.innerHTML = errorHTML(e.message); list.querySelector('[data-retry]')?.addEventListener('click', () => ctx.reload()); }
}

// =====================================================================
//  Mã PIN ví (email → OTP → PIN mới)
// =====================================================================
export async function pin(ctx) {
  ctx.title('Mã PIN ví');
  ctx.wide('narrow');
  let has = false; try { has = (await api('/api/wallet-pin/status')).daDatPin; } catch { /* */ }
  let step = 1, email = session.user?.email || '';
  const draw = () => {
    ctx.el.innerHTML = `<div class="page-head">${backBtn('/wallet')}<div class="grow"><h1>Mã PIN ví</h1><div class="sub">${has ? 'Đổi mã PIN' : 'Đặt mã PIN'} bằng xác thực email + OTP.</div></div></div>
      <form class="card stack" id="f" novalidate>
        <div class="steps"><span class="on"></span><span class="${step === 2 ? 'on' : ''}"></span></div>
        ${step === 1 ? `<h3 style="margin:0">Bước 1/2 — Xác thực email</h3>
          <div class="field"><label>Email đã đăng ký tài khoản</label><input class="in" name="em" type="email" value="${esc(email)}" autocomplete="email"></div>`
          : `<h3 style="margin:0">Bước 2/2 — Nhập OTP và mã PIN mới</h3>
          <p class="muted">Mã OTP đã được gửi tới ${esc(email)}.</p>
          <div class="field"><label>Mã OTP</label><input class="in" name="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
          <div class="field"><label>Mã PIN mới (6 số)</label><input class="in" name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
          <div class="field"><label>Nhập lại mã PIN</label><input class="in" name="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
          <button type="button" class="link-btn" id="resend" style="align-self:flex-start">Gửi lại mã OTP</button>`}
        <div class="err-msg hidden" id="err"></div>
        <button class="btn primary lg block" type="submit">${step === 1 ? 'Gửi mã OTP' : 'Lưu mã PIN'}</button>
      </form>`;
    const f = ctx.el.querySelector('#f'), err = ctx.el.querySelector('#err'), btn = f.querySelector('[type=submit]');
    const bad = (m) => { err.textContent = m; err.classList.remove('hidden'); };
    ctx.el.querySelector('#resend')?.addEventListener('click', () => api('/api/wallet-pin/request-otp', { method: 'POST', body: { email } }).then(() => toastOk('Đã gửi lại mã OTP.')).catch(toastErr));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); err.classList.add('hidden');
      try {
        if (step === 1) {
          email = f.em.value.trim(); if (!/^\S+@\S+\.\S+$/.test(email)) return bad('Email không hợp lệ.');
          setBusy(btn, true); await api('/api/wallet-pin/request-otp', { method: 'POST', body: { email } }); toastOk('Mã OTP đã được gửi đến email của bạn.'); step = 2; draw();
        } else {
          if (f.otp.value.trim().length !== 6) return bad('Mã OTP gồm 6 chữ số.');
          if (!/^\d{6}$/.test(f.pin.value)) return bad('Mã PIN phải gồm đúng 6 chữ số.');
          if (f.pin.value !== f.pin2.value) return bad('Mã PIN nhập lại không khớp.');
          setBusy(btn, true); await api('/api/wallet-pin/confirm', { method: 'POST', body: { otp: f.otp.value.trim(), maPin: f.pin.value } });
          toastOk('Đặt mã PIN ví thành công.'); go('/wallet');
        }
      } catch (e2) { bad(e2.message); setBusy(btn, false); }
    });
  };
  draw();
}
