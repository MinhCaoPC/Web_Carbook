// Backfill XE.soTang cho các xe được seed từ trước khi createVehicle() ghi field này (xem
// xe.service.js createVehicle — chỉ set soTang cho xe TẠO MỚI qua form, xe cũ chưa có).
// An toàn chạy lại nhiều lần: chỉ cập nhật xe đang thiếu field, lấy soTang từ MAUSODOGHE
// tương ứng với maMauSoDo của từng xe.
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const [xeSnap, mauSnap] = await Promise.all([
    db.collection('XE').get(),
    db.collection('MAUSODOGHE').get(),
  ]);

  const mauSoTangMap = {};
  mauSnap.forEach((doc) => {
    mauSoTangMap[doc.id] = doc.data().soTang;
  });

  const missing = xeSnap.docs.filter((d) => d.data().soTang === undefined);
  console.log(`${missing.length}/${xeSnap.size} xe thiếu soTang.`);

  let updated = 0;
  let skipped = 0;
  const batch = db.batch();
  for (const doc of missing) {
    const maMauSoDo = doc.data().maMauSoDo;
    const soTang = mauSoTangMap[maMauSoDo];
    if (soTang === undefined) {
      console.warn(`  Bỏ qua ${doc.id}: không tìm thấy mẫu sơ đồ ghế "${maMauSoDo}".`);
      skipped++;
      continue;
    }
    batch.update(doc.ref, { soTang });
    updated++;
  }

  if (updated > 0) await batch.commit();
  console.log(`Đã cập nhật ${updated} xe, bỏ qua ${skipped} xe.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi khi backfill soTang:', err);
    process.exit(1);
  });
