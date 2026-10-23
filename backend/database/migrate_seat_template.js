// Sinh bảng mẫu ghế GHEXE_MAU (1 layout ghế cho mỗi chiếc XE, dùng chung mọi ngày/chuyến)
// từ dữ liệu GHEXE cũ (đang mapping 1-1 theo CHUYENXE). Chạy 1 lần duy nhất sau khi đã seed().
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  console.log('Đang đọc CHUYENXE để tìm 1 chuyến đại diện cho mỗi xe...');
  const chuyenXeSnap = await db.collection('CHUYENXE').get();

  const chuyenXeByXe = {}; // maXe -> maChuyenXe đại diện
  chuyenXeSnap.forEach((doc) => {
    const { maXe } = doc.data();
    if (maXe && !chuyenXeByXe[maXe]) {
      chuyenXeByXe[maXe] = doc.id;
    }
  });

  const xeIds = Object.keys(chuyenXeByXe);
  console.log(`Tìm thấy ${xeIds.length} xe. Đang tạo layout ghế mẫu...`);

  let total = 0;
  for (const maXe of xeIds) {
    const maChuyenXe = chuyenXeByXe[maXe];
    const gheSnap = await db.collection('GHEXE').where('maChuyenXe', '==', maChuyenXe).get();

    const batch = db.batch();
    gheSnap.forEach((doc) => {
      const { maGhe } = doc.data();
      if (!maGhe) return;
      const ref = db.collection('GHEXE_MAU').doc(`${maXe}_${maGhe}`);
      batch.set(ref, { maXe, maGhe });
      total++;
    });
    await batch.commit();
    console.log(`  ...${maXe}: ${gheSnap.size} ghế`);
  }

  console.log(`Hoàn tất! Đã tạo ${total} document trong GHEXE_MAU.`);
}

run().catch((err) => {
  console.error('Lỗi khi tạo layout ghế mẫu:', err);
  process.exit(1);
});
