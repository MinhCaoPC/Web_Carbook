// Các hàm xử lý ngày giờ theo GIỜ VIỆT NAM (UTC+7), không phụ thuộc múi giờ của máy chủ.

const LECH_GIO_VN_MS = 7 * 60 * 60 * 1000;
const MOT_NGAY_MS = 24 * 60 * 60 * 1000;

/** Ngày hôm nay ở Việt Nam, dạng "YYYY-MM-DD". */
function homNay(bayGio = Date.now()) {
  return new Date(bayGio + LECH_GIO_VN_MS).toISOString().slice(0, 10);
}

/** Danh sách `soNgay` ngày bán vé, bắt đầu từ hôm nay. */
function danhSachNgayBanVe(soNgay, bayGio = Date.now()) {
  return Array.from({ length: soNgay }, (_, i) => homNay(bayGio + i * MOT_NGAY_MS));
}

/** Đổi một mốc thời gian (Date/Timestamp Firestore/số ms) thành số phút trong ngày theo giờ VN. */
function phutTrongNgayVN(thoiDiem) {
  const ms = doiSangMili(thoiDiem);
  const d = new Date(ms + LECH_GIO_VN_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Ghép "ngày" + "số phút trong ngày" (giờ VN) thành Date thật. */
function ghepNgayVaPhut(ngay, phut) {
  const nuaDem = Date.parse(`${ngay}T00:00:00+07:00`);
  return new Date(nuaDem + phut * 60 * 1000);
}

/** Chấp nhận nhiều kiểu dữ liệu thời gian và trả về số mili-giây. */
function doiSangMili(thoiDiem) {
  if (thoiDiem == null) return NaN;
  if (typeof thoiDiem === 'number') return thoiDiem;
  if (thoiDiem instanceof Date) return thoiDiem.getTime();
  if (typeof thoiDiem.toMillis === 'function') return thoiDiem.toMillis(); // Timestamp Firestore
  if (typeof thoiDiem._seconds === 'number') return thoiDiem._seconds * 1000; // Timestamp đã lưu ra JSON
  if (typeof thoiDiem.__ts === 'number') return thoiDiem.__ts; // định dạng file sao lưu cũ
  return Date.parse(String(thoiDiem));
}

/** "HH:mm" theo giờ VN. */
function dinhDangGio(date) {
  const d = new Date(date.getTime() + LECH_GIO_VN_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

module.exports = { homNay, danhSachNgayBanVe, phutTrongNgayVN, ghepNgayVaPhut, doiSangMili, dinhDangGio, MOT_NGAY_MS };
