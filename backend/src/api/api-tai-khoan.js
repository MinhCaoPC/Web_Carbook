// API tài khoản: /api/tai-khoan/...
const express = require('express');
const { boc } = require('./trung-gian');
const { DichVuXacThuc } = require('../dich-vu/dich-vu-xac-thuc');

/**
 * @param {{ dichVuXacThuc: DichVuXacThuc, canDangNhap: Function, blockchain: import('../ket-noi/ket-noi-blockchain').KetNoiBlockchain }} phuThuoc
 */
function taoApiTaiKhoan({ dichVuXacThuc, canDangNhap, blockchain }) {
  const r = express.Router();

  // Đăng ký: { email, matKhau, hoTen, sdt }
  r.post('/dang-ky', boc(async (req, res) => {
    const { token, nguoiDung } = await dichVuXacThuc.dangKy(req.body || {});
    res.status(201).json({ thanhCong: true, token, nguoiDung });
  }));

  // Đăng nhập: { email, matKhau }
  r.post('/dang-nhap', boc(async (req, res) => {
    const { token, nguoiDung } = await dichVuXacThuc.dangNhap(req.body || {});
    res.json({ thanhCong: true, token, nguoiDung });
  }));

  // ----- Đăng nhập Google -----
  // Web hỏi: có bật Google không, client ID là gì (để vẽ nút "Đăng nhập với Google")
  r.get('/cau-hinh-google', (req, res) => {
    res.json({ thanhCong: true, ...dichVuXacThuc.cauHinhGoogle() });
  });
  // { idToken } do thư viện Google trả về trên trình duyệt
  r.post('/dang-nhap-google', boc(async (req, res) => {
    const { token, nguoiDung } = await dichVuXacThuc.dangNhapGoogle((req.body || {}).idToken);
    res.json({ thanhCong: true, token, nguoiDung });
  }));

  // ----- Quên mật khẩu: 3 bước -----
  // B1 { email } -> gửi mã OTP 6 số qua email
  r.post('/quen-mat-khau', boc(async (req, res) => {
    await dichVuXacThuc.guiMaQuenMatKhau((req.body || {}).email);
    res.json({ thanhCong: true, thongBao: 'Nếu email đã đăng ký, mã OTP đã được gửi tới hộp thư.' });
  }));
  // B2 { email, ma } -> kiểm tra mã
  r.post('/xac-thuc-ma', boc(async (req, res) => {
    await dichVuXacThuc.xacThucMaKhoiPhuc((req.body || {}).email, (req.body || {}).ma);
    res.json({ thanhCong: true });
  }));
  // B3 { email, ma, matKhauMoi } -> đặt mật khẩu mới
  r.post('/dat-lai-mat-khau', boc(async (req, res) => {
    const { email, ma, matKhauMoi } = req.body || {};
    await dichVuXacThuc.datLaiMatKhau(email, ma, matKhauMoi);
    res.json({ thanhCong: true, thongBao: 'Đã đổi mật khẩu.' });
  }));

  // Thông tin tài khoản đang đăng nhập
  r.get('/toi', canDangNhap, (req, res) => {
    res.json({ thanhCong: true, nguoiDung: req.nguoiDung });
  });

  // VAI TRÒ của tài khoản, đọc TRỰC TIẾP TỪ BLOCKCHAIN theo ví đã liên kết -> web chọn 1 trong 3 giao diện:
  //   nhaXe  : ví là chủ hợp đồng VeXeNFT            -> giao diện Nhà xe
  //   soatVe : hợp đồng ghi ví này là nhân viên soát vé -> giao diện Soát vé
  //   còn lại: khách hàng                              -> giao diện Khách
  r.get('/vai-tro', canDangNhap, boc(async (req, res) => {
    const vi = req.nguoiDung.diaChiVi;
    let vaiTro = { nhaXe: false, soatVe: false };
    if (vi) {
      try {
        const nhaXe = (await blockchain.chuHopDong()) === vi;
        vaiTro = { nhaXe, soatVe: nhaXe || (await blockchain.coQuyenSoatVe(vi)) };
      } catch { /* hợp đồng chưa triển khai / mạng chưa chạy -> coi là khách */ }
    }
    res.json({ thanhCong: true, vaiTro });
  }));

  // Cập nhật họ tên, SĐT
  r.put('/toi', canDangNhap, boc(async (req, res) => {
    const nguoiDung = await dichVuXacThuc.capNhatThongTin(req.nguoiDung.email, req.body || {});
    res.json({ thanhCong: true, nguoiDung });
  }));

  // Câu cần ký để liên kết ví: ?diaChi=0x...
  r.get('/noi-dung-lien-ket-vi', canDangNhap, (req, res) => {
    res.json({ thanhCong: true, noiDung: DichVuXacThuc.noiDungLienKetVi(req.nguoiDung.email, req.query.diaChi || '') });
  });

  // Liên kết ví MetaMask: { diaChi, chuKy }
  r.post('/lien-ket-vi', canDangNhap, boc(async (req, res) => {
    const nguoiDung = await dichVuXacThuc.lienKetVi(req.nguoiDung.email, req.body || {});
    res.json({ thanhCong: true, nguoiDung });
  }));

  return r;
}

module.exports = { taoApiTaiKhoan };
