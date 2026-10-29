const customerService = require('../services/customerService');

// GET /api/khach-hang/theo-tai-khoan/:maTaiKhoan
exports.layTheoTaiKhoan = async (req, res) => {
  try {
    const result = await customerService.layHoacTaoKhachHang(req.params.maTaiKhoan);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('layTheoTaiKhoan error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message || 'Lỗi máy chủ.' });
  }
};
