// API chuyến xe (chức năng 1): /api/chuyen-xe/...
const express = require('express');
const { boc } = require('./trung-gian');

/** @param {{ dichVuChuyenXe: import('../dich-vu/dich-vu-chuyen-xe').DichVuChuyenXe }} phuThuoc */
function taoApiChuyenXe({ dichVuChuyenXe }) {
  const r = express.Router();

  // Các ngày đang bán vé
  r.get('/ngay', (req, res) => {
    res.json({ thanhCong: true, danhSachNgay: dichVuChuyenXe.danhSachNgay() });
  });

  // Điểm đi / điểm đến / các tuyến có thật
  r.get('/dia-diem', (req, res) => {
    res.json({ thanhCong: true, ...dichVuChuyenXe.danhSachDiaDiem() });
  });

  // Tìm chuyến: ?diemDi=&diemDen=&ngay=YYYY-MM-DD
  r.get('/tim', boc(async (req, res) => {
    const danhSach = await dichVuChuyenXe.timChuyen(req.query);
    res.json({ thanhCong: true, danhSach });
  }));

  // Dành cho nhà xe: các chuyến của ngày chưa mở bán on-chain (?ngay=)
  r.get('/can-mo-ban', boc(async (req, res) => {
    res.json({ thanhCong: true, ...(await dichVuChuyenXe.chuyenCanMoBan(req.query.ngay)) });
  }));

  // Chi tiết 1 chuyến + sơ đồ ghế (ghế nào đã bán lấy từ blockchain)
  r.get('/:maChuyen', boc(async (req, res) => {
    res.json({ thanhCong: true, ...(await dichVuChuyenXe.chiTietChuyen(req.params.maChuyen)) });
  }));

  return r;
}

module.exports = { taoApiChuyenXe };
