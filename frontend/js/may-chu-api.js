/**
 * Gọi API backend. Tự gắn token đăng nhập, tự đổi lỗi thành Error có câu tiếng Việt.
 * Token được giữ trong localStorage để tải lại trang không bị đăng xuất.
 */
export class MayChuApi {
  static KHOA_TOKEN = 'carbook_token';

  constructor() {
    this.token = MayChuApi._docBoNho(MayChuApi.KHOA_TOKEN);
  }

  datToken(token) {
    this.token = token || null;
    try {
      if (token) localStorage.setItem(MayChuApi.KHOA_TOKEN, token);
      else localStorage.removeItem(MayChuApi.KHOA_TOKEN);
    } catch { /* trình duyệt chặn localStorage: chỉ đăng nhập trong phiên này */ }
  }

  static _docBoNho(khoa) {
    try { return localStorage.getItem(khoa); } catch { return null; }
  }

  /** @returns {Promise<any>} phần thân JSON nếu thành công */
  async goi(duongDan, { method = 'GET', body } = {}) {
    let phanHoi;
    try {
      phanHoi = await fetch(duongDan, {
        method,
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Không kết nối được máy chủ. Backend đã chạy chưa?');
    }
    const duLieu = await phanHoi.json().catch(() => ({}));
    if (phanHoi.status === 401) this.datToken(null);
    if (!phanHoi.ok || duLieu.thanhCong === false) throw new Error(duLieu.thongBao || `Lỗi ${phanHoi.status}`);
    return duLieu;
  }

  lay(duongDan) { return this.goi(duongDan); }
  gui(duongDan, body) { return this.goi(duongDan, { method: 'POST', body }); }
  sua(duongDan, body) { return this.goi(duongDan, { method: 'PUT', body }); }
}
