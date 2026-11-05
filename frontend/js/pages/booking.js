import { api, session, icon, esc, money, ymd, fmtTime, fmtDate, fmtDateTime, duration, weekdayLong, WEEKDAYS, toastErr, toastOk, toast, setBusy, modal, emptyHTML, errorHTML, loadingHTML } from '../core.js';
import { go } from '../app.js';
import { normBooking } from '../model.js';

const qs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const backBtn = (href) => `<a class="back" href="#${href}" aria-label="Quay lại">${icon('back')}</a>`;

// =====================================================================
//  Kết quả tìm chuyến
// =====================================================================
export async function search(ctx) {
  const { from, to, date, qty = '1' } = ctx.query;
  if (!from || !to || !date) return go('/', { replace: true });
  ctx.title(`${from} → ${to}`);
  const d0 = new Date(date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Chỉ các ngày đã mở bán (hôm nay + 3 ngày tới, theo backend)
  let allowed = [];
  try { allowed = (await api('/api/trips/ngay-cho-phep', { auth: false })).danhSachNgay || []; } catch { /* dùng mặc định bên dưới */ }
  if (!allowed.length) allowed = Array.from({ length: 4 }, (_, i) => ymd(new Date(today.getTime() + i * 86400000)));
  if (!allowed.includes(date)) return go(`/search?${qs({ from, to, date: allowed[0], qty })}`, { replace: true });
  const days = allowed.map((v) => new Date(v + 'T00:00:00'));
  const strip = days.map((d) => `<a class="dchip ${ymd(d) === date ? 'on' : ''}" href="#/search?${qs({ from, to, date: ymd(d), qty })}">
      <small>${i0(d, today)}</small><b>${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</b></a>`).join('');

  ctx.el.innerHTML = `
    <div class="page-head">${backBtn('/')}
      <div class="grow"><h1>${esc(from)} → ${esc(to)}</h1><div class="sub">${weekdayLong(d0)}, ${fmtDate(d0)} · ${esc(qty)} vé</div></div>
    </div>
    <div class="date-strip" id="strip">${strip}</div>
    <div class="split left-side mt-s">
      <aside class="sticky-side"><div class="card filters" id="filters">
        <div class="field"><label>Sắp xếp</label><select class="in" id="f-sort"><option value="time">Giờ đi sớm nhất</option><option value="price">Giá thấp nhất</option><option value="late">Giờ đi muộn nhất</option><option value="seats">Nhiều chỗ trống nhất</option></select></div>
        <div class="field"><label>Giờ khởi hành</label><select class="in" id="f-time"><option value="">Tất cả</option><option value="m">Sáng (00:00 – 12:00)</option><option value="a">Chiều (12:00 – 18:00)</option><option value="e">Tối (18:00 – 24:00)</option></select></div>
        <div class="field"><label>Loại xe</label><select class="in" id="f-type"><option value="">Tất cả</option></select></div>
      </div></aside>
      <section><div id="list">${loadingHTML}</div></section>
    </div>`;
  ctx.el.querySelector('#strip .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });

  const list = ctx.el.querySelector('#list');
  let trips = [];
  try {
    const d = await api('/api/trips/search', { query: { from, to, date, soLuongVe: qty } });
    trips = d.trips || [];
  } catch (e) {
    list.innerHTML = errorHTML(e.message);
    list.querySelector('[data-retry]')?.addEventListener('click', () => ctx.reload());
    return;
  }
  if (!ctx.isCurrent()) return;

  const types = [...new Set(trips.map((t) => t.tenLoaiXe).filter(Boolean))];
  ctx.el.querySelector('#f-type').insertAdjacentHTML('beforeend', types.map((t) => `<option>${esc(t)}</option>`).join(''));

  const draw = () => {
    const sort = ctx.el.querySelector('#f-sort').value, tm = ctx.el.querySelector('#f-time').value, ty = ctx.el.querySelector('#f-type').value;
    let arr = trips.filter((t) => {
      const h = new Date(t.thoiGianXuatPhat).getHours();
      return (!tm || (tm === 'm' ? h < 12 : tm === 'a' ? h >= 12 && h < 18 : h >= 18)) && (!ty || t.tenLoaiXe === ty);
    });
    arr.sort((a, b) => sort === 'price' ? a.giaVe - b.giaVe : sort === 'late' ? new Date(b.thoiGianXuatPhat) - new Date(a.thoiGianXuatPhat)
      : sort === 'seats' ? b.soGheConTrong - a.soGheConTrong : new Date(a.thoiGianXuatPhat) - new Date(b.thoiGianXuatPhat));
    if (!arr.length) {
      list.innerHTML = emptyHTML('bus', trips.length ? 'Không có chuyến phù hợp bộ lọc' : 'Chưa có chuyến xe cho ngày này', trips.length ? 'Hãy thử bỏ bớt bộ lọc.' : 'Hãy thử chọn ngày khác hoặc đổi tuyến.');
      return;
    }
    list.innerHTML = `<div class="muted" style="margin:0 2px 10px">Tìm thấy <b>${arr.length}</b> chuyến</div><div class="stack">${arr.map(tripCard).join('')}</div>`;
  };
  const tripCard = (t) => {
    const full = !t.duVe || t.soGheConTrong < Number(qty);
    const href = `#/seats/${encodeURIComponent(t.maChuyenXe)}?${qs({ date, from, to, gio: t.gioXuatPhat || fmtTime(t.thoiGianXuatPhat), gia: t.giaVe, qty })}`;
    return `<${full ? 'div' : `a href="${href}"`} class="card trip" ${full ? 'style="opacity:.6"' : ''}>
      <div class="trip-main">
        <div class="t-time">${fmtTime(t.thoiGianXuatPhat)}<small>${esc(t.diemKhoiHanh)}</small></div>
        <div class="t-line">${duration(t.thoiGianXuatPhat, t.thoiGianDenDich)}<div class="bar"></div>${esc(t.tenLoaiXe)}</div>
        <div class="t-time" style="text-align:right">${fmtTime(t.thoiGianDenDich)}<small style="margin-left:auto">${esc(t.diemKetThuc)}</small></div>
      </div>
      <div class="trip-foot">
        <div class="row wrap"><span class="badge ${full ? 'red' : t.soGheConTrong <= 5 ? 'warn' : 'green'}">${full ? 'Hết chỗ' : `Còn ${t.soGheConTrong}/${t.tongSoGhe} chỗ`}</span></div>
        <div class="row"><span class="price">${money(t.giaVe)}</span>${full ? '' : `<span class="btn primary sm">Chọn chuyến</span>`}</div>
      </div></${full ? 'div' : 'a'}>`;
  };
  ['#f-sort', '#f-time', '#f-type'].forEach((s) => ctx.el.querySelector(s).addEventListener('change', draw));
  draw();
}
function i0(d, today) { const n = Math.round((d - today) / 86400000); return n === 0 ? 'Hôm nay' : n === 1 ? 'Ngày mai' : WEEKDAYS[d.getDay()]; }

// =====================================================================
//  Chọn ghế
// =====================================================================
const MAX_SEATS = 5;
export async function seats(ctx) {
  const ma = ctx.params.ma;
  const { date, from = '', to = '', gio = '', gia = 0, qty = 1 } = ctx.query;
  if (!date) return go('/', { replace: true });
  ctx.title('Chọn ghế');
  const price = Number(gia) || 0;
  const d0 = new Date(date + 'T00:00:00');
  const back = `/search?${qs({ from, to, date, qty })}`;

  let map;
  try { map = await api(`/api/seats/${encodeURIComponent(ma)}/${date}`, { auth: false }); }
  catch (e) {
    ctx.el.innerHTML = `<div class="page-head">${backBtn(back)}<h1>Chọn ghế</h1></div>${errorHTML(e.message)}`;
    ctx.el.querySelector('[data-retry]')?.addEventListener('click', () => ctx.reload());
    return;
  }
  const all = (map.seats || []).map((s) => ({ id: s.maGhe, taken: s.trangThai !== 'TRONG' })).sort((a, b) => a.id.localeCompare(b.id, 'vi', { numeric: true }));
  const lower = all.filter((s) => s.id.startsWith('A')), upper = all.filter((s) => s.id.startsWith('B')), other = all.filter((s) => !/^[AB]/.test(s.id));
  const floors = [['Tầng dưới', lower.concat(other)], ...(upper.length ? [['Tầng trên', upper]] : [])];
  let floor = 0; const sel = new Set();

  ctx.el.innerHTML = `
    <div class="page-head">${backBtn(back)}<div class="grow"><h1>Chọn ghế</h1><div class="sub">${esc(from)} → ${esc(to)} · ${weekdayLong(d0)}, ${fmtDate(d0)}${gio ? ' · ' + esc(gio) : ''}</div></div></div>
    <div class="split">
      <section class="stack">
        ${floors.length > 1 ? `<div class="tabs" id="floors">${floors.map((f, i) => `<button data-f="${i}" class="${i === 0 ? 'on' : ''}">${f[0]}</button>`).join('')}</div>` : ''}
        <div class="card"><div class="legend"><span><i></i>Trống</span><span><i class="s"></i>Đang chọn</span><span><i class="b"></i>Đã bán</span></div>
          <div class="mt"><div class="bus"><div class="front">PHÍA TRƯỚC</div><div class="seat-grid" id="grid"></div></div></div>
          <p class="center muted mt" style="font-size:13px">Còn ${map.soGheTrong ?? 0}/${map.tongSoGhe ?? all.length} ghế trống · chọn tối đa ${MAX_SEATS} ghế mỗi lần đặt</p></div>
      </section>
      <aside class="sticky-side only-lg"><div class="card" id="side"></div></aside>
    </div>
    <div class="bar-fixed hide-lg"><div class="pay-bar" id="bar"></div></div>`;

  const grid = ctx.el.querySelector('#grid');
  const paint = () => {
    const arr = floors[floor][1];
    grid.innerHTML = arr.length ? arr.map((s) => `<button class="seat ${sel.has(s.id) ? 'sel' : ''}" data-s="${s.id}" ${s.taken ? 'disabled' : ''} aria-label="Ghế ${s.id}">${s.id}</button>`).join('') : '<p class="muted center" style="grid-column:1/-1">Không có ghế ở tầng này.</p>';
    const list = [...sel].sort(), total = price * list.length;
    const sum = `
      <div><div class="muted" style="font-size:12px">Ghế đã chọn (${list.length}/${MAX_SEATS})</div>
        <div style="font-weight:700;min-height:22px">${list.length ? list.join(', ') : '—'}</div></div>`;
    ctx.el.querySelector('#bar').innerHTML = `<div class="grow">${sum}<div class="money" style="color:var(--primary);font-size:18px">${money(total)}</div></div>
      <button class="btn primary lg" id="go" ${list.length ? '' : 'disabled'}>Tiếp tục ${icon('arrow')}</button>`;
    ctx.el.querySelector('#side').innerHTML = `<h3>Thông tin chuyến</h3>
      <div class="kv"><span>Tuyến</span><span>${esc(from)} → ${esc(to)}</span></div>
      <div class="kv"><span>Khởi hành</span><span>${esc(gio)} · ${fmtDate(d0)}</span></div>
      <div class="kv"><span>Đơn giá</span><span>${money(price)}</span></div>
      <div class="kv"><span>Ghế đã chọn</span><span>${list.length ? list.join(', ') : '—'}</span></div>
      <div class="kv"><span>Tổng cộng</span><span class="money" style="color:var(--primary);font-size:20px">${money(total)}</span></div>
      <button class="btn primary lg block mt" id="go2" ${list.length ? '' : 'disabled'}>Tiếp tục ${icon('arrow')}</button>`;
    ctx.el.querySelector('#go')?.addEventListener('click', proceed);
    ctx.el.querySelector('#go2')?.addEventListener('click', proceed);
  };
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const id = b.dataset.s;
    if (sel.has(id)) sel.delete(id);
    else if (sel.size >= MAX_SEATS) return toast(`Chỉ được chọn tối đa ${MAX_SEATS} ghế cho mỗi lần đặt.`);
    else sel.add(id);
    paint();
  });
  ctx.el.querySelector('#floors')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    floor = +b.dataset.f;
    ctx.el.querySelectorAll('#floors button').forEach((x) => x.classList.toggle('on', x === b));
    paint();
  });

  let busy = false;
  async function proceed() {
    if (busy || !sel.size) return;
    busy = true;
    const btns = ['#go', '#go2'].map((s) => ctx.el.querySelector(s)); btns.forEach((b) => setBusy(b, true));
    try {
      const maKH = await session.ensureMaKH();
      if (!maKH) throw new Error('Vui lòng đăng nhập để đặt ghế.');
      const seatsArr = [...sel].sort();
      const r = await api('/api/dat-ve/giu-cho', { method: 'POST', body: { maKhachHang: maKH, maChuyenXe: ma, ngayDi: date, danhSachMaGhe: seatsArr } });
      go(`/passenger?${qs({ ids: (r.danhSachMaDatVe || []).join(','), ma, date, from, to, gio, gia: price, qty })}`);
    } catch (e) {
      toastErr(e); busy = false; ctx.reload();
    }
  }
  paint();
}

// =====================================================================
//  Thông tin hành khách + điểm đón/trả
// =====================================================================
export async function passenger(ctx) {
  const ids = (ctx.query.ids || '').split(',').filter(Boolean);
  if (!ids.length) return go('/', { replace: true });
  ctx.title('Thông tin hành khách');
  const { ma, date, from, to, gio, gia, qty } = ctx.query;
  const seatsUrl = ma ? `/seats/${encodeURIComponent(ma)}?${qs({ date, from, to, gio, gia, qty })}` : '/';

  let info;
  const load = async () => { info = normBooking(await api('/api/dat-ve/kiem-tra', { query: { danhSachMaDatVe: ids.join(',') } })); };
  try { await load(); } catch (e) {
    ctx.el.innerHTML = `<div class="page-head">${backBtn('/')}<h1>Thông tin hành khách</h1></div>${errorHTML(e.message)}`;
    ctx.el.querySelector('[data-retry]')?.addEventListener('click', () => ctx.reload());
    return;
  }

  const ptOptions = (list, cur) => list.map((p) => `<option value="${esc(p.maDiem)}" ${cur?.maDiem === p.maDiem ? 'selected' : ''}>${esc(p.tenDiem)}${p.diaChi ? ' – ' + esc(p.diaChi) : ''}</option>`).join('');
  const ptTime = (p) => (p?.thoiGianDuKien ? `<div class="hint mt-s">Thời gian dự kiến: <b>${fmtDateTime(p.thoiGianDuKien)}</b></div>` : '');

  const draw = () => {
    ctx.el.innerHTML = `
    <div class="page-head">${backBtn(seatsUrl)}<div class="grow"><h1>Kiểm tra thông tin</h1><div class="sub">Vui lòng soát lại chi tiết chuyến đi của bạn.</div></div></div>
    <div class="split">
      <section class="stack">
        <div class="card">
          <div class="row between"><h3 style="margin:0">Chuyến đi</h3><span class="badge blue">${esc(info.tenXe)}${info.bienSoXe ? ' · ' + esc(info.bienSoXe) : ''}</span></div>
          <div class="trip-main mt">
            <div class="t-time">${fmtTime(info.xuatPhat)}<small>${esc(info.diemKhoiHanh)}</small></div>
            <div class="t-line">${duration(info.xuatPhat, info.denDich)}<div class="bar"></div></div>
            <div class="t-time" style="text-align:right">${fmtTime(info.denDich)}<small style="margin-left:auto">${esc(info.diemKetThuc)}</small></div>
          </div>
          <div class="muted mt-s" style="font-size:13px">Khởi hành ${fmtDateTime(info.xuatPhat)} · Dự kiến đến ${fmtDateTime(info.denDich)}</div>
        </div>

        <div class="card">
          <div class="row between"><h3 style="margin:0">Thông tin hành khách</h3><button class="link-btn" id="edit-pax">${icon('edit', 'sm')} Chỉnh sửa</button></div>
          <div class="mt-s">
            <div class="kv"><span>Họ và tên</span><span>${esc(info.hoTen) || '—'}</span></div>
            <div class="kv"><span>Số điện thoại</span><span>${esc(info.sdt) || '—'}</span></div>
            <div class="kv"><span>Email</span><span>${esc(info.email) || '—'}</span></div>
            ${info.cmnd ? `<div class="kv"><span>CMND/CCCD</span><span>${esc(info.cmnd)}</span></div>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="row between"><h3 style="margin:0">Ghế của bạn</h3><button class="link-btn" id="change-seat">${icon('refresh', 'sm')} Chọn lại ghế</button></div>
          <div class="row wrap mt-s">${info.ghe.map((g) => `<span class="badge blue" style="height:30px;font-size:14px">${esc(g)}</span>`).join('')}</div>
        </div>

        <div class="card">
          <h3>Điểm đón &amp; trả</h3>
          <div class="form-grid two">
            <div class="field"><label>Điểm đón</label><select class="in" id="p-don">${ptOptions(info.dsDiemDon, info.diemDon)}</select>${ptTime(info.diemDon)}</div>
            <div class="field"><label>Điểm trả</label><select class="in" id="p-tra">${ptOptions(info.dsDiemTra, info.diemTra)}</select>${ptTime(info.diemTra)}</div>
          </div>
          ${info.canhBao ? `<div class="warn-msg mt">${esc(info.canhBao)}</div>` : ''}
          <div class="info-msg mt">Vui lòng có mặt tại điểm đón ít nhất 30 phút trước giờ khởi hành.</div>
        </div>
      </section>

      <aside class="sticky-side"><div class="card">
        <h3>Chi tiết giá</h3>
        <div class="kv"><span>Số vé</span><span>${info.ghe.length}</span></div>
        <div class="kv"><span>Ghế</span><span>${esc(info.ghe.join(', '))}</span></div>
        <div class="kv"><span>Tổng cộng</span><span class="money" style="color:var(--primary);font-size:22px">${money(info.tongTien)}</span></div>
        <button class="btn primary lg block mt" id="next">Tiếp tục thanh toán ${icon('arrow')}</button>
        <p class="hint center mt-s">Ghế được giữ trong 60 phút kể từ lúc chọn.</p>
      </div></aside>
    </div>`;

    ctx.el.querySelector('#edit-pax').addEventListener('click', editPassenger);
    ctx.el.querySelector('#next').addEventListener('click', () => go(`/payment?ids=${encodeURIComponent(ids.join(','))}`));
    ctx.el.querySelector('#change-seat').addEventListener('click', async () => {
      try { await api('/api/dat-ve/nha-ghe-va-chon-lai', { method: 'POST', body: { maKhachHang: session.maKH, danhSachMaDatVe: ids } }); go(seatsUrl, { replace: true }); }
      catch (e) { toastErr(e); }
    });
    const onPoint = (sel, isDon) => ctx.el.querySelector(sel).addEventListener('change', async (e) => {
      const code = e.target.value;
      try {
        await api('/api/dat-ve/diem-don-tra', { method: 'PATCH', body: { maKhachHang: session.maKH, danhSachMaDatVe: ids, [isDon ? 'maDiemDon' : 'maDiemTra']: code } });
        await load(); draw();
      } catch (er) { toastErr(er); await load().catch(() => {}); draw(); }
    });
    onPoint('#p-don', true); onPoint('#p-tra', false);
  };

  function editPassenger() {
    const m = modal(`<h2>Thông tin hành khách</h2>
      <form id="pf" class="stack mt" novalidate>
        <div class="field"><label>Họ và tên</label><input class="in" name="hoTen" value="${esc(info.hoTen)}" autocomplete="name"></div>
        <div class="field"><label>Số điện thoại</label><input class="in" name="sdt" type="tel" value="${esc(info.sdt)}" autocomplete="tel"></div>
        <div class="field"><label>Email</label><input class="in" name="email" type="email" value="${esc(info.email)}" autocomplete="email"></div>
        <div class="field"><label>CMND/CCCD (không bắt buộc)</label><input class="in" name="cmnd" value="${esc(info.cmnd)}"></div>
        <div class="err-msg hidden" id="perr"></div>
        <div class="actions"><button type="button" class="btn ghost" data-close="false">Hủy</button><button type="submit" class="btn primary">Lưu</button></div>
      </form>`);
    const f = m.box.querySelector('#pf'), err = m.box.querySelector('#perr');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = { hoTen: f.hoTen.value.trim(), sdt: f.sdt.value.trim(), email: f.email.value.trim(), cmnd: f.cmnd.value.trim() || null };
      const bad = (t) => { err.textContent = t; err.classList.remove('hidden'); };
      if (!v.hoTen) return bad('Vui lòng nhập họ tên.');
      if (!/^(0|\+84)\d{9}$/.test(v.sdt.replace(/\s/g, ''))) return bad('Số điện thoại không hợp lệ.');
      if (!/^\S+@\S+\.\S+$/.test(v.email)) return bad('Email không hợp lệ.');
      const btn = f.querySelector('[type=submit]'); setBusy(btn, true);
      try {
        await api('/api/dat-ve/thong-tin-hanh-khach', { method: 'PATCH', body: { maKhachHang: session.maKH, danhSachMaDatVe: ids, ...v } });
        m.close(true); await load(); draw(); toastOk('Đã cập nhật thông tin hành khách.');
      } catch (e2) { bad(e2.message); setBusy(btn, false); }
    });
  }
  draw();
}
