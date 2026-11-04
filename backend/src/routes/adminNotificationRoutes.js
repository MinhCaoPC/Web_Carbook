const express = require('express');
const router = express.Router();
const adminNotificationController = require('../controllers/adminNotificationController');

// GET /api/admin/notifications?limit=3
router.get('/', adminNotificationController.listAdminNotifications);

// GET /api/admin/notifications/stats
router.get('/stats', adminNotificationController.getAdminNotificationStats);

// GET /api/admin/notifications/history?limit=10
router.get('/history', adminNotificationController.getCustomerNotificationHistory);

// POST /api/admin/notifications/broadcast — gửi thông báo tới 1 khách hàng hoặc toàn bộ
router.post('/broadcast', adminNotificationController.broadcastNotification);

module.exports = router;
