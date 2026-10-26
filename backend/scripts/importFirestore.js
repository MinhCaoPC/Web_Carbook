// Nhập dữ liệu từ backend/firestore-backup/*.json vào project Firebase HIỆN TẠI
// (project mà serviceAccountKey.json đang trỏ tới — nhớ thay key sang project MỚI trước khi chạy!).
//
// Cách chạy (từ thư mục backend):
//   node scripts/importFirestore.js
//
// Sau khi import xong, sinh lại lịch chuyến + ghế theo ngày:
//   node scripts/generateDailySchedules.js

const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const IN_DIR = path.join(__dirname, '..', 'firestore-backup');
const BATCH_SIZE = 400; // Firestore giới hạn 500 thao tác / batch

// Khôi phục { __ts: millis } -> Firestore Timestamp (đệ quy)
function deserialize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.__ts === 'number' && Object.keys(value).length === 1) {
      return Timestamp.fromMillis(value.__ts);
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deserialize(v);
    return out;
  }
  if (Array.isArray(value)) return value.map(deserialize);
  return value;
}

async function main() {
  console.log(`Import vào project: ${serviceAccount.project_id}`);
  const files = fs.readdirSync(IN_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error('Không tìm thấy file backup nào trong', IN_DIR);
    process.exit(1);
  }

  let tongDoc = 0;
  for (const file of files) {
    const colName = path.basename(file, '.json');
    const docs = JSON.parse(fs.readFileSync(path.join(IN_DIR, file), 'utf8'));
    const entries = Object.entries(docs);

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const [docId, data] of entries.slice(i, i + BATCH_SIZE)) {
        batch.set(db.collection(colName).doc(docId), deserialize(data));
      }
      await batch.commit();
    }

    tongDoc += entries.length;
    console.log(`✓ ${colName}: ${entries.length} document`);
  }

  console.log(`\nHoàn tất: đã nhập ${tongDoc} document vào ${serviceAccount.project_id}.`);
  console.log('Nhớ chạy tiếp: node scripts/generateDailySchedules.js (sinh lại CHUYENXE_NGAY + GHEXE)');
}

main().then(() => process.exit(0)).catch((err) => { console.error('Lỗi import:', err); process.exit(1); });
