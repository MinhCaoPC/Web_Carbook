const { ethers } = require('ethers');
const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');
const { dinhDangGio } = require('../tien-ich/thoi-gian');

const SO_THONG_BAO_TOI_DA = 50;
const SO_MA_GHI_NHO_TOI_DA = 200; // danh sách "đã đọc"/"đã xóa" chỉ giữ 200 mã gần nhất
const MOT_NGAY_MS = 24 * 60 * 60 * 1000;

/**
 * DỊCH VỤ THÔNG BÁO.
 *
 * Thông báo được DỰNG TỪ SỰ KIỆN BLOCKCHAIN của ví người dùng (không lưu từng thông báo vào Firebase):
 *   DaMuaVe        -> "Đặt vé thành công"
 *   DaBanLai       -> "Vé đã được bán" (người bán) / "Mua vé trên chợ thành công" (người mua)
 *   DaChuyenNhuong -> "Đã tặng vé" / "Bạn được tặng vé"
 *   DaHuyVe        -> "Đã hủy vé, hoàn tiền"
 *   DaSuDungVe     -> "Đã lên xe"
 * cộng thêm "Chuyến sắp khởi hành" cho vé còn hiệu lực chạy trong 24 giờ tới.
 *
 * Firebase chỉ giữ trạng thái đã đọc / đã xóa trong tài khoản (1 lượt ghi khi người dùng bấm).
 */
class DichVuThongBao {
  /**
   * @param {import('../ket-noi/ket-noi-blockchain').KetNoiBlockchain} blockchain
   * @param {import('../ket-noi/nhat-ky-su-kien').NhatKySuKien} nhatKy
   * @param {import('../kho-du-lieu/kho-nguoi-dung').KhoNguoiDung} khoNguoiDung
   * @param {import('./dich-vu-chuyen-xe').DichVuChuyenXe} dichVuChuyenXe
   * @param {import('../kho-du-lieu/kho-thong-bao-chung').KhoThongBaoChung} [khoThongBaoChung] thông báo nhà xe gửi mọi khách
   */
  constructor(blockchain, nhatKy, khoNguoiDung, dichVuChuyenXe, khoThongBaoChung = null) {
    this.khoThongBaoChung = khoThongBaoChung;
    this.blockchain = blockchain;
    this.nhatKy = nhatKy;
    this.khoNguoiDung = khoNguoiDung;
    this.dichVuChuyenXe = dichVuChuyenXe;
    this._veDaBiet = new Map();    // mã vé -> { maChuyen, maGhe } (mã chuyến/ghế của vé không bao giờ đổi)
    this._chuVeDaDung = new Map(); // mã vé đã soát -> ví chủ (không đổi được nữa)
  }

  /** Mô tả ngắn một vé: "Cà Mau → Cần Thơ · 08:00 14/11 · ghế A01" */
  _moTaVe(maChuyen, maGhe) {
    const c = this.dichVuChuyenXe.timTheoMa(maChuyen);
    if (!c) return `chuyến ${maChuyen} · ghế ${maGhe}`;
    const ngay = c.ngayDi.split('-').reverse().slice(0, 2).join('/');
    return `${c.loTrinh?.diemKhoiHanh} → ${c.loTrinh?.diemKetThuc} · ${dinhDangGio(c.gioKhoiHanh)} ${ngay} · ghế ${maGhe}`;
  }

  async _layVe(maVe) {
    const so = Number(maVe);
    if (!this._veDaBiet.has(so)) {
      const ve = await this.blockchain.layVe(so);
      this._veDaBiet.set(so, { maChuyen: ve.maChuyen, maGhe: ve.maGhe });
    }
    return this._veDaBiet.get(so);
  }

  /** Dựng toàn bộ thông báo của một ví (chưa áp dụng đã đọc/đã xóa). */
  async _dungThongBao(vi) {
    await this.nhatKy.capNhat();
    const ketQua = [];
    const them = (sk, loai, tieuDe, noiDung, maVe) =>
      ketQua.push({ ma: `${loai}_${sk.maGiaoDich}_${sk.viTri}`, loai, tieuDe, noiDung, maVe: Number(maVe), thoiGian: sk.thoiGian, maGiaoDich: sk.maGiaoDich });
    const eth = (wei) => `${ethers.formatEther(wei)} ETH`;
    const la = (diaChi) => String(diaChi).toLowerCase() === vi;

    for (const sk of this.nhatKy.danhSach) {
      const t = sk.thamSo;
      switch (sk.ten) {
        case 'DaMuaVe':
          if (la(t.nguoiMua)) them(sk, 'MUA_VE', 'Đặt vé thành công', `Vé NFT #${t.maVe} (${this._moTaVe(t.maChuyen, t.maGhe)}) đã vào ví của bạn.`, t.maVe);
          break;
        case 'DaBanLai': {
          if (!la(t.nguoiBan) && !la(t.nguoiMua)) break;
          const ve = await this._layVe(t.maVe);
          if (la(t.nguoiBan)) them(sk, 'BAN_VE', 'Vé đã được bán', `Vé #${t.maVe} (${this._moTaVe(ve.maChuyen, ve.maGhe)}) đã bán được ${eth(t.gia)} — tiền đã về ví.`, t.maVe);
          else them(sk, 'MUA_LAI', 'Mua vé trên chợ thành công', `Vé #${t.maVe} (${this._moTaVe(ve.maChuyen, ve.maGhe)}) đã vào ví. Hãy nhập thông tin hành khách.`, t.maVe);
          break;
        }
        case 'DaChuyenNhuong': {
          if (!la(t.tu) && !la(t.den)) break;
          const ve = await this._layVe(t.maVe);
          if (la(t.tu)) them(sk, 'TANG_VE', 'Đã tặng vé', `Bạn đã chuyển vé #${t.maVe} (${this._moTaVe(ve.maChuyen, ve.maGhe)}) cho ví ${t.den.slice(0, 8)}…`, t.maVe);
          else them(sk, 'NHAN_VE', 'Bạn được tặng vé', `Ví ${t.tu.slice(0, 8)}… đã tặng bạn vé #${t.maVe} (${this._moTaVe(ve.maChuyen, ve.maGhe)}). Hãy nhập thông tin hành khách.`, t.maVe);
          break;
        }
        case 'DaHuyVe':
          if (la(t.chuVe)) {
            const ve = await this._layVe(t.maVe);
            them(sk, 'HUY_VE', 'Đã hủy vé', `Vé #${t.maVe} (${this._moTaVe(ve.maChuyen, ve.maGhe)}) đã hủy, hoàn ${eth(t.tienHoan)} về ví.`, t.maVe);
          }
          break;
        case 'DaSuDungVe': {
          const ve = await this._layVe(t.maVe);
          // Vé đã dùng không chuyển nhượng được nữa -> chủ HIỆN TẠI chính là người đi xe (đọc riêng, nhớ mãi)
          const so = Number(t.maVe);
          if (!this._chuVeDaDung.has(so)) this._chuVeDaDung.set(so, (await this.blockchain.layVe(so)).chuSoHuu);
          if (this._chuVeDaDung.get(so) === vi) them(sk, 'SOAT_VE', 'Đã lên xe', `Vé #${t.maVe} (${this._moTaVe(ve.maChuyen, ve.maGhe)}) đã được soát. Chúc bạn thượng lộ bình an!`, t.maVe);
          break;
        }
        default:
          break;
      }
    }

    // Nhắc chuyến sắp chạy: vé còn hiệu lực, khởi hành trong 24 giờ tới
    const bayGio = Date.now();
    for (const ve of await this.blockchain.layVeCuaChu(vi)) {
      const conLai = ve.gioKhoiHanh.getTime() - bayGio;
      if (ve.conHieuLuc && conLai > 0 && conLai <= MOT_NGAY_MS) {
        ketQua.push({
          ma: `NHAC_${ve.maVe}`, loai: 'NHAC_CHUYEN', tieuDe: 'Chuyến sắp khởi hành',
          noiDung: `${this._moTaVe(ve.maChuyen, ve.maGhe)}. Vui lòng có mặt tại điểm đón trước 30 phút và mở mã QR khi lên xe.`,
          maVe: ve.maVe, thoiGian: ve.gioKhoiHanh.getTime() - MOT_NGAY_MS,
        });
      }
    }
    return ketQua;
  }

  /** Danh sách thông báo (mới nhất trước) đã áp dụng trạng thái đọc/xóa. */
  async danhSach(nguoiDung) {
    const tb = nguoiDung.thongBao;
    // Thông báo từ blockchain (cần ví) + thông báo chung của nhà xe (mọi khách)
    const tuChuoi = nguoiDung.diaChiVi ? await this._dungThongBao(nguoiDung.diaChiVi) : [];
    const chung = this.khoThongBaoChung ? (await this.khoThongBaoChung.danhSach()).map((n) => ({
      ma: `NHA_XE_${n.ma}`, loai: 'NHA_XE', tieuDe: n.tieuDe, noiDung: n.noiDung, maVe: null, thoiGian: n.thoiGian,
    })) : [];
    return [...tuChuoi, ...chung]
      .filter((n) => n.thoiGian > tb.xoaTruoc && !tb.daXoa.includes(n.ma))
      .map((n) => ({ ...n, daDoc: n.thoiGian <= tb.daDocLuc || tb.daDoc.includes(n.ma) }))
      .sort((a, b) => b.thoiGian - a.thoiGian)
      .slice(0, SO_THONG_BAO_TOI_DA);
  }

  async soChuaDoc(nguoiDung) {
    return (await this.danhSach(nguoiDung)).filter((n) => !n.daDoc).length;
  }

  /** Đánh dấu đã đọc 1 thông báo (có `ma`) hoặc tất cả. 1 lượt ghi Firebase. */
  async danhDauDaDoc(nguoiDung, ma) {
    const tb = nguoiDung.thongBao;
    if (ma) tb.daDoc = [...tb.daDoc.filter((x) => x !== ma), String(ma)].slice(-SO_MA_GHI_NHO_TOI_DA);
    else { tb.daDocLuc = Date.now(); tb.daDoc = []; }
    await this.khoNguoiDung.luu(nguoiDung);
  }

  /** Xóa 1 thông báo (có `ma`) hoặc tất cả. 1 lượt ghi Firebase. */
  async xoa(nguoiDung, ma) {
    const tb = nguoiDung.thongBao;
    if (ma) tb.daXoa = [...tb.daXoa.filter((x) => x !== ma), String(ma)].slice(-SO_MA_GHI_NHO_TOI_DA);
    else { tb.xoaTruoc = Date.now(); tb.daXoa = []; tb.daDoc = []; }
    await this.khoNguoiDung.luu(nguoiDung);
  }

  static kiemTraMa(ma) {
    if (ma !== undefined && ma !== null && !/^[A-Z_]+_[\w]+/.test(String(ma))) throw new LoiNghiepVu('Mã thông báo không hợp lệ.');
  }
}

module.exports = { DichVuThongBao };
