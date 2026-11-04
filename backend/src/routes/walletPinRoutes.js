const express = require('express');
const router = express.Router();
const walletPinController = require('../controllers/walletPinController');
const { verifyKhachHang } = require('../middlewares/auth');

router.get('/status', verifyKhachHang, walletPinController.getPinStatus);
router.post('/setup', verifyKhachHang, walletPinController.setupPin);
router.post('/request-otp', verifyKhachHang, walletPinController.requestPinOtp);
router.post('/confirm', verifyKhachHang, walletPinController.confirmPin);
router.post('/verify', verifyKhachHang, walletPinController.verifyPin);

module.exports = router;
