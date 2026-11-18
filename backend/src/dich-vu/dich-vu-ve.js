const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');
const { homNay } = require('../tien-ich/thoi-gian');

/**
 * DỊCH VỤ VÉ — ghép dữ liệu ON-CHAIN (vé NFT) với dữ liệu OFF-CHAIN (thông tin chuyến, hành khách).
 *
 * Lưu ý: dịch vụ này KHÔNG mua/hủy/chuyển vé. Các việc đó người dùng làm trực tiếp với hợp đồng
 * qua MetaMask. Ở đây chỉ: lưu thông tin hành khách, liệt kê vé, sinh metadata, kiểm tra mã QR khi soát vé.
 */
class DichVuVe {
  /**
   * @param {import('../ket-noi/ket-noi-blockchain').KetNoiBlockchain} blockchain
   * @param {import('../kho-du-lieu/kho-thong-tin-ve').KhoThongTinVe} khoThongTinVe
   * @param {import('./dich-vu-chuyen-xe').DichVuChuyenXe} dichVuChuyenXe
   * @param {import('../ket-noi/nhat-ky-su-kien').NhatKySuKien} [nhatKySuKien] để tìm vé đã hủy
   */
  constructor(blockchain, khoThongTinVe, dichVuChuyenXe, nhatKySuKien = null) {
    this.blockchain = blockchain;
    this.khoThongTinVe = khoThongTinVe;
    this.dichVuChuyenXe = dichVuChuyenXe;
    this.nhatKySuKien = nhatKySuKien;
  }

  _batBuocCoVi(nguoiDung) {
    if (!nguoiDung.diaChiVi) throw new LoiNghiepVu('Bạn cần liên kết ví MetaMask với tài khoản trước.', 400);
    return nguoiDung.diaChiVi;
  }

  /** Thêm thông tin chuyến (tuyến, giờ, xe) vào vé để hiển thị. */
  _ganThongTinChuyen(ve) {
    const chuyen = this.dichVuChuyenXe.timTheoMa(ve.maChuyen);
    return { ...ve.toJSON(), chuyen: chuyen ? chuyen.toJSON() : null };
  }

  /**
   * Sau khi mua vé trên blockchain xong, web gửi họ tên + SĐT hành khách cho từng vé.
   * Chỉ CHỦ VÉ HIỆN TẠI (theo blockchain) mới được ghi thông tin cho vé đó.
   */
  async luuThongTinHanhKhach(nguoiDung, danhSach) {
    const vi = this._batBuocCoVi(nguoiDung);
    if (!Array.isArray(danhSach) || danhSach.length === 0 || danhSach.length > 5) throw new LoiNghiepVu('Danh sách hành khách không hợp lệ.');

    for (const { maVe, hoTen, sdt } of danhSach) {
      if (!hoTen || !String(hoTen).trim()) throw new LoiNghiepVu(`Thiếu họ tên hành khách cho vé #${maVe}.`);
      const ve = await this.blockchain.layVe(maVe);
      if (ve.chuSoHuu !== vi) throw new LoiNghiepVu(`Vé #${maVe} không thuộc ví của bạn.`, 403);
      await this.khoThongTinVe.luu(maVe, { hoTen: String(hoTen).trim(), sdt: String(sdt || '').trim(), email: nguoiDung.email, diaChiChu: vi });
    }
    return { soVe: danhSach.length };
  }

  /** Vé đang nằm trong ví đã liên kết của người dùng (đọc từ blockchain). */
  async veCuaToi(nguoiDung) {
    const vi = this._batBuocCoVi(nguoiDung);
    const danhSachVe = await this.blockchain.layVeCuaChu(vi);
    const ketQua = await Promise.all(
      danhSachVe.map(async (ve) => {
        const hanhKhach = await this.khoThongTinVe.lay(ve.maVe);
        // Thông tin hành khách của CHỦ CŨ (trước khi chuyển nhượng) thì không hiện cho chủ mới
        const cuaChuHienTai = hanhKhach && hanhKhach.diaChiChu === vi;
        return { ...this._ganThongTinChuyen(ve), hanhKhach: cuaChuHienTai ? { hoTen: hanhKhach.hoTen, sdt: hanhKhach.sdt } : null };
      })
    );
    return ketQua.sort((a, b) => new Date(a.gioKhoiHanh) - new Date(b.gioKhoiHanh));
  }

  /**
   * VÉ ĐÃ HỦY của ví đã liên kết. Vé hủy bị đốt (không còn chủ) nên không nằm trong veCuaToi —
   * tìm qua SỰ KIỆN DaHuyVe(maVe, chuVe, tienHoan) mà hợp đồng phát ra lúc hủy, rồi đọc lại thông tin vé
   * (hợp đồng vẫn giữ mã chuyến, ghế, giá sau khi đốt).
   *
   * Kèm gợi ý ĐẶT LẠI (datLai):
   *   GHE_CU    : chuyến chưa chạy và ghế cũ còn trống -> đặt lại đúng ghế đó
   *   GHE_KHAC  : chuyến chưa chạy nhưng ghế cũ đã có người mua -> chọn ghế khác cùng chuyến
   *   TUYEN_KHAC: chuyến đã chạy / ngừng bán -> tìm chuyến khác cùng tuyến
   */
  async veDaHuy(nguoiDung) {
    const vi = this._batBuocCoVi(nguoiDung);
    if (!this.nhatKySuKien) return [];
    await this.nhatKySuKien.capNhat();
    const suKienHuy = this.nhatKySuKien.danhSach
      .filter((s) => s.ten === 'DaHuyVe' && String(s.thamSo.chuVe).toLowerCase() === vi)
      .reverse(); // mới hủy lên trước

    return Promise.all(suKienHuy.map(async (s) => {
      const ve = await this.blockchain.layVe(Number(s.thamSo.maVe));
      const [chuyen, ghe] = await Promise.all([
        this.blockchain.layChuyen(ve.maChuyen),
        this.blockchain.layTrangThaiGhe(ve.maChuyen, [ve.maGhe]),
      ]);
      const conBan = chuyen.dangMoBan && chuyen.gioKhoiHanh * 1000 > Date.now();
      const datLai = !conBan ? 'TUYEN_KHAC' : ghe.get(ve.maGhe) ? 'GHE_KHAC' : 'GHE_CU';
      return {
        ...this._ganThongTinChuyen(ve),
        tienHoanWei: s.thamSo.tienHoan.toString(),
        thoiGianHuy: s.thoiGian ? new Date(s.thoiGian).toISOString() : null,
        maGiaoDich: s.maGiaoDich,
        datLai,
      };
    }));
  }

  /**
   * TRA CỨU VÉ CÔNG KHAI (không cần đăng nhập): ai cũng kiểm tra được một vé NFT có thật không, còn hiệu lực không,
   * thuộc ví nào — vd trước khi mua lại vé của người khác. Chỉ trả dữ liệu vốn đã công khai trên blockchain
   * + thông tin chuyến; KHÔNG trả họ tên, số điện thoại hành khách.
   */
  async traCuuCongKhai(maVe) {
    const so = Number(maVe);
    if (!Number.isInteger(so) || so <= 0) throw new LoiNghiepVu('Mã vé là một số nguyên dương, ví dụ 12.');
    let ve;
    try {
      ve = await this.blockchain.layVe(so);
    } catch (loi) {
      if (loi.maHttp === 404) throw new LoiNghiepVu(`Không có vé #${so} trên blockchain — vé này chưa từng được phát hành.`, 404);
      throw loi;
    }
    const coTheChuyenNhuong = ve.chuSoHuu ? await this.blockchain.coTheChuyenNhuong(so) : false;
    return { ...this._ganThongTinChuyen(ve), coTheChuyenNhuong };
  }

  /** Chợ vé: các vé đang rao bán (công khai, không có thông tin cá nhân). */
  async choVe() {
    const danhSach = await this.blockchain.layDanhSachRaoBan();
    return danhSach.map((ve) => this._ganThongTinChuyen(ve)).sort((a, b) => new Date(a.gioKhoiHanh) - new Date(b.gioKhoiHanh));
  }

  /**
   * Metadata chuẩn ERC-721 (tokenURI trỏ về đây). Ví MetaMask / sàn NFT đọc để hiện tên, mô tả, thuộc tính vé.
   * Chỉ có thông tin chuyến — KHÔNG có thông tin cá nhân.
   */
  async metadata(maVe) {
    const ve = await this.blockchain.layVe(maVe);
    const chuyen = this.dichVuChuyenXe.timTheoMa(ve.maChuyen);
    const tuyen = chuyen ? `${chuyen.loTrinh?.diemKhoiHanh} → ${chuyen.loTrinh?.diemKetThuc}` : ve.maChuyen;
    return {
      name: `Vé xe CARBOOK #${ve.maVe} – Ghế ${ve.maGhe}`,
      description: `Vé xe khách tuyến ${tuyen}, khởi hành ${ve.gioKhoiHanh.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
      attributes: [
        { trait_type: 'Tuyến', value: tuyen },
        { trait_type: 'Mã chuyến', value: ve.maChuyen },
        { trait_type: 'Ghế', value: ve.maGhe },
        { trait_type: 'Trạng thái', value: ve.trangThai },
        { trait_type: 'Giờ khởi hành', display_type: 'date', value: Math.floor(ve.gioKhoiHanh.getTime() / 1000) },
      ],
    };
  }

  /**
   * SOÁT VÉ (bước kiểm tra trước khi nhân viên bấm xác nhận trên MetaMask):
   *   1. Người gọi phải là nhân viên soát vé — vai trò đọc TỪ BLOCKCHAIN theo ví đã liên kết.
   *   2. Khôi phục ví đã ký mã QR, so với chủ NFT hiện tại.
   *   3. Kiểm tra trạng thái vé, giờ chạy; trả về thông tin hành khách để nhân viên đối chiếu giấy tờ.
   */
  /**
   * Kiểm tra trước mã QR = { maVe, chuKy } — QR trên điện thoại hay vé in đều giống nhau, KHÔNG có hạn
   * (giống hệt điều hợp đồng sẽ kiểm tra khi xác nhận lên xe): người ký có phải chủ vé hiện tại? vé còn hiệu lực?
   */
  /**
   * LỊCH SỬ SOÁT VÉ — đọc từ sự kiện DaSuDungVe(maVe, nhanVien) mà hợp đồng phát ra mỗi lần xác nhận lên xe,
   * nên không ai sửa / xóa được và không tốn lượt Firebase.
   *   - Nhân viên soát vé: chỉ thấy các vé CHÍNH MÌNH đã soát.
   *   - Nhà xe (chủ hợp đồng): thấy toàn bộ, kèm ví nhân viên đã soát.
   * Vé đã soát không chuyển nhượng được nữa -> chủ hiện tại chính là người đã lên xe (dùng để lấy tên hành khách).
   */
  async lichSuSoatVe(nguoiDung, { soLuong = 50 } = {}) {
    const vi = nguoiDung.diaChiVi;
    if (!(await this.blockchain.coQuyenSoatVe(vi))) {
      throw new LoiNghiepVu('Ví liên kết với tài khoản này không có quyền soát vé.', 403);
    }
    if (!this.nhatKySuKien) return { laNhaXe: false, tongSo: 0, homNay: 0, danhSach: [] };
    const laNhaXe = vi === (await this.blockchain.chuHopDong());

    await this.nhatKySuKien.capNhat();
    const tatCa = this.nhatKySuKien.danhSach
      .filter((s) => s.ten === 'DaSuDungVe' && (laNhaXe || String(s.thamSo.nhanVien).toLowerCase() === vi))
      .reverse(); // mới soát lên trước
    const ngayHomNay = homNay();
    const soHomNay = tatCa.filter((s) => s.thoiGian && homNay(s.thoiGian) === ngayHomNay).length;

    const n = Math.min(Math.max(Number(soLuong) || 50, 1), 200);
    const danhSach = await Promise.all(tatCa.slice(0, n).map(async (s) => {
      const ve = await this.blockchain.layVe(Number(s.thamSo.maVe));
      const hanhKhach = await this.khoThongTinVe.lay(ve.maVe);
      return {
        ...this._ganThongTinChuyen(ve),
        thoiGianSoat: s.thoiGian ? new Date(s.thoiGian).toISOString() : null,
        nhanVien: String(s.thamSo.nhanVien).toLowerCase(),
        maGiaoDich: s.maGiaoDich,
        hanhKhach: hanhKhach && hanhKhach.diaChiChu === ve.chuSoHuu ? { hoTen: hanhKhach.hoTen, sdt: hanhKhach.sdt } : null,
      };
    }));
    return { laNhaXe, tongSo: tatCa.length, homNay: soHomNay, danhSach };
  }

  async kiemTraSoatVe(nhanVien, { maVe, chuKy }) {
    if (!(await this.blockchain.coQuyenSoatVe(nhanVien.diaChiVi))) {
      throw new LoiNghiepVu('Ví liên kết với tài khoản này không có quyền soát vé.', 403);
    }
    if (!maVe || !chuKy) throw new LoiNghiepVu('Mã QR thiếu mã vé hoặc chữ ký.');

    const ve = await this.blockchain.layVe(maVe);
    const nguoiKy = await this.blockchain.layNguoiKyQR(maVe, chuKy);
    // loi = lý do CHẮC CHẮN bị hợp đồng từ chối; luuY = điều nhân viên nên biết nhưng không chặn
    const loi = [];
    const luuY = [];
    if (!ve.chuSoHuu) loi.push('Vé đã bị hủy.');
    else if (nguoiKy !== ve.chuSoHuu) loi.push('Mã QR không do chủ vé hiện tại ký (có thể là ảnh chụp của người đã bán/tặng vé).');
    if (ve.trangThai === 'DA_SU_DUNG') loi.push('Vé đã được sử dụng.');
    if (ve.giaDangRaoWei > 0n) luuY.push('Vé đang được rao bán — soát vé sẽ tự gỡ tin rao.');

    const conBaoLau = ve.gioKhoiHanh.getTime() - Date.now();
    if (conBaoLau > 24 * 3600 * 1000) luuY.push('Chưa đến ngày đi của vé này.');
    if (conBaoLau < -12 * 3600 * 1000) luuY.push('Chuyến xe đã chạy hơn 12 giờ trước.');

    const hanhKhach = await this.khoThongTinVe.lay(ve.maVe);
    return {
      hopLe: loi.length === 0,
      loi,
      luuY,
      ve: this._ganThongTinChuyen(ve),
      nguoiKy,
      hanhKhach: hanhKhach && hanhKhach.diaChiChu === ve.chuSoHuu ? { hoTen: hanhKhach.hoTen, sdt: hanhKhach.sdt } : null,
    };
  }
}

module.exports = { DichVuVe };
