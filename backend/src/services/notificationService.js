const { Timestamp } = require('firebase-admin/firestore');
const { db } = require('../config/firebase');

const THONGBAO_COLLECTION = 'THONGBAO';
const VEXE_COLLECTION = 'VEXE';
const CHUYENXE_COLLECTION = 'CHUYENXE';
const CHUYENXE_NGAY_COLLECTION = 'CHUYENXE_NGAY';
const LOTRINH_COLLECTION = 'LOTRINH';

// Nhắc chuyến trước giờ khởi hành dự kiến bao nhiêu phút
const NHAC_TRUOC_PHUT = 30;

function ngayHomNay() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function gioPhut(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// CREATE (tự động): sinh thông báo "chuyến xe sắp khởi hành" cho các vé đã thanh toán
// đi trong HÔM NAY, khi còn <= 60 phút đến giờ xuất phát dự kiến. Doc id = TB_{maDatVe}
// nên gọi lặp lại không tạo trùng; thông báo giữ nguyên trạng thái đã đọc.
async function generateDepartureReminders(maKhachHang) {
  const homNay = ngayHomNay();
  const veSnap = await db.collection(VEXE_COLLECTION)
    .where('maKhachHang', '==', maKhachHang)
    .where('trangThaiVe', '==', 'DA_TT')
    .where('ngayDi', '==', homNay)
    .get();

  if (veSnap.empty) return 0;

  const now = Date.now();
  const tripCache = {};
  let soTaoMoi = 0;

  for (const veDoc of veSnap.docs) {
    const ve = veDoc.data();

    const maThongBao = `TB_${veDoc.id}`;
    const tbRef = db.collection(THONGBAO_COLLECTION).doc(maThongBao);
    if ((await tbRef.get()).exists) continue; // đã nhắc vé này rồi

    // Giờ xuất phát thật theo ngày đi (CHUYENXE_NGAY), fallback giờ mẫu trên CHUYENXE
    if (!tripCache[ve.maChuyenXe]) {
      const [ngayDoc, tripDoc] = await Promise.all([
        db.collection(CHUYENXE_NGAY_COLLECTION).doc(`${ve.maChuyenXe}_${homNay}`).get(),
        db.collection(CHUYENXE_COLLECTION).doc(ve.maChuyenXe).get(),
      ]);
      const trip = tripDoc.exists ? tripDoc.data() : {};
      const routeDoc = trip.maLoTrinh
        ? await db.collection(LOTRINH_COLLECTION).doc(trip.maLoTrinh).get()
        : null;
      tripCache[ve.maChuyenXe] = {
        departure: (ngayDoc.exists && ngayDoc.data().thoiGianXuatPhat
          ? ngayDoc.data().thoiGianXuatPhat
          : trip.thoiGianXuatPhat
        )?.toDate?.() || null,
        route: routeDoc && routeDoc.exists ? routeDoc.data() : {},
      };
    }

    const { departure, route } = tripCache[ve.maChuyenXe];
    if (!departure) continue;

    const msConLai = departure.getTime() - now;
    if (msConLai <= 0 || msConLai > NHAC_TRUOC_PHUT * 60 * 1000) continue; // chưa tới cửa sổ nhắc / đã chạy

    await tbRef.set({
      maThongBao,
      maKhachHang,
      loai: 'CHUYEN_XE',
      maDatVe: veDoc.id,
      tieuDe: 'Chuyến xe sắp khởi hành',
      noiDung:
        `Chuyến ${route.diemKhoiHanh || ''} → ${route.diemKetThuc || ''} của bạn sẽ khởi hành lúc ` +
        `${gioPhut(departure)} hôm nay (ghế ${ve.maGhe}). Vui lòng có mặt tại điểm đón trước 30 phút để chuẩn bị lên xe.`,
      daDoc: false,
      thoiGianTao: Timestamp.now(),
    });
    soTaoMoi++;
  }

  return soTaoMoi;
}

// CREATE: thông báo "thanh toán đặt vé chưa hoàn tất" — gọi khi khách rời trang thanh toán
// giữa chừng. Doc id gắn theo nhóm vé nên gọi lặp không tạo trùng; app bấm vào thông báo
// sẽ mở lại trang thanh toán của đúng nhóm vé (danhSachMaDatVe).
async function createPaymentReminder(maKhachHang, danhSachMaDatVe) {
  if (!Array.isArray(danhSachMaDatVe) || danhSachMaDatVe.length === 0) {
    const err = new Error('Thiếu danhSachMaDatVe.');
    err.statusCode = 400;
    return Promise.reject(err);
  }

  // Chỉ nhắc khi nhóm vé còn đang giữ chỗ và còn hạn (đã thanh toán/hết hạn thì bỏ qua)
  const veDoc = await db.collection(VEXE_COLLECTION).doc(danhSachMaDatVe[0]).get();
  if (!veDoc.exists || veDoc.data().maKhachHang !== maKhachHang) return { daTao: false };
  const ve = veDoc.data();
  if (ve.trangThaiVe !== 'GIU_CHO' || !ve.hetHanGiuVe || ve.hetHanGiuVe.toMillis() <= Date.now()) {
    return { daTao: false };
  }

  const hanGiu = ve.hetHanGiuVe.toDate();
  const maThongBao = `TB_TT_${danhSachMaDatVe[0]}`;
  await db.collection(THONGBAO_COLLECTION).doc(maThongBao).set({
    maThongBao,
    maKhachHang,
    loai: 'THANH_TOAN',
    danhSachMaDatVe,
    tieuDe: 'Thanh toán đặt vé chưa hoàn tất',
    noiDung:
      `Ghế của bạn vẫn đang được giữ đến ${gioPhut(hanGiu)}. ` +
      'Bấm vào đây để tiếp tục thanh toán và hoàn tất đặt vé.',
    daDoc: false,
    thoiGianTao: Timestamp.now(),
  });
  return { daTao: true, maThongBao };
}

// CREATE: thông báo "đặt vé thành công" (gửi tự động sau khi thanh toán)
async function createBookingSuccessNotification(maKhachHang, danhSachMaDatVe) {
  if (!Array.isArray(danhSachMaDatVe) || danhSachMaDatVe.length === 0) return { daTao: false };

  // Lấy vé đầu tiên để đại diện (lấy thông tin tuyến, giờ đi)
  const veDoc = await db.collection(VEXE_COLLECTION).doc(danhSachMaDatVe[0]).get();
  if (!veDoc.exists) return { daTao: false };
  const ve = veDoc.data();

  // Lấy chi tiết chuyến xe -> Lộ trình
  let tenLoTrinh = 'Đang cập nhật';
  try {
    const cxDoc = await db.collection(CHUYENXE_COLLECTION).doc(ve.maChuyenXe).get();
    if (cxDoc.exists) {
       const ltDoc = await db.collection(LOTRINH_COLLECTION).doc(cxDoc.data().maLoTrinh).get();
       if (ltDoc.exists) tenLoTrinh = `${ltDoc.data().diemKhoiHanh} - ${ltDoc.data().diemKetThuc}`;
    }
  } catch(e) {}

  const maThongBao = `TB_SUCCESS_${danhSachMaDatVe[0]}`;
  await db.collection(THONGBAO_COLLECTION).doc(maThongBao).set({
    maThongBao,
    maKhachHang,
    loai: 'DAT_VE_THANH_CONG',
    danhSachMaDatVe,
    tieuDe: 'Đặt vé thành công',
    noiDung: `Bạn đã thanh toán và đặt vé thành công cho chuyến xe ${tenLoTrinh} khởi hành ngày ${ve.ngayDi}. Cảm ơn bạn đã sử dụng dịch vụ!`,
    daDoc: false,
    thoiGianTao: Timestamp.now(),
  });
  return { daTao: true, maThongBao };
}

// CREATE: thông báo "hủy vé và hoàn tiền thành công"
async function createRefundSuccessNotification(maKhachHang, maDatVe, soTien) {
  if (!maDatVe) return { daTao: false };

  const maThongBao = `TB_REFUND_${maDatVe}`;
  await db.collection(THONGBAO_COLLECTION).doc(maThongBao).set({
    maThongBao,
    maKhachHang,
    loai: 'HUY_VE_THANH_CONG',
    maDatVe,
    tieuDe: 'Hủy vé và hoàn tiền thành công',
    noiDung: `Vé ${maDatVe} của bạn đã được hủy thành công. Số tiền ${soTien.toLocaleString('vi-VN')}đ đã được hoàn lại.`,
    daDoc: false,
    thoiGianTao: Timestamp.now(),
  });
  return { daTao: true, maThongBao };
}

// Lấy danh sách thông báo chung cho Admin (Gom dữ liệu từ VEXE và CHUYENXE_NGAY để giảm truy vấn)
async function listAdminNotifications(limitNum = 3) {
  // 1. Truy vấn 5 vé xe mới nhất (giảm số lượng đọc)
  const veSnap = await db.collection(VEXE_COLLECTION)
    .orderBy('thoiGianDat', 'desc')
    .limit(limitNum + 2)
    .get();

  const dsVe = [];
  for (const doc of veSnap.docs) {
    const ve = doc.data();
    
    // Lấy thông tin khách hàng (tùy chọn, nếu lỗi bỏ qua)
    let tenKH = ve.maKhachHang;
    try {
      const khSnap = await db.collection('KHACHHANG').where('maTaiKhoan', '==', ve.maKhachHang).get();
      if (!khSnap.empty) tenKH = khSnap.docs[0].data().hoTen;
    } catch(e) {}

    // Lấy thông tin tuyến
    let tenLoTrinh = 'Đang cập nhật';
    try {
      const cxDoc = await db.collection(CHUYENXE_COLLECTION).doc(ve.maChuyenXe).get();
      if (cxDoc.exists) {
         const ltDoc = await db.collection(LOTRINH_COLLECTION).doc(cxDoc.data().maLoTrinh).get();
         if (ltDoc.exists) tenLoTrinh = `${ltDoc.data().diemKhoiHanh} - ${ltDoc.data().diemKetThuc}`;
      }
    } catch(e) {}

    dsVe.push({
      maThongBao: `VE_${doc.id}`,
      loai: 'VE_MOI',
      tieuDe: 'Thông báo đặt vé mới',
      noiDung: `Khách hàng: ${tenKH} • Tuyến: ${tenLoTrinh} • Ghế: ${ve.maGheXe || ve.maGhe}`,
      daDoc: false,
      thoiGianTao: ve.thoiGianDat?.toDate?.()?.toISOString() || new Date().toISOString(),
      timestamp: ve.thoiGianDat?.toMillis?.() || Date.now()
    });
  }

  // 2. Truy vấn chuyến xe đã hoàn thành (Lấy 15 chuyến mới nhất, tự lọc trạng thái Xong để không vướng Index Firebase)
  const cxnSnap = await db.collection(CHUYENXE_NGAY_COLLECTION)
    .orderBy('ngayDi', 'desc')
    .limit(15)
    .get();

  const dsCX = [];
  for (const doc of cxnSnap.docs) {
    const cxn = doc.data();
    if (cxn.trangThai === 'Xong' || cxn.trangThai === 'DaHoanThanh') {
      let tenLoTrinh = cxn.maChuyenXe;
      try {
        const cxDoc = await db.collection(CHUYENXE_COLLECTION).doc(cxn.maChuyenXe).get();
        if (cxDoc.exists) {
           const ltDoc = await db.collection(LOTRINH_COLLECTION).doc(cxDoc.data().maLoTrinh).get();
           if (ltDoc.exists) tenLoTrinh = `${ltDoc.data().diemKhoiHanh} - ${ltDoc.data().diemKetThuc}`;
        }
      } catch(e) {}

      const tgiDen = cxn.thoiGianDenDich || cxn.thoiGianXuatPhat;
      dsCX.push({
        maThongBao: `CXN_${doc.id}`,
        loai: 'CHUYEN_XE_HOAN_THANH',
        tieuDe: 'Chuyến xe hoàn thành',
        noiDung: `Mã chuyến: ${cxn.maChuyenXe} • Tuyến: ${tenLoTrinh} • Trạng thái: Đã hoàn thành`,
        daDoc: false,
        thoiGianTao: tgiDen?.toDate?.()?.toISOString() || new Date().toISOString(),
        timestamp: tgiDen?.toMillis?.() || Date.now()
      });
    }
  }

  // Gom dữ liệu từ 2 nguồn và sort tại server (giảm số lần truy vấn client)
  const combined = [...dsVe, ...dsCX].sort((a, b) => b.timestamp - a.timestamp).slice(0, limitNum);
  
  return combined.map(item => {
    delete item.timestamp;
    return item;
  });
}

// READ: danh sách thông báo của khách (tự sinh nhắc chuyến trước khi trả), mới nhất trước
async function listNotifications(maKhachHang) {
  await generateDepartureReminders(maKhachHang);

  const snap = await db.collection(THONGBAO_COLLECTION).where('maKhachHang', '==', maKhachHang).get();
  return snap.docs
    .map((doc) => {
      const tb = doc.data();
      return {
        maThongBao: doc.id,
        loai: tb.loai,
        maDatVe: tb.maDatVe || null,
        danhSachMaDatVe: tb.danhSachMaDatVe || null,
        tieuDe: tb.tieuDe,
        noiDung: tb.noiDung,
        daDoc: !!tb.daDoc,
        thoiGianTao: tb.thoiGianTao?.toDate?.()?.toISOString() || null,
      };
    })
    .sort((a, b) => (b.thoiGianTao || '').localeCompare(a.thoiGianTao || ''));
}

// UPDATE: đánh dấu đã đọc 1 thông báo, hoặc tất cả nếu không truyền maThongBao
async function markAsRead(maKhachHang, maThongBao) {
  if (maThongBao) {
    const doc = await db.collection(THONGBAO_COLLECTION).doc(maThongBao).get();
    if (!doc.exists || doc.data().maKhachHang !== maKhachHang) return 0;
    await doc.ref.update({ daDoc: true });
    return 1;
  }

  const snap = await db.collection(THONGBAO_COLLECTION)
    .where('maKhachHang', '==', maKhachHang)
    .where('daDoc', '==', false)
    .get();
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, { daDoc: true }));
  await batch.commit();
  return snap.size;
}

// DELETE: xóa 1 thông báo, hoặc toàn bộ của khách nếu không truyền maThongBao
async function deleteNotifications(maKhachHang, maThongBao) {
  if (maThongBao) {
    const doc = await db.collection(THONGBAO_COLLECTION).doc(maThongBao).get();
    if (!doc.exists || doc.data().maKhachHang !== maKhachHang) return 0;
    await doc.ref.delete();
    return 1;
  }

  const snap = await db.collection(THONGBAO_COLLECTION).where('maKhachHang', '==', maKhachHang).get();
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

module.exports = { 
  generateDepartureReminders, 
  createPaymentReminder, 
  createBookingSuccessNotification,
  createRefundSuccessNotification,
  listNotifications, 
  markAsRead, 
  deleteNotifications, 
  listAdminNotifications 
};
