/**
 * MÁY CHỦ CARBOOK — điểm khởi động backend.
 *
 * Sơ đồ các lớp (mũi tên = "dùng"):
 *
 *   API (Express router)  ->  Dịch vụ (nghiệp vụ)        ->  Kho dữ liệu (off-chain)  ->  Firestore / file JSON
 *                                                        ->  KetNoiBlockchain (on-chain, chỉ đọc)
 *
 * Lớp UngDungMayChu tạo mọi đối tượng MỘT LẦN rồi "tiêm" vào nhau (dependency injection),
 * nhờ vậy khi kiểm thử có thể thay Firestore bằng file, blockchain thật bằng blockchain giả.
 */
const path = require('path');
const express = require('express');
const { CAU_HINH } = require('./cau-hinh');
const { KhoLuuTruFirestore } = require('./kho-du-lieu/kho-luu-tru-firestore');
const { KhoLuuTruTep } = require('./kho-du-lieu/kho-luu-tru-tep');
const { KhoDanhMuc } = require('./kho-du-lieu/kho-danh-muc');
const { KhoNguoiDung } = require('./kho-du-lieu/kho-nguoi-dung');
const { KhoThongTinVe } = require('./kho-du-lieu/kho-thong-tin-ve');
const { KhoThongBaoChung } = require('./kho-du-lieu/kho-thong-bao-chung');
const { KetNoiBlockchain } = require('./ket-noi/ket-noi-blockchain');
const { NhatKySuKien } = require('./ket-noi/nhat-ky-su-kien');
const { XacMinhGoogle } = require('./ket-noi/xac-minh-google');
const { GuiThuDienTu } = require('./ket-noi/gui-thu-dien-tu');
const { DichVuXacThuc } = require('./dich-vu/dich-vu-xac-thuc');
const { DichVuChuyenXe } = require('./dich-vu/dich-vu-chuyen-xe');
const { DichVuVe } = require('./dich-vu/dich-vu-ve');
const { DichVuThongBao } = require('./dich-vu/dich-vu-thong-bao');
const { DichVuThongKe } = require('./dich-vu/dich-vu-thong-ke');
const { DichVuQuanLyDanhMuc } = require('./dich-vu/dich-vu-quan-ly-danh-muc');
const { DichVuQuanLyTaiKhoan } = require('./dich-vu/dich-vu-quan-ly-tai-khoan');
const { canDangNhap, canNhaXe, xuLyLoi } = require('./api/trung-gian');
const { taoApiTaiKhoan } = require('./api/api-tai-khoan');
const { taoApiChuyenXe } = require('./api/api-chuyen-xe');
const { taoApiVe, taoApiMetadata } = require('./api/api-ve');
const { taoApiThongBao } = require('./api/api-thong-bao');
const { taoApiQuanTri } = require('./api/api-quan-tri');

class UngDungMayChu {
  /**
   * @param {object} p
   * @param {import('./kho-du-lieu/kho-luu-tru').KhoLuuTru} p.khoLuuTru  nơi lưu tài khoản, thông tin vé
   * @param {KhoDanhMuc} p.khoDanhMuc
   * @param {KetNoiBlockchain} p.blockchain
   * @param {object} p.cauHinh
   * @param {XacMinhGoogle} [p.xacMinhGoogle] truyền bản giả khi kiểm thử
   * @param {GuiThuDienTu} [p.guiThu]         truyền bản giả khi kiểm thử
   */
  constructor({ khoLuuTru, khoDanhMuc, blockchain, cauHinh, xacMinhGoogle, guiThu }) {
    this.cauHinh = cauHinh;
    this.blockchain = blockchain;
    this.khoDanhMuc = khoDanhMuc;

    // Kho dữ liệu
    const khoNguoiDung = new KhoNguoiDung(khoLuuTru);
    const khoThongTinVe = new KhoThongTinVe(khoLuuTru);
    const khoThongBaoChung = new KhoThongBaoChung(khoLuuTru);

    // Kết nối dịch vụ ngoài (Google, Gmail) + nhật ký sự kiện blockchain
    const ketNoi = {
      xacMinhGoogle: xacMinhGoogle || new XacMinhGoogle(cauHinh.googleClientIds),
      guiThu: guiThu || new GuiThuDienTu(cauHinh),
    };
    const nhatKySuKien = new NhatKySuKien(blockchain);

    // Dịch vụ
    this.dichVuXacThuc = new DichVuXacThuc(khoNguoiDung, cauHinh, ketNoi);
    this.dichVuChuyenXe = new DichVuChuyenXe(khoDanhMuc, blockchain, cauHinh);
    this.dichVuVe = new DichVuVe(blockchain, khoThongTinVe, this.dichVuChuyenXe, nhatKySuKien);
    this.dichVuThongBao = new DichVuThongBao(blockchain, nhatKySuKien, khoNguoiDung, this.dichVuChuyenXe, khoThongBaoChung);

    // Dịch vụ quản trị (chỉ nhà xe)
    this.dichVuThongKe = new DichVuThongKe(blockchain, nhatKySuKien, khoThongTinVe, this.dichVuChuyenXe);
    this.dichVuDanhMuc = new DichVuQuanLyDanhMuc(khoLuuTru, khoDanhMuc);
    this.dichVuTaiKhoan = new DichVuQuanLyTaiKhoan(khoNguoiDung, khoThongBaoChung, blockchain);

    this.app = this._taoExpress();
  }

  /** Tạo ứng dụng từ cấu hình .env (dùng khi chạy thật). */
  static taoTuCauHinh(cauHinh = CAU_HINH) {
    const khoLuuTru = cauHinh.noiLuuDuLieu === 'tep'
      ? new KhoLuuTruTep(cauHinh.thuMucDuLieu)
      : new KhoLuuTruFirestore(cauHinh.fileKhoaFirebase);
    const khoDanhMuc = new KhoDanhMuc(khoLuuTru, {
      fileDanhMuc: path.join(cauHinh.thuMucDuLieu, 'danh-muc.json'),
      soGioLamMoi: cauHinh.soGioLamMoiDanhMuc,
      soChuyenMoiTuyen: cauHinh.soChuyenMoiTuyen,
      chiDocFile: cauHinh.noiLuuDuLieu === 'tep',
    });
    const blockchain = new KetNoiBlockchain({
      tenMang: cauHinh.mangBlockchain,
      rpcUrl: cauHinh.rpcUrl,
      fileDiaChi: cauHinh.fileDiaChiHopDong,
      fileAbi: cauHinh.fileAbiHopDong,
    });
    return new UngDungMayChu({ khoLuuTru, khoDanhMuc, blockchain, cauHinh });
  }

  _taoExpress() {
    const app = express();
    app.use(express.json({ limit: '100kb' }));
    const canDangNhapMW = canDangNhap(this.dichVuXacThuc);

    // ----- API -----
    app.use('/api/tai-khoan', taoApiTaiKhoan({ dichVuXacThuc: this.dichVuXacThuc, canDangNhap: canDangNhapMW, blockchain: this.blockchain }));
    app.use('/api/chuyen-xe', taoApiChuyenXe({ dichVuChuyenXe: this.dichVuChuyenXe }));
    app.use('/api/ve', taoApiVe({ dichVuVe: this.dichVuVe, canDangNhap: canDangNhapMW }));
    app.use('/api/metadata', taoApiMetadata({ dichVuVe: this.dichVuVe }));
    app.use('/api/thong-bao', taoApiThongBao({ dichVuThongBao: this.dichVuThongBao, canDangNhap: canDangNhapMW }));
    app.use('/api/quan-tri', taoApiQuanTri({
      canDangNhap: canDangNhapMW, canNhaXe: canNhaXe(this.blockchain),
      dichVuThongKe: this.dichVuThongKe, dichVuDanhMuc: this.dichVuDanhMuc, dichVuTaiKhoan: this.dichVuTaiKhoan,
    }));

    // Thông tin hợp đồng cho web: địa chỉ, chainId, ABI, tỷ giá demo
    app.get('/api/hop-dong', (req, res) => {
      res.json({
        thanhCong: true,
        ...this.blockchain.thongTinChoWeb(),
        rpcUrl: this.cauHinh.mangBlockchain === 'localhost' ? this.cauHinh.rpcUrl : null,
        tyGiaVndMoiEth: this.cauHinh.tyGiaVndMoiEth,
      });
    });
    app.use('/api', (req, res) => res.status(404).json({ thanhCong: false, thongBao: 'API không tồn tại.' }));

    // ----- Giao diện web + thư viện ethers cho trình duyệt -----
    // (lấy luôn file trong node_modules -> web chạy được cả khi không có Internet)
    const fileEthers = path.join(__dirname, '..', 'node_modules', 'ethers', 'dist', 'ethers.min.js');
    app.get('/thu-vien/ethers.min.js', (req, res) => res.sendFile(fileEthers));
    app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

    app.use(xuLyLoi);
    return app;
  }

  /** Nạp danh mục, kiểm tra blockchain rồi mở cổng. */
  async khoiDong() {
    await this.khoDanhMuc.taiDuLieu();
    const kiemTra = await this.blockchain.kiemTraSanSang();
    if (kiemTra.sanSang) console.log(`⛓️  Hợp đồng VeXeNFT (${this.cauHinh.mangBlockchain}): ${kiemTra.diaChi}`);
    else console.warn(`⚠️  Blockchain chưa sẵn sàng: ${kiemTra.lyDo}`);

    return new Promise((xong) => {
      const mayChu = this.app.listen(this.cauHinh.cong, () => {
        console.log(`🚌 CARBOOK đang chạy: http://localhost:${this.cauHinh.cong}  (dữ liệu off-chain: ${this.cauHinh.noiLuuDuLieu})`);
        xong(mayChu);
      });
    });
  }
}

// Chạy trực tiếp `node src/may-chu.js` -> khởi động máy chủ
if (require.main === module) {
  UngDungMayChu.taoTuCauHinh()
    .khoiDong()
    .catch((loi) => {
      console.error('❌ Không khởi động được máy chủ:', loi.message);
      process.exit(1);
    });
}

module.exports = { UngDungMayChu };
