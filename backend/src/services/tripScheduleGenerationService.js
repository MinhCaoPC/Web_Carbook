// Sinh "chuyến theo ngày" (CHUYENXE_NGAY) + bộ ghế (GHEXE) cho cửa sổ N ngày tới — bản tối ưu quota:
// dùng chung bởi cron trong server.js (tự động mỗi ngày) VÀ scripts/generateDailySchedules.js
// (chạy tay khi cần, ví dụ đổi lịch trình rồi muốn sinh lại ngay).
//
// Tối ưu so với bản cũ (bản cũ mỗi lần chạy tốn ~25-30k lượt ĐỌC vì quét toàn bộ GHEXE của từng chuyến):
// 1. Layout ghế được cache vào XE.danhSachMaGhe (tự migrate lần chạy đầu) — các lần sau 0 lượt đọc thêm.
// 2. Dò ngày còn thiếu bằng 1 query/ngày trên CHUYENXE_NGAY — chạy hằng ngày thì thường chỉ
//    sinh thêm ĐÚNG 1 ngày mới (~192 chuyến + ~6.5k ghế ghi) thay vì đụng cả 4 ngày.
// 3. Xóa GHEXE của các ngày ĐÃ QUA (quota xóa của Firestore tính riêng, không ăn quota ghi).
//
// An toàn khi chạy lại nhiều lần: (chuyến, ngày) đã sinh sẽ bỏ qua, không reset ghế đã đặt.

const { db } = require('../config/firebase');
const { Timestamp } = require('firebase-admin/firestore');
const { layDanhSachNgayChoPhep, ghepNgayGio } = require('../utils/schedule');

const BATCH_SIZE = 400;

async function ghiBatch(danhSachThaoTac, kieu = 'set') {
  for (let i = 0; i < danhSachThaoTac.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const item of danhSachThaoTac.slice(i, i + BATCH_SIZE)) {
      if (kieu === 'delete') batch.delete(item.ref);
      else batch.set(item.ref, item.data);
    }
    await batch.commit();
  }
}

// Lấy layout ghế của 1 xe — ưu tiên cache trên XE.danhSachMaGhe (0 lượt đọc thêm);
// chưa có thì đọc GHEXE_MAU 1 lần rồi lưu cache lại cho các lần sau.
async function layLayoutGhe(maXe, xeData, chuyenDaiDien) {
  if (Array.isArray(xeData.danhSachMaGhe) && xeData.danhSachMaGhe.length > 0) {
    return xeData.danhSachMaGhe;
  }

  let maGheList = [];
  const mauSnap = await db.collection('GHEXE_MAU').where('maXe', '==', maXe).get();
  if (!mauSnap.empty) {
    maGheList = [...new Set(mauSnap.docs.map((d) => d.data().maGhe))];
  } else if (chuyenDaiDien) {
    // Fallback dữ liệu rất cũ: đọc GHEXE theo 1 chuyến đại diện (chỉ xảy ra 1 lần rồi được cache)
    const gheSnap = await db.collection('GHEXE').where('maChuyenXe', '==', chuyenDaiDien).get();
    maGheList = [...new Set(gheSnap.docs.map((d) => d.data().maGhe))];
  }

  if (maGheList.length > 0) {
    await db.collection('XE').doc(maXe).update({ danhSachMaGhe: maGheList }).catch(() => {});
  }
  return maGheList;
}

async function generateDailySchedules({ xoaCaLich = false } = {}) {
  const danhSachNgay = layDanhSachNgayChoPhep();
  const homNay = danhSachNgay[0];
  console.log(`[Lịch chuyến xe] Cửa sổ ${danhSachNgay.length} ngày: ${danhSachNgay.join(', ')}`);

  // 1. Đọc chuyến mẫu + xe
  const [chuyenXeSnap, xeSnap] = await Promise.all([
    db.collection('CHUYENXE').where('trangThai', '!=', 'Huy').get(),
    db.collection('XE').get(),
  ]);
  const xeById = {};
  xeSnap.forEach((doc) => (xeById[doc.id] = doc.data()));
  console.log(`[Lịch chuyến xe] ${chuyenXeSnap.size} chuyến mẫu, ${xeSnap.size} xe.`);

  // 2. Dò (chuyến, ngày) còn thiếu: 1 query/ngày thay vì 1 lượt đọc/cặp
  const daCoTheoNgay = {};
  for (const ngay of danhSachNgay) {
    const snap = await db.collection('CHUYENXE_NGAY').where('ngayDi', '==', ngay).get();
    daCoTheoNgay[ngay] = new Set(snap.docs.map((d) => d.data().maChuyenXe));
  }

  // 3. Sinh phần còn thiếu (chạy hằng ngày thì thường chỉ là 1 ngày mới nhất)
  const layoutCache = {};
  let soChuyenNgayMoi = 0;
  let soGheMoi = 0;

  for (const chuyenXeDoc of chuyenXeSnap.docs) {
    const maChuyenXe = chuyenXeDoc.id;
    const chuyenXe = chuyenXeDoc.data();

    const ngayThieu = danhSachNgay.filter((ngay) => !daCoTheoNgay[ngay].has(maChuyenXe));
    if (ngayThieu.length === 0) continue;

    if (!layoutCache[chuyenXe.maXe]) {
      layoutCache[chuyenXe.maXe] = await layLayoutGhe(chuyenXe.maXe, xeById[chuyenXe.maXe] || {}, maChuyenXe);
    }
    const danhSachMaGhe = layoutCache[chuyenXe.maXe];
    if (danhSachMaGhe.length === 0) {
      console.warn(`[Lịch chuyến xe]   Bỏ qua ${maChuyenXe}: không tìm thấy layout ghế cho xe ${chuyenXe.maXe}.`);
      continue;
    }

    const gioXuatPhatMau = chuyenXe.thoiGianXuatPhat.toDate();
    const thoiLuongMs = chuyenXe.thoiGianDenDich.toDate().getTime() - gioXuatPhatMau.getTime();

    for (const ngayDi of ngayThieu) {
      const thoiGianXuatPhat = ghepNgayGio(ngayDi, gioXuatPhatMau);
      const thaoTac = [
        {
          ref: db.collection('CHUYENXE_NGAY').doc(`${maChuyenXe}_${ngayDi}`),
          data: {
            maChuyenXe,
            ngayDi,
            thoiGianXuatPhat: Timestamp.fromDate(thoiGianXuatPhat),
            thoiGianDenDich: Timestamp.fromDate(new Date(thoiGianXuatPhat.getTime() + thoiLuongMs)),
            soGheConTrong: danhSachMaGhe.length,
            trangThai: 'SapChay',
          },
        },
        ...danhSachMaGhe.map((maGhe) => ({
          ref: db.collection('GHEXE').doc(`${maChuyenXe}_${ngayDi}_${maGhe}`),
          data: { maChuyenXe, ngayDi, maGhe, trangThai: 'TRONG', hetHanGiu: null },
        })),
      ];
      await ghiBatch(thaoTac);
      soChuyenNgayMoi++;
      soGheMoi += danhSachMaGhe.length;
    }
  }
  console.log(`[Lịch chuyến xe] Sinh mới: ${soChuyenNgayMoi} chuyến-ngày, ${soGheMoi} ghế.`);

  // 4. Dọn ngày đã qua: xóa GHEXE cũ (quota xóa riêng của Firestore, không tốn quota ghi).
  //    GHEXE mẫu cũ không có trường ngayDi nên không bao giờ bị query này đụng tới.
  const gheCuSnap = await db.collection('GHEXE').where('ngayDi', '<', homNay).get();
  await ghiBatch(gheCuSnap.docs.map((d) => ({ ref: d.ref })), 'delete');
  console.log(`[Lịch chuyến xe] Đã xóa ${gheCuSnap.size} ghế của các ngày trước ${homNay}.`);

  if (xoaCaLich) {
    const lichCuSnap = await db.collection('CHUYENXE_NGAY').where('ngayDi', '<', homNay).get();
    await ghiBatch(lichCuSnap.docs.map((d) => ({ ref: d.ref })), 'delete');
    console.log(`[Lịch chuyến xe] Đã xóa ${lichCuSnap.size} CHUYENXE_NGAY cũ (--xoa-ca-lich).`);
  } else {
    console.log('[Lịch chuyến xe] Giữ lại CHUYENXE_NGAY cũ để lịch sử vé hiển thị đúng giờ đi.');
  }

  console.log('[Lịch chuyến xe] Hoàn tất.');
  return { soChuyenNgayMoi, soGheMoi, ngayDaXoaGhe: gheCuSnap.size };
}

module.exports = { generateDailySchedules };
