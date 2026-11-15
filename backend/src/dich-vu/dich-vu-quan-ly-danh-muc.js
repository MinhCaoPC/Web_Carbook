const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');
const { laLoTrinhMienTay } = require('../tien-ich/mien-tay');
const { ghepNgayVaPhut } = require('../tien-ich/thoi-gian');

// Bảng Firebase tương ứng từng loại danh mục (giữ nguyên tên/định dạng cũ để dữ liệu cũ vẫn dùng được)
const BANG = { loTrinh: 'LOTRINH', chuyenXe: 'CHUYENXE', xe: 'XE' };
const TIEN_TO = { loTrinh: 'LT', chuyenXe: 'CX', xe: 'XE' };
// Chuyến mẫu lưu giờ chạy dưới dạng một mốc thời gian; chỉ phần GIỜ:PHÚT có ý nghĩa nên dùng ngày cố định
const NGAY_GOC_CHUYEN_MAU = '2026-01-01';

/**
 * QUẢN LÝ DANH MỤC (nhà xe): thêm / sửa lộ trình, chuyến mẫu (giờ chạy + giá), xe.
 * Mỗi lần lưu = 1 lượt ghi Firebase; danh mục trong RAM + file được cập nhật luôn (không đọc lại Firebase).
 *
 * Lưu ý: giá/giờ mới chỉ áp dụng cho chuyến MỞ BÁN SAU ĐÓ. Chuyến đã mở bán trên blockchain giữ giá cũ,
 * và vé đã bán luôn giữ đúng giá đã trả.
 */
class DichVuQuanLyDanhMuc {
  /**
   * @param {import('../kho-du-lieu/kho-luu-tru').KhoLuuTru} khoLuuTru
   * @param {import('../kho-du-lieu/kho-danh-muc').KhoDanhMuc} khoDanhMuc
   */
  constructor(khoLuuTru, khoDanhMuc) {
    this.khoLuuTru = khoLuuTru;
    this.khoDanhMuc = khoDanhMuc;
  }

  /** Toàn bộ danh mục cho trang quản trị */
  danhSach() {
    const loTrinh = this.khoDanhMuc.tatCa('loTrinh').map((l) => ({ ...l, mienTay: laLoTrinhMienTay(l) }));
    const xe = this.khoDanhMuc.tatCa('xe').map((x) => ({ ...x, soGhe: this.khoDanhMuc.laySoDoGhe(x.ma).length }));
    const chuyenXe = this.khoDanhMuc.tatCa('chuyenXe').map((c) => ({
      ...c,
      gioKhoiHanh: `${String(Math.floor(c.phutKhoiHanh / 60)).padStart(2, '0')}:${String(c.phutKhoiHanh % 60).padStart(2, '0')}`,
    }));
    const dangBan = new Set(this.khoDanhMuc.danhSachChuyenMau().map((c) => c.ma));
    chuyenXe.forEach((c) => { c.dangBan = dangBan.has(c.ma); });
    const mauSoDo = this.khoDanhMuc.tatCa('mauSoDo').map((m) => ({ ma: m.ma, loaiGhe: m.loaiGhe, soGhe: m.danhSachGhe.length }));
    return { loTrinh, chuyenXe, xe, mauSoDo };
  }

  /** Mã mới kế tiếp, vd LT065 */
  _maMoi(loai) {
    const so = this.khoDanhMuc.tatCa(loai).map((x) => Number(String(x.ma).replace(/\D/g, '')) || 0);
    return `${TIEN_TO[loai]}${String(Math.max(0, ...so) + 1).padStart(3, '0')}`;
  }

  _timHoacBao(loai, ma) {
    const coSan = this.khoDanhMuc.tatCa(loai).find((x) => x.ma === ma);
    if (!coSan) throw new LoiNghiepVu('Không tìm thấy mục cần sửa.', 404);
    return coSan;
  }

  async _ghi(loai, ma, banGhi) {
    await this.khoLuuTru.ghi(BANG[loai], ma, banGhi);
    return this.khoDanhMuc.capNhatMuc(loai, { ma, ...banGhi });
  }

  // ----------------------- LỘ TRÌNH -----------------------
  async luuLoTrinh(ma, du) {
    if (ma) this._timHoacBao('loTrinh', ma);
    const diemKhoiHanh = String(du.diemKhoiHanh || '').trim();
    const diemKetThuc = String(du.diemKetThuc || '').trim();
    if (!diemKhoiHanh || !diemKetThuc) throw new LoiNghiepVu('Vui lòng nhập điểm đi và điểm đến.');
    if (diemKhoiHanh === diemKetThuc) throw new LoiNghiepVu('Điểm đi và điểm đến phải khác nhau.');
    const quangDuongKm = du.quangDuongKm === '' || du.quangDuongKm == null ? null : Number(du.quangDuongKm);
    if (quangDuongKm !== null && !(quangDuongKm > 0 && quangDuongKm < 3000)) throw new LoiNghiepVu('Quãng đường không hợp lệ.');
    const trangThai = du.trangThai === 'Ngung' ? 'Ngung' : 'HoatDong';
    const banGhi = {
      tenLoTrinh: String(du.tenLoTrinh || '').trim() || `${diemKhoiHanh} - ${diemKetThuc}`,
      diemKhoiHanh, diemKetThuc, quangDuongKm, trangThai,
    };
    return this._ghi('loTrinh', ma || this._maMoi('loTrinh'), banGhi);
  }

  // ----------------------- CHUYẾN MẪU -----------------------
  async luuChuyenMau(ma, du) {
    if (ma) this._timHoacBao('chuyenXe', ma);
    if (!this.khoDanhMuc.layLoTrinh(du.maLoTrinh)) throw new LoiNghiepVu('Lộ trình không tồn tại.');
    if (!this.khoDanhMuc.layXe(du.maXe)) throw new LoiNghiepVu('Xe không tồn tại.');
    const khop = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(du.gioKhoiHanh || ''));
    if (!khop) throw new LoiNghiepVu('Giờ khởi hành phải có dạng HH:mm, vd 08:30.');
    const soPhut = Number(du.soPhutDiChuyen);
    if (!Number.isInteger(soPhut) || soPhut < 30 || soPhut > 24 * 60) throw new LoiNghiepVu('Thời gian di chuyển từ 30 đến 1440 phút.');
    const giaVe = Number(du.giaVe);
    if (!Number.isInteger(giaVe) || giaVe < 10_000 || giaVe > 5_000_000) throw new LoiNghiepVu('Giá vé từ 10.000đ đến 5.000.000đ.');

    const di = ghepNgayVaPhut(NGAY_GOC_CHUYEN_MAU, Number(khop[1]) * 60 + Number(khop[2]));
    const banGhi = {
      maLoTrinh: du.maLoTrinh,
      maXe: du.maXe,
      thoiGianXuatPhat: di,
      thoiGianDenDich: new Date(di.getTime() + soPhut * 60_000),
      giaVe,
      trangThai: du.trangThai === 'Huy' ? 'Huy' : 'SapChay',
    };
    return this._ghi('chuyenXe', ma || this._maMoi('chuyenXe'), banGhi);
  }

  // ----------------------- XE -----------------------
  async luuXe(ma, du) {
    if (ma) this._timHoacBao('xe', ma);
    const bienSoXe = String(du.bienSoXe || '').trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z]{1,2}[- ]?[0-9.]{4,6}$/.test(bienSoXe)) throw new LoiNghiepVu('Biển số không hợp lệ, vd 65B-12345.');
    if (this.khoDanhMuc.tatCa('xe').some((x) => x.bienSoXe.toUpperCase() === bienSoXe && x.ma !== ma)) throw new LoiNghiepVu('Biển số này đã có.', 409);
    const mau = this.khoDanhMuc.tatCa('mauSoDo').find((m) => m.ma === du.maMauSoDo);
    if (du.maMauSoDo && !mau) throw new LoiNghiepVu('Mẫu sơ đồ ghế không tồn tại.');
    const banGhi = {
      bienSoXe,
      tenLoaiXe: String(du.tenLoaiXe || '').trim() || 'Giường nằm 34 chỗ',
      maMauSoDo: mau ? mau.ma : null,
      tongSoGhe: mau ? mau.danhSachGhe.length : 34,
      trangThaiXe: du.trangThaiXe === 'BaoTri' ? 'BaoTri' : 'SanSang',
    };
    return this._ghi('xe', ma || this._maMoi('xe'), banGhi);
  }
}

module.exports = { DichVuQuanLyDanhMuc };
