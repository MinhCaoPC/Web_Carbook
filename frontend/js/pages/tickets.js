import { api, session, icon, esc, money, fmtTime, fmtDate, fmtDateTime, duration, toastErr, toastOk, setBusy, confirmBox, renderQR, emptyHTML, errorHTML, loadingHTML } from '../core.js';
import { go, setUnread, refreshUnread } from '../app.js';
import { normBooking } from '../model.js';
import { sellDialog, cancelListing } from './market.js';

const backBtn = (href) => `<a class="back" href="#${href}" aria-label="Quay lại">${icon('back')}</a>`;

// =====================================================================
//  Lịch sử vé
// =====================================================================
const ST = {
  upcoming: { label: 'Sắp đi', cls: 'blue' },
  completed: { label: 'Hoàn thành', cls: 'green' },
  cancelled: { label: 'Đã hủy', cls: 'red' },
};

export async function history(ctx) {
  ctx.title('Vé của tôi');
  ctx.el.innerHTML = `<div class="page-head"><div class="grow"><h1>Vé của tôi</h1><div class="sub">Lịch sử đặt vé và các chuyến sắp đi.</div></div></div>
    <div class="tabs" id="tabs">
      <button data-t="" class="on">Tất cả</button><button data-t="upcoming">Sắp đi</button>
      <button data-t="completed">Hoàn thành</button><button data-t="cancelled">Đã hủy</button></div>
    <div id="list" class="mt">${loadingHTML}</div>`;
  const list = ctx.el.querySelector('#list');
  let tickets = [], tab = '';

  const load = async () => {
    list.innerHTML = loadingHTML;
    try {
      const maKH = await session.ensureMaKH();
      if (!maKH) { tickets = []; return draw(); }
      tickets = (await api(`/api/bookings/history/${maKH}`)).data || [];
      draw();
    } catch (e) { list.innerHTML = errorHTML(e.message); list.querySelector('[data-retry]')?.addEventListener('click', load); }
  };
  const draw = () => {
    const arr = tickets.filter((t) => !tab || t.status === tab);
    if (!arr.length) { list.innerHTML = emptyHTML('ticket', 'Chưa có vé nào', 'Các vé bạn đặt sẽ xuất hiện ở đây.', '<a class="btn primary" href="#/">Đặt vé ngay</a>'); return; }
    list.innerHTML = `<div class="grid cols-2">${arr.map((t) => {
      const st = ST[t.status] || ST.completed;
      return `<div class="card">
        <div class="row between"><div class="row"><span class="ico">${icon('bus')}</span><div><b>${esc(t.company || 'CARBOOK')}</b><div class="hint">${esc(t.date)} · ${esc(t.time)}</div></div></div><div class="row">${t.nftTokenId ? `<span class="badge gray" title="Vé NFT trên blockchain">NFT #${t.nftTokenId}</span>` : ''}${t.dangRaoBan ? `<span class="badge warn">Đang rao ${esc(String(t.giaRaoBan ? t.giaRaoBan.toLocaleString('vi-VN') + 'đ' : ''))}</span>` : ''}<span class="badge ${st.cls}">${st.label}</span></div></div>
        <div class="mt row"><div class="grow"><div class="row"><span class="muted">${icon('pin', 'sm')}</span><b>${esc(t.from)}</b></div><div class="row mt-s"><span style="color:var(--accent)">${icon('pin', 'sm')}</span><b>${esc(t.to)}</b></div></div>
          <div style="text-align:right"><div class="hint">Ghế</div><b>${esc(t.seat)}</b></div></div>
        <div class="trip-foot"><span class="price">${esc(t.price)}</span>
          <div class="row">
            <a class="btn sm" href="#/ticket?id=${encodeURIComponent(t.id)}">${icon('ticket', 'sm')} Xem vé</a>
            ${t.status === 'upcoming' && t.dangRaoBan ? `<button class="btn sm" data-unsell="${esc(t.id)}">Huỷ rao bán</button>`
              : t.status === 'upcoming' ? `${t.nftStatus === 'DA_MINT' ? `<button class="btn sm" data-sell="${esc(t.id)}">${icon('swap', 'sm')} Rao bán</button>` : ''}<button class="btn sm danger-o" data-cancel="${esc(t.id)}">Hủy vé</button>`
              : `<a class="btn sm ghost" href="#/?from=${encodeURIComponent(t.from)}&to=${encodeURIComponent(t.to)}">Đặt lại</a>`}
          </div></div></div>`;
    }).join('')}</div>`;
    list.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', async () => {
      const t = tickets.find((x) => x.id === b.dataset.sell);
      if (t && (await sellDialog(t))) await load();
    }));
    list.querySelectorAll('[data-unsell]').forEach((b) => b.addEventListener('click', async () => {
      setBusy(b, true);
      try { if (await cancelListing(b.dataset.unsell)) await load(); else setBusy(b, false); } catch (e) { toastErr(e); setBusy(b, false); }
    }));
    list.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await confirmBox({
        title: 'Xác nhận hủy vé', danger: true, ok: 'Hủy vé', cancel: 'Không',
        message: 'Bạn có chắc chắn muốn hủy vé này không?\n\n• Phải thực hiện trước giờ xe chạy ít nhất 4 tiếng.\n• Phí hủy vé là 30% giá vé (hoàn lại 70% vào ví CarbookPay).\n• NFT của vé sẽ bị đốt.',
      });
      if (!ok) return;
      setBusy(b, true);
      try { const r = await api('/api/ticket/cancel', { method: 'POST', body: { ticketId: b.dataset.cancel } }); toastOk(r.message || 'Đã gửi yêu cầu hủy vé thành công.'); await load(); }
      catch (e) { toastErr(e); setBusy(b, false); }
    }));
  };
  ctx.el.querySelector('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    tab = b.dataset.t; ctx.el.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); draw();
  });
  load();
}

// =====================================================================
//  Vé lên xe (boarding pass)
// =====================================================================
export async function ticket(ctx) {
  ctx.title('Vé lên xe');
  const { id } = ctx.query; const ids = (ctx.query.ids || '').split(',').filter(Boolean);
  if (!id && !ids.length) return go('/history', { replace: true });
  const fromPay = !id;
  let info;
  try {
    info = normBooking(id ? await api(`/api/bookings/ticket/${encodeURIComponent(id)}`) : await api('/api/dat-ve/kiem-tra', { query: { danhSachMaDatVe: ids.join(',') } }));
  } catch (e) {
    ctx.el.innerHTML = `<div class="page-head">${backBtn('/history')}<h1>Vé lên xe</h1></div>${errorHTML(e.message)}`;
    ctx.el.querySelector('[data-retry]')?.addEventListener('click', () => ctx.reload());
    return;
  }
  const paid = info.ve.filter((v) => v.maQR);
  const goc = info.ve.reduce((s, v) => s + v.giaGoc, 0), giam = info.ve.reduce((s, v) => s + v.tienGiam, 0), tien = info.ve.reduce((s, v) => s + v.thanhTien, 0) || info.tongTien;
  ctx.wide('mid');
  ctx.el.innerHTML = `
    <div class="page-head no-print">${backBtn(fromPay ? '/' : '/history')}<div class="grow"><h1>Vé lên xe</h1></div>
      <button class="btn sm" id="print">${icon('print', 'sm')} In vé</button></div>
    <div class="split">
      <section class="stack">
        <div class="pass">
          <div class="pass-top">
            <div class="row between"><b style="letter-spacing:.1em">CARBOOK</b><span class="badge" style="background:rgba(255,255,255,.18);color:#fff">${esc(info.tenXe)}${info.bienSoXe ? ' · ' + esc(info.bienSoXe) : ''}</span></div>
            <div class="pass-route"><div class="big">${esc(info.diemKhoiHanh)}</div>${icon('arrow')}<div class="big" style="text-align:right">${esc(info.diemKetThuc)}</div></div>
            <div class="row between mt" style="font-size:14px;opacity:.85"><span>${fmtDateTime(info.xuatPhat)}</span><span>${duration(info.xuatPhat, info.denDich)}</span></div>
          </div>
          <div class="pass-cut"></div>
          <div class="pass-body">
            ${paid.length ? `<div class="grid ${paid.length > 1 ? 'cols-2' : ''}" style="justify-items:center">${paid.map((v) => `
              <div class="center"><div class="qr-box" data-qr="${esc(v.maQR)}"></div>
                <div class="mt-s"><b>Ghế ${esc(v.maGhe)}</b></div><div class="hint mono">${esc(v.maQR)}</div></div>`).join('')}</div>
              <p class="center muted mt">Quét mã QR để lên xe · <i>Scan to board</i></p>`
              : `<div class="warn-msg center">Vui lòng hoàn tất thanh toán để nhận mã QR lên xe.</div>`}
          </div>
        </div>
      </section>
      <aside class="stack">
        <div class="card"><h3>Hành khách</h3>
          <div class="kv"><span>Họ tên</span><span>${esc(info.hoTen)}</span></div>
          <div class="kv"><span>Điện thoại</span><span>${esc(info.sdt)}</span></div>
          <div class="kv"><span>Email</span><span>${esc(info.email)}</span></div>
          <div class="kv"><span>Ghế</span><span>${esc(info.ghe.join(', '))}</span></div>
          ${info.diemDon ? `<div class="kv"><span>Điểm đón</span><span>${esc(info.diemDon.tenDiem)}${info.diemDon.thoiGianDuKien ? ' · ' + fmtTime(info.diemDon.thoiGianDuKien) : ''}</span></div>` : ''}
          ${info.diemTra ? `<div class="kv"><span>Điểm trả</span><span>${esc(info.diemTra.tenDiem)}${info.diemTra.thoiGianDuKien ? ' · ' + fmtTime(info.diemTra.thoiGianDuKien) : ''}</span></div>` : ''}
        </div>
        <div class="card"><h3>Thanh toán</h3>
          <div class="kv"><span>Giá vé</span><span>${money(goc || tien)}</span></div>
          ${giam ? `<div class="kv"><span>Giảm giá</span><span>-${money(giam)}</span></div>` : ''}
          <div class="kv"><span>Tổng cộng</span><span class="money" style="color:var(--primary)">${money(tien)}</span></div>
          ${info.hoaDon.map((h) => `<div class="kv"><span>${h.phuongThucTT === 'VNPAY' ? 'VNPay' : 'Ví CarbookPay'}</span><span class="mono">${esc(h.txHash || h.maHoaDon)}</span></div>`).join('')}
        </div>
        ${info.ve.some((v) => v.nftTokenId) ? `<div class="card"><h3>Vé NFT</h3>
          ${info.ve.filter((v) => v.nftTokenId).map((v) => `<div class="kv"><span>Ghế ${esc(v.maGhe)}</span><span><b>NFT #${v.nftTokenId}</b>${v.dangRaoBan ? ' · đang rao bán' : ''}</span></div>`).join('')}
          <a class="btn ghost block mt-s" href="#/blockchain">${icon('shield', 'sm')} Kiểm chứng trên blockchain</a></div>`
          : (paid.length ? `<div class="info-msg">Vé đang được phát hành NFT, vui lòng tải lại sau ít phút.</div>` : '')}
        <div class="info-msg">Vui lòng có mặt tại điểm đón ít nhất 30 phút trước giờ khởi hành.</div>
      </aside>
    </div>`;
  ctx.el.querySelectorAll('[data-qr]').forEach((el) => renderQR(el, el.dataset.qr, 170));
  ctx.el.querySelector('#print').addEventListener('click', () => window.print());
}

// =====================================================================
//  Thông báo
// =====================================================================
export async function notifications(ctx) {
  ctx.title('Thông báo');
  ctx.wide('mid');
  ctx.el.innerHTML = `<div class="page-head"><div class="grow"><h1>Thông báo</h1></div>
    <button class="btn sm" id="read-all">${icon('check', 'sm')} Đọc tất cả</button><button class="btn sm danger-o" id="del-all">${icon('trash', 'sm')} Xóa tất cả</button></div>
    <div id="list">${loadingHTML}</div>`;
  const list = ctx.el.querySelector('#list');
  let items = [];
  const draw = () => {
    setUnread(items.filter((n) => !n.daDoc).length);
    if (!items.length) { list.innerHTML = emptyHTML('bell', 'Chưa có thông báo', 'Nhắc chuyến sắp khởi hành và thanh toán dở dang sẽ hiện ở đây.'); return; }
    list.innerHTML = `<div class="card pad-0 list">${items.map((n, i) => `
      <div class="item" data-i="${i}" style="cursor:pointer;${n.daDoc ? '' : 'background:var(--primary-50)'}">
        <span class="ico ${n.loai === 'THANH_TOAN' ? 'warn' : ''}">${icon(n.loai === 'THANH_TOAN' ? 'wallet' : 'bus')}</span>
        <div class="grow"><div class="row between"><b>${esc(n.tieuDe)}</b>${n.daDoc ? '' : '<span class="badge blue">Mới</span>'}</div>
          <div class="muted" style="font-size:14px">${esc(n.noiDung)}</div><div class="hint">${n.thoiGianTao ? fmtDateTime(n.thoiGianTao) : ''}</div></div>
        <button class="back" data-del="${i}" aria-label="Xóa" style="width:34px;height:34px">${icon('x', 'sm')}</button>
      </div>`).join('')}</div>`;
    list.querySelectorAll('[data-i]').forEach((row) => row.addEventListener('click', async (e) => {
      if (e.target.closest('[data-del]')) return;
      const n = items[row.dataset.i];
      if (!n.daDoc) { n.daDoc = true; api('/api/notifications/read', { method: 'PATCH', body: { maThongBao: n.maThongBao } }).catch(() => {}); draw(); }
      if (n.loai === 'THANH_TOAN' && n.danhSachMaDatVe?.length) go(`/payment?ids=${encodeURIComponent(n.danhSachMaDatVe.join(','))}`);
      else if (n.maDatVe) go(`/ticket?id=${encodeURIComponent(n.maDatVe)}`);
    }));
    list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const n = items[b.dataset.del];
      try { await api('/api/notifications', { method: 'DELETE', query: { maThongBao: n.maThongBao } }); items.splice(b.dataset.del, 1); draw(); } catch (e) { toastErr(e); }
    }));
  };
  ctx.el.querySelector('#read-all').addEventListener('click', async () => {
    try { await api('/api/notifications/read', { method: 'PATCH', body: {} }); items.forEach((n) => { n.daDoc = true; }); draw(); } catch (e) { toastErr(e); }
  });
  ctx.el.querySelector('#del-all').addEventListener('click', async () => {
    if (!items.length || !(await confirmBox({ title: 'Xóa tất cả thông báo?', message: 'Hành động này không thể hoàn tác.', danger: true, ok: 'Xóa' }))) return;
    try { await api('/api/notifications', { method: 'DELETE' }); items = []; draw(); } catch (e) { toastErr(e); }
  });
  try { items = (await api('/api/notifications')).danhSach || []; draw(); }
  catch (e) { list.innerHTML = errorHTML(e.message); list.querySelector('[data-retry]')?.addEventListener('click', () => ctx.reload()); }
}
