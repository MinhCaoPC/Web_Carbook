const walletPinService = require('../services/walletPinService');

function handleError(res, error, fallback) {
  console.error(fallback, error.message || error);
  return res.status(error.statusCode || 500).json({ success: false, message: error.message || fallback });
}

// GET /api/wallet-pin/status — tài khoản đã đặt mã PIN ví chưa
exports.getPinStatus = async (req, res) => {
  try {
    const result = await walletPinService.getPinStatus(req.maKhachHangDangNhap);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi kiểm tra mã PIN.');
  }
};

// POST /api/wallet-pin/setup — body { maPin }: đặt PIN lần đầu (lúc kích hoạt ví, không cần OTP)
exports.setupPin = async (req, res) => {
  try {
    const result = await walletPinService.setupPin(req.maKhachHangDangNhap, req.body?.maPin);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi đặt mã PIN.');
  }
};

// POST /api/wallet-pin/request-otp — body { email }: xác nhận đúng Gmail đã đăng ký rồi gửi OTP
exports.requestPinOtp = async (req, res) => {
  try {
    const result = await walletPinService.requestPinOtp(req.maKhachHangDangNhap, req.body?.email);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi gửi mã OTP.');
  }
};

// POST /api/wallet-pin/confirm — body { otp, maPin }: xác thực OTP và lưu PIN mới
exports.confirmPin = async (req, res) => {
  try {
    const result = await walletPinService.confirmPin(req.maKhachHangDangNhap, req.body?.otp, req.body?.maPin);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi đặt mã PIN.');
  }
};

// POST /api/wallet-pin/verify — body { maPin }: xác thực PIN (dùng trước khi thanh toán)
exports.verifyPin = async (req, res) => {
  try {
    const result = await walletPinService.verifyPin(req.maKhachHangDangNhap, req.body?.maPin);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi xác thực mã PIN.');
  }
};
