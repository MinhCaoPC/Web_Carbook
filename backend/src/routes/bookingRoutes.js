const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { verifyKhachHang, requireSelfKhachHang } = require('../middlewares/auth');

// Tuyến đường GET lấy lịch sử đặt vé (Ví dụ: /api/bookings/history/KH123)
router.get('/history/:customerId', requireSelfKhachHang('customerId'), bookingController.getBookingHistory);

// Chi tiết vé lên xe (boarding pass) theo mã đặt vé — dùng sau thanh toán hoặc từ lịch sử
router.get('/ticket/:maDatVe', verifyKhachHang, bookingController.getTicketDetail);

// ... (Khai báo các route tạo vé, giữ chỗ khác ở đây) ...

module.exports = router;