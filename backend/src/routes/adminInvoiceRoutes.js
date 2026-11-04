const express = require('express');
const router = express.Router();
const adminInvoiceController = require('../controllers/adminInvoiceController');

// Lấy thống kê tổng quan
router.get('/stats', adminInvoiceController.getInvoiceStats);

// Lấy danh sách hóa đơn (có lọc/tìm kiếm)
router.get('/', adminInvoiceController.getInvoices);

// Xem chi tiết một hóa đơn (vé)
router.get('/:id', adminInvoiceController.getInvoiceDetail);

module.exports = router;
