const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { requireSelfAccount } = require('../middlewares/auth');

router.get('/theo-tai-khoan/:maTaiKhoan', requireSelfAccount('maTaiKhoan'), customerController.layTheoTaiKhoan);

module.exports = router;
