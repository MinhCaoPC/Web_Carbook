const express = require('express');
const router = express.Router();
const c = require('../controllers/nftController');
const { verifyKhachHang, optionalKhachHang } = require('../middlewares/auth');

router.get('/config', c.layCauHinh);
router.get('/my', verifyKhachHang, c.veNftCuaToi);

// Chợ bán lại vé
router.get('/market', optionalKhachHang, c.danhSachRaoBan);
router.post('/market/list', verifyKhachHang, c.raoBan);
router.post('/market/cancel', verifyKhachHang, c.huyRaoBan);
router.post('/market/buy', verifyKhachHang, c.muaVe);

module.exports = router;
