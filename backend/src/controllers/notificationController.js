const notificationService = require('../services/notificationService');

// GET /api/notifications — danh sách thông báo (tự sinh nhắc "chuyến sắp khởi hành" trước 1 tiếng)
exports.listNotifications = async (req, res) => {
  try {
    const danhSach = await notificationService.listNotifications(req.maKhachHangDangNhap);
    const soChuaDoc = danhSach.filter((tb) => !tb.daDoc).length;
    return res.status(200).json({ success: true, soChuaDoc, danhSach });
  } catch (error) {
    console.error('listNotifications error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thông báo.' });
  }
};

// POST /api/notifications/payment-reminder — body { danhSachMaDatVe }:
// tạo thông báo in-app "thanh toán chưa hoàn tất" khi khách rời trang thanh toán giữa chừng
exports.createPaymentReminder = async (req, res) => {
  try {
    const result = await notificationService.createPaymentReminder(
      req.maKhachHangDangNhap,
      req.body?.danhSachMaDatVe
    );
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('createPaymentReminder error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi máy chủ khi tạo nhắc thanh toán.' });
  }
};

// PATCH /api/notifications/read — body { maThongBao? }: đánh dấu đã đọc 1 cái hoặc tất cả
exports.markAsRead = async (req, res) => {
  try {
    const soDaDanhDau = await notificationService.markAsRead(req.maKhachHangDangNhap, req.body?.maThongBao);
    return res.status(200).json({ success: true, soDaDanhDau });
  } catch (error) {
    console.error('markAsRead error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đánh dấu đã đọc.' });
  }
};

// DELETE /api/notifications — query ?maThongBao=: xóa 1 cái hoặc toàn bộ
exports.deleteNotifications = async (req, res) => {
  try {
    const soDaXoa = await notificationService.deleteNotifications(req.maKhachHangDangNhap, req.query?.maThongBao);
    return res.status(200).json({ success: true, soDaXoa });
  } catch (error) {
    console.error('deleteNotifications error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa thông báo.' });
  }
};
