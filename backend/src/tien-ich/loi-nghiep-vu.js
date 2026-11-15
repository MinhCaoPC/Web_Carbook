/**
 * Lỗi "có chủ đích" của hệ thống (vd: sai mật khẩu, thiếu dữ liệu...).
 * Mang theo mã HTTP để tầng API trả về đúng (400, 401, 404...), khác với lỗi bất ngờ (500).
 */
class LoiNghiepVu extends Error {
  /**
   * @param {string} thongBao  câu báo lỗi tiếng Việt hiển thị cho người dùng
   * @param {number} maHttp    mã trạng thái HTTP, mặc định 400
   */
  constructor(thongBao, maHttp = 400) {
    super(thongBao);
    this.name = 'LoiNghiepVu';
    this.maHttp = maHttp;
  }
}

module.exports = { LoiNghiepVu };
