// API thông báo: /api/thong-bao/...
const express = require('express');
const { boc } = require('./trung-gian');
const { DichVuThongBao } = require('../dich-vu/dich-vu-thong-bao');

/**
 * @param {{ dichVuThongBao: DichVuThongBao, canDangNhap: Function }} phuThuoc
 */
function taoApiThongBao({ dichVuThongBao, canDangNhap }) {
  const r = express.Router();
  r.use(canDangNhap);

  // Danh sách thông báo + số chưa đọc
  r.get('/', boc(async (req, res) => {
    const danhSach = await dichVuThongBao.danhSach(req.nguoiDung);
    res.json({ thanhCong: true, danhSach, soChuaDoc: danhSach.filter((n) => !n.daDoc).length });
  }));

  // Chỉ số chưa đọc (cho chấm đỏ trên menu)
  r.get('/so-chua-doc', boc(async (req, res) => {
    res.json({ thanhCong: true, soChuaDoc: await dichVuThongBao.soChuaDoc(req.nguoiDung) });
  }));

  // { ma } -> đánh dấu 1 thông báo đã đọc; không có ma -> đọc tất cả
  r.post('/da-doc', boc(async (req, res) => {
    const { ma } = req.body || {};
    DichVuThongBao.kiemTraMa(ma);
    await dichVuThongBao.danhDauDaDoc(req.nguoiDung, ma);
    res.json({ thanhCong: true });
  }));

  // { ma } -> xóa 1 thông báo; không có ma -> xóa tất cả
  r.post('/xoa', boc(async (req, res) => {
    const { ma } = req.body || {};
    DichVuThongBao.kiemTraMa(ma);
    await dichVuThongBao.xoa(req.nguoiDung, ma);
    res.json({ thanhCong: true });
  }));

  return r;
}

module.exports = { taoApiThongBao };
