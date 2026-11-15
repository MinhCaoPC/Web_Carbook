// Các "trung gian" (middleware) Express dùng chung cho mọi API.
const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');

/** Bọc hàm xử lý async: lỗi ném ra sẽ được chuyển tới `xuLyLoi` thay vì làm sập máy chủ. */
function boc(hamXuLy) {
  return (req, res, next) => Promise.resolve(hamXuLy(req, res, next)).catch(next);
}

/**
 * Bắt buộc đăng nhập. Đọc header "Authorization: Bearer <token>", kiểm tra token,
 * rồi gắn người dùng vào req.nguoiDung (lấy từ cache -> thường không tốn lượt đọc Firebase).
 * @param {import('../dich-vu/dich-vu-xac-thuc').DichVuXacThuc} dichVuXacThuc
 */
function canDangNhap(dichVuXacThuc) {
  return boc(async (req, res, next) => {
    const [kieu, token] = String(req.headers.authorization || '').split(' ');
    if (kieu !== 'Bearer' || !token) throw new LoiNghiepVu('Vui lòng đăng nhập.', 401);
    const email = dichVuXacThuc.xacMinhToken(token);
    req.nguoiDung = await dichVuXacThuc.layNguoiDung(email);
    next();
  });
}

/**
 * Chỉ NHÀ XE: ví liên kết với tài khoản phải đúng là CHỦ HỢP ĐỒNG trên blockchain.
 * (Đặt sau canDangNhap.) Vai trò lấy từ blockchain nên không cần bảng tài khoản admin riêng.
 * @param {import('../ket-noi/ket-noi-blockchain').KetNoiBlockchain} blockchain
 */
function canNhaXe(blockchain) {
  return boc(async (req, res, next) => {
    const vi = req.nguoiDung?.diaChiVi;
    if (!vi || vi !== (await blockchain.chuHopDong())) {
      throw new LoiNghiepVu('Chỉ nhà xe (tài khoản liên kết ví chủ hợp đồng) mới vào được trang này.', 403);
    }
    next();
  });
}

/** Trả lỗi dạng JSON thống nhất: { thanhCong: false, thongBao }. */
// eslint-disable-next-line no-unused-vars
function xuLyLoi(loi, req, res, next) {
  if (loi instanceof LoiNghiepVu) {
    return res.status(loi.maHttp).json({ thanhCong: false, thongBao: loi.message });
  }
  // Lỗi khi gọi blockchain (node tắt, hợp đồng cũ...) -> báo dễ hiểu
  if (loi && (loi.code === 'ECONNREFUSED' || loi.code === 'NETWORK_ERROR' || /could not detect network|ECONNREFUSED/.test(loi.message))) {
    return res.status(503).json({ thanhCong: false, thongBao: 'Không kết nối được blockchain. Mạng ảo đã chạy chưa? (npm run mang-ao)' });
  }
  if (loi && loi.code === 'BAD_DATA') {
    return res.status(503).json({ thanhCong: false, thongBao: 'Không đọc được hợp đồng — có thể mạng ảo vừa khởi động lại, hãy triển khai lại hợp đồng.' });
  }
  console.error('❌ Lỗi không mong đợi:', loi);
  return res.status(500).json({ thanhCong: false, thongBao: 'Lỗi máy chủ, vui lòng thử lại.' });
}

module.exports = { boc, canDangNhap, canNhaXe, xuLyLoi };
