const path = require('path');
const xlsx = require('xlsx');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Đọc dữ liệu từ file Excel, trả về mảng object (row đầu là tên cột)
function readExcel(fileName) {
  const filePath = path.join(__dirname, fileName);
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { raw: false, defval: null });
}

// Parse chuỗi ngày dạng "YYYY-MM-DD HH:mm:ss" thành Firestore Timestamp
function toTimestamp(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Timestamp.fromDate(date);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number(value);
}

// Ghi một mảng document vào 1 collection theo lô (Firestore giới hạn 500 op/batch)
async function seedCollection(collectionName, rows, idField, mapper) {
  const BATCH_SIZE = 400;
  let count = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const row of chunk) {
      const docId = row[idField];
      if (!docId) continue;
      const ref = db.collection(collectionName).doc(docId);
      batch.set(ref, mapper(row));
      count++;
    }

    await batch.commit();
    console.log(`  ...${collectionName}: đã nạp ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }

  console.log(`Hoàn tất bảng ${collectionName}: ${count} document.`);
}

async function seedXe() {
  const rows = readExcel('XE_Data_Fixed.xlsx');
  await seedCollection('XE', rows, 'maXe', (row) => ({
    bienSoXe: row.bienSoXe,
    tenLoaiXe: row.tenLoaiXe,
    tongSoGhe: toNumber(row.tongSoGhe),
    trangThaiXe: row.trangThaiXe
  }));
}

async function seedLoTrinh() {
  const rows = readExcel('LOTRINH_Data_Fixed.xlsx');
  await seedCollection('LOTRINH', rows, 'maLoTrinh', (row) => ({
    tenLoTrinh: row.tenLoTrinh,
    diemKhoiHanh: row.diemKhoiHanh,
    diemKetThuc: row.diemKetThuc,
    quangDuongKm: toNumber(row.quangDuongKm),
    thoiGianDuKien: toNumber(row.thoiGianDuKien),
    trangThai: row.trangThai
  }));
}

async function seedChuyenXe() {
  const rows = readExcel('CHUYENXE_Data_Fixed.xlsx');
  await seedCollection('CHUYENXE', rows, 'maChuyenXe', (row) => ({
    maLoTrinh: row.maLoTrinh,
    maXe: row.maXe,
    thoiGianXuatPhat: toTimestamp(row.thoiGianXuatPhat),
    thoiGianDenDich: toTimestamp(row.thoiGianDenDich),
    giaVe: toNumber(row.giaVe),
    soGheConTrong: toNumber(row.soGheConTrong),
    trangThai: row.trangThai
  }));
}

async function seedGheXe() {
  const rows = readExcel('GHEXE_Data_Fixed.xlsx');
  await seedCollection('GHEXE', rows, 'maGheXe', (row) => ({
    maChuyenXe: row.maChuyenXe,
    maGhe: row.maGhe,
    trangThai: row.trangThai
  }));
}

async function seedDiemTrungChuyen() {
  const rows = readExcel('DIEMTRUNGCHUYEN_Data_Fixed.xlsx');
  await seedCollection('DIEMTRUNGCHUYEN', rows, 'maDiem', (row) => ({
    maLoTrinh: row.maLoTrinh,
    tenDiem: row.tenDiem,
    diaChiChiTiet: row.diaChiChiTiet,
    khuVuc: row.khuVuc,
    tinhThanh: row.tinhThanh,
    sdt: row.sdt,
    loaiDiem: row.loaiDiem
  }));
}

async function insertData() {
  console.log("Bắt đầu nạp dữ liệu từ Excel lên Firebase...");

  // Thứ tự nạp tôn trọng quan hệ khóa ngoại: XE, LOTRINH trước CHUYENXE;
  // CHUYENXE trước GHEXE; LOTRINH trước DIEMTRUNGCHUYEN
  await seedXe();
  await seedLoTrinh();
  await seedChuyenXe();
  await seedGheXe();
  await seedDiemTrungChuyen();

  console.log("Hoàn tất! Hãy mở Firebase Console để xem kết quả.");
}

insertData().catch((err) => {
  console.error("Lỗi khi nạp dữ liệu:", err);
  process.exit(1);
});
