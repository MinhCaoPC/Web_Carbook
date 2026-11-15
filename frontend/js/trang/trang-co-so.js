/**
 * LỚP CHA của mọi trang. Trang con khai báo vài thuộc tính tĩnh và viết hàm `hienThi()`.
 *
 *   static tieuDe      tiêu đề tab trình duyệt
 *   static boCuc       'app' (có thanh điều hướng) | 'tron' (trang đăng nhập/đăng ký, không thanh điều hướng)
 *   static canDangNhap true = chưa đăng nhập thì chuyển sang trang đăng nhập
 *   static chiKhachLa  true = đã đăng nhập thì không vào (trang đăng nhập/đăng ký)
 *   static doRong      '' | 'mid' | 'narrow' — độ rộng nội dung
 *   static menu        đường dẫn mục menu được tô sáng khi đang ở trang này
 */
export class TrangCoSo {
  static tieuDe = '';
  static boCuc = 'app';
  static canDangNhap = true;
  static chiKhachLa = false;
  static doRong = '';
  static menu = '/';

  /** @param {import('../ung-dung.js').UngDung} ungDung */
  constructor(ungDung) {
    this.ud = ungDung;
    this.api = ungDung.api;
    this.hopDong = ungDung.hopDong; // lớp HopDongVeXe — gọi smart contract qua MetaMask
    this.vi = ungDung.vi;           // lớp ViMetaMask
  }

  /**
   * Vẽ trang.
   * @param {HTMLElement} khung   phần tử chứa nội dung trang
   * @param {object} thamSo       tham số trên đường dẫn, vd { ma } của #/chuyen/:ma
   * @param {object} truyVan      phần sau dấu ?, vd { diemDi, diemDen, ngay }
   */
  async hienThi(khung, thamSo, truyVan) {
    throw new Error('Trang con phải cài đặt hienThi()');
  }

  /** Dọn dẹp khi rời trang (vd tắt camera). */
  roiTrang() {}

  /** Trang còn đang hiển thị không (người dùng có thể đã chuyển trang trong lúc chờ tải). */
  get conHienThi() {
    return this.ud.trangHienTai === this;
  }
}
