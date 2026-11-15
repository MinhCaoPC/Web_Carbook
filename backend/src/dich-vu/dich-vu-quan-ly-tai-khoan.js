const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');
const { NguoiDung } = require('../mo-hinh/nguoi-dung');

/**
 * QUẢN LÝ TÀI KHOẢN (nhà xe): xem danh sách tài khoản kèm VAI TRÒ, khóa / mở khóa nhân viên, gửi thông báo cho mọi khách.
 *
 * Vai trò KHÔNG lưu trong Firebase mà đọc từ hợp đồng theo ví đã liên kết:
 *   nhaXe  = ví là chủ hợp đồng · soatVe = hợp đồng cấp quyền soát vé · khach = còn lại.
 * Quy tắc khóa: chỉ khóa được NHÂN VIÊN SOÁT VÉ. Khách hàng không bị nhà xe khóa (vé là tài sản của khách),
 * nhà xe không tự khóa mình. Mở khóa thì luôn được (gỡ các tài khoản đã lỡ khóa trước đây).
 */
class DichVuQuanLyTaiKhoan {
  /**
   * @param {import('../kho-du-lieu/kho-nguoi-dung').KhoNguoiDung} khoNguoiDung
   * @param {import('../kho-du-lieu/kho-thong-bao-chung').KhoThongBaoChung} khoThongBaoChung
   * @param {import('../ket-noi/ket-noi-blockchain').KetNoiBlockchain} blockchain
   */
  constructor(khoNguoiDung, khoThongBaoChung, blockchain) {
    this.khoNguoiDung = khoNguoiDung;
    this.khoThongBaoChung = khoThongBaoChung;
    this.blockchain = blockchain;
  }

  /** Vai trò của một ví: 'nhaXe' | 'soatVe' | 'khach' (đọc blockchain, không tốn lượt Firebase). */
  async _vaiTroCua(diaChiVi, chuHopDong) {
    if (!diaChiVi) return 'khach';
    if (diaChiVi === chuHopDong) return 'nhaXe';
    return (await this.blockchain.hopDong.laNhanVienSoatVe(diaChiVi)) ? 'soatVe' : 'khach';
  }

  async danhSach() {
    const ds = await this.khoNguoiDung.tatCa();
    let chu = null;
    try { chu = await this.blockchain.chuHopDong(); } catch { /* mạng chưa chạy -> mọi người là khách */ }
    const ketQua = await Promise.all(ds.map(async (nd) => {
      let vaiTro = 'khach';
      try { if (chu) vaiTro = await this._vaiTroCua(nd.diaChiVi, chu); } catch { /* giữ 'khach' */ }
      return { ...nd.toJSON(), vaiTro };
    }));
    return ketQua.sort((a, b) => String(b.ngayTao).localeCompare(String(a.ngayTao)));
  }

  /** Khóa / mở khóa. Chỉ khóa được nhân viên soát vé (xem quy tắc ở đầu lớp). */
  async datKhoa(email, khoa, nguoiThucHien) {
    if (NguoiDung.chuanHoaEmail(email) === nguoiThucHien.email) throw new LoiNghiepVu('Không thể tự khóa tài khoản của chính mình.');
    const nd = await this.khoNguoiDung.timTheoEmail(email);
    if (!nd) throw new LoiNghiepVu('Không tìm thấy tài khoản.', 404);
    if (khoa) {
      const vaiTro = await this._vaiTroCua(nd.diaChiVi, await this.blockchain.chuHopDong());
      if (vaiTro !== 'soatVe') throw new LoiNghiepVu('Chỉ khóa được tài khoản nhân viên soát vé. Tài khoản khách hàng không bị nhà xe khóa.', 403);
    }
    nd.biKhoa = !!khoa;
    await this.khoNguoiDung.luu(nd);
    return nd.toJSON();
  }

  async lichSuThongBao() {
    return this.khoThongBaoChung.danhSach();
  }

  async guiThongBao({ tieuDe, noiDung }, nguoiThucHien) {
    tieuDe = String(tieuDe || '').trim();
    noiDung = String(noiDung || '').trim();
    if (!tieuDe || tieuDe.length > 120) throw new LoiNghiepVu('Tiêu đề từ 1 đến 120 ký tự.');
    if (!noiDung || noiDung.length > 1000) throw new LoiNghiepVu('Nội dung từ 1 đến 1000 ký tự.');
    return this.khoThongBaoChung.them({ tieuDe, noiDung, nguoiGui: nguoiThucHien.email });
  }
}

module.exports = { DichVuQuanLyTaiKhoan };
