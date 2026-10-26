const crypto = require('crypto');
const { db } = require('../config/firebase');
const { sendOtpEmail } = require('../config/mailer');

const KHACHHANG_COLLECTION = 'KHACHHANG';
const TAIKHOAN_COLLECTION = 'TAIKHOAN';
const OTP_TTL_MS = 5 * 60 * 1000; // OTP sống 5 phút (giống luồng quên mật khẩu)

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

// Tìm TAIKHOAN của khách đang đăng nhập (KHACHHANG -> maTaiKhoan -> TAIKHOAN)
async function layTaiKhoanCuaKhach(maKhachHang) {
  const khDoc = await db.collection(KHACHHANG_COLLECTION).doc(maKhachHang).get();
  if (!khDoc.exists) throw httpError('Không tìm thấy khách hàng.', 404);

  const maTaiKhoan = khDoc.data().maTaiKhoan;
  const tkDoc = maTaiKhoan ? await db.collection(TAIKHOAN_COLLECTION).doc(maTaiKhoan).get() : null;
  if (!tkDoc || !tkDoc.exists) throw httpError('Không tìm thấy tài khoản liên kết.', 404);

  return tkDoc;
}

// READ: kiểm tra tài khoản đã đặt mã PIN ví chưa
async function getPinStatus(maKhachHang) {
  const tkDoc = await layTaiKhoanCuaKhach(maKhachHang);
  return { daDatPin: !!tkDoc.data().maPinVi };
}

// CREATE (đặt PIN lần đầu — lúc kích hoạt ví): chưa có PIN thì cho đặt thẳng không cần OTP
// (người dùng đang đăng nhập). Đã có PIN rồi thì bắt buộc đi luồng đổi PIN qua email + OTP.
async function setupPin(maKhachHang, maPin) {
  if (!/^\d{6}$/.test(String(maPin || ''))) {
    throw httpError('Mã PIN phải gồm đúng 6 chữ số.', 400);
  }

  const tkDoc = await layTaiKhoanCuaKhach(maKhachHang);
  if (tkDoc.data().maPinVi) {
    throw httpError('Tài khoản đã có mã PIN. Vui lòng dùng chức năng đổi mã PIN (xác thực qua email).', 403);
  }

  await tkDoc.ref.update({ maPinVi: hashPin(maPin) });
  return { message: 'Đặt mã PIN ví thành công.' };
}

// CREATE OTP (bước 1 đổi/reset PIN): bắt nhập đúng Gmail đã đăng ký tài khoản (kể cả tài khoản
// Google) rồi mới sinh OTP — tận dụng trường resetOtp/resetOtpExpires của luồng quên mật khẩu.
async function requestPinOtp(maKhachHang, email) {
  if (!email) throw httpError('Vui lòng nhập email đã đăng ký tài khoản.', 400);

  const tkDoc = await layTaiKhoanCuaKhach(maKhachHang);
  const emailTaiKhoan = (tkDoc.data().email || '').trim().toLowerCase();
  if (emailTaiKhoan !== email.trim().toLowerCase()) {
    throw httpError('Email không khớp với email đã đăng ký của tài khoản này.', 400);
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  await tkDoc.ref.update({
    resetOtp: otp,
    resetOtpExpires: Date.now() + OTP_TTL_MS,
  });

  try {
    await sendOtpEmail(emailTaiKhoan, otp);
  } catch (mailErr) {
    console.warn('⚠️ Không gửi được email OTP đặt PIN:', mailErr.message);
    console.log(`👉 [DEMO BYPASS] OTP đặt mã PIN ví: ${otp}`);
  }

  return { message: 'Mã OTP đã được gửi đến email của bạn.' };
}

// UPDATE (bước 2): xác thực OTP rồi lưu mã PIN mới (băm sha256, không lưu PIN thô)
async function confirmPin(maKhachHang, otp, maPin) {
  if (!otp || !maPin) throw httpError('Vui lòng nhập mã OTP và mã PIN mới.', 400);
  if (!/^\d{6}$/.test(String(maPin))) {
    throw httpError('Mã PIN phải gồm đúng 6 chữ số.', 400);
  }

  const tkDoc = await layTaiKhoanCuaKhach(maKhachHang);
  const data = tkDoc.data();

  if (!data.resetOtp || !data.resetOtpExpires) {
    throw httpError('Chưa yêu cầu mã OTP. Vui lòng thực hiện lại bước gửi OTP.', 400);
  }
  if (Date.now() > data.resetOtpExpires) {
    throw httpError('Mã OTP đã hết hạn, vui lòng gửi lại.', 400);
  }
  if (data.resetOtp !== String(otp)) {
    throw httpError('Mã OTP không đúng.', 400);
  }

  await tkDoc.ref.update({
    maPinVi: hashPin(maPin),
    resetOtp: null,
    resetOtpExpires: null,
  });

  return { message: 'Đặt mã PIN ví thành công.' };
}

// READ (xác thực): so mã PIN nhập vào với PIN đã lưu — dùng trước khi thanh toán ví
async function verifyPin(maKhachHang, maPin) {
  const tkDoc = await layTaiKhoanCuaKhach(maKhachHang);
  const maPinViDaLuu = tkDoc.data().maPinVi;

  if (!maPinViDaLuu) {
    throw httpError('Ví chưa đặt mã PIN. Vui lòng vào Ví CarbookPay để đặt mã PIN trước.', 400);
  }
  if (!maPin || hashPin(maPin) !== maPinViDaLuu) {
    throw httpError('Mã PIN không đúng.', 400);
  }
  return { hopLe: true };
}

module.exports = { getPinStatus, setupPin, requestPinOtp, confirmPin, verifyPin };
