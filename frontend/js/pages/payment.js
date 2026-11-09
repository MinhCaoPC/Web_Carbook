import { api, session, icon, esc, money, fmtTime, fmtDateTime, duration, toastErr, toastOk, setBusy, pinBox, alertBox, errorHTML, loadingHTML } from '../core.js';
import { go } from '../app.js';
import { normBooking } from '../model.js';

const backBtn = (href) => `<a class="back" href="#${href}" aria-label="Quay lại">${icon('back')}</a>`;
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const PENDING_KEY = 'carbook_pending_vnpay';

// =====================================================================
//  Thanh toán
// =====================================================================
export async function payment(ctx) {
  const ids = (ctx.query.ids || '').split(',').filter(Boolean);
  if (!ids.length) return go('/', { replace: true });
  ctx.title('Thanh toán');

  let info;
  try { info = normBooking(await api('/api/dat-ve/thanh-toan', { query: { danhSachMaDatVe: ids.join(',') } })); }
  catch (e) {
    ctx.el.innerHTML = `<div class="page-head">${backBtn('/history')}<h1>Thanh toán</h1></div>${errorHTML(e.message)}`;
    ctx.el.querySelector('[data-retry]')?.addEventListener('click', () => ctx.reload());
    return;
  }

  // Số dư ví (để cảnh báo thiếu tiền)
  let balance = null;
  try {
    const w = await api(`/api/wallet/userId/${session.userId}`);
    if (w.walletAddress && !/^0x0+$/.test(w.walletAddress)) balance = Number((await api(`/api/wallet/balance/${w.walletAddress}`)).balance) || 0;
  } catch { /* chưa có ví */ }

  const total = info.tongTien + info.phiThanhToan;
  let method = 'CARBOOKPAY', paid = false, leaving = false;
  let remain = info.hetHanGiu ? Math.max(0, Math.round((info.hetHanGiu - Date.now()) / 1000)) : 3600;

  ctx.el.innerHTML = `
    <div class="page-head">${backBtn(`/passenger?ids=${encodeURIComponent(ids.join(','))}`)}<div class="grow"><h1>Thanh toán</h1><div class="sub">Hoàn tất thanh toán trước khi hết thời gian giữ chỗ.</div></div>
      <span class="timer" id="timer">${icon('clock', 'sm')}<span id="tm">${mmss(remain)}</span></span></div>
    <div class="split">
      <section class="stack">
        <div class="card">
          <h3>Chuyến đi</h3>
          <div class="trip-main">
            <div class="t-time">${fmtTime(info.xuatPhat)}<small>${esc(info.diemKhoiHanh)}</small></div>
            <div class="t-line">${duration(info.xuatPhat, info.denDich)}<div class="bar"></div></div>
            <div class="t-time" style="text-align:right">${fmtTime(info.denDich)}<small style="margin-left:auto">${esc(info.diemKetThuc)}</small></div>
          </div>
          <div class="mt">
            <div class="kv"><span>Khởi hành</span><span>${fmtDateTime(info.xuatPhat)}</span></div>
            <div class="kv"><span>Xe</span><span>${esc(info.tenXe)}${info.bienSoXe ? ' · ' + esc(info.bienSoXe) : ''}</span></div>
            <div class="kv"><span>Ghế</span><span>${esc(info.ghe.join(', '))}</span></div>
            <div class="kv"><span>Hành khách</span><span>${esc(info.hoTen)} · ${esc(info.sdt)}</span></div>
            ${info.diemDon ? `<div class="kv"><span>Điểm đón</span><span>${esc(info.diemDon.tenDiem)}</span></div>` : ''}
            ${info.diemTra ? `<div class="kv"><span>Điểm trả</span><span>${esc(info.diemTra.tenDiem)}</span></div>` : ''}
          </div>
        </div>
        <div class="card">
          <h3>Phương thức thanh toán</h3>
          <div class="stack">
            <label class="method on" data-m="CARBOOKPAY"><input type="radio" name="m" checked>
              <span class="ico">${icon('wallet')}</span>
              <div class="grow"><b>Ví CarbookPay</b><div class="hint">Trừ tiền trong ví — xác nhận bằng mã PIN</div>
                ${balance !== null ? `<div class="hint" style="margin-top:2px">Số dư: <b>${money(balance)}</b>${balance < total ? ' · <span style="color:var(--danger)">không đủ</span>' : ''}</div>` : `<div class="hint" style="margin-top:2px;color:var(--warn)">Bạn chưa kích hoạt ví</div>`}</div></label>
            <label class="method" data-m="VNPAY"><input type="radio" name="m">
              <span class="ico green">${icon('card')}</span>
              <div class="grow"><b>VNPay</b><div class="hint">Thẻ ATM/ngân hàng nội địa qua cổng VNPay</div></div></label>
          </div>
        </div>
      </section>
      <aside class="sticky-side"><div class="card">
        <h3>Chi tiết thanh toán</h3>
        <div class="kv"><span>Giá vé (${info.ghe.length} ghế)</span><span>${money(info.tongTien)}</span></div>
        <div class="kv"><span>Phí thanh toán</span><span>${money(info.phiThanhToan)}</span></div>
        <div class="kv"><span>Thanh toán</span><span class="money" style="color:var(--primary);font-size:22px">${money(total)}</span></div>
        <div class="err-msg hidden mt" id="expired">Đã hết thời gian giữ chỗ. Vui lòng chọn ghế lại.</div>
        <button class="btn primary lg block mt" id="pay">Thanh toán ${money(total)}</button>
      </div></aside>
    </div>`;

  const payBtn = ctx.el.querySelector('#pay');
  ctx.el.querySelectorAll('.method').forEach((m) => m.addEventListener('click', () => {
    method = m.dataset.m;
    ctx.el.querySelectorAll('.method').forEach((x) => { x.classList.toggle('on', x === m); x.querySelector('input').checked = x === m; });
  }));

  const timerEl = ctx.el.querySelector('#timer'), tm = ctx.el.querySelector('#tm');
  const tick = setInterval(() => {
    remain = Math.max(0, remain - 1);
    tm.textContent = mmss(remain);
    timerEl.classList.toggle('low', remain < 300);
    if (remain === 0) { clearInterval(tick); payBtn.disabled = true; ctx.el.querySelector('#expired').classList.remove('hidden'); }
  }, 1000);
  ctx.onLeave(() => {
    clearInterval(tick);
    // Rời trang khi chưa trả tiền -> tạo thông báo nhắc trong app (như app cũ)
    if (!paid && !leaving && remain > 0) api('/api/notifications/payment-reminder', { method: 'POST', body: { danhSachMaDatVe: ids } }).catch(() => {});
  });
  if (remain === 0) { payBtn.disabled = true; ctx.el.querySelector('#expired').classList.remove('hidden'); }

  payBtn.addEventListener('click', async () => {
    if (method === 'VNPAY') {
      setBusy(payBtn, true, 'Đang chuyển tới VNPay…');
      try {
        const r = await api('/api/thanh-toan/vnpay', { method: 'POST', body: { maKhachHang: session.maKH, danhSachMaDatVe: ids } });
        localStorage.setItem(PENDING_KEY, JSON.stringify({ kind: 'ticket', orderId: r.orderId, ids }));
        leaving = true;
        location.href = r.paymentUrl;
      } catch (e) { toastErr(e); setBusy(payBtn, false); }
      return;
    }
    // Ví CarbookPay: cần PIN
    try {
      const st = await api('/api/wallet-pin/status');
      if (!st.daDatPin) {
        await alertBox({ title: 'Chưa có mã PIN ví', html: '<p class="muted">Bạn cần kích hoạt ví và đặt mã PIN trong mục <b>Ví CarbookPay</b> trước khi thanh toán bằng ví.</p>' });
        return go('/wallet');
      }
    } catch (e) { return toastErr(e); }
    const maPin = await pinBox({ title: 'Nhập mã PIN ví', desc: `Xác nhận thanh toán ${money(total)}` });
    if (!maPin) return;
    setBusy(payBtn, true, 'Đang thanh toán…');
    try {
      const r = await api('/api/thanh-toan', { method: 'POST', body: { maKhachHang: session.maKH, danhSachMaDatVe: ids, phuongThucTT: 'CARBOOKPAY', maPin } });
      paid = true;
      go(`/payment-result?ids=${encodeURIComponent(ids.join(','))}&tong=${r.tongTien ?? total}`, { replace: true });
    } catch (e) { toastErr(e); setBusy(payBtn, false); }
  });
}

// =====================================================================
//  Kết quả thanh toán thành công
// =====================================================================
export async function result(ctx) {
  const ids = (ctx.query.ids || '').split(',').filter(Boolean);
  if (!ids.length) return go('/history', { replace: true });
  ctx.title('Thanh toán thành công');
  ctx.wide('narrow');
  let info = null;
  try { info = normBooking(await api('/api/dat-ve/kiem-tra', { query: { danhSachMaDatVe: ids.join(',') } })); } catch { /* vẫn hiển thị thành công */ }
  const hd = info?.hoaDon?.[0];
  ctx.el.innerHTML = `
    <div class="success-hero"><div class="tick">${icon('check')}</div>
      <h1>Thanh toán thành công!</h1>
      <p class="muted mt-s">Vé của bạn đã được xác nhận. Mã QR lên xe có trong mục "Vé của tôi".</p></div>
    <div class="card mt">
      <div class="kv"><span>Số tiền</span><span class="money">${money(ctx.query.tong || info?.tongTien)}</span></div>
      ${info ? `<div class="kv"><span>Tuyến</span><span>${esc(info.diemKhoiHanh)} → ${esc(info.diemKetThuc)}</span></div>
        <div class="kv"><span>Khởi hành</span><span>${fmtDateTime(info.xuatPhat)}</span></div>
        <div class="kv"><span>Ghế</span><span>${esc(info.ghe.join(', '))}</span></div>` : ''}
      ${hd ? `<div class="kv"><span>Phương thức</span><span>${hd.phuongThucTT === 'VNPAY' ? 'VNPay' : 'Ví CarbookPay'}</span></div>
        ${hd.txHash ? `<div class="kv"><span>Mã giao dịch</span><span class="mono">${esc(hd.txHash)}</span></div>` : ''}` : ''}
      <div class="info-msg mt-s">Vé của bạn đang được phát hành dưới dạng <b>NFT</b> trên blockchain. Xem trong mục "Vé của tôi".</div>
    </div>
    <div class="stack mt">
      <a class="btn primary lg block" href="#/ticket?ids=${encodeURIComponent(ids.join(','))}">${icon('ticket')} Xem vé lên xe</a>
      <a class="btn ghost lg block" href="#/">Về trang chủ</a>
    </div>`;
}

// =====================================================================
//  Quay về từ VNPay (vé hoặc nạp tiền): đối soát rồi chuyển trang
// =====================================================================
export async function vnpayDone(ctx) {
  ctx.title('Đang xác nhận giao dịch');
  ctx.wide('narrow');
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { /* */ }
  if (!pending) return go('/history', { replace: true });

  ctx.el.innerHTML = `<div class="success-hero"><div class="loading"><div class="spinner"></div></div>
    <h2>Đang xác nhận giao dịch…</h2><p class="muted mt-s">Vui lòng không đóng trang. Việc này có thể mất vài chục giây.</p></div>`;

  const isTicket = pending.kind === 'ticket';
  const attempts = isTicket ? 6 : 12, wait = isTicket ? 3000 : 5000;
  let status = 'PENDING';
  for (let i = 0; i < attempts && ctx.isCurrent(); i++) {
    try {
      const r = isTicket
        ? await api('/api/thanh-toan/vnpay-reconcile', { method: 'POST', body: { orderId: pending.orderId } })
        : await api('/api/token/deposit/reconcile', { method: 'POST', body: { orderId: pending.orderId } });
      status = r.status || 'PENDING';
      if (status === 'SUCCESS' || status === 'FAILED') break;
    } catch { /* thử lại */ }
    await new Promise((r) => setTimeout(r, wait));
  }
  if (!ctx.isCurrent()) return;

  if (status !== 'PENDING' && status !== 'PROCESSING') localStorage.removeItem(PENDING_KEY);

  if (status === 'SUCCESS') {
    if (isTicket) return go(`/payment-result?ids=${encodeURIComponent(pending.ids.join(','))}`, { replace: true });
    ctx.el.innerHTML = `<div class="success-hero"><div class="tick">${icon('check')}</div><h1>Nạp tiền thành công!</h1>
      <p class="muted mt-s">Tiền đã được cộng vào ví CarbookPay của bạn.</p></div>
      <div class="card mt"><div class="kv"><span>Số tiền</span><span class="money">${money(pending.amount)}</span></div>
      <div class="kv"><span>Mã giao dịch</span><span class="mono">${esc(pending.orderId)}</span></div></div>
      <div class="stack mt"><a class="btn primary lg block" href="#/wallet">Về ví CarbookPay</a></div>`;
    return;
  }
  const retryHref = isTicket ? `#/payment?ids=${encodeURIComponent(pending.ids.join(','))}` : '#/wallet/deposit';
  const failed = status === 'FAILED';
  ctx.el.innerHTML = `<div class="success-hero"><div class="tick bad">${icon(failed ? 'x' : 'clock')}</div>
    <h1>${failed ? 'Thanh toán không thành công' : 'Giao dịch đang được xử lý'}</h1>
    <p class="muted mt-s">${failed ? 'Giao dịch đã bị hủy hoặc không thành công.' + (isTicket ? ' Ghế vẫn đang được giữ — bạn có thể thử lại.' : '')
      : 'Vui lòng kiểm tra lại số dư/lịch sử sau ít phút. Hệ thống sẽ tự cập nhật khi VNPay xác nhận.'}</p></div>
    <div class="stack mt"><a class="btn primary lg block" href="${retryHref}">${failed ? 'Thử lại' : 'Xem lại'}</a>
    <a class="btn ghost lg block" href="#/${isTicket ? 'history' : 'wallet'}">${isTicket ? 'Vé của tôi' : 'Về ví'}</a></div>`;
}
