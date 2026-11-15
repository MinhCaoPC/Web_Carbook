const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const { NguoiDung } = require('../mo-hinh/nguoi-dung');
const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');

// Luật mã OTP quên mật khẩu
const OTP_SO_PHUT = 5;          // mã sống 5 phút
const OTP_GUI_LAI_SAU_GIAY = 60; // tối thiểu 60 giây giữa 2 lần gửi
const OTP_SAI_TOI_DA = 5;        // sai 5 lần thì mã bị hủy, phải xin mã mới

/**
 * DỊCH VỤ XÁC THỰC: đăng ký, đăng nhập (mật khẩu hoặc Google), quên mật khẩu, token, liên kết ví MetaMask.
 *
 * Token đăng nhập là JWT: máy chủ ký bằng khóa bí mật, lần sau chỉ cần kiểm tra chữ ký
 * -> KHÔNG phải đọc Firebase ở mỗi request.
 */
class DichVuXacThuc {
  /**
   * @param {import('../kho-du-lieu/kho-nguoi-dung').KhoNguoiDung} khoNguoiDung
   * @param {{ khoaJwt: string, hanJwt: string }} cauHinh
   * @param {{ xacMinhGoogle?: import('../ket-noi/xac-minh-google').XacMinhGoogle, guiThu?: import('../ket-noi/gui-thu-dien-tu').GuiThuDienTu }} [ketNoi]
   */
  constructor(khoNguoiDung, cauHinh, ketNoi = {}) {
    this.khoNguoiDung = khoNguoiDung;
    this.khoaJwt = cauHinh.khoaJwt;
    this.hanJwt = cauHinh.hanJwt;
    this.xacMinhGoogle = ketNoi.xacMinhGoogle || null;
    this.guiThu = ketNoi.guiThu || null;
  }

  // ===================== ĐĂNG KÝ / ĐĂNG NHẬP =====================

  async dangKy({ email, matKhau, hoTen, sdt, diaChiLienHe }) {
    email = NguoiDung.chuanHoaEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new LoiNghiepVu('Email không hợp lệ.');
    DichVuXacThuc._kiemTraMatKhauMoi(matKhau);
    if (!hoTen || !String(hoTen).trim()) throw new LoiNghiepVu('Vui lòng nhập họ tên.');
    if (await this.khoNguoiDung.timTheoEmail(email)) throw new LoiNghiepVu('Email này đã được đăng ký.', 409);

    const nguoiDung = new NguoiDung({
      email,
      hoTen: String(hoTen).trim(),
      sdt: String(sdt || '').trim(),
      diaChiLienHe: DichVuXacThuc._chuanHoaDiaChi(diaChiLienHe),
      matKhauBam: NguoiDung.bamMatKhau(matKhau),
    });
    await this.khoNguoiDung.luu(nguoiDung);
    return { token: this.taoToken(nguoiDung), nguoiDung };
  }

  async dangNhap({ email, matKhau }) {
    const nguoiDung = await this.khoNguoiDung.timTheoEmail(email);
    if (nguoiDung && !nguoiDung.matKhauBam && nguoiDung.googleId) {
      throw new LoiNghiepVu('Tài khoản này đăng nhập bằng Google. Hãy bấm nút Google, hoặc dùng "Quên mật khẩu" để đặt mật khẩu.', 401);
    }
    if (!nguoiDung || !nguoiDung.kiemTraMatKhau(matKhau)) throw new LoiNghiepVu('Email hoặc mật khẩu không đúng.', 401);
    if (nguoiDung.biKhoa) throw new LoiNghiepVu('Tài khoản đã bị nhà xe khóa. Vui lòng liên hệ nhà xe.', 403);
    return { token: this.taoToken(nguoiDung), nguoiDung };
  }

  /** Thông tin cho nút Google trên web */
  cauHinhGoogle() {
    const bat = !!this.xacMinhGoogle?.daCauHinh;
    return { batDat: bat, clientId: bat ? this.xacMinhGoogle.danhSachClientId[0] : null };
  }

  /**
   * Đăng nhập bằng Google. Email đã có tài khoản -> đăng nhập vào tài khoản đó (gắn thêm Google);
   * chưa có -> tự tạo tài khoản mới (chưa có mật khẩu).
   */
  async dangNhapGoogle(idToken) {
    if (!this.xacMinhGoogle) throw new LoiNghiepVu('Máy chủ chưa bật đăng nhập Google.', 503);
    const { googleId, email, hoTen } = await this.xacMinhGoogle.xacMinh(idToken);

    let nguoiDung = await this.khoNguoiDung.timTheoEmail(email);
    if (!nguoiDung) {
      nguoiDung = new NguoiDung({ email, hoTen, googleId });
      await this.khoNguoiDung.luu(nguoiDung);
    } else if (nguoiDung.googleId !== googleId) {
      nguoiDung.googleId = googleId;
      await this.khoNguoiDung.luu(nguoiDung);
    }
    if (nguoiDung.biKhoa) throw new LoiNghiepVu('Tài khoản đã bị nhà xe khóa. Vui lòng liên hệ nhà xe.', 403);
    return { token: this.taoToken(nguoiDung), nguoiDung };
  }

  // ===================== QUÊN MẬT KHẨU (email -> OTP -> mật khẩu mới) =====================

  /**
   * Bước 1: gửi mã OTP 6 số tới email. Email không tồn tại cũng trả về "đã gửi"
   * để người lạ không dò được email nào đã đăng ký.
   */
  async guiMaQuenMatKhau(email) {
    email = NguoiDung.chuanHoaEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new LoiNghiepVu('Email không hợp lệ.');
    const nguoiDung = await this.khoNguoiDung.timTheoEmail(email);
    if (!nguoiDung) return;

    const daGuiCachDay = Date.now() - (nguoiDung.khoiPhuc?.guiLuc || 0);
    if (daGuiCachDay < OTP_GUI_LAI_SAU_GIAY * 1000) {
      throw new LoiNghiepVu(`Vui lòng đợi ${Math.ceil((OTP_GUI_LAI_SAU_GIAY * 1000 - daGuiCachDay) / 1000)} giây rồi gửi lại mã.`, 429);
    }

    const ma = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    nguoiDung.khoiPhuc = { maBam: nguoiDung.bamMaKhoiPhuc(ma), hetHan: Date.now() + OTP_SO_PHUT * 60_000, soLanSai: 0, guiLuc: Date.now() };
    await this.khoNguoiDung.luu(nguoiDung); // chỉ lưu bản băm của mã
    if (!this.guiThu) throw new LoiNghiepVu('Máy chủ chưa cấu hình gửi email.', 503);
    await this.guiThu.guiMaKhoiPhuc(email, ma, OTP_SO_PHUT);
  }

  /** Kiểm tra mã OTP; sai thì tăng đếm, sai quá số lần cho phép thì hủy mã. */
  async _kiemTraMa(email, ma) {
    const nguoiDung = await this.khoNguoiDung.timTheoEmail(email);
    const kp = nguoiDung?.khoiPhuc;
    if (!kp || !kp.maBam) throw new LoiNghiepVu('Mã OTP không đúng hoặc đã hết hạn. Hãy gửi lại mã.');
    if (Date.now() > kp.hetHan) throw new LoiNghiepVu('Mã OTP đã hết hạn. Hãy gửi lại mã.');
    if (nguoiDung.bamMaKhoiPhuc(ma) !== kp.maBam) {
      kp.soLanSai = (kp.soLanSai || 0) + 1;
      if (kp.soLanSai >= OTP_SAI_TOI_DA) nguoiDung.khoiPhuc = { guiLuc: kp.guiLuc };
      await this.khoNguoiDung.luu(nguoiDung);
      throw new LoiNghiepVu(kp.soLanSai >= OTP_SAI_TOI_DA ? 'Nhập sai quá nhiều lần. Hãy gửi lại mã mới.' : `Mã OTP không đúng (còn ${OTP_SAI_TOI_DA - kp.soLanSai} lần thử).`);
    }
    return nguoiDung;
  }

  /** Bước 2: xác thực mã (chưa dùng mã, để bước 3 còn dùng). */
  async xacThucMaKhoiPhuc(email, ma) {
    await this._kiemTraMa(email, ma);
  }

  /** Bước 3: kiểm tra lại mã rồi đặt mật khẩu mới; mã bị hủy sau khi dùng. */
  async datLaiMatKhau(email, ma, matKhauMoi) {
    DichVuXacThuc._kiemTraMatKhauMoi(matKhauMoi);
    const nguoiDung = await this._kiemTraMa(email, ma);
    nguoiDung.matKhauBam = NguoiDung.bamMatKhau(matKhauMoi);
    nguoiDung.khoiPhuc = null;
    await this.khoNguoiDung.luu(nguoiDung);
  }

  static _kiemTraMatKhauMoi(matKhau) {
    if (!matKhau || String(matKhau).length < 6) throw new LoiNghiepVu('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  // ===================== TOKEN & HỒ SƠ =====================

  taoToken(nguoiDung) {
    return jwt.sign({ email: nguoiDung.email }, this.khoaJwt, { expiresIn: this.hanJwt });
  }

  /** Trả về email trong token, hoặc báo lỗi 401 nếu token sai/hết hạn. */
  xacMinhToken(token) {
    try {
      return jwt.verify(token, this.khoaJwt).email;
    } catch {
      throw new LoiNghiepVu('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', 401);
    }
  }

  async layNguoiDung(email) {
    const nguoiDung = await this.khoNguoiDung.timTheoEmail(email);
    if (!nguoiDung) throw new LoiNghiepVu('Tài khoản không tồn tại.', 401);
    if (nguoiDung.biKhoa) throw new LoiNghiepVu('Tài khoản đã bị nhà xe khóa. Vui lòng liên hệ nhà xe.', 401);
    return nguoiDung;
  }

  /** Địa chỉ liên hệ: bỏ khoảng trắng thừa, tối đa 200 ký tự. */
  static _chuanHoaDiaChi(diaChi) {
    const kq = String(diaChi || '').trim().replace(/\s+/g, ' '); // gộp nhiều khoảng trắng liền nhau thành một
    if (kq.length > 200) throw new LoiNghiepVu('Địa chỉ tối đa 200 ký tự.');
    return kq;
  }

  async capNhatThongTin(email, { hoTen, sdt, diaChiLienHe }) {
    const nguoiDung = await this.layNguoiDung(email);
    if (hoTen !== undefined) nguoiDung.hoTen = String(hoTen).trim();
    if (sdt !== undefined) nguoiDung.sdt = String(sdt).trim();
    if (diaChiLienHe !== undefined) nguoiDung.diaChiLienHe = DichVuXacThuc._chuanHoaDiaChi(diaChiLienHe);
    await this.khoNguoiDung.luu(nguoiDung);
    return nguoiDung;
  }

  // ===================== LIÊN KẾT VÍ METAMASK =====================

  /** Câu người dùng ký bằng MetaMask để chứng minh mình sở hữu ví (không tốn gas). */
  static noiDungLienKetVi(email, diaChi) {
    return `CARBOOK - Lien ket vi ${String(diaChi).toLowerCase()} voi tai khoan ${email}`;
  }

  /** Gắn ví MetaMask vào tài khoản, sau khi kiểm tra chữ ký đúng là của ví đó. */
  async lienKetVi(email, { diaChi, chuKy }) {
    if (!ethers.isAddress(diaChi)) throw new LoiNghiepVu('Địa chỉ ví không hợp lệ.');
    const nguoiDung = await this.layNguoiDung(email);

    let nguoiKy;
    try {
      nguoiKy = ethers.verifyMessage(DichVuXacThuc.noiDungLienKetVi(nguoiDung.email, diaChi), chuKy);
    } catch {
      throw new LoiNghiepVu('Chữ ký không hợp lệ.');
    }
    if (nguoiKy.toLowerCase() !== diaChi.toLowerCase()) throw new LoiNghiepVu('Chữ ký không phải của ví này.');

    const daGan = await this.khoNguoiDung.timTheoVi(diaChi);
    if (daGan && daGan.email !== nguoiDung.email) throw new LoiNghiepVu('Ví này đã liên kết với tài khoản khác.', 409);

    nguoiDung.diaChiVi = diaChi.toLowerCase();
    await this.khoNguoiDung.luu(nguoiDung);
    return nguoiDung;
  }
}

module.exports = { DichVuXacThuc };
