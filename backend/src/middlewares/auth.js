// Ứng dụng hiện dùng tài khoản tự quản lý (TAIKHOAN + mật khẩu băm), chưa tích hợp Firebase
// Auth ID token ở phía client. Để verify "maKhachHang trong body khớp với user đang đăng nhập"
// theo đúng tinh thần yêu cầu, middleware này đối chiếu header `x-ma-khach-hang` (do client gửi
// sau khi đăng nhập) với maKhachHang trong body/query của request.
// TODO: khi tích hợp Firebase Auth ID token thật, thay nội dung hàm này bằng
// admin.auth().verifyIdToken(token) rồi map uid -> maKhachHang.
function verifyKhachHang(req, res, next) {
  const maKhachHangDangNhap = req.headers['x-ma-khach-hang'];
  const maKhachHangTrongBody = req.body?.maKhachHang || req.query?.maKhachHang;

  if (!maKhachHangDangNhap) {
    return res.status(401).json({ success: false, message: 'Thiếu thông tin xác thực (x-ma-khach-hang).' });
  }

  if (maKhachHangTrongBody && maKhachHangTrongBody !== maKhachHangDangNhap) {
    return res.status(403).json({ success: false, message: 'Không có quyền thao tác trên tài khoản khách hàng khác.' });
  }

  req.maKhachHangDangNhap = maKhachHangDangNhap;
  next();
}

module.exports = { verifyKhachHang };
