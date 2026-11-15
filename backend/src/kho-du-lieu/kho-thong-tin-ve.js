const { BoNhoDem } = require('./bo-nho-dem');

const BANG = 'THONGTIN_VE';

/**
 * Thông tin CÁ NHÂN của hành khách đi bằng vé (OFF-CHAIN): họ tên, số điện thoại.
 * Không đưa lên blockchain vì blockchain công khai, ai cũng đọc được.
 * Mã bản ghi = mã vé NFT (tokenId). Mỗi vé chỉ ghi Firebase 1 lần lúc mua (hoặc khi chủ mới cập nhật).
 */
class KhoThongTinVe {
  /** @param {import('./kho-luu-tru').KhoLuuTru} khoLuuTru */
  constructor(khoLuuTru) {
    this.khoLuuTru = khoLuuTru;
    this.cache = new BoNhoDem(30 * 60 * 1000);
  }

  /** @returns {Promise<{hoTen:string, sdt:string, diaChiChu:string}|null>} */
  async lay(maVe) {
    const ma = String(maVe);
    const duLieu = await this.cache.layHoacTai(ma, async () => (await this.khoLuuTru.docMot(BANG, ma)) || null);
    return duLieu;
  }

  async luu(maVe, { hoTen, sdt, email, diaChiChu }) {
    const duLieu = { hoTen, sdt, email: email || '', diaChiChu: String(diaChiChu).toLowerCase(), ngayCapNhat: new Date().toISOString() };
    await this.khoLuuTru.ghi(BANG, String(maVe), duLieu);
    this.cache.dat(String(maVe), { ma: String(maVe), ...duLieu });
  }
}

module.exports = { KhoThongTinVe };
