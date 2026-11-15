/**
 * Bộ nhớ đệm (cache) trong RAM có hạn dùng.
 * Đọc Firebase 1 lần, các lần sau lấy từ RAM -> tiết kiệm lượt đọc Firestore (gói miễn phí 50.000 lượt/ngày).
 */
class BoNhoDem {
  /** @param {number} hanDungMs sau bao lâu thì dữ liệu được coi là cũ */
  constructor(hanDungMs) {
    this.hanDungMs = hanDungMs;
    this._du = new Map(); // khóa -> { giaTri, hetHan }
  }

  lay(khoa) {
    const muc = this._du.get(khoa);
    if (!muc) return undefined;
    if (Date.now() > muc.hetHan) {
      this._du.delete(khoa);
      return undefined;
    }
    return muc.giaTri;
  }

  dat(khoa, giaTri) {
    this._du.set(khoa, { giaTri, hetHan: Date.now() + this.hanDungMs });
    return giaTri;
  }

  xoa(khoa) {
    this._du.delete(khoa);
  }

  /** Có trong cache thì trả luôn; chưa có thì gọi `hamTai` (vd đọc Firebase) rồi cất vào cache. */
  async layHoacTai(khoa, hamTai) {
    const coSan = this.lay(khoa);
    if (coSan !== undefined) return coSan;
    return this.dat(khoa, await hamTai());
  }
}

module.exports = { BoNhoDem };
