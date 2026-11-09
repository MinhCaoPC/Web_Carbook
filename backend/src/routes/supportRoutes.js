const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { requireSelfAccount } = require('../middlewares/auth');

// Tuyến đường POST: /api/support
router.post('/', requireSelfAccount('maKhachHang', 'body'), supportController.createSupportRequest);
router.get('/:maKhachHang', requireSelfAccount('maKhachHang'), supportController.getSupportHistory);
module.exports = router;