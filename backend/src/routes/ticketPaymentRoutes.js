const express = require('express');
const router = express.Router();
const ticketPaymentController = require('../controllers/ticketPaymentController');
const { verifyKhachHang } = require('../middlewares/auth');

router.post('/', verifyKhachHang, ticketPaymentController.thanhToan);

// Thanh toán vé trực tiếp qua cổng VNPay (phương thức 2)
router.post('/vnpay', verifyKhachHang, ticketPaymentController.taoDonVnpay);
// VNPay redirect về từ trình duyệt/WebView — không có header đăng nhập nên để public,
// an toàn nhờ verify chữ ký HMAC trong service
router.get('/vnpay-return', ticketPaymentController.vnpayReturnVe);
router.post('/vnpay-reconcile', verifyKhachHang, ticketPaymentController.doiSoatVnpay);

module.exports = router;
