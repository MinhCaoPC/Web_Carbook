const crypto = require('crypto');
const { BoNhoDem } = require('./bo-nho-dem');

const BANG = 'THONGBAO_CHUNG';

/**
 * Thông báo nhà xe gửi cho TẤT CẢ khách (vd "Tết nghỉ chạy tuyến X", "Khuyến mãi...").
 * Gửi 1 lần = ghi 1 bản ghi Firebase; mọi khách đọc chung danh sách này (cache 1 phút).
 */
class KhoThongBaoChung {
  /** @param {import('./kho-luu-tru').KhoLuuTru} khoLuuTru */
  constructor(khoLuuTru) {
    this.khoLuuTru = khoLuuTru;
    this.cache = new BoNhoDem(60 * 1000);
  }

  /** @returns {Promise<Array<{ ma, tieuDe, noiDung, thoiGian, nguoiGui }>>} mới nhất trước */
  async danhSach() {
    const ds = await this.cache.layHoacTai('tat-ca', () => this.khoLuuTru.docCaBang(BANG));
    return [...ds].sort((a, b) => b.thoiGian - a.thoiGian);
  }

  async them({ tieuDe, noiDung, nguoiGui }) {
    const thoiGian = Date.now();
    const ma = `${thoiGian}${crypto.randomBytes(2).toString('hex')}`;
    await this.khoLuuTru.ghi(BANG, ma, { tieuDe, noiDung, nguoiGui, thoiGian });
    this.cache.xoa('tat-ca');
    return { ma, tieuDe, noiDung, nguoiGui, thoiGian };
  }
}

module.exports = { KhoThongBaoChung };
