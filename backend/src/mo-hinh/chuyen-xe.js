const { ghepNgayVaPhut, dinhDangGio } = require('../tien-ich/thoi-gian');

/**
 * Mô hình MỘT CHUYẾN XE CỤ THỂ trong MỘT NGÀY.
 *
 * Firebase chỉ lưu "chuyến mẫu" lặp lại hằng ngày (vd CX001 chạy 08:00). Lớp này ghép chuyến mẫu + ngày đi
 * thành chuyến thật, có mã dùng chung với blockchain:  maChuyen = "CX001_2026-11-12".
 * Vì tính ra được nên KHÔNG cần lưu từng chuyến từng ngày vào Firebase nữa.
 */
class ChuyenXe {
  /**
   * @param {object} p
   * @param {object} p.mau     chuyến mẫu (từ KhoDanhMuc)
   * @param {object} p.loTrinh lộ trình
   * @param {object|null} p.xe xe chạy chuyến này
   * @param {string} p.ngayDi  "YYYY-MM-DD"
   * @param {number} p.soGhe   tổng số ghế theo sơ đồ
   * @param {string} p.maSoDo  mã sơ đồ ghế của xe (đã/sẽ đăng ký lên hợp đồng)
   */
  constructor({ mau, loTrinh, xe, ngayDi, soGhe, maSoDo }) {
    this.maChuyenXe = mau.ma;
    this.ngayDi = ngayDi;
    this.maChuyen = ChuyenXe.taoMa(mau.ma, ngayDi);
    this.loTrinh = loTrinh;
    this.xe = xe;
    this.giaVe = mau.giaVe; // VNĐ (giá hiển thị). Giá thật phải trả nằm trên blockchain (wei).
    this.soGhe = soGhe;
    this.maSoDo = maSoDo;
    this.gioKhoiHanh = ghepNgayVaPhut(ngayDi, mau.phutKhoiHanh);
    this.gioDen = new Date(this.gioKhoiHanh.getTime() + mau.soPhutDiChuyen * 60000);
  }

  static taoMa(maChuyenXe, ngayDi) {
    return `${maChuyenXe}_${ngayDi}`;
  }

  /** Tách "CX001_2026-11-12" -> { maChuyenXe: "CX001", ngayDi: "2026-11-12" } */
  static tachMa(maChuyen) {
    const m = /^(.+)_(\d{4}-\d{2}-\d{2})$/.exec(String(maChuyen || ''));
    return m ? { maChuyenXe: m[1], ngayDi: m[2] } : null;
  }

  daKhoiHanh(bayGio = Date.now()) {
    return this.gioKhoiHanh.getTime() <= bayGio;
  }

  /** Giờ khởi hành dạng unix giây — đúng kiểu dữ liệu hợp đồng cần (uint64). */
  get gioKhoiHanhUnix() {
    return Math.floor(this.gioKhoiHanh.getTime() / 1000);
  }

  /** Đổi giá VNĐ sang wei theo tỷ giá demo (1 ETH = 10^18 wei). */
  giaVeWei(tyGiaVndMoiEth) {
    return (BigInt(this.giaVe) * 10n ** 18n) / BigInt(tyGiaVndMoiEth);
  }

  toJSON() {
    return {
      maChuyen: this.maChuyen,
      maChuyenXe: this.maChuyenXe,
      ngayDi: this.ngayDi,
      tenLoTrinh: this.loTrinh?.tenLoTrinh || '',
      diemKhoiHanh: this.loTrinh?.diemKhoiHanh || '',
      diemKetThuc: this.loTrinh?.diemKetThuc || '',
      quangDuongKm: this.loTrinh?.quangDuongKm || null,
      gioKhoiHanh: this.gioKhoiHanh.toISOString(),
      gioDen: this.gioDen.toISOString(),
      gioDi: dinhDangGio(this.gioKhoiHanh),
      gioToi: dinhDangGio(this.gioDen),
      loaiXe: this.xe?.tenLoaiXe || '',
      bienSoXe: this.xe?.bienSoXe || '',
      giaVe: this.giaVe,
      soGhe: this.soGhe,
      maSoDo: this.maSoDo,
    };
  }
}

module.exports = { ChuyenXe };
