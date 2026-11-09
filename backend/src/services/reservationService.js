const { v4: uuidv4 } = require('uuid');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { db } = require('../config/firebase');
const { giuGhe, nhaGhe } = require('./seatHoldService');
const { genMaDatVe } = require('../utils/ticketCodeGenerator');
const { maskPhone, maskEmail } = require('../utils/maskInfo');
const { ngayHopLe, layDanhSachNgayChoPhep, ghepNgayGio } = require('../utils/schedule');

const VEXE_COLLECTION = 'VEXE';
const KHACHHANG_COLLECTION = 'KHACHHANG';
const TAIKHOAN_COLLECTION = 'TAIKHOAN';
const CHUYENXE_COLLECTION = 'CHUYENXE';
const CHUYENXE_NGAY_COLLECTION = 'CHUYENXE_NGAY';
const LOTRINH_COLLECTION = 'LOTRINH';
const XE_COLLECTION = 'XE';
const DIEMTRUNGCHUYEN_COLLECTION = 'DIEMTRUNGCHUYEN';
const LICHTRINHCHUYEN_COLLECTION = 'LICHTRINHCHUYEN';

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function tsToIso(value) {
  return value && value.toDate ? value.toDate().toISOString() : value;
}

function loaiDiemToNhom(loaiDiem) {
  return loaiDiem === 'TRUNGCHUYEN' ? 'TRUNG_CHUYEN' : 'BEN_XE';
}

// Chuẩn hoá tên tỉnh/thành để so khớp: bỏ dấu, bỏ tiền tố "tỉnh/tp/thành phố", lowercase
function chuanHoaTenTinh(value) {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/^\s*(tinh|tp\.?|thanh pho)\s*/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

// Từ tên điểm khởi hành/kết thúc của lộ trình (vd "An Minh (Kien Giang)", "Ca Mau"),
// tách ra các "ứng viên" tên tỉnh để so khớp với DIEMTRUNGCHUYEN.tinhThanh
function tachUngVienTenTinh(tenDiaDiem) {
  if (!tenDiaDiem) return [];
  const trongNgoac = tenDiaDiem.match(/\(([^)]+)\)/);
  const ngoaiNgoac = tenDiaDiem.replace(/\([^)]*\)/g, '').trim();
  const ungVien = [ngoaiNgoac];
  if (trongNgoac) ungVien.push(trongNgoac[1].trim());
  return ungVien.map(chuanHoaTenTinh).filter(Boolean);
}

function diemThuocPhamViTinh(diem, tenDiaDiem) {
  const tinhDiem = chuanHoaTenTinh(diem.tinhThanh);
  if (!tinhDiem) return false;
  return tachUngVienTenTinh(tenDiaDiem).some(
    (ungVien) => tinhDiem.includes(ungVien) || ungVien.includes(tinhDiem)
  );
}

// Lọc danh sách điểm trung chuyển về đúng phạm vi tỉnh của điểm đón/trả (vd "Ca Mau" -> chỉ
// lấy các điểm có tinhThanh khớp "Cà Mau"). Nếu không khớp điểm nào (dữ liệu tỉnh chưa đủ chi
// tiết), giữ nguyên danh sách gốc theo lộ trình để tránh màn hình trống.
function locTheoPhamViTinh(danhSachDiem, tenDiaDiem) {
  const daLoc = danhSachDiem.filter((diem) => diemThuocPhamViTinh(diem, tenDiaDiem));
  return daLoc.length > 0 ? daLoc : danhSachDiem;
}

async function layDiemMacDinh(maLoTrinh, loaiDiem, tenDiaDiem) {
  const snap = await db.collection(DIEMTRUNGCHUYEN_COLLECTION)
    .where('maLoTrinh', '==', maLoTrinh)
    .where('loaiDiem', '==', loaiDiem)
    .get();
  if (snap.empty) return null;

  const danhSach = snap.docs.map((doc) => ({ maDiem: doc.id, ...doc.data() }));
  const daLoc = locTheoPhamViTinh(danhSach, tenDiaDiem);
  return daLoc[0] || null;
}

async function layDiemTheoId(maDiem) {
  if (!maDiem) return null;
  const doc = await db.collection(DIEMTRUNGCHUYEN_COLLECTION).doc(maDiem).get();
  if (!doc.exists) return null;
  return { maDiem: doc.id, ...doc.data() };
}

// Giữ chỗ: tạo VEXE draft cho từng ghế + giữ ghế 60 PHÚT (transaction bên trong giuGhe).
// maChuyenXe là chuyến "mẫu" (giờ cố định, lặp lại mỗi ngày) — ngayDi xác định đúng lượt chạy
// cụ thể (CHUYENXE_NGAY) mà ghế/vé sẽ gắn vào, để không dính trạng thái với ngày khác.
async function giuCho({ maKhachHang, maChuyenXe, ngayDi, danhSachMaGhe, maDiemDon, maDiemTra }) {
  if (!maKhachHang || !maChuyenXe || !ngayDi || !Array.isArray(danhSachMaGhe) || danhSachMaGhe.length === 0) {
    throw httpError('Thiếu thông tin giữ chỗ (maKhachHang, maChuyenXe, ngayDi, danhSachMaGhe).', 400);
  }

  if (danhSachMaGhe.length > 5) {
    throw httpError('Chỉ được đặt tối đa 5 vé cho mỗi lần đặt.', 400);
  }

  if (!ngayHopLe(ngayDi)) {
    throw httpError(`Chỉ hỗ trợ đặt vé trong ${layDanhSachNgayChoPhep().length} ngày tới.`, 400);
  }

  const khachHangDoc = await db.collection(KHACHHANG_COLLECTION).doc(maKhachHang).get();
  if (!khachHangDoc.exists) {
    throw httpError('Không tìm thấy khách hàng.', 404);
  }
  const khachHang = khachHangDoc.data();

  const taiKhoanDoc = khachHang.maTaiKhoan
    ? await db.collection(TAIKHOAN_COLLECTION).doc(khachHang.maTaiKhoan).get()
    : null;
  const email = taiKhoanDoc && taiKhoanDoc.exists ? taiKhoanDoc.data().email : '';

  const tripDoc = await db.collection(CHUYENXE_COLLECTION).doc(maChuyenXe).get();
  if (!tripDoc.exists) {
    throw httpError('Không tìm thấy chuyến xe.', 404);
  }
  const chuyenXe = tripDoc.data();
  const loTrinhDoc = await db.collection(LOTRINH_COLLECTION).doc(chuyenXe.maLoTrinh).get();
  const loTrinh = loTrinhDoc.exists ? loTrinhDoc.data() : {};

  const chuyenXeNgayDoc = await db.collection(CHUYENXE_NGAY_COLLECTION).doc(`${maChuyenXe}_${ngayDi}`).get();
  if (!chuyenXeNgayDoc.exists) {
    throw httpError('Chuyến xe chưa mở bán cho ngày này.', 404);
  }

  // giuGhe throw nếu có ghế không khả dụng -> để nguyên propagate lên route (400).
  // Giữ chỗ 60 PHÚT: khách không thanh toán trong 1 tiếng thì ghế tự mở lại cho người khác.
  const { thoiHanGiu, gheDaGiu } = await giuGhe(maChuyenXe, ngayDi, danhSachMaGhe, 60);
  const hetHanGiuVe = Timestamp.fromDate(thoiHanGiu);

  // Dữ liệu DIEMTRUNGCHUYEN hiện tại 100% loaiDiem = 'TRUNGCHUYEN' (không có điểm 'DON'/'TRA'
  // riêng — xem ghi chú ở đầu file) nên mặc định phải tìm theo 'TRUNGCHUYEN', nếu không sẽ luôn
  // ra null (bug cũ: mọi vé không tự chọn điểm đều có maDiemDon/maDiemTra rỗng).
  const diemDon = maDiemDon
    ? await layDiemTheoId(maDiemDon)
    : await layDiemMacDinh(chuyenXe.maLoTrinh, 'TRUNGCHUYEN', loTrinh.diemKhoiHanh);
  const diemTra = maDiemTra
    ? await layDiemTheoId(maDiemTra)
    : await layDiemMacDinh(chuyenXe.maLoTrinh, 'TRUNGCHUYEN', loTrinh.diemKetThuc);

  const maNhomDat = uuidv4();
  const danhSachMaDatVe = [];
  const batch = db.batch();

  for (const maGhe of gheDaGiu) {
    const maDatVe = await genMaDatVe();
    danhSachMaDatVe.push(maDatVe);

    batch.set(db.collection(VEXE_COLLECTION).doc(maDatVe), {
      maNhomDat,
      maKhachHang,
      maChuyenXe,
      ngayDi,
      maGheXe: `${maChuyenXe}_${ngayDi}_${maGhe}`,
      maGhe,
      maDiemDon: diemDon ? diemDon.maDiem : null,
      maDiemTra: diemTra ? diemTra.maDiem : null,
      hoTenHanhKhach: khachHang.hoTen || '',
      emailHanhKhach: email || '',
      sdtHanhKhach: khachHang.sdt || '',
      cmndHanhKhach: null,
      giaVeGoc: chuyenXe.giaVe,
      tienGiam: 0,
      thanhTien: chuyenXe.giaVe,
      maQR: null,
      trangThaiVe: 'GIU_CHO',
      thoiGianDat: Timestamp.now(),
      hetHanGiuVe,
    });
  }

  await batch.commit();

  return {
    maNhomDat,
    danhSachMaDatVe,
    thoiHanGiu: thoiHanGiu.toISOString(),
    tongTien: chuyenXe.giaVe * gheDaGiu.length,
  };
}

// Đọc N VEXE theo mã, ráp thông tin chuyến/lộ trình/xe/hành khách/điểm đón-trả
async function layChiTietNhomVe(danhSachMaDatVe) {
  if (!Array.isArray(danhSachMaDatVe) || danhSachMaDatVe.length === 0) {
    throw httpError('Thiếu danh sách mã đặt vé.', 400);
  }

  const veDocs = await Promise.all(
    danhSachMaDatVe.map((maDatVe) => db.collection(VEXE_COLLECTION).doc(maDatVe).get())
  );

  const missing = veDocs.find((doc) => !doc.exists);
  if (missing) {
    throw httpError('Không tìm thấy vé trong danh sách yêu cầu.', 404);
  }

  const veList = veDocs.map((doc) => ({ maDatVe: doc.id, ...doc.data() }));
  const { maChuyenXe, ngayDi } = veList[0];
  if (veList.some((ve) => ve.maChuyenXe !== maChuyenXe || ve.ngayDi !== ngayDi)) {
    throw httpError('Danh sách vé không thuộc cùng một chuyến xe.', 400);
  }

  // Hai document độc lập -> đọc song song để giảm số vòng chờ Firestore
  const [tripDoc, chuyenXeNgayDoc] = await Promise.all([
    db.collection(CHUYENXE_COLLECTION).doc(maChuyenXe).get(),
    db.collection(CHUYENXE_NGAY_COLLECTION).doc(`${maChuyenXe}_${ngayDi}`).get(),
  ]);
  if (!tripDoc.exists) {
    throw httpError('Không tìm thấy chuyến xe.', 404);
  }
  const chuyenXeMau = tripDoc.data();

  // Chuyến (mẫu) lặp lại mỗi ngày -> giờ xuất phát/đến thật của ĐÚNG ngày này lấy từ
  // CHUYENXE_NGAY; nếu vì lý do gì thiếu (dữ liệu cũ) thì tạm dùng giờ mẫu để không vỡ màn hình.
  const chuyenXe = chuyenXeNgayDoc.exists
    ? { ...chuyenXeMau, ...chuyenXeNgayDoc.data() }
    : chuyenXeMau;

  const [loTrinhDoc, xeDoc, lichTrinhSnap, diemDonSnap, diemTraSnap] = await Promise.all([
    db.collection(LOTRINH_COLLECTION).doc(chuyenXeMau.maLoTrinh).get(),
    db.collection(XE_COLLECTION).doc(chuyenXeMau.maXe).get(),
    db.collection(LICHTRINHCHUYEN_COLLECTION).where('maChuyenXe', '==', maChuyenXe).get(),
    db.collection(DIEMTRUNGCHUYEN_COLLECTION)
      .where('maLoTrinh', '==', chuyenXeMau.maLoTrinh)
      .where('loaiDiem', 'in', ['DON', 'TRUNGCHUYEN'])
      .get(),
    db.collection(DIEMTRUNGCHUYEN_COLLECTION)
      .where('maLoTrinh', '==', chuyenXeMau.maLoTrinh)
      .where('loaiDiem', 'in', ['TRA', 'TRUNGCHUYEN'])
      .get(),
  ]);

  const loTrinh = loTrinhDoc.exists ? loTrinhDoc.data() : {};
  const xe = xeDoc.exists ? xeDoc.data() : {};

  // LICHTRINHCHUYEN chỉ lưu giờ-trong-ngày cố định của chuyến mẫu (không có state đặt/giữ chỗ)
  // nên chiếu (ghép) giờ đó lên đúng ngayDi của nhóm vé để hiển thị đúng ngày thực tế.
  const gioTheoDiem = new Map();
  lichTrinhSnap.docs.forEach((doc) => {
    const gio = doc.data().thoiGianDuKien;
    gioTheoDiem.set(doc.data().maDiem, gio ? ghepNgayGio(ngayDi, gio.toDate()).toISOString() : null);
  });

  const ganGioVaLoai = (diem) => diem && ({
    loai: loaiDiemToNhom(diem.loaiDiem),
    maDiem: diem.maDiem,
    tenDiem: diem.tenDiem,
    diaChi: diem.diaChiChiTiet,
    loaiDiem: diem.loaiDiem,
    thoiGianDuKien: gioTheoDiem.get(diem.maDiem) || null,
  });

  const diemDonGoc = diemDonSnap.docs.map((doc) => ({ maDiem: doc.id, ...doc.data() }));
  const diemTraGoc = diemTraSnap.docs.map((doc) => ({ maDiem: doc.id, ...doc.data() }));

  // Điểm đón/trả của vé thường đã nằm trong danh sách vừa query theo lộ trình ->
  // tra tại chỗ, chỉ đọc thêm Firestore khi không tìm thấy (dữ liệu cũ/khác lộ trình)
  const timDiemCuaVe = async (maDiem, danhSach) => {
    if (!maDiem) return null;
    return danhSach.find((d) => d.maDiem === maDiem) || (await layDiemTheoId(maDiem));
  };

  const veChinh = veList[0];
  const [diemDonCuaVe, diemTraCuaVe] = await Promise.all([
    timDiemCuaVe(veChinh.maDiemDon, diemDonGoc),
    timDiemCuaVe(veChinh.maDiemTra, diemTraGoc),
  ]);
  const diemDon = ganGioVaLoai(diemDonCuaVe);
  const diemTra = ganGioVaLoai(diemTraCuaVe);

  // Chỉ giữ các điểm trung chuyển thuộc phạm vi tỉnh của điểm khởi hành (cho đón) /
  // điểm kết thúc (cho trả) của lộ trình, ví dụ tuyến đi Cà Mau thì điểm đón chỉ gồm các
  // điểm trung chuyển thuộc Cà Mau.
  const danhSachDiemDonKhaDung = locTheoPhamViTinh(diemDonGoc, loTrinh.diemKhoiHanh).map(ganGioVaLoai);
  const danhSachDiemTraKhaDung = locTheoPhamViTinh(diemTraGoc, loTrinh.diemKetThuc).map(ganGioVaLoai);

  return {
    veList,
    chuyenXe,
    loTrinh,
    xe,
    maChuyenXe,
    diemDon,
    diemTra,
    danhSachDiemDonKhaDung,
    danhSachDiemTraKhaDung,
  };
}

async function kiemTraThongTin(danhSachMaDatVe, { maskThongTin = true, maKhachHangDangNhap } = {}) {
  const { veList, chuyenXe, loTrinh, xe, maChuyenXe, diemDon, diemTra, danhSachDiemDonKhaDung, danhSachDiemTraKhaDung } =
    await layChiTietNhomVe(danhSachMaDatVe);

  // Hóa đơn của nhóm vé (chỉ có sau khi thanh toán) — hiển thị ở trang "vé của tôi"
  const hoaDonSnap = await db.collection('HOADON').where('maDatVe', 'in', danhSachMaDatVe).get();
  const danhSachHoaDon = hoaDonSnap.docs
    .map((doc) => {
      const hd = doc.data();
      return {
        maHoaDon: doc.id,
        maDatVe: hd.maDatVe,
        phuongThucTT: hd.phuongThucTT,
        tongTien: hd.tongTien,
        trangThaiTT: hd.trangThaiTT,
        txHash: hd.txHash || null,
        ngayThanhToan: hd.ngayThanhToan?.toDate?.()?.toISOString() || null,
      };
    })
    .sort((a, b) => (a.maDatVe > b.maDatVe ? 1 : -1));

  const veChinh = veList[0];
  const tongTien = veList.reduce((sum, ve) => sum + (ve.thanhTien || 0), 0);
  // Chỉ hiển thị thông tin gốc (không mask) khi người gọi đúng là chủ sở hữu nhóm vé
  const laChuSoHuu = maKhachHangDangNhap && veChinh.maKhachHang === maKhachHangDangNhap;
  const anThongTin = maskThongTin && !laChuSoHuu;

  return {
    chuyenXe: {
      maChuyenXe,
      tenLoTrinh: loTrinh.tenLoTrinh,
      diemKhoiHanh: loTrinh.diemKhoiHanh,
      diemKetThuc: loTrinh.diemKetThuc,
      thoiGianXuatPhat: tsToIso(chuyenXe.thoiGianXuatPhat),
      thoiGianDenDich: tsToIso(chuyenXe.thoiGianDenDich),
      tenXe: xe.tenLoaiXe,
      bienSoXe: xe.bienSoXe,
    },
    hanhKhach: {
      hoTen: veChinh.hoTenHanhKhach,
      sdt: anThongTin ? maskPhone(veChinh.sdtHanhKhach) : veChinh.sdtHanhKhach,
      email: anThongTin ? maskEmail(veChinh.emailHanhKhach) : veChinh.emailHanhKhach,
      cmnd: veChinh.cmndHanhKhach || null,
    },
    danhSachGhe: veList.map((ve) => ve.maGhe),
    // Chi tiết từng vé (mã QR chỉ có sau khi thanh toán) — màn kết quả/soát vé dùng
    danhSachVe: veList.map((ve) => ({
      maDatVe: ve.maDatVe,
      maGhe: ve.maGhe,
      maQR: ve.maQR || null,
      trangThaiVe: ve.trangThaiVe,
      giaVeGoc: ve.giaVeGoc || 0,
      tienGiam: ve.tienGiam || 0,
      thanhTien: ve.thanhTien || 0,
      // Vé NFT (chứng nhận sở hữu trên blockchain)
      nftTokenId: ve.nftTokenId || null,
      nftStatus: ve.nftStatus || null,
      nftTxHash: ve.nftTxHash || null,
      dangRaoBan: !!ve.dangRaoBan,
      giaRaoBan: ve.giaRaoBan || null,
    })),
    diemDon,
    danhSachDiemDonKhaDung,
    diemTra,
    danhSachDiemTraKhaDung,
    danhSachHoaDon,
    tongTien,
    hetHanGiu: tsToIso(veChinh.hetHanGiuVe),
    maKhachHang: veChinh.maKhachHang,
  };
}

async function layThongTinThanhToan(danhSachMaDatVe, { maskThongTin = true, maKhachHangDangNhap } = {}) {
  const co = await kiemTraThongTin(danhSachMaDatVe, { maskThongTin, maKhachHangDangNhap });
  const { veList } = await layChiTietNhomVe(danhSachMaDatVe);

  const canhBao = co.diemDon
    ? `Quý khách vui lòng có mặt tại ${co.diemDon.tenDiem} trước giờ khởi hành để được trung chuyển hoặc kiểm tra thông tin trước khi lên xe`
    : null;

  return {
    ...co,
    chiTietThanhToan: {
      soLuongVe: veList.length,
      giaVe: co.tongTien,
      phiThanhToan: 0,
      tongTien: co.tongTien,
      // Ví nội bộ (VINOIBO/GIAODICHVI) sẽ triển khai sau khi tích hợp blockchain.
      phuongThucMacDinh: 'CARBOOKPAY',
    },
    diemLenXe: co.diemDon ? { ...co.diemDon, canhBao } : null,
  };
}

function assertChuSoHuu(veDocs, maKhachHangDangNhap) {
  if (!maKhachHangDangNhap) return;
  const khongPhaiChuVe = veDocs.some((doc) => doc.exists && doc.data().maKhachHang !== maKhachHangDangNhap);
  if (khongPhaiChuVe) {
    throw httpError('Không có quyền thao tác trên vé của khách hàng khác.', 403);
  }
}

async function capNhatThongTinHanhKhach({ danhSachMaDatVe, hoTen, email, sdt, cmnd, maKhachHangDangNhap }) {
  if (!Array.isArray(danhSachMaDatVe) || danhSachMaDatVe.length === 0) {
    throw httpError('Thiếu danh sách mã đặt vé.', 400);
  }

  const veDocs = await Promise.all(
    danhSachMaDatVe.map((maDatVe) => db.collection(VEXE_COLLECTION).doc(maDatVe).get())
  );
  assertChuSoHuu(veDocs, maKhachHangDangNhap);

  const batch = db.batch();
  let soVe = 0;

  for (const doc of veDocs) {
    if (!doc.exists || doc.data().trangThaiVe !== 'GIU_CHO') continue;
    batch.update(doc.ref, {
      ...(hoTen !== undefined && { hoTenHanhKhach: hoTen }),
      ...(email !== undefined && { emailHanhKhach: email }),
      ...(sdt !== undefined && { sdtHanhKhach: sdt }),
      ...(cmnd !== undefined && { cmndHanhKhach: cmnd }),
    });
    soVe++;
  }

  if (soVe > 0) await batch.commit();

  return { capNhat: soVe > 0, soVe };
}

async function capNhatDiemDonTra({ danhSachMaDatVe, maDiemDon, maDiemTra, maKhachHangDangNhap }) {
  if (!Array.isArray(danhSachMaDatVe) || danhSachMaDatVe.length === 0) {
    throw httpError('Thiếu danh sách mã đặt vé.', 400);
  }

  const veDocs = await Promise.all(
    danhSachMaDatVe.map((maDatVe) => db.collection(VEXE_COLLECTION).doc(maDatVe).get())
  );
  const missing = veDocs.find((doc) => !doc.exists);
  if (missing) throw httpError('Không tìm thấy vé trong danh sách yêu cầu.', 404);
  assertChuSoHuu(veDocs, maKhachHangDangNhap);

  const { maChuyenXe } = veDocs[0].data();
  // Đọc chuyến + 2 điểm cần kiểm tra song song (độc lập nhau) rồi mới validate
  const [tripDoc, diemDonMoi, diemTraMoi] = await Promise.all([
    db.collection(CHUYENXE_COLLECTION).doc(maChuyenXe).get(),
    maDiemDon ? layDiemTheoId(maDiemDon) : null,
    maDiemTra ? layDiemTheoId(maDiemTra) : null,
  ]);
  if (!tripDoc.exists) throw httpError('Không tìm thấy chuyến xe.', 404);
  const { maLoTrinh } = tripDoc.data();

  if (maDiemDon && (!diemDonMoi || diemDonMoi.maLoTrinh !== maLoTrinh || diemDonMoi.loaiDiem === 'TRA')) {
    throw httpError('Điểm đón không hợp lệ cho tuyến này.', 400);
  }
  if (maDiemTra && (!diemTraMoi || diemTraMoi.maLoTrinh !== maLoTrinh || diemTraMoi.loaiDiem === 'DON')) {
    throw httpError('Điểm trả không hợp lệ cho tuyến này.', 400);
  }

  const batch = db.batch();
  for (const doc of veDocs) {
    batch.update(doc.ref, {
      ...(maDiemDon !== undefined && { maDiemDon }),
      ...(maDiemTra !== undefined && { maDiemTra }),
    });
  }
  await batch.commit();

  return { capNhat: true, soVe: veDocs.length };
}

async function nhaGheVaChonLai({ danhSachMaDatVe, maKhachHangDangNhap }) {
  if (!Array.isArray(danhSachMaDatVe) || danhSachMaDatVe.length === 0) {
    throw httpError('Thiếu danh sách mã đặt vé.', 400);
  }

  const veDocs = await Promise.all(
    danhSachMaDatVe.map((maDatVe) => db.collection(VEXE_COLLECTION).doc(maDatVe).get())
  );
  const missing = veDocs.find((doc) => !doc.exists);
  if (missing) throw httpError('Không tìm thấy vé trong danh sách yêu cầu.', 404);
  assertChuSoHuu(veDocs, maKhachHangDangNhap);

  const { maChuyenXe, ngayDi } = veDocs[0].data();
  const danhSachMaGhe = veDocs.map((doc) => doc.data().maGhe);

  await nhaGhe(maChuyenXe, ngayDi, danhSachMaGhe);

  const batch = db.batch();
  veDocs.forEach((doc) => batch.update(doc.ref, { trangThaiVe: 'HUY' }));
  await batch.commit();

  return { daNhaGhe: true, soVe: veDocs.length };
}

module.exports = {
  giuCho,
  kiemTraThongTin,
  layThongTinThanhToan,
  capNhatThongTinHanhKhach,
  capNhatDiemDonTra,
  nhaGheVaChonLai,
  layChiTietNhomVe,
  httpError,
};
