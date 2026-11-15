// ============================================================
// giao-dien.js — tiện ích giao diện dùng chung (giữ phong cách CARBOOK cũ):
//   icon, định dạng tiền/giờ, thông báo nổi (toast), hộp thoại (modal), mã QR
// ============================================================

// ---------- Bộ icon (nét mảnh, kiểu feather) — giữ nguyên từ giao diện cũ ----------
const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1z"/><circle cx="16" cy="14" r="1.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  swap: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v3M16 18v3"/><circle cx="8" cy="14.5" r=".6"/><circle cx="16" cy="14.5" r=".6"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M7 17L17 7M9 7h8v8"/>',
  down: '<path d="M17 7L7 17M15 17H7V9"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20a4 4 0 0 1-4 2h-2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  ticket: '<path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/><path d="M14 5v14" stroke-dasharray="2 3"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chevd: '<path d="M6 9l6 6 6-6"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  hub: '<circle cx="12" cy="12" r="3"/><circle cx="4.5" cy="6" r="2"/><circle cx="19.5" cy="6" r="2"/><circle cx="4.5" cy="18" r="2"/><circle cx="19.5" cy="18" r="2"/><path d="M6 7l4 3M18 7l-4 3M6 17l4-3M18 17l-4-3"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2 0-4-1-4-3s3-2 4 3zM12 8c2 0 4-1 4-3s-3-2-4 3z"/>',
  token: '<circle cx="12" cy="12" r="9"/><path d="M9 9h5a2 2 0 0 1 0 4H9m0 0h5.5a2 2 0 0 1 0 4H9M9 7v10"/>',
  seat: '<path d="M7 4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8l3 5h2l-1-6V6a2 2 0 0 0-2-2z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h3v-3"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
  fox: '<path d="M4 4l5 4h6l5-4-1 8 1 4-4 4H8l-4-4 1-4z"/><path d="M9 13h.01M15 13h.01M10 17h4"/>',
};

/** Vẽ icon SVG theo tên, vd icon('bus'), icon('ticket', 'sm') */
export function icon(ten, lop = '') {
  return `<svg class="i ${lop}" viewBox="0 0 24 24" aria-hidden="true">${P[ten] || ''}</svg>`;
}

// ---------- Chống chèn mã HTML ----------
/** Mọi dữ liệu đưa vào HTML đều phải đi qua hàm này. */
export const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Định dạng ----------
const hai = (n) => String(n).padStart(2, '0');
export const dinhDangVnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
export const gio = (v) => { const d = new Date(v); return isNaN(d) ? '--:--' : `${hai(d.getHours())}:${hai(d.getMinutes())}`; };
export const ngay = (v) => { const d = new Date(v); return isNaN(d) ? '---' : `${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const ngayGio = (v) => `${gio(v)} ${ngay(v)}`;
export const THU_NGAN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const thuDayDu = (d) => ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][new Date(d).getDay()];
/** "YYYY-MM-DD" -> Date lúc 0h giờ máy */
export const chuoiSangNgay = (s) => new Date(`${s}T00:00:00`);

/** Thời gian di chuyển giữa 2 mốc, vd "4h30" */
export function thoiLuong(a, b) {
  const phut = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  return phut >= 60 ? `${Math.floor(phut / 60)}h${phut % 60 ? hai(phut % 60) : ''}` : `${phut} phút`;
}

/** wei (chuỗi hoặc BigInt) -> "0,0024 ETH" */
export function dinhDangEth(wei) {
  const eth = Number(BigInt(wei || 0)) / 1e18;
  return `${eth.toLocaleString('vi-VN', { maximumFractionDigits: 6 })} ETH`;
}
/** wei -> số VNĐ theo tỷ giá demo */
export const weiSangVnd = (wei, tyGia) => (Number(BigInt(wei || 0)) / 1e18) * tyGia;
/** 0x12345678…abcdef */
export const rutGonDiaChi = (a) => (a && a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a || '');
/** Chữ cái đầu của tên (để vẽ avatar) */
export const chuDau = (ten) => (String(ten || '?').trim().split(/\s+/).slice(-1)[0][0] || '?').toUpperCase();

// ---------- Thông báo nổi ----------
/** loai: '' | 'ok' (xanh) | 'err' (đỏ) */
export function thongBao(noiDung, loai = '') {
  const cho = document.getElementById('toasts');
  const o = document.createElement('div');
  o.className = `toast ${loai}`;
  o.textContent = noiDung;
  cho.appendChild(o);
  setTimeout(() => { o.style.transition = '.3s'; o.style.opacity = '0'; setTimeout(() => o.remove(), 300); }, loai === 'err' ? 6000 : 3200);
}
export const baoLoi = (loi) => thongBao(loi?.message || String(loi), 'err');
export const baoThanhCong = (noiDung) => thongBao(noiDung, 'ok');

// ---------- Hộp thoại ----------
/**
 * Mở hộp thoại. Trả về { khung, dong, ketQua } — ketQua là Promise nhận giá trị truyền vào dong().
 * Nút có data-close="true" -> dong(true); data-close="false" -> dong(null).
 */
export function hopThoai(html, { khiMo } = {}) {
  const goc = document.getElementById('modal-root');
  const nen = document.createElement('div');
  nen.className = 'overlay';
  nen.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  goc.appendChild(nen);
  const khung = nen.firstElementChild;
  let xong;
  const ketQua = new Promise((r) => { xong = r; });
  const phimEsc = (e) => { if (e.key === 'Escape') dong(null); };
  const dong = (giaTri) => { document.removeEventListener('keydown', phimEsc); nen.remove(); xong(giaTri); };
  nen.addEventListener('mousedown', (e) => { if (e.target === nen) dong(null); });
  document.addEventListener('keydown', phimEsc);
  khung.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dong(b.dataset.close === 'true' ? true : null)));
  khiMo?.(khung, dong);
  return { khung, dong, ketQua };
}

/** Hộp hỏi Đồng ý / Hủy. Trả về true/false. */
export function hoiXacNhan({ tieuDe, noiDungHtml, dongY = 'Đồng ý', huy = 'Hủy', nguyHiem = false }) {
  return hopThoai(`
    <h2>${h(tieuDe)}</h2>
    <div class="muted mt-s">${noiDungHtml}</div>
    <div class="actions">
      <button class="btn ghost" data-close="false">${h(huy)}</button>
      <button class="btn ${nguyHiem ? 'danger' : 'primary'}" data-close="true">${h(dongY)}</button>
    </div>`).ketQua.then((v) => v === true);
}

/** Hộp chỉ để đọc, một nút đóng. */
export function hopThongTin({ tieuDe, noiDungHtml, nut = 'Đã hiểu' }) {
  return hopThoai(`<h2>${h(tieuDe)}</h2><div class="mt-s">${noiDungHtml}</div>
    <div class="actions"><button class="btn primary" data-close="true">${h(nut)}</button></div>`).ketQua;
}

// ---------- Nút đang xử lý ----------
/**
 * Khóa nút + hiện vòng quay trong lúc chạy `viec` (vd chờ MetaMask, chờ giao dịch vào khối).
 * Lỗi được báo bằng thông báo đỏ. Trả về kết quả của viec (lỗi thì undefined).
 */
export async function dangXuLy(nut, viec, chu = '') {
  const cu = nut?.innerHTML;
  if (nut) { nut.disabled = true; nut.innerHTML = `<span class="spinner"></span>${chu ? `<span>${h(chu)}</span>` : ''}`; }
  try {
    return await viec();
  } catch (loi) {
    baoLoi(loi);
    return undefined;
  } finally {
    if (nut && nut.isConnected) { nut.disabled = false; nut.innerHTML = cu; }
  }
}

// ---------- Khối hiển thị dùng chung ----------
export const htmlDangTai = '<div class="loading"><div class="spinner"></div></div>';
export const htmlTrong = (ic, tieuDe, phu = '', hanhDong = '') =>
  `<div class="empty">${icon(ic)}<h3>${h(tieuDe)}</h3><p>${h(phu)}</p>${hanhDong ? `<div class="mt">${hanhDong}</div>` : ''}</div>`;
export const htmlLoi = (thongDiep) => `<div class="empty">${icon('alert')}<h3>Có lỗi xảy ra</h3><p>${h(thongDiep)}</p></div>`;
export const nutQuayLai = (duongDan) => `<a class="back" href="#${duongDan}" aria-label="Quay lại">${icon('back')}</a>`;

/** Nhãn trạng thái vé (badge) */
export function nhanTrangThaiVe(trangThai, dangRao = false) {
  if (trangThai === 'DA_SU_DUNG') return '<span class="badge gray">Đã sử dụng</span>';
  if (trangThai === 'DA_HUY') return '<span class="badge red">Đã hủy</span>';
  if (dangRao) return '<span class="badge warn">Đang rao bán</span>';
  return '<span class="badge blue">Sắp đi</span>';
}

/**
 * MÃ TRA CỨU BLOCKCHAIN của một vé: mã vé (tokenId), mã chuyến, mã ghế — đúng các giá trị cần nhập vào
 * Etherscan (layVe, layTrangThaiGhe). Mỗi mã có nút sao chép (nút có data-chep, xử lý chung trong ung-dung.js).
 */
export function htmlMaTraCuu(ve) {
  const o = (nhan, hienThi, chep) =>
    `<span class="ma-tra-cuu-o"><span>${nhan}</span><code>${h(hienThi)}</code><button type="button" class="nut-chep" data-chep="${h(chep)}" title="Sao chép ${nhan.toLowerCase()}" aria-label="Sao chép ${nhan.toLowerCase()}">${icon('copy', 'sm')}</button></span>`;
  return `<div class="ma-tra-cuu">
    ${o('Mã vé', `#${ve.maVe}`, String(ve.maVe))}
    ${o('Mã chuyến', ve.maChuyen, ve.maChuyen)}
    ${o('Mã ghế', ve.maGhe, ve.maGhe)}
  </div>`;
}

export async function saoChep(text, thongDiep = 'Đã sao chép') {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  baoThanhCong(thongDiep);
}

// ---------- Mã QR (thư viện tải lười từ CDN, như bản cũ) ----------
let thuVienQR;
export function veQR(khung, noiDung, kichThuoc = 200) {
  const ve = () => { khung.innerHTML = ''; new window.QRCode(khung, { text: noiDung, width: kichThuoc, height: kichThuoc, correctLevel: window.QRCode.CorrectLevel.M }); };
  if (window.QRCode) return Promise.resolve(ve());
  thuVienQR ??= new Promise((ok, loi) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = ok; s.onerror = loi; document.head.appendChild(s);
  });
  return thuVienQR.then(ve).catch(() => { khung.innerHTML = '<div class="warn-msg">Không tải được thư viện QR — đưa nhân viên đoạn mã bên dưới.</div>'; });
}

// ---------- Giao diện sáng / tối ----------
export function doiGiaoDien() {
  const toi = document.documentElement.getAttribute('data-theme') !== 'dark';
  if (toi) document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('carbook_theme', toi ? 'dark' : 'light'); } catch { /* trình duyệt chặn bộ nhớ */ }
  return toi;
}
