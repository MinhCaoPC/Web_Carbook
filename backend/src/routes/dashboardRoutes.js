const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Thêm middleware xác thực nếu cần (ví dụ requireAdmin)
// const { verifyToken } = require('../middlewares/authMiddleware');

router.get('/overview', dashboardController.overview);

module.exports = router;
