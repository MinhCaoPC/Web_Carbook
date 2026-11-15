const { ChuyenXe } = require('../mo-hinh/chuyen-xe');
const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');
const { boDau } = require('../tien-ich/mien-tay');
const { danhSachNgayBanVe } = require('../tien-ich/thoi-gian');

/**
 * DỊCH VỤ CHUYẾN XE — chức năng 1: xem tuyến, chuyến, sơ đồ ghế.
 *   - Thông tin chuyến, tuyến, xe, sơ đồ ghế: lấy từ KhoDanhMuc (off-chain, trong RAM).
 *   - Ghế nào đã bán, chuyến đã mở bán chưa, giá bằng ETH: đọc từ BLOCKCHAIN (on-chain).
 */
class DichVuChuyenXe {
  /**
   * @param {import('../kho-du-lieu/kho-danh-muc').KhoDanhMuc} khoDanhMuc
   * @param {import('../ket-noi/ket-noi-blockchain').KetNoiBlockchain} blockchain
   * @param {{ soNgayBanVe: number, tyGiaVndMoiEth: number }} cauHinh
   */
  constructor(khoDanhMuc, blockchain, cauHinh) {
    this.khoDanhMuc = khoDanhMuc;
    this.blockchain = blockchain;
    this.soNgayBanVe = cauHinh.soNgayBanVe;
    this.tyGiaVndMoiEth = cauHinh.tyGiaVndMoiEth;
  }

  /** Các ngày đang bán vé (hôm nay + vài ngày tới). */
  danhSachNgay() {
    return danhSachNgayBanVe(this.soNgayBanVe);
  }

  /** Danh sách điểm đi/đến và các cặp tuyến có thật, để giao diện hiện ô chọn. */
  danhSachDiaDiem() {
    const loTrinh = this.khoDanhMuc.danhSachLoTrinh();
    const diaDiem = new Set();
    const tuyen = new Map();
    for (const l of loTrinh) {
      diaDiem.add(l.diemKhoiHanh);
      diaDiem.add(l.diemKetThuc);
      tuyen.set(`${l.diemKhoiHanh}|${l.diemKetThuc}`, { diemDi: l.diemKhoiHanh, diemDen: l.diemKetThuc });
    }
    return { diaDiem: [...diaDiem].sort((a, b) => a.localeCompare(b, 'vi')), tuyen: [...tuyen.values()] };
  }

  /** Tạo đối tượng ChuyenXe (mẫu + ngày). */
  _taoChuyen(mau, ngayDi) {
    const soDo = this.khoDanhMuc.laySoDoCuaXe(mau.maXe);
    return new ChuyenXe({
      mau,
      ngayDi,
      loTrinh: this.khoDanhMuc.layLoTrinh(mau.maLoTrinh),
      xe: this.khoDanhMuc.layXe(mau.maXe),
      soGhe: soDo.danhSachGhe.length,
      maSoDo: soDo.maSoDo,
    });
  }

  _kiemTraNgay(ngay) {
    if (!this.danhSachNgay().includes(ngay)) {
      throw new LoiNghiepVu(`Chỉ bán vé cho các ngày: ${this.danhSachNgay().join(', ')}.`);
    }
  }

  /** Tất cả chuyến (chưa chạy) của một ngày. */
  danhSachChuyenTrongNgay(ngay) {
    this._kiemTraNgay(ngay);
    return this.khoDanhMuc
      .danhSachChuyenMau()
      .map((mau) => this._taoChuyen(mau, ngay))
      .filter((c) => !c.daKhoiHanh())
      .sort((a, b) => a.gioKhoiHanh - b.gioKhoiHanh);
  }

  /** Tìm chuyến theo điểm đi, điểm đến, ngày. Kèm số ghế còn trống đọc từ blockchain. */
  async timChuyen({ diemDi, diemDen, ngay }) {
    if (!diemDi || !diemDen || !ngay) throw new LoiNghiepVu('Vui lòng chọn điểm đi, điểm đến và ngày đi.');
    const di = boDau(diemDi);
    const den = boDau(diemDen);
    const ketQua = this.danhSachChuyenTrongNgay(ngay).filter(
      (c) => boDau(c.loTrinh?.diemKhoiHanh) === di && boDau(c.loTrinh?.diemKetThuc) === den
    );
    return Promise.all(ketQua.map((c) => this._ganTrangThaiTrenChuoi(c)));
  }

  /** Thêm thông tin on-chain vào chuyến; blockchain lỗi thì vẫn trả chuyến (trạng thái = null). */
  async _ganTrangThaiTrenChuoi(chuyen) {
    const json = chuyen.toJSON();
    try {
      const tren = await this.blockchain.layChuyen(chuyen.maChuyen);
      json.trenChuoi = { dangMoBan: tren.dangMoBan, giaVeWei: tren.giaVeWei.toString(), soGheTrong: tren.dangMoBan ? tren.soGhe - tren.soVeDaBan : null };
    } catch {
      json.trenChuoi = null;
    }
    return json;
  }

  /** Tìm chuyến theo mã "CX001_2026-11-12" (kể cả chuyến đã chạy — dùng để hiển thị vé cũ). */
  timTheoMa(maChuyen) {
    const tach = ChuyenXe.tachMa(maChuyen);
    const mau = tach && this.khoDanhMuc.layChuyenMau(tach.maChuyenXe);
    return mau ? this._taoChuyen(mau, tach.ngayDi) : null;
  }

  /** Chi tiết một chuyến + sơ đồ ghế, mỗi ghế kèm mã vé đang giữ (0 = trống) lấy từ blockchain. */
  async chiTietChuyen(maChuyen) {
    const chuyen = this.timTheoMa(maChuyen);
    if (!chuyen) throw new LoiNghiepVu('Không tìm thấy chuyến xe.', 404);

    const soDo = this.khoDanhMuc.laySoDoGhe(chuyen.xe?.ma);
    const [tren, trangThaiGhe] = await Promise.all([
      this.blockchain.layChuyen(maChuyen),
      this.blockchain.layTrangThaiGhe(maChuyen, soDo.map((g) => g.maGhe)),
    ]);
    return {
      chuyen: chuyen.toJSON(),
      trenChuoi: { dangMoBan: tren.dangMoBan, giaVeWei: tren.giaVeWei.toString(), soVeDaBan: tren.soVeDaBan, soGhe: tren.soGhe },
      soDoGhe: soDo.map((g) => ({ ...g, maVe: trangThaiGhe.get(g.maGhe) || 0 })),
    };
  }

  /**
   * Dành cho NHÀ XE: các chuyến của một ngày CHƯA mở bán trên blockchain, đã đổi sẵn thành
   * đúng 4 mảng mà hàm hợp đồng `moBanNhieuChuyen` cần -> web chỉ việc gửi qua MetaMask.
   */
  async chuyenCanMoBan(ngay) {
    const danhSach = this.danhSachChuyenTrongNgay(ngay);
    const trangThai = await Promise.all(danhSach.map((c) => this.blockchain.layChuyen(c.maChuyen)));
    const canMo = danhSach.filter((c, i) => !trangThai[i].dangMoBan);

    // Bước 1: sơ đồ ghế nào các chuyến này dùng mà CHƯA đăng ký lên hợp đồng -> phải đăng ký trước
    const cacMaSoDo = [...new Set(canMo.map((c) => c.maSoDo))];
    const daDangKy = await Promise.all(cacMaSoDo.map((ma) => this.blockchain.soDoDaDangKy(ma)));
    const soDoCanDangKy = cacMaSoDo
      .filter((ma, i) => !daDangKy[i])
      .map((ma) => ({ maSoDo: ma, danhSachGhe: this._danhSachMaGheCuaSoDo(ma, canMo) }));

    // Bước 2: tham số cho hàm hợp đồng moBanNhieuChuyen(maChuyen[], giaVe[], gioKhoiHanh[], maSoDo[])
    return {
      tongSoChuyen: danhSach.length,
      daMoBan: danhSach.length - canMo.length,
      danhSach: canMo.map((c) => c.toJSON()),
      soDoCanDangKy,
      thamSoHopDong: {
        maChuyen: canMo.map((c) => c.maChuyen),
        giaVe: canMo.map((c) => c.giaVeWei(this.tyGiaVndMoiEth).toString()),
        gioKhoiHanh: canMo.map((c) => c.gioKhoiHanhUnix),
        maSoDo: canMo.map((c) => c.maSoDo),
      },
    };
  }

  /** Danh sách mã ghế (vd ["A01", ..., "B17"]) của sơ đồ `maSoDo`, lấy từ xe của một chuyến dùng sơ đồ đó. */
  _danhSachMaGheCuaSoDo(maSoDo, cacChuyen) {
    const chuyen = cacChuyen.find((c) => c.maSoDo === maSoDo);
    return this.khoDanhMuc.laySoDoCuaXe(chuyen.xe?.ma).danhSachGhe.map((g) => g.maGhe);
  }
}

module.exports = { DichVuChuyenXe };
