const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyKhachHang } = require('../middlewares/auth');

router.get('/', verifyKhachHang, notificationController.listNotifications);
router.post('/payment-reminder', verifyKhachHang, notificationController.createPaymentReminder);
router.patch('/read', verifyKhachHang, notificationController.markAsRead);
router.delete('/', verifyKhachHang, notificationController.deleteNotifications);

module.exports = router;
