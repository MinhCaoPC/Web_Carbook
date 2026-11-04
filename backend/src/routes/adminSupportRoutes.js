const express = require('express');
const router = express.Router();
const adminSupportController = require('../controllers/adminSupportController');

// Lấy danh sách yêu cầu hỗ trợ cho Admin
router.get('/', adminSupportController.getAllSupportRequests);

// Cập nhật trạng thái yêu cầu hỗ trợ (Ví dụ: Phê duyệt / Từ chối)
router.put('/:id', adminSupportController.updateSupportRequestStatus);

module.exports = router;
