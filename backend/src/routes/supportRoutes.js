const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');

// Tuyến đường POST: /api/support
router.post('/', supportController.createSupportRequest);
router.get('/:maKhachHang', supportController.getSupportHistory);
module.exports = router;