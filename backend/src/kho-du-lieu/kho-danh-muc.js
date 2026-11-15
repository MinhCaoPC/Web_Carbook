const fs = require('fs');
const path = require('path');
const { laLoTrinhMienTay, chonChuyenMoiTuyen } = require('../tien-ich/mien-tay');
const { phutTrongNgayVN, doiSangMili } = require('../tien-ich/thoi-gian');

/**
 * KHO DANH MỤC — dữ liệu gần như KHÔNG ĐỔI: lộ trình, chuyến xe mẫu, xe, sơ đồ ghế.
 *
 * ĐÂY LÀ CHỖ TIẾT KIỆM FIREBASE NHIỀU NHẤT:
 *   - Đọc Firestore 1 lần (~vài trăm lượt), rồi lưu toàn bộ ra file du-lieu/danh-muc.json.
 *   - Khởi động lại máy chủ -> đọc file, KHÔNG đọc lại Firebase (trừ khi file cũ hơn SO_GIO_LAM_MOI_DANH_MUC).
 *   - Mọi lượt tìm chuyến / xem ghế sau đó lấy trong RAM -> 0 lượt đọc Firebase.
 *   (Code cũ đọc GHEXE + CHUYENXE_NGAY mỗi lượt tìm và sinh ~15.000 tài liệu ghế mỗi ngày.)
 */
class KhoDanhMuc {
  /**
   * @param {import('./kho-luu-tru').KhoLuuTru} khoLuuTru nguồn dữ liệu gốc (Firestore hoặc file)
   * @param {{ fileDanhMuc: string, soGioLamMoi: number, soChuyenMoiTuyen: number, chiDocFile?: boolean }} tuyChon
   */
  constructor(khoLuuTru, tuyChon) {
    this.khoLuuTru = khoLuuTru;
    this.fileDanhMuc = tuyChon.fileDanhMuc;
    this.soGioLamMoi = tuyChon.soGioLamMoi;
    this.soChuyenMoiTuyen = tuyChon.soChuyenMoiTuyen;
    this.chiDocFile = !!tuyChon.chiDocFile; // chế độ 'tep': không bao giờ gọi Firebase
    this._duLieu = null;
  }

  // ===================== NẠP DỮ LIỆU =====================

  /** Nạp danh mục (gọi 1 lần lúc khởi động). `epDocLai` = bỏ qua file, đọc lại từ nguồn gốc. */
  async taiDuLieu(epDocLai = false) {
    const file = this._docFile();
    const conMoi = file && Date.now() - file.thoiGianTai < this.soGioLamMoi * 3600 * 1000;

    if (this.chiDocFile || (!epDocLai && conMoi)) {
      if (!file) throw new Error(`Chưa có ${path.basename(this.fileDanhMuc)}. Chạy một lần với NOI_LUU_DU_LIEU=firebase để tải danh mục.`);
      this._duLieu = file;
      console.log(`📂 Danh mục: đọc từ file (${this._moTa()}) — không tốn lượt đọc Firebase`);
      return this;
    }

    try {
      this._duLieu = await this._docTuNguonGoc();
      this._ghiFile(this._duLieu);
      console.log(`☁️  Danh mục: đã tải từ ${this.khoLuuTru.ten} và lưu ra file (${this._moTa()})`);
    } catch (loi) {
      if (!file) throw loi;
      this._duLieu = file; // mất mạng / hết quota -> dùng tạm bản cũ
      console.warn(`⚠️  Không đọc được ${this.khoLuuTru.ten} (${loi.message}). Dùng tạm danh mục cũ trong file.`);
    }
    return this;
  }

  async _docTuNguonGoc() {
    const [loTrinh, chuyenXe, xe, mauSoDo] = await Promise.all(
      ['LOTRINH', 'CHUYENXE', 'XE', 'MAUSODOGHE'].map((bang) => this.khoLuuTru.docCaBang(bang))
    );
    // Chỉ giữ những trường cần dùng, đổi thời gian sang số -> file gọn, dễ đọc
    return {
      thoiGianTai: Date.now(),
      loTrinh: loTrinh.map(KhoDanhMuc.CHUAN_HOA.loTrinh),
      chuyenXe: chuyenXe.map(KhoDanhMuc.CHUAN_HOA.chuyenXe),
      xe: xe.map(KhoDanhMuc.CHUAN_HOA.xe),
      mauSoDo: mauSoDo.map(KhoDanhMuc.CHUAN_HOA.mauSoDo),
    };
  }

  /** Đổi bản ghi Firestore (định dạng gốc) -> dạng gọn dùng trong RAM. Dùng chung khi tải và khi quản trị sửa. */
  static CHUAN_HOA = {
    loTrinh: (l) => ({
      ma: l.ma, tenLoTrinh: l.tenLoTrinh || '', diemKhoiHanh: l.diemKhoiHanh || '', diemKetThuc: l.diemKetThuc || '',
      quangDuongKm: l.quangDuongKm || null, trangThai: l.trangThai || 'HoatDong',
    }),
    chuyenXe: (c) => {
      const di = doiSangMili(c.thoiGianXuatPhat);
      const den = doiSangMili(c.thoiGianDenDich);
      return {
        ma: c.ma, maLoTrinh: c.maLoTrinh, maXe: c.maXe, giaVe: Number(c.giaVe) || 0, trangThai: c.trangThai || '',
        phutKhoiHanh: phutTrongNgayVN(di),
        soPhutDiChuyen: Number.isFinite(den - di) && den > di ? Math.round((den - di) / 60000) : 240,
      };
    },
    xe: (x) => ({
      ma: x.ma, bienSoXe: x.bienSoXe || '', tenLoaiXe: x.tenLoaiXe || '', maMauSoDo: x.maMauSoDo || null, tongSoGhe: x.tongSoGhe || null,
    }),
    mauSoDo: (m) => ({
      ma: m.ma, loaiGhe: m.loaiGhe || '',
      danhSachGhe: (m.danhSachGhe || []).map((g) => ({ maGhe: g.maGhe, tang: g.tang || 1, hang: g.hang, cot: g.cot })),
    }),
  };

  // ===================== DÀNH CHO TRANG QUẢN TRỊ =====================

  /** Toàn bộ một loại danh mục (kể cả mục ngừng hoạt động / ngoài miền Tây). loai: loTrinh | chuyenXe | xe | mauSoDo */
  tatCa(loai) {
    return this._d[loai];
  }

  /**
   * Cập nhật 1 mục ngay trong RAM + file danh-muc.json sau khi quản trị đã ghi Firebase,
   * nên KHÔNG phải đọc lại cả danh mục từ Firebase.
   * @param {'loTrinh'|'chuyenXe'|'xe'} loai
   * @param {object} banGhiGoc bản ghi đúng định dạng Firestore (có trường `ma`)
   */
  capNhatMuc(loai, banGhiGoc) {
    const moi = KhoDanhMuc.CHUAN_HOA[loai](banGhiGoc);
    const ds = this._d[loai];
    const viTri = ds.findIndex((x) => x.ma === moi.ma);
    if (viTri >= 0) ds[viTri] = moi; else ds.push(moi);
    this._ghiFile(this._d);
    return moi;
  }

  _docFile() {
    try {
      return JSON.parse(fs.readFileSync(this.fileDanhMuc, 'utf8'));
    } catch {
      return null;
    }
  }

  _ghiFile(duLieu) {
    fs.mkdirSync(path.dirname(this.fileDanhMuc), { recursive: true });
    fs.writeFileSync(this.fileDanhMuc, JSON.stringify(duLieu, null, 1));
  }

  _moTa() {
    const d = this._duLieu;
    return `${d.loTrinh.length} lộ trình, ${d.chuyenXe.length} chuyến mẫu, ${d.xe.length} xe`;
  }

  get _d() {
    if (!this._duLieu) throw new Error('KhoDanhMuc chưa được nạp (gọi taiDuLieu() trước).');
    return this._duLieu;
  }

  // ===================== TRA CỨU (trong RAM) =====================

  /** Lộ trình đang hoạt động thuộc miền Tây. */
  danhSachLoTrinh() {
    return this._d.loTrinh.filter((l) => l.trangThai === 'HoatDong' && laLoTrinhMienTay(l));
  }

  layLoTrinh(ma) {
    return this._d.loTrinh.find((l) => l.ma === ma) || null;
  }

  layXe(ma) {
    return this._d.xe.find((x) => x.ma === ma) || null;
  }

  layChuyenMau(ma) {
    return this._d.chuyenXe.find((c) => c.ma === ma) || null;
  }

  /** Các chuyến mẫu được bán: thuộc lộ trình miền Tây, không bị hủy, tối đa N chuyến/tuyến. */
  danhSachChuyenMau() {
    const maLoTrinhHopLe = new Set(this.danhSachLoTrinh().map((l) => l.ma));
    const hopLe = this._d.chuyenXe.filter((c) => maLoTrinhHopLe.has(c.maLoTrinh) && c.trangThai !== 'Huy' && c.giaVe > 0);
    return chonChuyenMoiTuyen(hopLe, this.soChuyenMoiTuyen);
  }

  /** Sơ đồ ghế của một xe. Xe chưa gán mẫu sơ đồ thì dùng mẫu giường nằm 34 chỗ mặc định. */
  laySoDoGhe(maXe) {
    return this.laySoDoCuaXe(maXe).danhSachGhe;
  }

  /**
   * Sơ đồ ghế của một xe kèm MÃ SƠ ĐỒ — mã này được đăng ký lên hợp đồng để hợp đồng biết xe có những ghế nào.
   * Xe chưa gán sơ đồ (hoặc sơ đồ rỗng) dùng sơ đồ mặc định "MAC_DINH_34".
   * @returns {{ maSoDo: string, danhSachGhe: Array<{maGhe, tang, hang, cot}> }}
   */
  laySoDoCuaXe(maXe) {
    const xe = this.layXe(maXe);
    const mau = xe && this._d.mauSoDo.find((m) => m.ma === xe.maMauSoDo);
    if (mau && mau.danhSachGhe.length) return { maSoDo: mau.ma, danhSachGhe: mau.danhSachGhe };
    return { maSoDo: KhoDanhMuc.MA_SO_DO_MAC_DINH, danhSachGhe: KhoDanhMuc.soDoMacDinh34Cho() };
  }

  static MA_SO_DO_MAC_DINH = 'MAC_DINH_34';

  /** Giường nằm 34 chỗ: 2 tầng (A, B), mỗi tầng 6 hàng x 3 cột, hàng đầu khuyết ghế giữa. */
  static soDoMacDinh34Cho() {
    const ghe = [];
    for (const [tang, kyHieu] of [[1, 'A'], [2, 'B']]) {
      let so = 1;
      for (let hang = 1; hang <= 6; hang++) {
        for (let cot = 1; cot <= 3; cot++) {
          if (hang === 1 && cot === 2) continue;
          ghe.push({ maGhe: `${kyHieu}${String(so++).padStart(2, '0')}`, tang, hang, cot });
        }
      }
    }
    return ghe;
  }
}

module.exports = { KhoDanhMuc };
