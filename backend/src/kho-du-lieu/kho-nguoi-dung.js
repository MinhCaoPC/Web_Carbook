const { BoNhoDem } = require('./bo-nho-dem');
const { NguoiDung } = require('../mo-hinh/nguoi-dung');

const BANG = 'NGUOIDUNG';

/**
 * Kho tài khoản người dùng (OFF-CHAIN): email, họ tên, SĐT, mật khẩu đã băm, ví MetaMask đã liên kết.
 * Mã bản ghi = email (chữ thường) -> tìm theo email chỉ tốn đúng 1 lượt đọc, và email tự nhiên là duy nhất.
 * Có cache để các request liên tiếp không đọc lại Firebase.
 */
class KhoNguoiDung {
  /** @param {import('./kho-luu-tru').KhoLuuTru} khoLuuTru */
  constructor(khoLuuTru) {
    this.khoLuuTru = khoLuuTru;
    this.cache = new BoNhoDem(10 * 60 * 1000);
    this.cacheDanhSach = new BoNhoDem(2 * 60 * 1000); // danh sách cho trang quản trị
  }

  /** @returns {Promise<NguoiDung|null>} */
  async timTheoEmail(email) {
    const ma = NguoiDung.chuanHoaEmail(email);
    const duLieu = await this.cache.layHoacTai(ma, () => this.khoLuuTru.docMot(BANG, ma));
    return duLieu ? new NguoiDung(duLieu) : null;
  }

  /** Tài khoản nào đang liên kết với ví này (dùng để chặn một ví gắn vào 2 tài khoản). */
  async timTheoVi(diaChiVi) {
    const duLieu = await this.khoLuuTru.timMot(BANG, 'diaChiVi', String(diaChiVi).toLowerCase());
    return duLieu ? new NguoiDung(duLieu) : null;
  }

  /** Mọi tài khoản (trang quản trị). Mỗi tài khoản = 1 lượt đọc, nên giữ cache 2 phút. */
  async tatCa() {
    const ds = await this.cacheDanhSach.layHoacTai('tat-ca', () => this.khoLuuTru.docCaBang(BANG));
    return ds.map((d) => new NguoiDung(d));
  }

  /** @param {NguoiDung} nguoiDung */
  async luu(nguoiDung) {
    const duLieu = nguoiDung.duLieuLuuTru();
    await this.khoLuuTru.ghi(BANG, nguoiDung.email, duLieu);
    this.cache.dat(nguoiDung.email, { ma: nguoiDung.email, ...duLieu });
    this.cacheDanhSach.xoa('tat-ca');
  }
}

module.exports = { KhoNguoiDung };
