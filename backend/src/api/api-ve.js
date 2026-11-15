// API vé: /api/ve/... và metadata NFT /api/metadata/:maVe
const express = require('express');
const { boc } = require('./trung-gian');

/**
 * @param {{ dichVuVe: import('../dich-vu/dich-vu-ve').DichVuVe, canDangNhap: Function }} phuThuoc
 */
function taoApiVe({ dichVuVe, canDangNhap }) {
  const r = express.Router();

  // Vé trong ví đã liên kết của tôi (đọc từ blockchain)
  r.get('/cua-toi', canDangNhap, boc(async (req, res) => {
    res.json({ thanhCong: true, danhSach: await dichVuVe.veCuaToi(req.nguoiDung) });
  }));

  // TRA CỨU VÉ công khai (không cần đăng nhập): vé có thật không, trạng thái, chủ sở hữu — không có thông tin cá nhân
  r.get('/tra-cuu/:maVe', boc(async (req, res) => {
    res.json({ thanhCong: true, ve: await dichVuVe.traCuuCongKhai(req.params.maVe) });
  }));

  // Vé tôi đã hủy (đọc từ sự kiện DaHuyVe) + gợi ý đặt lại
  r.get('/da-huy', canDangNhap, boc(async (req, res) => {
    res.json({ thanhCong: true, danhSach: await dichVuVe.veDaHuy(req.nguoiDung) });
  }));

  // Lưu họ tên/SĐT hành khách sau khi mua: { danhSach: [{ maVe, hoTen, sdt }] }
  r.post('/hanh-khach', canDangNhap, boc(async (req, res) => {
    res.json({ thanhCong: true, ...(await dichVuVe.luuThongTinHanhKhach(req.nguoiDung, (req.body || {}).danhSach)) });
  }));

  // Chợ vé: các vé đang rao bán
  r.get('/cho', boc(async (req, res) => {
    res.json({ thanhCong: true, danhSach: await dichVuVe.choVe() });
  }));

  // Soát vé — bước kiểm tra mã QR: { maVe, chuKy }
  r.post('/soat-ve/kiem-tra', canDangNhap, boc(async (req, res) => {
    res.json({ thanhCong: true, ...(await dichVuVe.kiemTraSoatVe(req.nguoiDung, req.body || {})) });
  }));

  return r;
}

/** tokenURI của NFT trỏ về đây: /api/metadata/<maVe> */
function taoApiMetadata({ dichVuVe }) {
  const r = express.Router();
  r.get('/:maVe', boc(async (req, res) => {
    res.json(await dichVuVe.metadata(Number(req.params.maVe)));
  }));
  return r;
}

module.exports = { taoApiVe, taoApiMetadata };
