const crypto = require('crypto');

/**
 * Mô hình TÀI KHOẢN NGƯỜI DÙNG (lưu off-chain).
 * - Mật khẩu và mã OTP KHÔNG BAO GIỜ lưu dạng gốc, chỉ lưu bản băm.
 * - Trạng thái "đã đọc / đã xóa" thông báo cũng nằm ở đây (thông báo được dựng từ sự kiện blockchain,
 *   nên không phải lưu từng thông báo vào Firebase).
 */
class NguoiDung {
  constructor({
    ma, email, hoTen = '', sdt = '', diaChiLienHe = '', matKhauBam = '', diaChiVi = null, ngayTao = null,
    googleId = null, khoiPhuc = null, thongBao = null, biKhoa = false,
  }) {
    this.email = NguoiDung.chuanHoaEmail(email || ma);
    this.hoTen = hoTen;
    this.sdt = sdt;
    this.diaChiLienHe = diaChiLienHe;        // địa chỉ nhà / liên hệ của khách (KHÁC diaChiVi là địa chỉ ví)
    this.matKhauBam = matKhauBam;            // rỗng = tài khoản tạo bằng Google, chưa đặt mật khẩu
    this.diaChiVi = diaChiVi ? String(diaChiVi).toLowerCase() : null; // ví MetaMask đã liên kết
    this.ngayTao = ngayTao || new Date().toISOString();
    this.googleId = googleId;
    this.biKhoa = !!biKhoa; // nhà xe khóa tài khoản -> không đăng nhập được
    // Mã OTP quên mật khẩu: { maBam, hetHan, soLanSai, guiLuc } (thời gian = mili-giây)
    // (sao chép ra object mới để sửa ở đây không vô tình sửa luôn bản trong bộ nhớ đệm)
    this.khoiPhuc = khoiPhuc ? { ...khoiPhuc } : null;
    // Thông báo: daDocLuc = đọc hết tới thời điểm này; daDoc/daXoa = mã từng thông báo; xoaTruoc = xóa hết tới thời điểm này
    const tb = thongBao || {};
    this.thongBao = { daDocLuc: tb.daDocLuc || 0, xoaTruoc: tb.xoaTruoc || 0, daDoc: [...(tb.daDoc || [])], daXoa: [...(tb.daXoa || [])] };
  }

  static chuanHoaEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  /** Băm mật khẩu: "scrypt$<muối>$<kết quả băm>" */
  static bamMatKhau(matKhau) {
    const muoi = crypto.randomBytes(16).toString('hex');
    const bam = crypto.scryptSync(String(matKhau), muoi, 64).toString('hex');
    return `scrypt$${muoi}$${bam}`;
  }

  /** So mật khẩu nhập vào với bản băm đã lưu (so sánh thời gian hằng để chống dò). */
  kiemTraMatKhau(matKhau) {
    const [kieu, muoi, bamCu] = String(this.matKhauBam).split('$');
    if (kieu !== 'scrypt' || !muoi || !bamCu) return false;
    const bamMoi = crypto.scryptSync(String(matKhau), muoi, 64);
    const bamCuBuf = Buffer.from(bamCu, 'hex');
    return bamCuBuf.length === bamMoi.length && crypto.timingSafeEqual(bamCuBuf, bamMoi);
  }

  /** Băm mã OTP (mã ngắn nên kèm email làm "muối" để 2 người cùng mã vẫn khác bản băm). */
  bamMaKhoiPhuc(ma) {
    return crypto.createHash('sha256').update(`${this.email}:${String(ma).trim()}`).digest('hex');
  }

  /** Dữ liệu ghi xuống kho (có các bản băm). */
  duLieuLuuTru() {
    return {
      email: this.email, hoTen: this.hoTen, sdt: this.sdt, diaChiLienHe: this.diaChiLienHe, matKhauBam: this.matKhauBam,
      diaChiVi: this.diaChiVi, ngayTao: this.ngayTao, googleId: this.googleId, biKhoa: this.biKhoa,
      khoiPhuc: this.khoiPhuc, thongBao: this.thongBao,
    };
  }

  /** Dữ liệu trả cho trình duyệt (KHÔNG có mật khẩu, mã OTP). */
  toJSON() {
    return {
      email: this.email, hoTen: this.hoTen, sdt: this.sdt, diaChiLienHe: this.diaChiLienHe, diaChiVi: this.diaChiVi, ngayTao: this.ngayTao,
      coMatKhau: !!this.matKhauBam, lienKetGoogle: !!this.googleId, biKhoa: this.biKhoa,
    };
  }
}

module.exports = { NguoiDung };
