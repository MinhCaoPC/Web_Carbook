const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

router.get('/theo-tai-khoan/:maTaiKhoan', customerController.layTheoTaiKhoan);

module.exports = router;
