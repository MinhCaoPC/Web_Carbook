const express = require('express');
const router = express.Router();
const searchHistoryController = require('../controllers/searchHistoryController');
const { verifyKhachHang } = require('../middlewares/auth');

router.get('/gan-day', verifyKhachHang, searchHistoryController.layTimKiemGanDay);
router.delete('/gan-day', verifyKhachHang, searchHistoryController.xoaTimKiemGanDay);

module.exports = router;
