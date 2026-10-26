const { db } = require('../config/firebase');

const KHACHHANG_COLLECTION = 'KHACHHANG';
const TAIKHOAN_COLLECTION = 'TAIKHOAN';

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Trả về (hoặc tự tạo nếu chưa có) bản ghi KHACHHANG ứng với 1 TAIKHOAN đã đăng nhập.
// App hiện lưu phiên đăng nhập theo id TAIKHOAN, trong khi luồng đặt vé/thanh toán
// làm việc trên maKhachHang (KHACHHANG), nên cần một điểm ánh xạ 1-1 giữa 2 bảng.
async function layHoacTaoKhachHang(maTaiKhoan) {
  if (!maTaiKhoan) {
    throw httpError('Thiếu maTaiKhoan.', 400);
  }

  const existing = await db.collection(KHACHHANG_COLLECTION)
    .where('maTaiKhoan', '==', maTaiKhoan)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    return { maKhachHang: doc.id, ...doc.data() };
  }

  const taiKhoanDoc = await db.collection(TAIKHOAN_COLLECTION).doc(maTaiKhoan).get();
  if (!taiKhoanDoc.exists) {
    throw httpError('Không tìm thấy tài khoản.', 404);
  }
  const taiKhoan = taiKhoanDoc.data();

  const maKhachHang = `KH${Date.now()}`;
  const khachHangMoi = {
    maTaiKhoan,
    hoTen: `${taiKhoan.firstName || ''} ${taiKhoan.lastName || ''}`.trim(),
    sdt: taiKhoan.phone || '',
    diaChi: '',
    gioiTinh: null,
    ngaySinh: null,
  };
  await db.collection(KHACHHANG_COLLECTION).doc(maKhachHang).set(khachHangMoi);

  return { maKhachHang, ...khachHangMoi };
}

module.exports = { layHoacTaoKhachHang };
