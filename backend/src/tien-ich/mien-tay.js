// Phạm vi kinh doanh: tuyến xe MIỀN TÂY (đồng bằng sông Cửu Long).
// Tuyến hợp lệ = có ít nhất một đầu ở miền Tây, đầu còn lại ở miền Tây hoặc TP.HCM.

// 5 tỉnh/thành ĐBSCL sau sáp nhập 2025 + tên tỉnh cũ + địa danh hay gặp trong dữ liệu tuyến
const DIA_DANH_MIEN_TAY = [
  'An Giang', 'Cần Thơ', 'Cà Mau', 'Vĩnh Long', 'Đồng Tháp',
  'Sóc Trăng', 'Hậu Giang', 'Bến Tre', 'Trà Vinh', 'Tiền Giang', 'Kiên Giang', 'Bạc Liêu',
  'Rạch Giá', 'Hà Tiên', 'Châu Đốc', 'Long Xuyên', 'Sa Đéc', 'Cao Lãnh', 'Hồng Ngự', 'Mỹ Tho', 'Gò Công',
  'Vĩnh Châu', 'Năm Căn', 'Gành Hào', 'Đầm Dơi', 'Hộ Phòng', 'Phước Long', 'An Minh', 'Gò Quao',
  'Khánh Bình', 'Vĩnh Thuận', 'Cầu Kè', 'Trà Ôn', 'Duyên Hải', 'Thạnh Phú', 'Ba Tri', 'miền Tây',
];
const DAU_MOI_TPHCM = ['tp.hcm', 'tp hcm', 'tphcm', 'ho chi minh', 'sai gon', 'ben cat', 'binh duong'];
const NGOAI_PHAM_VI = ['vung tau', 'mien dong', 'mien trung', 'mien bac', 'da lat', 'nha trang', 'ha noi'];

/** Bỏ dấu tiếng Việt + chữ thường + gộp khoảng trắng, để so khớp tên địa danh. */
function boDau(chuoi) {
  return String(chuoi || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const TAP_MIEN_TAY = DIA_DANH_MIEN_TAY.map(boDau);

/** Phân loại một đầu tuyến: 'MIEN_TAY' | 'DAU_MOI' (TP.HCM) | 'NGOAI'. */
function phanLoaiDiem(ten) {
  const t = boDau(ten);
  if (!t || NGOAI_PHAM_VI.some((k) => t.includes(k))) return 'NGOAI';
  if (TAP_MIEN_TAY.some((k) => t.includes(k))) return 'MIEN_TAY';
  if (DAU_MOI_TPHCM.some((k) => t.includes(k))) return 'DAU_MOI';
  return 'NGOAI';
}

/** Lộ trình có thuộc phạm vi miền Tây không. */
function laLoTrinhMienTay(loTrinh) {
  const a = phanLoaiDiem(loTrinh && loTrinh.diemKhoiHanh);
  const b = phanLoaiDiem(loTrinh && loTrinh.diemKetThuc);
  if (a === 'NGOAI' || b === 'NGOAI') return false;
  return a === 'MIEN_TAY' || b === 'MIEN_TAY';
}

/**
 * Mỗi tuyến chỉ giữ tối đa k chuyến/ngày, rải đều trong ngày (vd k=2 -> sớm nhất và muộn nhất).
 * @param {Array<{maLoTrinh:string, phutKhoiHanh:number}>} danhSachChuyen
 */
function chonChuyenMoiTuyen(danhSachChuyen, k) {
  const theoTuyen = new Map();
  for (const c of danhSachChuyen) {
    if (!theoTuyen.has(c.maLoTrinh)) theoTuyen.set(c.maLoTrinh, []);
    theoTuyen.get(c.maLoTrinh).push(c);
  }
  const ketQua = [];
  for (const ds of theoTuyen.values()) {
    ds.sort((x, y) => x.phutKhoiHanh - y.phutKhoiHanh);
    if (ds.length <= k) { ketQua.push(...ds); continue; }
    if (k === 1) { ketQua.push(ds[Math.floor((ds.length - 1) / 2)]); continue; }
    const viTri = new Set();
    for (let i = 0; i < k; i++) viTri.add(Math.round((i * (ds.length - 1)) / (k - 1)));
    for (const i of viTri) ketQua.push(ds[i]);
  }
  return ketQua;
}

module.exports = { boDau, phanLoaiDiem, laLoTrinhMienTay, chonChuyenMoiTuyen };
