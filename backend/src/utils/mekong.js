// Phạm vi kinh doanh của CARBOOK: vận chuyển hành khách khu vực MIỀN TÂY (đồng bằng sông Cửu Long).
// Tuyến hợp lệ = có ít nhất một đầu ở miền Tây, đầu còn lại ở miền Tây hoặc TP.HCM (đầu mối đi/đến miền Tây).
// Tuyến sang miền Đông (Vũng Tàu, "Miền Đông Mới"...) bị loại. Số chuyến mỗi tuyến/ngày được giới hạn
// (mặc định 2, chỉnh bằng MEKONG_TRIPS_PER_ROUTE) để quy mô vừa phải và nhẹ quota Firestore.

// 5 tỉnh/thành ĐBSCL theo địa giới SAU sáp nhập 2025 (khớp tên dùng trong dữ liệu lộ trình):
//   Cần Thơ (+Sóc Trăng, Hậu Giang) · Vĩnh Long (+Bến Tre, Trà Vinh) · Đồng Tháp (+Tiền Giang)
//   An Giang (+Kiên Giang) · Cà Mau (+Bạc Liêu).  Long An nay thuộc Tây Ninh nên không tính là miền Tây.
const TINH_MIEN_TAY = ['An Giang', 'Cần Thơ', 'Cà Mau', 'Vĩnh Long', 'Đồng Tháp'];
// Tên cũ của các tỉnh đã sáp nhập vẫn hay xuất hiện như địa danh/thành phố trong tuyến (vd "Sóc Trăng (Cần Thơ)").
const TINH_CU_DA_SAP_NHAP = ['Sóc Trăng', 'Hậu Giang', 'Bến Tre', 'Trà Vinh', 'Tiền Giang', 'Kiên Giang', 'Bạc Liêu'];
// Địa danh/huyện thị hay gặp trong dữ liệu tuyến, ví dụ "Hà Tiên (An Giang)".
const DIA_DANH_MIEN_TAY = [
  'Rạch Giá', 'Hà Tiên', 'Châu Đốc', 'Long Xuyên', 'Sa Đéc', 'Cao Lãnh', 'Hồng Ngự', 'Mỹ Tho', 'Gò Công',
  'Vĩnh Châu', 'Năm Căn', 'Gành Hào', 'Đầm Dơi', 'Hộ Phòng', 'Phước Long', 'An Minh', 'Gò Quao',
  'Khánh Bình', 'Vĩnh Thuận', 'Cầu Kè', 'Trà Ôn', 'Duyên Hải', 'Thạnh Phú', 'Ba Tri',
];
const HUB = ['tp.hcm', 'tp hcm', 'tphcm', 'ho chi minh', 'sai gon', 'ben cat', 'binh duong'];
const NGOAI_PHAM_VI = ['vung tau', 'mien dong', 'mien trung', 'mien bac', 'da lat', 'nha trang', 'ha noi'];

function bo_dau(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const SET_MIEN_TAY = [...TINH_MIEN_TAY, ...TINH_CU_DA_SAP_NHAP, ...DIA_DANH_MIEN_TAY].map(bo_dau);

// 'MIEN_TAY' | 'DAU_MOI' (TP.HCM) | 'NGOAI' — phân loại một đầu của lộ trình
function phanLoaiDiem(ten) {
  const t = bo_dau(ten);
  if (!t) return 'NGOAI';
  if (NGOAI_PHAM_VI.some((k) => t.includes(k))) return 'NGOAI';
  if (t.includes('mien tay') || SET_MIEN_TAY.some((k) => t.includes(k))) return 'MIEN_TAY';
  if (HUB.some((k) => t.includes(k))) return 'DAU_MOI';
  return 'NGOAI';
}

// Lộ trình thuộc phạm vi miền Tây? (nhận object có diemKhoiHanh/diemKetThuc)
function laLoTrinhMienTay(loTrinh) {
  const a = phanLoaiDiem(loTrinh && loTrinh.diemKhoiHanh);
  const b = phanLoaiDiem(loTrinh && loTrinh.diemKetThuc);
  if (a === 'NGOAI' || b === 'NGOAI') return false;
  return a === 'MIEN_TAY' || b === 'MIEN_TAY';
}

function soChuyenMoiTuyen() {
  const n = Number(process.env.MEKONG_TRIPS_PER_ROUTE || 2);
  return Number.isInteger(n) && n > 0 ? n : 2;
}

// Phút trong ngày của giờ xuất phát mẫu (Timestamp Firestore, Date hoặc chuỗi 'YYYY-MM-DD HH:mm:ss')
function phutTrongNgay(ts) {
  if (!ts) return 0;
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(String(ts).replace(' ', 'T'));
  return d.getHours() * 60 + d.getMinutes();
}

// Chọn tối đa k chuyến mỗi tuyến, rải đều trong ngày (vd 3 chuyến, k=2 -> chuyến sớm nhất và muộn nhất).
// trips: [{ id|maChuyenXe, maLoTrinh, thoiGianXuatPhat }]. Trả về mảng con (giữ nguyên object).
function chonChuyenMoiTuyen(trips, k = soChuyenMoiTuyen()) {
  const theoTuyen = new Map();
  for (const t of trips) {
    if (!theoTuyen.has(t.maLoTrinh)) theoTuyen.set(t.maLoTrinh, []);
    theoTuyen.get(t.maLoTrinh).push(t);
  }
  const chon = [];
  for (const ds of theoTuyen.values()) {
    ds.sort((a, b) => phutTrongNgay(a.thoiGianXuatPhat) - phutTrongNgay(b.thoiGianXuatPhat));
    if (ds.length <= k) { chon.push(...ds); continue; }
    if (k === 1) { chon.push(ds[Math.floor((ds.length - 1) / 2)]); continue; }
    const idx = new Set();
    for (let i = 0; i < k; i++) idx.add(Math.round((i * (ds.length - 1)) / (k - 1)));
    for (const i of idx) chon.push(ds[i]);
  }
  return chon;
}

module.exports = { TINH_MIEN_TAY, phanLoaiDiem, laLoTrinhMienTay, chonChuyenMoiTuyen, soChuyenMoiTuyen, bo_dau };
