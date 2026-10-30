const searchHistoryService = require('../services/searchHistoryService');

// GET /api/tim-kiem/gan-day?maKhachHang=... — mục "Tìm kiếm gần đây" ở màn hình Mua vé xe
exports.layTimKiemGanDay = async (req, res) => {
  try {
    const danhSach = await searchHistoryService.layTimKiemGanDay(req.maKhachHangDangNhap);
    return res.status(200).json({ success: true, danhSach });
  } catch (error) {
    console.error('layTimKiemGanDay error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy lịch sử tìm kiếm.' });
  }
};

// DELETE /api/tim-kiem/gan-day?maKhachHang=... — nút "Xóa lịch sử"
exports.xoaTimKiemGanDay = async (req, res) => {
  try {
    const soDaXoa = await searchHistoryService.xoaTimKiemGanDay(req.maKhachHangDangNhap);
    return res.status(200).json({ success: true, message: `Đã xóa ${soDaXoa} lượt tìm kiếm.` });
  } catch (error) {
    console.error('xoaTimKiemGanDay error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa lịch sử tìm kiếm.' });
  }
};
