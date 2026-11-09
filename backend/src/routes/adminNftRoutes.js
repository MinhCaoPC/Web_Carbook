const express = require('express');
const router = express.Router();
const c = require('../controllers/nftController');

// Đã nằm sau requireAdmin của /api/admin (xem server.js)
router.post('/check-in', c.checkIn);
router.post('/retry-mint', c.thuLaiMint);

module.exports = router;
