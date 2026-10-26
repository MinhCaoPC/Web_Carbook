const functions = require('firebase-functions');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

// Chạy mỗi 1 phút, quét GHEXE đang DANG_GIU và hetHanGiu < now
// -> reset về TRONG, tăng soGheConTrong tương ứng
exports.nhaGheHetHan = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
  const now = Timestamp.now();
  const gheHetHanSnap = await db.collection('GHEXE')
    .where('trangThai', '==', 'DANG_GIU')
    .where('hetHanGiu', '<', now)
    .get();

  if (gheHetHanSnap.empty) {
    console.log('Không có ghế nào hết hạn giữ.');
    return null;
  }

  // Gom số ghế hết hạn theo từng (chuyến, ngày) để cộng lại soGheConTrong của đúng CHUYENXE_NGAY
  // (ghế lặp lại mỗi ngày nên phải cộng đúng ngày, không cộng nhầm sang CHUYENXE mẫu dùng chung)
  const soGheHetHanTheoChuyenNgay = new Map();
  for (const doc of gheHetHanSnap.docs) {
    const { maChuyenXe, ngayDi } = doc.data();
    const key = `${maChuyenXe}_${ngayDi}`;
    soGheHetHanTheoChuyenNgay.set(key, (soGheHetHanTheoChuyenNgay.get(key) || 0) + 1);
  }

  const BATCH_SIZE = 400;
  const docs = gheHetHanSnap.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);
    for (const doc of chunk) {
      batch.update(doc.ref, { trangThai: 'TRONG', hetHanGiu: null });
    }
    await batch.commit();
  }

  const chuyenXeNgayEntries = [...soGheHetHanTheoChuyenNgay.entries()];
  for (let i = 0; i < chuyenXeNgayEntries.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = chuyenXeNgayEntries.slice(i, i + BATCH_SIZE);
    for (const [maChuyenXeNgay, soLuong] of chunk) {
      batch.update(db.collection('CHUYENXE_NGAY').doc(maChuyenXeNgay), {
        soGheConTrong: FieldValue.increment(soLuong)
      });
    }
    await batch.commit();
  }

  console.log(`Đã nhả ${gheHetHanSnap.size} ghế hết hạn giữ.`);

  // Đồng bộ VEXE: các vé GIU_CHO mà hetHanGiuVe đã qua -> chuyển HUY
  const veHetHanSnap = await db.collection('VEXE')
    .where('trangThaiVe', '==', 'GIU_CHO')
    .where('hetHanGiuVe', '<', now)
    .get();

  if (!veHetHanSnap.empty) {
    const veDocs = veHetHanSnap.docs;
    for (let i = 0; i < veDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = veDocs.slice(i, i + BATCH_SIZE);
      for (const doc of chunk) {
        batch.update(doc.ref, { trangThaiVe: 'HUY' });
      }
      await batch.commit();
    }
    console.log(`Đã huỷ ${veHetHanSnap.size} vé hết hạn giữ chỗ.`);
  }

  return null;
});
