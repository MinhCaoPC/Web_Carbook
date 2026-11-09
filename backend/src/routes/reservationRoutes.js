const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');
const { verifyKhachHang, optionalKhachHang } = require('../middlewares/auth');

router.post('/giu-cho', verifyKhachHang, reservationController.giuCho);
router.get('/kiem-tra', optionalKhachHang, reservationController.kiemTra);
router.patch('/thong-tin-hanh-khach', verifyKhachHang, reservationController.thongTinHanhKhach);
router.patch('/diem-don-tra', verifyKhachHang, reservationController.diemDonTra);
router.post('/nha-ghe-va-chon-lai', verifyKhachHang, reservationController.nhaGheVaChonLai);
router.get('/thanh-toan', optionalKhachHang, reservationController.thongTinThanhToan);

module.exports = router;
