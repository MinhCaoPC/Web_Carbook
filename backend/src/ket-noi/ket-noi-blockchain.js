const fs = require('fs');
const { ethers } = require('ethers');
const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');
const { VeXe } = require('../mo-hinh/ve-xe');

/**
 * KẾT NỐI BLOCKCHAIN — backend chỉ ĐỌC hợp đồng VeXeNFT (miễn phí, không tốn gas).
 *
 * Backend KHÔNG giữ khóa riêng nào và KHÔNG gửi giao dịch: mọi việc ghi lên blockchain
 * (mua, hủy, chuyển nhượng, soát vé...) đều do người dùng tự ký bằng MetaMask trên trình duyệt.
 */
class KetNoiBlockchain {
  /**
   * @param {object} p
   * @param {string} [p.rpcUrl]   địa chỉ node blockchain (vd http://127.0.0.1:8545)
   * @param {ethers.AbstractProvider} [p.provider] truyền sẵn provider (dùng khi kiểm thử)
   * @param {string} [p.diaChi]   địa chỉ hợp đồng (bỏ trống -> đọc từ file dia-chi-hop-dong.json)
   * @param {Array}  [p.abi]      ABI hợp đồng (bỏ trống -> đọc từ artifacts)
   * @param {string} [p.tenMang]  'localhost' | 'sepolia'
   * @param {string} [p.fileDiaChi]
   * @param {string} [p.fileAbi]
   */
  constructor(p) {
    this.tenMang = p.tenMang || 'localhost';
    this.rpcUrl = p.rpcUrl;
    this._provider = p.provider || null;
    this._diaChi = p.diaChi || null;
    this._abi = p.abi || null;
    this.fileDiaChi = p.fileDiaChi;
    this.fileAbi = p.fileAbi;
    this._hopDong = null;
  }

  // ===================== THÔNG TIN HỢP ĐỒNG =====================

  /** Đọc lại địa chỉ + ABI mỗi lần cần (để triển khai lại hợp đồng không phải khởi động lại máy chủ). */
  _docThongTinTuFile() {
    let diaChi = this._diaChi;
    let chainId = null;
    let khoiTrienKhai = 0; // khối chứa giao dịch triển khai hợp đồng — quét sự kiện bắt đầu từ đây
    if (!diaChi && this.fileDiaChi && fs.existsSync(this.fileDiaChi)) {
      const thongTin = JSON.parse(fs.readFileSync(this.fileDiaChi, 'utf8'))[this.tenMang];
      if (thongTin) ({ diaChi, chainId, khoiTrienKhai = 0 } = thongTin);
    }
    let abi = this._abi;
    if (!abi && this.fileAbi && fs.existsSync(this.fileAbi)) abi = JSON.parse(fs.readFileSync(this.fileAbi, 'utf8')).abi;
    return { diaChi, chainId, abi, khoiTrienKhai };
  }

  /** Khối bắt đầu quét sự kiện của hợp đồng hiện tại. */
  get khoiTrienKhai() {
    return this._docThongTinTuFile().khoiTrienKhai || 0;
  }

  /** Thông tin cho trình duyệt: địa chỉ, chainId, ABI — để web tự gọi hợp đồng qua MetaMask. */
  thongTinChoWeb() {
    const { diaChi, chainId, abi } = this._docThongTinTuFile();
    return { tenMang: this.tenMang, diaChi: diaChi || null, chainId: chainId || (this.tenMang === 'sepolia' ? 11155111 : 31337), abi: abi || [] };
  }

  get provider() {
    if (!this._provider) {
      if (!this.rpcUrl) throw new LoiNghiepVu('Chưa cấu hình RPC_URL cho blockchain.', 503);
      // cacheTimeout -1: không giữ kết quả cũ -> trạng thái ghế luôn mới nhất, và script gửi nhiều giao dịch
      // liên tiếp trên mạng ảo (tạo khối tức thì) không bị trùng nonce
      // batchMaxCount 1: gửi từng yêu cầu riêng, không gom lô — RPC công khai (vd Tenderly) từ chối lô lớn khi đọc nhiều khối cùng lúc
      this._provider = new ethers.JsonRpcProvider(this.rpcUrl, undefined, { staticNetwork: true, cacheTimeout: -1, batchMaxCount: 1 });
    }
    return this._provider;
  }

  /** Đối tượng hợp đồng chỉ-đọc. Báo lỗi dễ hiểu nếu chưa triển khai. */
  get hopDong() {
    const { diaChi, abi } = this._docThongTinTuFile();
    if (!diaChi || !abi || !abi.length) {
      throw new LoiNghiepVu('Hợp đồng VeXeNFT chưa được triển khai (xem README: npm run trien-khai).', 503);
    }
    if (!this._hopDong || this._hopDong.target !== diaChi) {
      this._hopDong = new ethers.Contract(diaChi, abi, this.provider);
    }
    return this._hopDong;
  }

  /** Kiểm tra node blockchain chạy và địa chỉ hợp đồng có mã thật (in cảnh báo lúc khởi động). */
  async kiemTraSanSang() {
    try {
      const diaChi = this.hopDong.target;
      const ma = await this.provider.getCode(diaChi);
      if (ma === '0x') return { sanSang: false, lyDo: `Không có hợp đồng tại ${diaChi} (mạng ảo vừa khởi động lại? hãy triển khai lại).` };
      return { sanSang: true, diaChi };
    } catch (loi) {
      return { sanSang: false, lyDo: loi.message };
    }
  }

  // ===================== ĐỌC DỮ LIỆU TRÊN CHUỖI =====================

  /** Thông tin chuyến trên blockchain: giá (wei), giờ chạy, số ghế, đang mở bán không. */
  async layChuyen(maChuyen) {
    const [c, daBan] = await Promise.all([
      this.hopDong.layChuyen(maChuyen),
      this.hopDong.soVeDaBan(ethers.id(maChuyen)), // ethers.id = keccak256 của chuỗi, khớp layIdChuyen
    ]);
    return { giaVeWei: c.giaVe, gioKhoiHanh: Number(c.gioKhoiHanh), soGhe: Number(c.soGhe), dangMoBan: c.dangMoBan, soVeDaBan: Number(daBan) };
  }

  /** Map mã ghế -> mã vé đang giữ ghế (0 = trống). Một lần gọi cho cả xe. */
  async layTrangThaiGhe(maChuyen, danhSachMaGhe) {
    if (!danhSachMaGhe.length) return new Map();
    const maVe = await this.hopDong.layTrangThaiGhe(maChuyen, danhSachMaGhe);
    return new Map(danhSachMaGhe.map((g, i) => [g, Number(maVe[i])]));
  }

  /** @returns {Promise<VeXe>} */
  async layVe(maVe) {
    const [ve, chuSoHuu, giaDangRao] = await this.hopDong.layVe(maVe);
    if (!ve.maChuyen) throw new LoiNghiepVu(`Vé #${maVe} không tồn tại.`, 404);
    return new VeXe(maVe, ve, chuSoHuu, giaDangRao);
  }

  /** @returns {Promise<VeXe[]>} các vé đang nằm trong ví */
  async layVeCuaChu(diaChi) {
    const [danhSachMa, danhSachVe] = await this.hopDong.layVeCuaChu(diaChi);
    const giaRao = await Promise.all(danhSachMa.map((ma) => this.hopDong.giaRaoBan(ma)));
    return danhSachMa.map((ma, i) => new VeXe(ma, danhSachVe[i], diaChi, giaRao[i]));
  }

  /** @returns {Promise<VeXe[]>} các vé đang rao bán trên chợ */
  async layDanhSachRaoBan() {
    const danhSachMa = await this.hopDong.layDanhSachRaoBan();
    return Promise.all(danhSachMa.map((ma) => this.layVe(ma)));
  }

  /** Ví đã ký mã QR của vé (dùng hàm thuần `layNguoiKy` của hợp đồng để khớp 100% cách hợp đồng kiểm tra). */
  /** Ví đã ký mã QR { maVe, chuKy } (hợp đồng tự khôi phục từ chữ ký). */
  async layNguoiKyQR(maVe, chuKy) {
    try {
      return (await this.hopDong.layNguoiKy(maVe, chuKy)).toLowerCase();
    } catch {
      throw new LoiNghiepVu('Chữ ký trong mã QR không hợp lệ.', 400);
    }
  }

  /** Sơ đồ ghế `maSoDo` đã đăng ký lên hợp đồng chưa (số ghế > 0). */
  async soDoDaDangKy(maSoDo) {
    return (await this.hopDong.soGheCuaSoDo(ethers.id(maSoDo))) > 0n;
  }

  /** Vé còn chuyển nhượng / bán lại được không (còn hiệu lực và còn hơn 2 giờ mới tới giờ chạy). */
  async coTheChuyenNhuong(maVe) {
    return this.hopDong.coTheChuyenNhuong(maVe);
  }

  /** Vé đã được cộng vào doanh thu nhà xe chưa (đã soát hoặc đã chốt "khách không đi"). */
  async daTinhDoanhThu(maVe) {
    return this.hopDong.daTinhDoanhThu(maVe);
  }

  /** Ví này có quyền soát vé không (là nhà xe hoặc nhân viên được cấp quyền) — vai trò lấy TỪ BLOCKCHAIN. */
  async coQuyenSoatVe(diaChi) {
    if (!diaChi) return false;
    const [chu, laNhanVien] = await Promise.all([this.hopDong.owner(), this.hopDong.laNhanVienSoatVe(diaChi)]);
    return laNhanVien || chu.toLowerCase() === String(diaChi).toLowerCase();
  }

  /** Ví chủ hợp đồng (nhà xe). Nhớ 30 giây để mỗi request quản trị không phải hỏi blockchain lại. */
  async chuHopDong() {
    const hd = this.hopDong;
    if (!this._chu || this._chu.diaChiHopDong !== hd.target || Date.now() > this._chu.hetHan) {
      this._chu = { giaTri: (await hd.owner()).toLowerCase(), diaChiHopDong: hd.target, hetHan: Date.now() + 30_000 };
    }
    return this._chu.giaTri;
  }
}

module.exports = { KetNoiBlockchain };
