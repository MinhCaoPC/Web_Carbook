import { api, session, icon, esc, money, ymd, toastErr, toastOk, fmtDate, weekdayLong } from '../core.js';
import { go } from '../app.js';

const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'; };

export async function home(ctx) {
  ctx.title('');
  const user = session.user || {};
  const today = new Date();
  const q = ctx.query;

  ctx.el.innerHTML = `
    <section class="hero">
      <div class="hello">${greeting()},</div>
      <h1>${esc(user.firstName || user.fullName || 'bạn')} 👋<br class="mobile-br"> Hôm nay bạn đi đâu?</h1>
      <p>Đặt vé xe khách miền Tây nhanh chóng, thanh toán bằng ví CarbookPay — mỗi vé là một NFT của riêng bạn.</p>
      <div class="hero-wallet" id="hero-wallet"><div class="skel" style="width:160px;height:40px"></div></div>
    </section>

    <form class="card search-card" id="sf" novalidate>
      <div class="search-grid">
        <div class="field"><label for="from">Điểm đi</label>
          <div class="ctrl">${icon('pin')}<input class="in" id="from" list="loc-from" placeholder="Chọn điểm đi" autocomplete="off" value="${esc(q.from || '')}"></div></div>
        <button type="button" class="swap" id="swap" aria-label="Đổi chiều">${icon('swap')}</button>
        <div class="field"><label for="to">Điểm đến</label>
          <div class="ctrl">${icon('pin')}<input class="in" id="to" list="loc-to" placeholder="Chọn điểm đến" autocomplete="off" value="${esc(q.to || '')}"></div></div>
        <div class="span-all search-row2" style="display:grid;gap:12px">
          <div class="field"><label for="date">Ngày đi</label>
            <div class="ctrl">${icon('calendar')}<select class="in" id="date"><option value="">Đang tải…</option></select></div></div>
          <div class="field"><label for="qty">Số vé</label>
            <div class="ctrl">${icon('users')}<select class="in" id="qty">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} vé</option>`).join('')}</select></div></div>
          <button class="btn primary lg" type="submit" style="align-self:end">${icon('search')} Tìm chuyến xe</button>
        </div>
      </div>
      <datalist id="loc-from"></datalist><datalist id="loc-to"></datalist>
      <div class="err-msg hidden mt-s" id="err"></div>
    </form>

    <div id="recent" class="mt"></div>

    <div class="mt-l grid cols-4 qa-grid">
      <a class="qa" href="#/history"><span class="ico">${icon('ticket')}</span>Vé của tôi</a>
      <a class="qa" href="#/wallet"><span class="ico green">${icon('wallet')}</span>Ví CarbookPay</a>
      <a class="qa" href="#/market"><span class="ico warn">${icon('swap')}</span>Chợ vé NFT</a>
      <a class="qa" href="#/support"><span class="ico gray">${icon('headset')}</span>Hỗ trợ</a>
    </div>

    <div class="mt-l"><div class="sec-title">Vì sao chọn CARBOOK</div>
      <div class="grid cols-3">
        <div class="card feature"><span class="ico">${icon('ticket')}</span><div><h4>Vé là NFT, như vé concert</h4><p>Mỗi vé đã thanh toán được phát hành thành một NFT trên blockchain — chống vé giả, kiểm chứng công khai.</p></div></div>
        <div class="card feature"><span class="ico green">${icon('swap')}</span><div><h4>Bán lại vé an toàn</h4><p>Không đi được? Rao bán trên chợ vé với giá tối đa 110% giá gốc — chống phe vé, QR mới cho người mua.</p></div></div>
        <div class="card feature"><span class="ico warn">${icon('refresh')}</span><div><h4>Hoàn tiền tự động</h4><p>Hủy vé trước giờ chạy 4 tiếng, hoàn 70% giá vé về ví CarbookPay ngay lập tức.</p></div></div>
      </div>
    </div>`;

  const f = ctx.el.querySelector('#sf'), err = ctx.el.querySelector('#err');
  const bad = (m) => { err.textContent = m; err.classList.remove('hidden'); };

  // Chỉ cho chọn tuyến CÓ THẬT (điểm đến phụ thuộc điểm đi) và đúng các ngày đã mở bán
  let tuyen = [];
  const optList = (arr) => [...new Set(arr)].map((l) => `<option value="${esc(l)}">`).join('');
  const refreshTo = () => {
    const from = f.from.value.trim();
    ctx.el.querySelector('#loc-to').innerHTML = optList(tuyen.filter((t) => !from || t.from === from).map((t) => t.to));
  };
  api('/api/trips/tuyen', { auth: false }).then((d) => {
    tuyen = d.tuyen || [];
    ctx.el.querySelector('#loc-from').innerHTML = optList(tuyen.map((t) => t.from));
    refreshTo();
  }).catch(() => {});
  f.from.addEventListener('input', refreshTo);

  const dateSel = ctx.el.querySelector('#date');
  api('/api/trips/ngay-cho-phep', { auth: false }).then((d) => {
    const days = d.danhSachNgay || [ymd(today)];
    dateSel.innerHTML = days.map((v, i) => `<option value="${v}">${i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : weekdayLong(new Date(v + 'T00:00:00'))} · ${fmtDate(new Date(v + 'T00:00:00')).slice(0, 5)}</option>`).join('');
    if (q.date && days.includes(q.date)) dateSel.value = q.date;
  }).catch(() => { dateSel.innerHTML = `<option value="${ymd(today)}">Hôm nay</option>`; });

  f.querySelector('#swap').addEventListener('click', () => { const t = f.from.value; f.from.value = f.to.value; f.to.value = t; refreshTo(); });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const from = f.from.value.trim(), to = f.to.value.trim();
    if (!from || !to) return bad('Vui lòng chọn điểm đi và điểm đến.');
    if (from === to) return bad('Điểm đi và điểm đến không được trùng nhau.');
    if (!f.date.value) return bad('Vui lòng chọn ngày đi.');
    if (tuyen.length && !tuyen.some((t) => t.from === from && t.to === to)) {
      const goi = tuyen.filter((t) => t.from === from).map((t) => t.to);
      return bad(goi.length ? `Chưa có tuyến ${from} → ${to}. Từ ${from} hiện có: ${goi.slice(0, 4).join(', ')}${goi.length > 4 ? '…' : ''}.` : `Chưa có chuyến khởi hành từ "${from}". Hãy chọn điểm đi trong danh sách gợi ý.`);
    }
    err.classList.add('hidden');
    go(`/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${f.date.value}&qty=${f.qty.value}`);
  });

  // Ví (tóm tắt)
  loadWalletMini(ctx);
  // Tìm kiếm gần đây
  loadRecent(ctx, f);
}

async function loadWalletMini(ctx) {
  const box = ctx.el.querySelector('#hero-wallet');
  try {
    const d = await api(`/api/wallet/userId/${session.userId}`);
    const addr = d.walletAddress;
    if (!addr || /^0x0+$/.test(addr)) throw new Error('none');
    api('/api/token/deposit/reconcile-pending', { method: 'POST', body: { userWallet: addr } }).catch(() => {});
    const b = await api(`/api/wallet/balance/${addr}`);
    if (!ctx.isCurrent()) return;
    box.innerHTML = `<span class="ico" style="background:rgba(255,255,255,.18);color:#fff">${icon('wallet')}</span>
      <div><small>Số dư ví CarbookPay</small><div class="bal">${money(b.balance)}</div></div>
      <a class="btn sm" style="background:#fff;color:var(--navy)" href="#/wallet/deposit">${icon('plus', 'sm')} Nạp tiền</a>`;
  } catch {
    if (!ctx.isCurrent()) return;
    box.innerHTML = `<span class="ico" style="background:rgba(255,255,255,.18);color:#fff">${icon('wallet')}</span>
      <div><small>Ví CarbookPay</small><div style="font-weight:700">Chưa kích hoạt</div></div>
      <a class="btn sm" style="background:#fff;color:var(--navy)" href="#/wallet">Kích hoạt ví</a>`;
  }
}

async function loadRecent(ctx, f) {
  const box = ctx.el.querySelector('#recent');
  try {
    const d = await api('/api/tim-kiem/gan-day');
    const list = d.danhSach || [];
    if (!list.length || !ctx.isCurrent()) return;
    box.innerHTML = `<div class="row between"><div class="sec-title" style="margin:0">Tìm kiếm gần đây</div><button class="link-btn" id="clr">Xóa</button></div>
      <div class="chips mt-s">${list.map((r, i) => `<button class="chip" data-i="${i}">${icon('history', 'sm')}${esc(r.diemDi)} → ${esc(r.diemDen)}</button>`).join('')}</div>`;
    box.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      const r = list[b.dataset.i];
      f.from.value = r.diemDi; f.to.value = r.diemDen; f.qty.value = Math.min(5, Math.max(1, +r.soLuongVe || 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    box.querySelector('#clr').addEventListener('click', async () => {
      try { await api('/api/tim-kiem/gan-day', { method: 'DELETE' }); box.innerHTML = ''; toastOk('Đã xóa lịch sử tìm kiếm.'); } catch (e) { toastErr(e); }
    });
  } catch { /* không có lịch sử */ }
}
