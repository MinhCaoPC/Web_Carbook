// ============================================================
// ung-dung.js — ĐIỂM KHỞI ĐỘNG CỦA WEB
// Lớp UngDung: tải thông tin hợp đồng, giữ phiên đăng nhập + ví MetaMask,
// vẽ khung giao diện (thanh trên / thanh tab) và chuyển trang theo địa chỉ "#/...".
// ============================================================
import './hieu-ung.js'; // hiệu ứng: hiện dần, gợn sóng, vệt sáng, tiến độ cuộn
import { MayChuApi } from './may-chu-api.js';
import { ViMetaMask, HopDongVeXe } from './vi-metamask.js';
import { icon, h, chuDau, rutGonDiaChi, thongBao, dangXuLy, htmlDangTai, htmlLoi, doiGiaoDien, saoChep } from './giao-dien.js';
import { TrangDangNhap, TrangDangKy, TrangQuenMatKhau } from './trang/dang-nhap.js';
import { TrangThongBao } from './trang/thong-bao.js';
import { TrangChu } from './trang/trang-chu.js';
import { TrangTimChuyen } from './trang/tim-chuyen.js';
import { TrangChonGhe } from './trang/chon-ghe.js';
import { TrangThanhToan } from './trang/thanh-toan.js';
import { TrangVeCuaToi } from './trang/ve-cua-toi.js';
import { TrangChiTietVe } from './trang/chi-tiet-ve.js';
import { TrangChoVe } from './trang/cho-ve.js';
import { TrangVi } from './trang/vi.js';
import { TrangSoatVe } from './trang/soat-ve.js';
import { TrangQuanTriTongQuan } from './trang/quan-tri-tong-quan.js';
import { TrangQuanTriVe } from './trang/quan-tri-ve.js';
import { TrangQuanTriDanhMuc } from './trang/quan-tri-danh-muc.js';
import { TrangQuanTriTaiKhoan } from './trang/quan-tri-tai-khoan.js';
import { TrangQuanTriBlockchain } from './trang/quan-tri-blockchain.js';
import { TrangTaiKhoan } from './trang/tai-khoan.js';
import { TrangTraCuuVe } from './trang/tra-cuu-ve.js';

/** Bảng đường dẫn -> lớp trang. ":ma" là tham số, vd #/chuyen/CX001_2026-11-14 */
const BANG_DUONG_DAN = [
  ['/dang-nhap', TrangDangNhap],
  ['/dang-ky', TrangDangKy],
  ['/quen-mat-khau', TrangQuenMatKhau],
  ['/', TrangChu],
  ['/thong-bao', TrangThongBao],
  ['/tim', TrangTimChuyen],
  ['/chuyen/:ma', TrangChonGhe],
  ['/thanh-toan', TrangThanhToan],
  ['/ve-cua-toi', TrangVeCuaToi],
  ['/ve/:maVe', TrangChiTietVe],
  ['/cho-ve', TrangChoVe],
  ['/vi', TrangVi],
  ['/soat-ve', TrangSoatVe],
  ['/quan-tri', TrangQuanTriTongQuan],
  ['/quan-tri/ve', TrangQuanTriVe],
  ['/quan-tri/danh-muc', TrangQuanTriDanhMuc],
  ['/quan-tri/tai-khoan', TrangQuanTriTaiKhoan],
  ['/quan-tri/blockchain', TrangQuanTriBlockchain],
  ['/tai-khoan', TrangTaiKhoan],
  ['/tra-cuu', TrangTraCuuVe],       // công khai
  ['/tra-cuu/:maVe', TrangTraCuuVe], // công khai
];

/**
 * BỐN GIAO DIỆN: khách chưa đăng nhập + ba vai trò của ví TRÊN BLOCKCHAIN (không có cột "quyền" nào trong Firebase):
 *   - khach : khách hàng — tìm chuyến, mua vé, vé của tôi, chợ vé
 *   - soatVe: nhân viên soát vé (hợp đồng cấp quyền) — chỉ có màn hình soát vé
 *   - nhaXe : chủ hợp đồng — các trang quản trị + soát vé
 *   - khachMoi: CHƯA đăng nhập — trang chủ, tìm chuyến, xem ghế, tra cứu vé (công khai)
 * Mỗi giao diện có: tên hiển thị, trang mở đầu, menu riêng.
 * Mục menu: tab = có trên thanh tab điện thoại; anTrenMayTinh = chỉ hiện trên điện thoại; chamDo = số thông báo chưa đọc.
 */
const GIAO_DIEN = {
  khachMoi: {
    ten: '',
    trangDau: '/',
    menu: [
      { href: '/', nhan: 'Trang chủ', ic: 'home', tab: true },
      { href: '/tra-cuu', nhan: 'Tra cứu vé', ic: 'shield', tab: true, nhanTab: 'Tra cứu' },
      { href: '/dang-nhap', nhan: 'Đăng nhập', ic: 'user', tab: true, anTrenMayTinh: true },
    ],
  },
  khach: {
    ten: '',
    trangDau: '/',
    menu: [
      { href: '/', nhan: 'Trang chủ', ic: 'home', tab: true },
      { href: '/ve-cua-toi', nhan: 'Vé của tôi', ic: 'ticket', tab: true, nhanTab: 'Vé' },
      { href: '/cho-ve', nhan: 'Chợ vé', ic: 'swap' },
      { href: '/thong-bao', nhan: 'Thông báo', ic: 'bell', tab: true, chamDo: true },
      { href: '/vi', nhan: 'Ví MetaMask', ic: 'wallet', tab: true, nhanTab: 'Ví' },
      { href: '/tai-khoan', nhan: 'Tài khoản', ic: 'user', tab: true, anTrenMayTinh: true },
    ],
  },
  soatVe: {
    ten: 'Nhân viên soát vé',
    trangDau: '/soat-ve',
    menu: [
      { href: '/soat-ve', nhan: 'Soát vé', ic: 'scan', tab: true },
      { href: '/vi', nhan: 'Ví MetaMask', ic: 'wallet', tab: true, nhanTab: 'Ví' },
      { href: '/tai-khoan', nhan: 'Tài khoản', ic: 'user', tab: true, anTrenMayTinh: true },
    ],
  },
  nhaXe: {
    ten: 'Nhà xe',
    trangDau: '/quan-tri',
    menu: [
      { href: '/quan-tri', nhan: 'Tổng quan', ic: 'trend', tab: true },
      { href: '/quan-tri/ve', nhan: 'Vé & hành khách', ic: 'ticket', tab: true, nhanTab: 'Vé' },
      { href: '/quan-tri/danh-muc', nhan: 'Tuyến · Xe', ic: 'bus', tab: true, nhanTab: 'Tuyến' },
      { href: '/quan-tri/tai-khoan', nhan: 'Tài khoản', ic: 'users' },
      { href: '/quan-tri/blockchain', nhan: 'Blockchain', ic: 'shield' },
      { href: '/soat-ve', nhan: 'Soát vé', ic: 'scan', tab: true },
      { href: '/tai-khoan', nhan: 'Tài khoản', ic: 'user', tab: true, anTrenMayTinh: true },
    ],
  },
};

/** Trang RIÊNG của từng giao diện; trang không có ở đây (ví, tài khoản, đăng nhập...) thì ai cũng vào được. */
const TRANG_THEO_GIAO_DIEN = new Map([
  ...[TrangChu, TrangTimChuyen, TrangChonGhe, TrangThanhToan, TrangVeCuaToi, TrangChiTietVe, TrangChoVe, TrangThongBao]
    .map((Lop) => [Lop, ['khach']]),
  [TrangSoatVe, ['soatVe', 'nhaXe']],
  ...[TrangQuanTriTongQuan, TrangQuanTriVe, TrangQuanTriDanhMuc, TrangQuanTriTaiKhoan, TrangQuanTriBlockchain]
    .map((Lop) => [Lop, ['nhaXe']]),
]);

export class UngDung {
  constructor() {
    this.api = new MayChuApi();
    this.nguoiDung = null;       // tài khoản đang đăng nhập (off-chain)
    this.thongTinHopDong = null; // địa chỉ, ABI, chainId của VeXeNFT
    this.vi = null;              // ViMetaMask
    this.hopDong = null;         // HopDongVeXe
    this.trangHienTai = null;
    this.khung = document.getElementById('app');
    this.soChuaDoc = 0;     // số thông báo chưa đọc (chấm đỏ trên menu)
    this._lanDemCuoi = 0;
    this.vaiTro = { nhaXe: false, soatVe: false }; // đọc từ blockchain theo ví đã liên kết
  }

  async khoiDong() {
    try {
      this.thongTinHopDong = await this.api.lay('/api/hop-dong');
    } catch (loi) {
      this.khung.innerHTML = htmlLoi(loi.message);
      return;
    }
    this.vi = new ViMetaMask(this.thongTinHopDong);
    this.hopDong = new HopDongVeXe(this.vi);
    this.vi.khiThayDoi(() => this.chuyenTrang());

    if (this.api.token) {
      try { this.nguoiDung = (await this.api.lay('/api/tai-khoan/toi')).nguoiDung; } catch { this.api.datToken(null); }
    }
    await this.vi.layViDaKetNoi().catch(() => null);
    await this.capNhatVaiTro();

    window.addEventListener('hashchange', () => this.chuyenTrang());
    // Mọi nút có data-chep (mã vé, mã chuyến, mã ghế...) -> sao chép nội dung, dùng chung cho cả web
    document.addEventListener('click', (e) => {
      const nut = e.target.closest('[data-chep]');
      if (nut) saoChep(nut.dataset.chep, `Đã sao chép: ${nut.dataset.chep}`);
    });
    await this.chuyenTrang();
  }

  get tyGia() {
    return this.thongTinHopDong?.tyGiaVndMoiEth || 100_000_000;
  }

  /** 'khachMoi' (chưa đăng nhập) | 'nhaXe' | 'soatVe' | 'khach' */
  get loaiGiaoDien() {
    if (!this.nguoiDung) return 'khachMoi';
    return this.vaiTro.nhaXe ? 'nhaXe' : this.vaiTro.soatVe ? 'soatVe' : 'khach';
  }

  get giaoDien() {
    return GIAO_DIEN[this.loaiGiaoDien];
  }

  // ===================== ĐIỀU HƯỚNG =====================

  /** Chuyển tới đường dẫn, vd ud.di('/tim?diemDi=...') */
  di(duongDan, { thayThe = false } = {}) {
    const hash = '#' + duongDan;
    if (thayThe) location.replace(hash); else location.hash = hash;
  }

  /** Tách "#/chuyen/CX1?ngay=..." thành lớp trang + tham số + truy vấn */
  _timTrang() {
    const tho = location.hash.replace(/^#/, '') || '/';
    const [duong, chuoiTruyVan = ''] = tho.split('?');
    const truyVan = Object.fromEntries(new URLSearchParams(chuoiTruyVan));
    for (const [mau, LopTrang] of BANG_DUONG_DAN) {
      const tenThamSo = [...mau.matchAll(/:(\w+)/g)].map((m) => m[1]);
      const bieuThuc = new RegExp('^' + mau.replace(/:\w+/g, '([^/]+)') + '/?$');
      const khop = (duong || '/').match(bieuThuc);
      if (khop) {
        const thamSo = Object.fromEntries(tenThamSo.map((ten, i) => [ten, decodeURIComponent(khop[i + 1])]));
        return { LopTrang, thamSo, truyVan, duong };
      }
    }
    return null;
  }

  async chuyenTrang() {
    const tim = this._timTrang();
    if (!tim) return this.di('/', { thayThe: true });
    const { LopTrang, thamSo, truyVan } = tim;

    // Bảo vệ trang
    if (LopTrang.canDangNhap && !this.nguoiDung) return this.di('/dang-nhap?tiep=' + encodeURIComponent(location.hash.slice(1)), { thayThe: true });
    if (LopTrang.chiKhachLa && this.nguoiDung) return this.di(this.giaoDien.trangDau, { thayThe: true });
    // Trang không thuộc giao diện của vai trò này -> về trang đầu của vai trò (vd nhà xe mở "#/" -> Tổng quan)
    const choPhep = TRANG_THEO_GIAO_DIEN.get(LopTrang);
    if (this.nguoiDung && choPhep && !choPhep.includes(this.loaiGiaoDien)) return this.di(this.giaoDien.trangDau, { thayThe: true });

    this.trangHienTai?.roiTrang();
    const trang = new LopTrang(this);
    this.trangHienTai = trang;

    document.body.classList.toggle('plain', LopTrang.boCuc === 'tron');
    document.title = LopTrang.tieuDe ? `${LopTrang.tieuDe} · CARBOOK` : 'CARBOOK – Vé xe miền Tây, vé NFT';
    this.veKhungGiaoDien(LopTrang.tab || LopTrang.menu); // trang quản trị tô sáng theo tab con
    this.khung.className = `page ${LopTrang.doRong || ''}`;
    this.khung.innerHTML = htmlDangTai;
    window.scrollTo(0, 0);
    try {
      await trang.hienThi(this.khung, thamSo, truyVan);
    } catch (loi) {
      if (this.trangHienTai === trang) this.khung.innerHTML = htmlLoi(loi.message);
    }
  }

  // ===================== KHUNG GIAO DIỆN =====================

  veKhungGiaoDien(menuDangChon) {
    const nav = document.getElementById('nav');
    const tabbar = document.getElementById('tabbar');
    const benPhai = document.getElementById('top-right');
    const chamDo = '<span class="dot hidden" data-badge></span>';
    const { menu, ten: tenVaiTro } = this.giaoDien;
    const mucMayTinh = menu.filter((m) => !m.anTrenMayTinh);
    nav.classList.toggle('nhieu-muc', mucMayTinh.length > 5);
    nav.innerHTML = mucMayTinh.map((m) =>
      `<a href="#${m.href}" title="${h(m.nhan)}" class="${menuDangChon === m.href ? 'active' : ''}">${icon(m.ic, 'sm')}<span class="nav-lbl">${h(m.nhan)}</span>${m.chamDo ? chamDo.replace('class="dot', 'style="position:static;border:0" class="dot') : ''}</a>`).join('');
    tabbar.innerHTML = menu.filter((m) => m.tab).map((m) =>
      `<a href="#${m.href}" class="${menuDangChon === m.href ? 'active' : ''}">${icon(m.ic)}<span>${h(m.nhanTab || m.nhan)}</span>${m.chamDo ? chamDo : ''}</a>`).join('');
    this._veChamDo();
    this.capNhatSoChuaDoc();

    const toi = document.documentElement.getAttribute('data-theme') === 'dark';
    const nutSangToi = `<button class="top-btn" id="nut-giao-dien" title="Chế độ tối" aria-label="Đổi giao diện sáng/tối">${icon(toi ? 'sun' : 'moon')}</button>`;
    const ganNutSangToi = () => benPhai.querySelector('#nut-giao-dien').addEventListener('click', (e) => {
      e.currentTarget.innerHTML = icon(doiGiaoDien() ? 'sun' : 'moon');
    });

    // Khách chưa đăng nhập: nút Đăng nhập / Đăng ký (giữ trang đang xem để quay lại sau khi đăng nhập)
    if (!this.nguoiDung) {
      const dangXem = location.hash.slice(1);
      const tiep = dangXem && dangXem !== '/' ? `?tiep=${encodeURIComponent(dangXem)}` : '';
      benPhai.innerHTML = `${nutSangToi}
        <a class="btn sm nut-dang-nhap" href="#/dang-nhap${tiep}">Đăng nhập</a>
        <a class="btn sm primary" href="#/dang-ky${tiep}">Đăng ký</a>`;
      ganNutSangToi();
      return;
    }

    const chipVi = !this.vi.coMetaMask
      ? `<a class="vi-chip cam" href="https://metamask.io" target="_blank" rel="noopener">${icon('fox', 'sm')}<span class="nhan-vi">Cài MetaMask</span></a>`
      : this.vi.diaChi
        ? `<a class="vi-chip" href="#/vi" title="${h(this.vi.diaChi)}"><span class="vi-dot"></span><span class="mono">${h(rutGonDiaChi(this.vi.diaChi))}</span></a>`
        : `<button class="vi-chip cam" id="nut-ket-noi-vi">${icon('fox', 'sm')}<span class="nhan-vi">Kết nối ví</span></button>`;
    benPhai.innerHTML = `
      ${tenVaiTro ? `<span class="the-vai-tro" title="Vai trò lấy từ hợp đồng trên blockchain">${icon(this.loaiGiaoDien === 'nhaXe' ? 'bus' : 'scan', 'sm')}${h(tenVaiTro)}</span>` : ''}
      ${chipVi}
      ${nutSangToi}
      <a class="avatar" href="#/tai-khoan" title="${h(this.nguoiDung.hoTen)}" aria-label="Tài khoản">${h(chuDau(this.nguoiDung.hoTen))}</a>`;

    ganNutSangToi();
    benPhai.querySelector('#nut-ket-noi-vi')?.addEventListener('click', (e) =>
      dangXuLy(e.currentTarget, async () => { await this.vi.ketNoi(); this.chuyenTrang(); }));
  }

  // ===================== THÔNG BÁO (chấm đỏ) =====================

  /** Hỏi backend số thông báo chưa đọc (tối đa 20 giây/lần, hoặc ngay khi `ep`). */
  async capNhatSoChuaDoc(ep = false) {
    if (!this.nguoiDung?.diaChiVi) return this.datSoChuaDoc(0);
    if (!ep && Date.now() - this._lanDemCuoi < 20_000) return;
    this._lanDemCuoi = Date.now();
    try { this.datSoChuaDoc((await this.api.lay('/api/thong-bao/so-chua-doc')).soChuaDoc); } catch { /* im lặng */ }
  }

  datSoChuaDoc(n) {
    this.soChuaDoc = n;
    this._veChamDo();
  }

  _veChamDo() {
    document.querySelectorAll('[data-badge]').forEach((o) => {
      o.textContent = this.soChuaDoc > 9 ? '9+' : this.soChuaDoc;
      o.classList.toggle('hidden', !this.soChuaDoc);
    });
  }

  // ===================== PHIÊN ĐĂNG NHẬP & VÍ =====================

  /**
   * Vai trò của ví đã liên kết: backend đọc từ hợp đồng (chủ hợp đồng = nhà xe; laNhanVienSoatVe = nhân viên).
   * Hỏi qua backend (RPC riêng) nên vẫn đúng kể cả khi MetaMask đang để nhầm mạng.
   */
  async capNhatVaiTro() {
    this.vaiTro = { nhaXe: false, soatVe: false };
    if (!this.nguoiDung?.diaChiVi) return;
    try {
      this.vaiTro = (await this.api.lay('/api/tai-khoan/vai-tro')).vaiTro;
    } catch { /* mất kết nối -> coi là khách */ }
  }

  async datPhien(token, nguoiDung) {
    this.api.datToken(token);
    this.nguoiDung = nguoiDung;
    this._lanDemCuoi = 0;
    await this.capNhatVaiTro();
  }

  dangXuat() {
    this.api.datToken(null);
    this.nguoiDung = null;
    this.vaiTro = { nhaXe: false, soatVe: false };
    this.datSoChuaDoc(0);
    this.di('/dang-nhap', { thayThe: true });
  }

  /** Liên kết ví MetaMask đang mở với tài khoản (ký một câu, không tốn gas). */
  async lienKetVi() {
    const diaChi = await this.vi.ketNoi();
    const { noiDung } = await this.api.lay(`/api/tai-khoan/noi-dung-lien-ket-vi?diaChi=${diaChi}`);
    const chuKy = await this.vi.kyThongDiep(noiDung);
    this.nguoiDung = (await this.api.gui('/api/tai-khoan/lien-ket-vi', { diaChi, chuKy })).nguoiDung;
    await this.capNhatVaiTro();
    this.capNhatSoChuaDoc(true);
    return this.nguoiDung;
  }

  /**
   * Gọi trước mọi giao dịch của khách: đã kết nối MetaMask, và ví MetaMask đang mở TRÙNG
   * với ví đã liên kết tài khoản (để vé NFT vào đúng ví của tài khoản này).
   */
  async damBaoSanSangGiaoDich() {
    const diaChi = await this.vi.ketNoi();
    if (!this.nguoiDung.diaChiVi) {
      thongBao('Tài khoản chưa liên kết ví — hãy ký xác nhận trong MetaMask để liên kết.');
      await this.lienKetVi();
    } else if (this.nguoiDung.diaChiVi !== diaChi) {
      throw new Error(`MetaMask đang mở ví ${rutGonDiaChi(diaChi)}, nhưng tài khoản liên kết ví ${rutGonDiaChi(this.nguoiDung.diaChiVi)}. Hãy đổi tài khoản trong MetaMask.`);
    }
    return diaChi;
  }
}

new UngDung().khoiDong();
