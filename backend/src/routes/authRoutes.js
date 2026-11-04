const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/google-config', authController.googleConfig);
router.post('/google', authController.googleAuth);
router.get('/profile/:id', authController.getProfile);
router.put('/profile/:id', authController.updateProfile);
router.patch('/profile/:id', authController.updateProfile);

router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
