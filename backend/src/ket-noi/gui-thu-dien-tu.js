const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');

/**
 * GỬI THƯ ĐIỆN TỬ qua Gmail (thư viện nodemailer).
 * Cần GMAIL_USER + GMAIL_APP_PASSWORD (App Password 16 ký tự tạo ở myaccount.google.com/apppasswords,
 * KHÔNG phải mật khẩu Gmail thường).
 *
 * Chế độ demo (NODE_ENV khác production): nếu chưa cấu hình Gmail hoặc gửi lỗi thì in mã ra cửa sổ backend
 * để vẫn chạy thử được — giống bản cũ.
 */
class GuiThuDienTu {
  /** @param {{ gmailUser: string, gmailMatKhauUngDung: string, laMoiTruongThat: boolean }} cauHinh */
  constructor(cauHinh) {
    this.nguoiGui = cauHinh.gmailUser;
    this.matKhauUngDung = cauHinh.gmailMatKhauUngDung;
    this.laMoiTruongThat = cauHinh.laMoiTruongThat;
    this._boGui = null;
  }

  get daCauHinh() {
    return !!(this.nguoiGui && this.matKhauUngDung);
  }

  get boGui() {
    if (!this._boGui) {
      const nodemailer = require('nodemailer');
      this._boGui = nodemailer.createTransport({ service: 'gmail', auth: { user: this.nguoiGui, pass: this.matKhauUngDung } });
    }
    return this._boGui;
  }

  /** Gửi mã OTP đặt lại mật khẩu. */
  async guiMaKhoiPhuc(email, ma, soPhutHieuLuc) {
    try {
      if (!this.daCauHinh) throw new Error('chưa cấu hình GMAIL_USER / GMAIL_APP_PASSWORD');
      await this.boGui.sendMail({
        from: `"CARBOOK" <${this.nguoiGui}>`,
        to: email,
        subject: 'Mã xác thực đặt lại mật khẩu - CARBOOK',
        html: `
          <div style="font-family:Arial,sans-serif;padding:16px">
            <h2 style="color:#0b2348">Đặt lại mật khẩu</h2>
            <p>Mã xác thực (OTP) của bạn là:</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#0b2348">${ma}</p>
            <p>Mã có hiệu lực trong ${soPhutHieuLuc} phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
          </div>`,
      });
    } catch (loi) {
      if (this.laMoiTruongThat) throw new LoiNghiepVu('Không gửi được email, vui lòng thử lại sau.', 502);
      console.warn(`⚠️  Không gửi được email (${loi.message}).`);
      console.log(`👉 [DEMO] Mã OTP đặt lại mật khẩu cho ${email}: ${ma}`);
    }
  }
}

module.exports = { GuiThuDienTu };
