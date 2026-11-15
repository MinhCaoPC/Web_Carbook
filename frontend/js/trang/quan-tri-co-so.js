// LỚP CHA của các trang quản trị nhà xe: vẽ tiêu đề + thanh tab chung, và kiểm tra quyền.
// Quyền nhà xe lấy TỪ BLOCKCHAIN: ví liên kết với tài khoản phải là chủ hợp đồng VeXeNFT.
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, rutGonDiaChi } from '../giao-dien.js';

const CAC_TAB = [
  ['/quan-tri', 'Tổng quan', 'trend'],
  ['/quan-tri/ve', 'Vé & hành khách', 'ticket'],
  ['/quan-tri/danh-muc', 'Tuyến · Chuyến · Xe', 'bus'],
  ['/quan-tri/tai-khoan', 'Tài khoản', 'users'],
  ['/quan-tri/blockchain', 'Blockchain', 'shield'],
];

export class TrangQuanTriCoSo extends TrangCoSo {
  static menu = '/quan-tri';
  /** Đường dẫn tab của trang con (để tô sáng) */
  static tab = '/quan-tri';

  async hienThi(khung, thamSo, truyVan) {
    this.khung = khung;
    const LopTrang = this.constructor;
    khung.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Quản lý nhà xe</h1>
        <div class="sub">Số liệu bán vé lấy trực tiếp từ blockchain · danh mục chuyến &amp; tài khoản lưu trên Firebase</div></div></div>
      <div class="tabs chi-dien-thoai" style="margin-bottom:18px">${CAC_TAB.map(([duong, ten, ic]) =>
        `<button data-tab="${duong}" class="${duong === LopTrang.tab ? 'on' : ''}">${icon(ic, 'sm')} ${ten}</button>`).join('')}</div>
      <div id="noi-dung-qt"></div>`;
    khung.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.ud.di(b.dataset.tab)));

    const vung = khung.querySelector('#noi-dung-qt');
    if (!this.ud.vaiTro.nhaXe) {
      const vi = this.ud.nguoiDung.diaChiVi;
      vung.innerHTML = `<div class="card"><div class="warn-msg">Chỉ <b>nhà xe</b> mới dùng được trang này: tài khoản phải liên kết với ví <b>chủ hợp đồng</b> (ví #0 trên mạng ảo).</div>
        <p class="muted mt">Ví tài khoản bạn đang liên kết: <span class="mono">${h(vi ? rutGonDiaChi(vi) : 'chưa liên kết')}</span>.
        Đăng nhập bằng tài khoản nhà xe, hoặc vào <a href="#/vi">Ví MetaMask</a> để liên kết ví nhà xe.</p></div>`;
      return;
    }
    await this.veNoiDung(vung, truyVan);
  }

  /** Trang con vẽ phần nội dung bên dưới thanh tab */
  async veNoiDung(vung, truyVan) {
    throw new Error('Trang quản trị con phải cài đặt veNoiDung()');
  }
}
