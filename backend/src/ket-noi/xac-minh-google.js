const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');

/**
 * XÁC MINH ĐĂNG NHẬP GOOGLE.
 * Trình duyệt nhận "ID token" từ Google rồi gửi lên đây. Máy chủ hỏi lại chính Google xem token có thật,
 * có dành cho ứng dụng này (aud = client ID của mình) và email đã xác minh chưa.
 * => KHÔNG tin email/tên do trình duyệt tự gửi.
 */
class XacMinhGoogle {
  /** @param {string[]} danhSachClientId các OAuth client ID loại Web được phép */
  constructor(danhSachClientId) {
    this.danhSachClientId = danhSachClientId || [];
  }

  get daCauHinh() {
    return this.danhSachClientId.length > 0;
  }

  /** @returns {Promise<{ googleId: string, email: string, hoTen: string }>} */
  async xacMinh(idToken) {
    if (!this.daCauHinh) throw new LoiNghiepVu('Máy chủ chưa cấu hình đăng nhập Google (GOOGLE_CLIENT_ID).', 503);
    if (!idToken) throw new LoiNghiepVu('Thiếu thông tin đăng nhập Google.');

    let phanHoi;
    try {
      phanHoi = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    } catch {
      throw new LoiNghiepVu('Không kết nối được Google, vui lòng thử lại.', 502);
    }
    const thongTin = await phanHoi.json().catch(() => ({}));
    if (!phanHoi.ok) throw new LoiNghiepVu('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.', 401);
    if (!this.danhSachClientId.includes(thongTin.aud)) throw new LoiNghiepVu('Token Google không dành cho ứng dụng này.', 401);
    if (thongTin.email_verified !== 'true' && thongTin.email_verified !== true) throw new LoiNghiepVu('Email Google chưa được xác minh.', 401);

    return { googleId: thongTin.sub, email: thongTin.email, hoTen: thongTin.name || thongTin.email.split('@')[0] };
  }
}

module.exports = { XacMinhGoogle };
