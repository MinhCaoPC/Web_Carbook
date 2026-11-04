const express = require('express');
const router = express.Router();
const adminReportController = require('../controllers/adminReportController');

// Lấy thông tin tổng quan (Doanh thu, chuyến đi, tỷ lệ lấp đầy)
router.get('/overview', adminReportController.getOverviewStats);

// Lấy dữ liệu vẽ biểu đồ doanh thu theo tuần/tháng/năm
router.get('/chart', adminReportController.getRevenueChartData);

// Lấy danh sách hóa đơn theo ngày (phục vụ bảng và phân trang)
router.get('/orders', adminReportController.getOrdersReport);

// Xuất file Excel báo cáo
router.get('/export', adminReportController.exportReportExcel);

module.exports = router;
