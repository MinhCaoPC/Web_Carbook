const { LoiNghiepVu } = require('../tien-ich/loi-nghiep-vu');
const { homNay, MOT_NGAY_MS } = require('../tien-ich/thoi-gian');

/**
 * THỐNG KÊ cho nhà xe — tính hoàn toàn từ SỰ KIỆN BLOCKCHAIN của hợp đồng:
 *   DaMuaVe (bán vé), DaHuyVe (hủy + tiền hoàn), DaSuDungVe (khách đã đi), DaBanLai (giao dịch chợ vé).
 * Vì sự kiện ghi vĩnh viễn trên chuỗi nên số liệu không ai sửa được, và không tốn lượt đọc Firebase.
 * Tiền tính bằng wei (BigInt), trả về dạng chuỗi; web đổi sang ETH/VNĐ.
 */
class DichVuThongKe {
  /**
   * @param {import('../ket-noi/ket-noi-blockchain').KetNoiBlockchain} blockchain
   * @param {import('../ket-noi/nhat-ky-su-kien').NhatKySuKien} nhatKy
   * @param {import('../kho-du-lieu/kho-thong-tin-ve').KhoThongTinVe} khoThongTinVe
   * @param {import('./dich-vu-chuyen-xe').DichVuChuyenXe} dichVuChuyenXe
   */
  constructor(blockchain, nhatKy, khoThongTinVe, dichVuChuyenXe) {
    this.blockchain = blockchain;
    this.nhatKy = nhatKy;
    this.khoThongTinVe = khoThongTinVe;
    this.dichVuChuyenXe = dichVuChuyenXe;
  }

  /** Ghép sự kiện thành bảng vé: mã vé -> { maChuyen, maGhe, gia, trangThai, muaLuc, tienHoan } */
  async _bangVe() {
    await this.nhatKy.capNhat();
    const ve = new Map();
    for (const sk of this.nhatKy.danhSach) {
      const t = sk.thamSo;
      const ma = Number(t.maVe);
      if (sk.ten === 'DaMuaVe') ve.set(ma, { maVe: ma, maChuyen: t.maChuyen, maGhe: t.maGhe, gia: BigInt(t.gia), trangThai: 'HIEU_LUC', muaLuc: sk.thoiGian, tienHoan: 0n });
      else if (sk.ten === 'DaHuyVe' && ve.has(ma)) Object.assign(ve.get(ma), { trangThai: 'DA_HUY', tienHoan: BigInt(t.tienHoan), huyLuc: sk.thoiGian });
      else if (sk.ten === 'DaSuDungVe' && ve.has(ma)) ve.get(ma).trangThai = 'DA_SU_DUNG';
    }
    return ve;
  }

  /**
   * Tổng quan + số liệu theo ngày cho `soNgay` ngày gần nhất (0 = toàn bộ lịch sử).
   * Doanh thu thuần của một ngày = tiền vé bán trong ngày − tiền hoàn của vé hủy trong ngày.
   */
  async tongQuan(soNgay = 14) {
    const bangVe = await this._bangVe();
    const tatCaVe = [...bangVe.values()];
    const tuLuc = soNgay > 0 ? Date.parse(`${homNay(Date.now() - (soNgay - 1) * MOT_NGAY_MS)}T00:00:00+07:00`) : 0;
    const trongKy = (luc) => luc >= tuLuc;
    const ngayVN = (luc) => homNay(luc);

    // ---- Chỉ số tổng ----
    const veBan = tatCaVe.filter((v) => trongKy(v.muaLuc));
    const veHuy = tatCaVe.filter((v) => v.trangThai === 'DA_HUY' && trongKy(v.huyLuc));
    const tong = (ds, lay) => ds.reduce((s, v) => s + lay(v), 0n);
    const doanhThuGop = tong(veBan, (v) => v.gia);
    const tienHoan = tong(veHuy, (v) => v.tienHoan);
    const banLai = this.nhatKy.danhSach.filter((s) => s.ten === 'DaBanLai' && trongKy(s.thoiGian));

    // ---- Theo ngày (đủ mọi ngày trong kỳ, kể cả ngày bằng 0) ----
    const ngayDau = soNgay > 0 ? ngayVN(tuLuc) : (veBan.length ? ngayVN(Math.min(...veBan.map((v) => v.muaLuc))) : homNay());
    const cacNgay = [];
    for (let luc = Date.parse(`${ngayDau}T00:00:00+07:00`); ngayVN(luc) <= homNay(); luc += MOT_NGAY_MS) cacNgay.push(ngayVN(luc));
    const theoNgay = new Map(cacNgay.map((n) => [n, { ngay: n, soVeBan: 0, soVeHuy: 0, tienBan: 0n, tienHoan: 0n }]));
    for (const v of veBan) { const d = theoNgay.get(ngayVN(v.muaLuc)); if (d) { d.soVeBan += 1; d.tienBan += v.gia; } }
    for (const v of veHuy) { const d = theoNgay.get(ngayVN(v.huyLuc)); if (d) { d.soVeHuy += 1; d.tienHoan += v.tienHoan; } }

    // ---- Theo tuyến (vé còn giữ chỗ: không tính vé đã hủy) ----
    const theoTuyen = new Map();
    for (const v of veBan) {
      if (v.trangThai === 'DA_HUY') continue;
      const c = this.dichVuChuyenXe.timTheoMa(v.maChuyen);
      const ten = c ? `${c.loTrinh?.diemKhoiHanh} → ${c.loTrinh?.diemKetThuc}` : v.maChuyen.split('_')[0];
      const muc = theoTuyen.get(ten) || { tuyen: ten, soVe: 0, doanhThu: 0n };
      muc.soVe += 1;
      muc.doanhThu += v.gia;
      theoTuyen.set(ten, muc);
    }

    // ---- Tỷ lệ lấp ghế của các chuyến có bán vé ----
    const theoChuyen = new Map();
    for (const v of tatCaVe) {
      if (v.trangThai === 'DA_HUY' || !trongKy(v.muaLuc)) continue;
      theoChuyen.set(v.maChuyen, (theoChuyen.get(v.maChuyen) || 0) + 1);
    }
    let gheDaBan = 0;
    let tongGhe = 0;
    for (const [maChuyen, so] of theoChuyen) {
      const c = this.dichVuChuyenXe.timTheoMa(maChuyen);
      gheDaBan += so;
      tongGhe += c ? c.soGhe : 34;
    }

    const [choRut, soDuHopDong] = await Promise.all([
      this.blockchain.hopDong.doanhThuChoRut(),
      this.blockchain.provider.getBalance(this.blockchain.hopDong.target),
    ]);
    const chuoi = (x) => x.toString();
    return {
      soNgay,
      tongQuan: {
        soVeBan: veBan.length,
        soVeHuy: veHuy.length,
        soVeDaDi: veBan.filter((v) => v.trangThai === 'DA_SU_DUNG').length,
        soVeConHieuLuc: veBan.filter((v) => v.trangThai === 'HIEU_LUC').length,
        doanhThuGopWei: chuoi(doanhThuGop),
        tienHoanWei: chuoi(tienHoan),
        doanhThuThuanWei: chuoi(doanhThuGop - tienHoan),
        soLanBanLai: banLai.length,
        giaTriBanLaiWei: chuoi(banLai.reduce((s, sk) => s + BigInt(sk.thamSo.gia), 0n)),
        soChuyenCoKhach: theoChuyen.size,
        tyLeLapGhe: tongGhe ? gheDaBan / tongGhe : 0,
        doanhThuChoRutWei: chuoi(choRut),
        soDuHopDongWei: chuoi(soDuHopDong),
      },
      theoNgay: [...theoNgay.values()].map((d) => ({ ...d, tienBan: chuoi(d.tienBan), tienHoan: chuoi(d.tienHoan), doanhThuThuanWei: chuoi(d.tienBan - d.tienHoan) })),
      theoTuyen: [...theoTuyen.values()].sort((a, b) => b.soVe - a.soVe).slice(0, 8).map((t) => ({ ...t, doanhThu: chuoi(t.doanhThu) })),
    };
  }

  /**
   * Danh sách vé của MỘT NGÀY ĐI (có thể lọc 1 chuyến), nhóm theo chuyến — dùng làm danh sách lên xe.
   * Trạng thái + chủ vé đọc trực tiếp từ hợp đồng; họ tên/SĐT từ kho off-chain.
   */
  /**
   * VÉ KHÁCH KHÔNG ĐI = vé còn hiệu lực (chưa soát, chưa hủy) + chuyến đã chạy + nhà xe CHƯA chốt.
   * Tiền của các vé này vẫn nằm trong hợp đồng; nhà xe bấm "Chốt" (hàm chotVeKhongDi) để cộng vào doanh thu.
   */
  async veKhachKhongDi() {
    const bangVe = await this._bangVe();
    const daChot = new Set(this.nhatKy.danhSach.filter((s) => s.ten === 'DaChotVeKhongDi').map((s) => Number(s.thamSo.maVe)));
    const conHieuLuc = [...bangVe.values()].filter((v) => v.trangThai === 'HIEU_LUC' && !daChot.has(v.maVe));

    const ketQua = await Promise.all(conHieuLuc.map(async (v) => {
      const trenChuoi = await this.blockchain.layVe(v.maVe); // đọc lại trạng thái + giờ chạy ghi trên vé
      const daChay = trenChuoi.gioKhoiHanh.getTime() < Date.now();
      if (trenChuoi.trangThai !== 'HIEU_LUC' || !daChay) return null;
      const c = this.dichVuChuyenXe.timTheoMa(v.maChuyen);
      return {
        maVe: v.maVe, maChuyen: v.maChuyen, maGhe: v.maGhe, giaWei: v.gia.toString(),
        gioKhoiHanh: trenChuoi.gioKhoiHanh.toISOString(), chuSoHuu: trenChuoi.chuSoHuu,
        tuyen: c ? `${c.loTrinh?.diemKhoiHanh} → ${c.loTrinh?.diemKetThuc}` : v.maChuyen,
      };
    }));
    return ketQua.filter(Boolean).sort((a, b) => a.gioKhoiHanh.localeCompare(b.gioKhoiHanh));
  }

  async danhSachVe({ ngay, maChuyen } = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ngay || ''))) throw new LoiNghiepVu('Ngày không hợp lệ (YYYY-MM-DD).');
    const bangVe = await this._bangVe();
    const loc = [...bangVe.values()].filter((v) => v.maChuyen.endsWith(`_${ngay}`) && (!maChuyen || v.maChuyen === maChuyen));

    const chiTiet = await Promise.all(loc.map(async (v) => {
      const [trenChuoi, hanhKhach] = await Promise.all([this.blockchain.layVe(v.maVe), this.khoThongTinVe.lay(v.maVe)]);
      const cuaChuHienTai = hanhKhach && trenChuoi.chuSoHuu && hanhKhach.diaChiChu === trenChuoi.chuSoHuu;
      return {
        maVe: v.maVe, maChuyen: v.maChuyen, maGhe: v.maGhe, giaWei: v.gia.toString(),
        trangThai: trenChuoi.trangThai, chuSoHuu: trenChuoi.chuSoHuu, dangRao: trenChuoi.giaDangRaoWei > 0n,
        hoTen: cuaChuHienTai ? hanhKhach.hoTen : '', sdt: cuaChuHienTai ? hanhKhach.sdt : '',
      };
    }));

    // Nhóm theo chuyến, kèm thông tin chuyến
    const nhom = new Map();
    for (const v of chiTiet) {
      if (!nhom.has(v.maChuyen)) {
        const c = this.dichVuChuyenXe.timTheoMa(v.maChuyen);
        nhom.set(v.maChuyen, { maChuyen: v.maChuyen, chuyen: c ? c.toJSON() : null, ve: [] });
      }
      nhom.get(v.maChuyen).ve.push(v);
    }
    const ketQua = [...nhom.values()];
    ketQua.forEach((n) => n.ve.sort((a, b) => a.maGhe.localeCompare(b.maGhe, 'vi', { numeric: true })));
    return ketQua.sort((a, b) => String(a.chuyen?.gioKhoiHanh || a.maChuyen).localeCompare(String(b.chuyen?.gioKhoiHanh || b.maChuyen)));
  }
}

module.exports = { DichVuThongKe };
