// API QUẢN TRỊ (chỉ nhà xe): /api/quan-tri/...
const express = require('express');
const { boc } = require('./trung-gian');

/**
 * @param {object} p
 * @param {Function} p.canDangNhap
 * @param {Function} p.canNhaXe
 * @param {import('../dich-vu/dich-vu-thong-ke').DichVuThongKe} p.dichVuThongKe
 * @param {import('../dich-vu/dich-vu-quan-ly-danh-muc').DichVuQuanLyDanhMuc} p.dichVuDanhMuc
 * @param {import('../dich-vu/dich-vu-quan-ly-tai-khoan').DichVuQuanLyTaiKhoan} p.dichVuTaiKhoan
 */
function taoApiQuanTri({ canDangNhap, canNhaXe, dichVuThongKe, dichVuDanhMuc, dichVuTaiKhoan }) {
  const r = express.Router();
  r.use(canDangNhap, canNhaXe); // mọi API dưới đây đều phải là nhà xe

  // ----- Tổng quan / dashboard: ?soNgay=7|14|30|0 (0 = toàn bộ) -----
  r.get('/tong-quan', boc(async (req, res) => {
    const soNgay = [0, 7, 14, 30].includes(Number(req.query.soNgay)) ? Number(req.query.soNgay) : 14;
    res.json({ thanhCong: true, ...(await dichVuThongKe.tongQuan(soNgay)) });
  }));

  // ----- Vé & hành khách theo ngày đi: ?ngay=YYYY-MM-DD&maChuyen= -----
  r.get('/ve', boc(async (req, res) => {
    res.json({ thanhCong: true, danhSach: await dichVuThongKe.danhSachVe(req.query) });
  }));

  // ----- Vé khách không đi (quá giờ chạy, chưa soát, chưa chốt) -> nhà xe chốt để nhận tiền -----
  r.get('/ve-khong-di', boc(async (req, res) => {
    res.json({ thanhCong: true, danhSach: await dichVuThongKe.veKhachKhongDi() });
  }));

  // ----- Danh mục: lộ trình, chuyến mẫu, xe -----
  r.get('/danh-muc', (req, res) => res.json({ thanhCong: true, ...dichVuDanhMuc.danhSach() }));
  r.post('/lo-trinh', boc(async (req, res) => res.json({ thanhCong: true, muc: await dichVuDanhMuc.luuLoTrinh(null, req.body || {}) })));
  r.put('/lo-trinh/:ma', boc(async (req, res) => res.json({ thanhCong: true, muc: await dichVuDanhMuc.luuLoTrinh(req.params.ma, req.body || {}) })));
  r.post('/chuyen-mau', boc(async (req, res) => res.json({ thanhCong: true, muc: await dichVuDanhMuc.luuChuyenMau(null, req.body || {}) })));
  r.put('/chuyen-mau/:ma', boc(async (req, res) => res.json({ thanhCong: true, muc: await dichVuDanhMuc.luuChuyenMau(req.params.ma, req.body || {}) })));
  r.post('/xe', boc(async (req, res) => res.json({ thanhCong: true, muc: await dichVuDanhMuc.luuXe(null, req.body || {}) })));
  r.put('/xe/:ma', boc(async (req, res) => res.json({ thanhCong: true, muc: await dichVuDanhMuc.luuXe(req.params.ma, req.body || {}) })));

  // ----- Tài khoản & thông báo chung -----
  r.get('/tai-khoan', boc(async (req, res) => res.json({ thanhCong: true, danhSach: await dichVuTaiKhoan.danhSach() })));
  r.post('/tai-khoan/khoa', boc(async (req, res) => {
    const { email, khoa } = req.body || {};
    res.json({ thanhCong: true, nguoiDung: await dichVuTaiKhoan.datKhoa(email, khoa, req.nguoiDung) });
  }));
  r.get('/thong-bao-chung', boc(async (req, res) => res.json({ thanhCong: true, danhSach: await dichVuTaiKhoan.lichSuThongBao() })));
  r.post('/thong-bao-chung', boc(async (req, res) => res.json({ thanhCong: true, thongBao: await dichVuTaiKhoan.guiThongBao(req.body || {}, req.nguoiDung) })));

  return r;
}

module.exports = { taoApiQuanTri };
