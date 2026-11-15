// Kết nối ví MetaMask và gọi hợp đồng VeXeNFT từ trình duyệt.
// Thư viện ethers được backend phục vụ sẵn tại /thu-vien/ethers.min.js.
import { ethers } from '/thu-vien/ethers.min.js';

export { ethers };

/** Câu báo lỗi của hợp đồng (không dấu, để tiết kiệm gas) -> câu tiếng Việt cho người dùng. */
const DICH_LOI_HOP_DONG = {
  // Lỗi của OpenZeppelin Ownable: ví gửi giao dịch không phải chủ hợp đồng
  OwnableUnauthorizedAccount: 'Chỉ ví nhà xe (chủ hợp đồng) mới làm được việc này. Hãy chuyển MetaMask sang ví nhà xe rồi thử lại.',
  // MetaMask đôi khi không gửi kèm mã lỗi nên ethers không đọc được tên lỗi
  'unknown custom error': 'Hợp đồng từ chối giao dịch. Kiểm tra ví đang mở trong MetaMask có đúng vai trò (nhà xe / nhân viên / chủ vé) không.',
  'So tien gui khong dung gia ve': 'Số tiền gửi không đúng giá vé.',
  'Chuyen chua mo ban': 'Chuyến này chưa được nhà xe mở bán trên blockchain.',
  'Chuyen da khoi hanh': 'Chuyến xe đã khởi hành.',
  'Ghe da co nguoi mua': 'Ghế đã có người mua (có thể vừa bị người khác mua trước).',
  'Chuyen da het ghe': 'Chuyến đã hết ghế.',
  'Ghe khong co tren xe nay': 'Ghế này không có trên xe của chuyến.',
  'So do ghe chua dang ky': 'Sơ đồ ghế của xe chưa được đăng ký lên hợp đồng.',
  'So do ghe da dang ky': 'Sơ đồ ghế này đã đăng ký rồi.',
  'Ve da duoc chot roi': 'Vé này đã được chốt doanh thu rồi.',
  'Chuyen chua chay': 'Chuyến chưa chạy nên chưa chốt được.',
  'Moi lan mua tu 1 den 5 ve': 'Mỗi lần chỉ mua được từ 1 đến 5 vé.',
  'Qua sat gio chay, khong the huy ve': 'Còn dưới 2 giờ trước giờ chạy nên không thể hủy vé.',
  'Ban khong phai chu ve': 'Bạn không phải chủ của vé này.',
  'Ve khong the chuyen nhuong': 'Vé đã dùng hoặc còn dưới 2 giờ trước giờ chạy nên không thể chuyển nhượng.',
  'Hay huy rao ban truoc': 'Hãy gỡ tin rao bán trước khi tặng vé.',
  'Gia vuot gia tran 110%': 'Giá rao vượt giá trần 110% giá gốc.',
  'Ve khong dang rao ban': 'Vé này không còn được rao bán.',
  'So tien gui khong dung gia rao': 'Số tiền gửi không đúng giá rao.',
  'Khong the tu mua ve cua minh': 'Bạn không thể tự mua vé của chính mình.',
  'Chu ky khong phai cua chu ve': 'Mã QR không do chủ vé hiện tại ký.',
  'Ve khong con hieu luc': 'Vé không còn hiệu lực (đã dùng hoặc đã hủy).',
  'Khong co quyen soat ve': 'Ví này không có quyền soát vé.',
  'Nguoi nhan khong hop le': 'Địa chỉ ví người nhận không hợp lệ.',
  'Chua co doanh thu': 'Chưa có doanh thu để rút.',
  OwnableUnauthorizedAccount: 'Chỉ ví nhà xe (chủ hợp đồng) mới làm được việc này.',
};

/** Rút câu lỗi dễ hiểu từ lỗi của ethers/MetaMask. */
export function dichLoi(loi) {
  if (loi?.code === 'ACTION_REJECTED' || loi?.code === 4001 || loi?.info?.error?.code === 4001) return 'Bạn đã từ chối trên MetaMask.';
  const toanBo = [loi?.reason, loi?.revert?.name, loi?.shortMessage, loi?.info?.error?.message, loi?.error?.message, loi?.message].filter(Boolean).join(' | ');
  for (const [khoa, cau] of Object.entries(DICH_LOI_HOP_DONG)) if (toanBo.includes(khoa)) return cau;
  if (/insufficient funds/i.test(toanBo)) return 'Ví không đủ ETH để trả tiền vé và phí gas.';
  if (/nonce|Nonce too high/i.test(toanBo)) return 'MetaMask lệch nonce (thường do mạng ảo vừa khởi động lại). Vào MetaMask > Cài đặt > Nâng cao > Xóa dữ liệu hoạt động.';
  return loi?.shortMessage || loi?.message || 'Giao dịch thất bại.';
}

// =====================================================================

/** Lớp quản lý ví MetaMask của người dùng. */
export class ViMetaMask {
  /** @param {{ diaChi:string, chainId:number, abi:Array, tenMang:string, rpcUrl:string|null }} thongTinHopDong */
  constructor(thongTinHopDong) {
    this.thongTin = thongTinHopDong;
    this.diaChi = null; // ví đang kết nối
  }

  get coMetaMask() {
    return typeof window !== 'undefined' && !!window.ethereum;
  }

  get chainIdHex() {
    return '0x' + Number(this.thongTin.chainId).toString(16);
  }

  /** Lấy ví đang kết nối mà KHÔNG bật cửa sổ MetaMask (dùng khi tải trang). */
  async layViDaKetNoi() {
    if (!this.coMetaMask) return null;
    const ds = await window.ethereum.request({ method: 'eth_accounts' });
    this.diaChi = ds[0] ? ds[0].toLowerCase() : null;
    return this.diaChi;
  }

  /** Bật MetaMask xin kết nối + chuyển đúng mạng. Trả về địa chỉ ví. */
  async ketNoi() {
    if (!this.coMetaMask) throw new Error('Chưa cài MetaMask. Hãy cài tiện ích MetaMask cho trình duyệt (metamask.io).');
    const ds = await window.ethereum.request({ method: 'eth_requestAccounts' });
    await this.damBaoDungMang();
    this.diaChi = ds[0].toLowerCase();
    return this.diaChi;
  }

  /** MetaMask phải ở đúng mạng của hợp đồng (31337 = mạng ảo, 11155111 = Sepolia). */
  async damBaoDungMang() {
    const hienTai = await window.ethereum.request({ method: 'eth_chainId' });
    if (hienTai === this.chainIdHex) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: this.chainIdHex }] });
    } catch (loi) {
      // 4902 = MetaMask chưa biết mạng này -> thêm mạng ảo vào MetaMask
      if (loi.code !== 4902 || !this.thongTin.rpcUrl) throw new Error(`Hãy chuyển MetaMask sang mạng ${this.thongTin.tenMang} (chainId ${this.thongTin.chainId}).`);
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: this.chainIdHex, chainName: this.thongTin.tenMang === 'sepolia' ? 'Sepolia' : 'CARBOOK mạng ảo (Hardhat)', rpcUrls: [this.thongTin.rpcUrl], nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 } }],
      });
    }
  }

  /** Ký một câu chữ (không tốn gas) — dùng để liên kết ví và tạo mã QR. */
  async kyThongDiep(noiDung) {
    const signer = await this._layNguoiKy();
    return signer.signMessage(noiDung);
  }

  async _layNguoiKy() {
    if (!this.diaChi) await this.ketNoi();
    await this.damBaoDungMang();
    return new ethers.BrowserProvider(window.ethereum).getSigner();
  }

  /** Hợp đồng gắn với ví (để gửi giao dịch). */
  async hopDongCoKy() {
    if (!this.thongTin.diaChi) throw new Error('Hợp đồng chưa được triển khai.');
    return new ethers.Contract(this.thongTin.diaChi, this.thongTin.abi, await this._layNguoiKy());
  }

  /**
   * Kết nối CHỈ ĐỌC tới blockchain, tạo MỘT lần rồi dùng lại (tạo mới mỗi lần sẽ phải dò lại mạng -> chậm).
   * Mạng ảo: đọc thẳng RPC của máy (biết sẵn chainId). Sepolia: đọc qua MetaMask.
   */
  get _nhaCungCapDoc() {
    if (!this.__nhaCungCapDoc) {
      this.__nhaCungCapDoc = this.thongTin.rpcUrl
        ? new ethers.JsonRpcProvider(this.thongTin.rpcUrl, Number(this.thongTin.chainId), { staticNetwork: true })
        : new ethers.BrowserProvider(window.ethereum);
    }
    return this.__nhaCungCapDoc;
  }

  /** Hợp đồng chỉ đọc (không cần ví, không tốn gas). */
  hopDongChiDoc() {
    return new ethers.Contract(this.thongTin.diaChi, this.thongTin.abi, this._nhaCungCapDoc);
  }

  /** Số dư ETH (wei) của một ví — đọc thẳng blockchain, không tốn gas. */
  async laySoDu(diaChi) {
    return this._nhaCungCapDoc.getBalance(diaChi);
  }

  /** Gọi hàm khi người dùng đổi tài khoản / đổi mạng trong MetaMask. */
  khiThayDoi(hamGoiLai) {
    if (!this.coMetaMask) return;
    window.ethereum.on?.('accountsChanged', (ds) => { this.diaChi = ds[0] ? ds[0].toLowerCase() : null; hamGoiLai(); });
    window.ethereum.on?.('chainChanged', () => { this.__nhaCungCapDoc = null; hamGoiLai(); }); // đổi mạng -> tạo lại kết nối đọc
  }
}

// =====================================================================

/**
 * Lớp bọc các hàm của hợp đồng VeXeNFT — mỗi hàm = một chức năng trên web.
 * Mọi giao dịch đi qua `_gui`: chờ người dùng xác nhận MetaMask, chờ vào khối, dịch lỗi sang tiếng Việt.
 */
export class HopDongVeXe {
  /** @param {ViMetaMask} vi */
  constructor(vi) {
    this.vi = vi;
  }

  async _gui(tenHam, thamSo = [], giaTri = 0n) {
    try {
      const hopDong = await this.vi.hopDongCoKy();
      const tx = await hopDong[tenHam](...thamSo, giaTri ? { value: giaTri } : {});
      const bienNhan = await tx.wait();
      return { hopDong, bienNhan, maGiaoDich: tx.hash };
    } catch (loi) {
      throw new Error(dichLoi(loi));
    }
  }

  async _doc(tenHam, ...thamSo) {
    try {
      return await this.vi.hopDongChiDoc()[tenHam](...thamSo);
    } catch (loi) {
      throw new Error(dichLoi(loi));
    }
  }

  // ----- Chức năng 2 + 3: mua vé (hợp đồng khóa ghế) -----
  /** @returns {Promise<{ danhSachMaVe:number[], maGiaoDich:string }>} */
  async muaVe(maChuyen, danhSachGhe, giaMoiVeWei) {
    const tong = BigInt(giaMoiVeWei) * BigInt(danhSachGhe.length);
    const { hopDong, bienNhan, maGiaoDich } = await this._gui('muaNhieuVe', [maChuyen, danhSachGhe], tong);
    // Lấy mã vé (tokenId) từ sự kiện DaMuaVe trong biên nhận giao dịch
    const danhSachMaVe = bienNhan.logs
      .map((log) => { try { return hopDong.interface.parseLog(log); } catch { return null; } })
      .filter((s) => s && s.name === 'DaMuaVe')
      .map((s) => Number(s.args.maVe));
    return { danhSachMaVe, maGiaoDich };
  }

  // ----- Chức năng 4: soát vé (mã QR = { maVe, chuKy }, không có hạn, vé chỉ lên xe được một lần) -----
  async noiDungCanKy(maVe) { return this._doc('noiDungCanKy', maVe); }
  async danhDauDaSuDung(maVe, chuKy) { return this._gui('danhDauDaSuDung', [maVe, chuKy]); }

  // ----- Chức năng 5: hủy vé, hoàn tiền -----
  async tinhTienHoan(maVe) {
    const [phanTram, tienHoan] = await this._doc('tinhTienHoan', maVe);
    return { phanTram: Number(phanTram), tienHoanWei: tienHoan };
  }
  async huyVe(maVe) { return this._gui('huyVe', [maVe]); }

  // ----- Chức năng 6: chuyển nhượng, bán lại -----
  async giaBanLaiToiDa(maVe) { return this._doc('giaBanLaiToiDa', maVe); }
  async raoBanVe(maVe, giaWei) { return this._gui('raoBanVe', [maVe, giaWei]); }
  async huyRaoBan(maVe) { return this._gui('huyRaoBan', [maVe]); }
  async muaLaiVe(maVe, giaWei) { return this._gui('muaLaiVe', [maVe], BigInt(giaWei)); }
  async chuyenNhuongVe(maVe, nguoiNhan) { return this._gui('chuyenNhuongVe', [maVe, nguoiNhan]); }

  // ----- Nhà xe -----
  async chuHopDong() { return (await this._doc('owner')).toLowerCase(); }
  async laNhanVienSoatVe(diaChi) { return this._doc('laNhanVienSoatVe', diaChi); }
  async doanhThuChoRut() { return this._doc('doanhThuChoRut'); }
  async dangKySoDoGhe(maSoDo, danhSachGhe) { return this._gui('dangKySoDoGhe', [maSoDo, danhSachGhe]); }
  async soDoDaDangKy(maSoDo) { return (await this._doc('soGheCuaSoDo', ethers.id(maSoDo))) > 0n; }
  async moBanNhieuChuyen(maChuyen, giaVe, gioKhoiHanh, maSoDo) { return this._gui('moBanNhieuChuyen', [maChuyen, giaVe, gioKhoiHanh, maSoDo]); }
  async chotVeKhongDi(danhSachMaVe) { return this._gui('chotVeKhongDi', [danhSachMaVe]); }
  async datNhanVienSoatVe(diaChi, coQuyen) { return this._gui('datNhanVienSoatVe', [diaChi, coQuyen]); }
  async rutDoanhThu(den) { return this._gui('rutDoanhThu', [den]); }
}
