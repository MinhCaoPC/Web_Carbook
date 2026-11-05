import { api, session, icon, esc, money, num, fmtDateTime, shortAddr, etherscan, toastErr, toastOk, setBusy, modal, pinBox, alertBox, copyText, emptyHTML, errorHTML, loadingHTML } from '../core.js';
import { go } from '../app.js';

const backBtn = (href) => `<a class="back" href="#${href}" aria-label="Quay lại">${icon('back')}</a>`;
const PENDING_KEY = 'carbook_pending_vnpay';
const NO_WALLET = (a) => !a || /^0x0+$/.test(a);

async function getAddress() {
  try { const d = await api(`/api/wallet/userId/${session.userId}`, { auth: false }); return NO_WALLET(d.walletAddress) ? null : d.walletAddress; } catch { return null; }
}
async function getBalance(addr) {
  const d = await api(`/api/wallet/balance/${addr}`, { auth: false });
  return { balance: Number(d.balance) || 0, available: Number(d.availableBalance ?? d.balance) || 0 };
}
const txIcon = { 'Nạp tiền': ['down', 'green'], 'Rút tiền': ['up', 'red'], 'Thanh toán': ['bus', 'red'], 'Hoàn tiền': ['refresh', 'green'] };
function txRow(t) {
  const [ic, col] = txIcon[t.type] || ['card', 'gray'];
  const pos = String(t.amount).startsWith('+');
  const ok = /Thành công|Hoàn tất/.test(t.status);
  return `<div class="item"><span class="ico ${col}">${icon(ic)}</span>
    <div class="grow"><b>${esc(t.title || t.type)}</b>
      <div class="hint">${fmtDateTime(t.time)} · <span style="color:var(--${ok ? 'success' : 'danger'})">${esc(t.status)}</span></div>
      ${t.txHash ? `<a class="hint mono" target="_blank" rel="noopener" href="${etherscan('tx', esc(t.txHash))}">${esc(shortAddr(t.txHash))} ${icon('ext', 'sm')}</a>` : ''}</div>
    <div class="money tx-amt ${pos ? 'pos' : 'neg'}">${esc(t.amount)}</div></div>`;
}

// ---------- Mã khôi phục ví ----------
function showRecovery(code) {
  return modal(`<h2>Lưu mã khôi phục ví</h2>
    <p class="muted mt-s">Đây là cách <b>DUY NHẤT</b> để khôi phục quyền dùng ví nếu bạn mất quyền truy cập tài khoản. CarbookPay không lưu mã dưới dạng có thể xem lại — hãy ghi lại và cất giữ an toàn, không chia sẻ cho ai.</p>
    <div class="card flat mt center"><div class="hint">Mã khôi phục ví</div><div class="mono" style="font-size:20px;font-weight:700;letter-spacing:.06em;margin:6px 0;user-select:all">${esc(code)}</div>
      <button class="btn sm" id="cp">${icon('copy', 'sm')} Sao chép mã</button></div>
    <div class="actions"><button class="btn primary" data-close="true">Tôi đã lưu mã này</button></div>`,
  { dismissible: false, onMount: (b) => b.querySelector('#cp').addEventListener('click', () => copyText(code, 'Đã sao chép mã khôi phục.')) }).result;
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
  try { api('/api/token/deposit/reconcile-pending', { method: 'POST', body: { userWallet: addr }, auth: false }).catch(() => {}); bal = await getBalance(addr); } catch { /* hiển thị 0 */ }
  ctx.el.innerHTML = `
    <div class="page-head"><div class="grow"><h1>Ví CarbookPay</h1><div class="sub">Quản lý số dư token CAR của bạn.</div></div></div>
    <div class="split">
      <section class="stack">
        <div class="wallet-card">
          <div class="lab">Số dư khả dụng</div>
          <div class="amt">${money(bal.available)}</div>
          ${bal.balance !== bal.available ? `<div class="lab">Tổng số dư ${money(bal.balance)} · đang khóa ${money(bal.balance - bal.available)}</div>` : ''}
          <div class="mt"><span class="addr mono" id="addr">${icon('wallet', 'sm')} ${esc(shortAddr(addr))} <button class="link-btn" id="cp" style="color:#fff;padding:0" aria-label="Sao chép">${icon('copy', 'sm')}</button></span></div>
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
        <div class="card"><div class="row"><span class="ico">${icon('hub')}</span><div><h3 style="margin:0">Mạng Blockchain</h3><div class="hint">Ethereum Sepolia Testnet</div></div></div>
          <p class="muted mt" style="font-size:14px">Ví hoạt động trên hạ tầng blockchain để mọi giao dịch minh bạch và có thể tra cứu công khai.</p>
          <a class="btn block mt" href="#/blockchain">${icon('shield')} Xem minh bạch on-chain</a>
          <a class="btn ghost block mt-s" target="_blank" rel="noopener" href="${etherscan('address', addr)}">${icon('ext')} Xem ví trên Etherscan</a></div>
      </aside>
    </div>`;
  ctx.el.querySelector('#cp').addEventListener('click', () => copyText(addr, 'Đã sao chép địa chỉ ví.'));
  api(`/api/token/history/${addr}`, { auth: false }).then((d) => {
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
      <p class="muted mt-s">Ví được tạo trên blockchain Sepolia, dùng token CAR để thanh toán vé nhanh chóng, không phí gas.</p>
      <label class="check mt" style="text-align:left"><input type="checkbox" id="agree"><span>Tôi đồng ý với điều khoản sử dụng ví CarbookPay.</span></label>
      <div class="err-msg hidden mt-s" id="err"></div>
      <button class="btn primary lg block mt" id="act" disabled>Kích hoạt ví</button>
      <button class="btn ghost block mt-s" id="link">${icon('link')} Liên kết ví đã có</button>
    </div>`;
  const agree = ctx.el.querySelector('#agree'), act = ctx.el.querySelector('#act'), err = ctx.el.querySelector('#err');
  agree.addEventListener('change', () => { act.disabled = !agree.checked; });
  const showErr = (m) => { err.textContent = m; err.classList.toggle('hidden', !m); };

  act.addEventListener('click', async () => {
    showErr('');
    const maPin = await pinBox({ title: 'Đặt mã PIN ví', desc: 'Mã PIN gồm 6 chữ số, dùng để xác nhận mỗi lần thanh toán vé bằng ví.', confirm: true });
    if (!maPin) return;
    setBusy(act, true, 'Đang tạo ví trên blockchain… (có thể mất ~30 giây)');
    try {
      const r = await api('/api/wallet/create', { method: 'POST', body: { userId: session.userId }, auth: false });
      try { await api('/api/wallet-pin/setup', { method: 'POST', body: { maPin } }); } catch (e) { toastErr(new Error('Chưa lưu được mã PIN, hãy đặt lại ở mục Mã PIN. ' + e.message)); }
      if (r.maKhoiPhuc) await showRecovery(r.maKhoiPhuc);
      await alertBox({ title: 'Kích hoạt ví thành công!', html: '<p class="muted">Ví của bạn đã sẵn sàng. Hãy nạp tiền để trải nghiệm thanh toán vé xe nhanh chóng.</p>', ok: 'Tuyệt vời' });
      ctx.reload();
    } catch (e) { showErr(e.message); setBusy(act, false); }
  });

  ctx.el.querySelector('#link').addEventListener('click', () => {
    const m = modal(`<h2>Liên kết ví đã có</h2><p class="muted mt-s">Nhập địa chỉ ví và mã khôi phục ví (không phải private key).</p>
      <form id="lf" class="stack mt"><div class="field"><label>Địa chỉ ví</label><input class="in mono" name="a" placeholder="0x…" autocomplete="off"></div>
      <div class="field"><label>Mã khôi phục</label><input class="in mono" name="k" autocomplete="off"></div>
      <div class="err-msg hidden" id="le"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close="false">Hủy</button><button class="btn primary" type="submit">Liên kết</button></div></form>`);
    const f = m.box.querySelector('#lf'), le = m.box.querySelector('#le');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.a.value.trim() || !f.k.value.trim()) { le.textContent = 'Vui lòng nhập đủ thông tin.'; le.classList.remove('hidden'); return; }
      const btn = f.querySelector('[type=submit]'); setBusy(btn, true);
      try {
        const r = await api('/api/wallet/link', { method: 'POST', body: { userId: session.userId, walletAddress: f.a.value.trim(), maKhoiPhuc: f.k.value.trim() }, auth: false });
        m.close(true);
        const maPin = await pinBox({ title: 'Đặt mã PIN ví', desc: 'PIN được đặt theo tài khoản hiện tại.', confirm: true });
        if (maPin) await api('/api/wallet-pin/setup', { method: 'POST', body: { maPin } }).catch(toastErr);
        if (r.maKhoiPhuc) await showRecovery(r.maKhoiPhuc);
        ctx.reload();
      } catch (e2) { le.textContent = e2.message; le.classList.remove('hidden'); setBusy(btn, false); }
    });
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
      <div class="info-msg">1.000đ = 1 token CAR. Token được mint vào ví sau khi VNPay xác nhận thanh toán.</div>
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
      const r = await api('/api/token/deposit', { method: 'POST', body: { userWallet: addr, amount: v }, auth: false });
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
      const r = await api('/api/token/withdraw/request', { method: 'POST', body: { userWallet: addr, amount: v, bankName: f.bank.value, bankAccount: f.acc.value.trim(), bankAccountName: f.name.value.trim() }, auth: false });
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
        const r = await api('/api/token/withdraw/confirm', { method: 'POST', body: { withdrawId, otp: otp.value.trim() }, auth: false });
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
  const tabs = ['Tất cả', 'Nạp tiền', 'Rút tiền', 'Thanh toán', 'Hoàn tiền'];
  let tab = 'Tất cả', all = [];
  ctx.el.innerHTML = `<div class="page-head">${backBtn('/wallet')}<div class="grow"><h1>Lịch sử giao dịch</h1><div class="sub">Đối chiếu trực tiếp từ sự kiện on-chain.</div></div></div>
    <div class="tabs" id="tabs">${tabs.map((t) => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="card pad-0 mt"><div class="list" id="list">${loadingHTML}</div></div>`;
  const list = ctx.el.querySelector('#list');
  const draw = () => { const a = all.filter((t) => tab === 'Tất cả' || t.type === tab); list.innerHTML = a.length ? a.map(txRow).join('') : emptyHTML('history', 'Không có giao dịch', ''); };
  ctx.el.querySelector('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; ctx.el.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  try { all = (await api(`/api/token/history/${addr}`, { auth: false })).transactions || []; draw(); }
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

// =====================================================================
//  Minh bạch on-chain (dành cho đồ án blockchain)
// =====================================================================
export async function blockchain(ctx) {
  ctx.title('Minh bạch on-chain');
  ctx.wide('mid');
  const addr = await getAddress();
  let info = null; try { info = await api('/api/blockchain/info', { auth: false }); } catch (e) { info = { error: e.message }; }
  if (!ctx.isCurrent()) return;
  const ex = info?.network?.explorer || 'https://sepolia.etherscan.io';
  ctx.el.innerHTML = `
    <div class="page-head">${backBtn('/wallet')}<div class="grow"><h1>Minh bạch on-chain</h1><div class="sub">Mọi giao dịch của CARBOOK đều có thể kiểm chứng công khai trên blockchain.</div></div></div>
    <div class="split">
      <section class="stack">
        <div class="card"><h3>Mạng &amp; smart contract</h3>
          ${info.error ? `<div class="warn-msg">${esc(info.error)}</div>` : `
          <div class="kv"><span>Mạng</span><span>${esc(info.network.name)}</span></div>
          <div class="kv"><span>Chain ID</span><span>${info.network.chainId}</span></div>
          <div class="mt">${info.contracts.map((c) => `<div class="contract"><div class="row between"><b>${esc(c.label)}</b><span class="badge gray">${esc(c.name)}.sol</span></div>
            <a class="mono" target="_blank" rel="noopener" href="${ex}/address/${esc(c.address)}">${esc(c.address)} ${icon('ext', 'sm')}</a></div>`).join('')}</div>`}
        </div>
        ${addr ? `<div class="card"><h3>Ví của bạn</h3><a class="mono" target="_blank" rel="noopener" href="${etherscan('address', addr)}">${esc(addr)} ${icon('ext', 'sm')}</a>
          <h3 class="mt">Giao dịch on-chain</h3><div class="list" id="tx">${loadingHTML}</div></div>` : `<div class="info-msg">Kích hoạt ví để xem giao dịch on-chain của bạn.</div>`}
      </section>
      <aside class="sticky-side"><div class="card"><h3>Cách hoạt động</h3>
        <div class="stack">
          ${[['down', 'green', 'Nạp tiền', 'VNPay xác nhận → backend mint token CAR vào ví của bạn (CARToken.mint).'],
            ['bus', '', 'Thanh toán vé', 'TicketPayment.payForTicket trừ token CAR; relayer trả phí gas, phát sự kiện PaymentSuccess.'],
            ['refresh', 'warn', 'Hoàn tiền', 'Hủy vé trước giờ chạy 4 giờ → Refund.refundTicket hoàn 70% về ví, phát sự kiện RefundSuccess.'],
            ['shield', 'gray', 'Đối chiếu', 'Lịch sử được đọc trực tiếp từ event on-chain, không thể bị chỉnh sửa.']].map(([ic, col, t, d]) => `
            <div class="feature"><span class="ico ${col}">${icon(ic)}</span><div><h4>${t}</h4><p>${d}</p></div></div>`).join('')}
        </div></div></aside>
    </div>`;
  if (addr) {
    api(`/api/token/history/${addr}`, { auth: false }).then((d) => {
      const el = ctx.el.querySelector('#tx'); if (!el) return;
      const a = (d.transactions || []).filter((t) => t.txHash);
      el.innerHTML = a.length ? a.map(txRow).join('') : emptyHTML('hub', 'Chưa có giao dịch on-chain', '');
    }).catch(() => { const el = ctx.el.querySelector('#tx'); if (el) el.innerHTML = '<div class="empty"><p>Không tải được lịch sử.</p></div>'; });
  }
}
