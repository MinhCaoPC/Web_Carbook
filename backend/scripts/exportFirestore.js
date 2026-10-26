// Xuất toàn bộ Firestore ra file JSON để chuyển sang project Firebase khác.
//
// Cách chạy (từ thư mục backend, khi serviceAccountKey.json còn trỏ PROJECT CŨ):
//   node scripts/exportFirestore.js                # bỏ qua GHEXE + CHUYENXE_NGAY (sinh lại được)
//   node scripts/exportFirestore.js --all          # xuất tất cả (tốn nhiều lượt đọc!)
//
// Kết quả: backend/firestore-backup/<TênCollection>.json
// Timestamp được mã hóa dạng { __ts: <millis> } để import khôi phục đúng kiểu.

const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Hai bảng nặng nhất (~18k docs) — sinh lại bằng scripts/generateDailySchedules.js nên mặc định bỏ qua
const SKIP_DEFAULT = ['GHEXE', 'CHUYENXE_NGAY'];
const exportAll = process.argv.includes('--all');

const OUT_DIR = path.join(__dirname, '..', 'firestore-backup');

// Đổi Firestore Timestamp -> { __ts: millis } (đệ quy cho object/array lồng nhau)
function serialize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value.toMillis === 'function' && typeof value.toDate === 'function') {
    return { __ts: value.toMillis() };
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const collections = await db.listCollections();
  let tongDoc = 0;

  for (const col of collections) {
    if (!exportAll && SKIP_DEFAULT.includes(col.id)) {
      console.log(`- Bỏ qua ${col.id} (sinh lại bằng generateDailySchedules.js)`);
      continue;
    }

    const snap = await col.get();
    const docs = {};
    snap.forEach((doc) => (docs[doc.id] = serialize(doc.data())));

    fs.writeFileSync(path.join(OUT_DIR, `${col.id}.json`), JSON.stringify(docs, null, 1));
    tongDoc += snap.size;
    console.log(`✓ ${col.id}: ${snap.size} document`);
  }

  console.log(`\nHoàn tất: ${tongDoc} document -> ${OUT_DIR}`);
  console.log('Bước tiếp theo: thay serviceAccountKey.json bằng key của PROJECT MỚI rồi chạy scripts/importFirestore.js');
}

main().then(() => process.exit(0)).catch((err) => { console.error('Lỗi export:', err); process.exit(1); });
