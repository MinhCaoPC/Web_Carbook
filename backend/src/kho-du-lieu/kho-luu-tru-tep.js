const fs = require('fs');
const path = require('path');
const { KhoLuuTru } = require('./kho-luu-tru');

/**
 * Lưu dữ liệu trong file JSON (mỗi bảng một file: du-lieu/<BANG>.json).
 * Không cần Internet, không tốn lượt truy cập Firebase — phù hợp để chạy demo / kiểm thử.
 * Dữ liệu được giữ trong RAM và ghi ra đĩa sau mỗi lần thay đổi.
 */
class KhoLuuTruTep extends KhoLuuTru {
  /** @param {string} thuMuc thư mục chứa các file JSON */
  constructor(thuMuc) {
    super();
    this.thuMuc = thuMuc;
    this._bangTrongRam = new Map(); // tên bảng -> { ma: duLieu }
  }

  _duongDan(bang) {
    return path.join(this.thuMuc, `${bang}.json`);
  }

  _layBang(bang) {
    if (!this._bangTrongRam.has(bang)) {
      const file = this._duongDan(bang);
      this._bangTrongRam.set(bang, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {});
    }
    return this._bangTrongRam.get(bang);
  }

  _luuBang(bang) {
    fs.mkdirSync(this.thuMuc, { recursive: true });
    fs.writeFileSync(this._duongDan(bang), JSON.stringify(this._layBang(bang), null, 2));
  }

  async docMot(bang, ma) {
    const duLieu = this._layBang(bang)[ma];
    return duLieu ? { ma: String(ma), ...duLieu } : null;
  }

  async docCaBang(bang) {
    return Object.entries(this._layBang(bang)).map(([ma, duLieu]) => ({ ma, ...duLieu }));
  }

  async timMot(bang, truong, giaTri) {
    const tim = Object.entries(this._layBang(bang)).find(([, d]) => d[truong] === giaTri);
    return tim ? { ma: tim[0], ...tim[1] } : null;
  }

  async ghi(bang, ma, duLieu) {
    const b = this._layBang(bang);
    b[ma] = { ...(b[ma] || {}), ...duLieu };
    this._luuBang(bang);
  }
}

module.exports = { KhoLuuTruTep };
