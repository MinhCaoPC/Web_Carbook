const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('../config/firebase');

const TIMKIEM_COLLECTION = 'TIMKIEM_GANDAY';
const SO_LUOT_TOI_DA = 10; // mỗi khách chỉ giữ tối đa 10 tuyến tìm gần nhất

// Doc ID theo (khách, tuyến): tìm lại cùng tuyến chỉ cập nhật bản ghi cũ, không nhân bản
function taoDocId(maKhachHang, diemDi, diemDen) {
  const slug = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, '-');
  return `${maKhachHang}_${slug(diemDi)}_${slug(diemDen)}`;
}

// CREATE/UPDATE: lưu 1 lượt tìm kiếm, sau đó cắt bớt bản ghi cũ nhất nếu vượt giới hạn
async function luuTimKiem(maKhachHang, { diemDi, diemDen, ngayDi, ngayVe, soLuongVe }) {
  const docRef = db.collection(TIMKIEM_COLLECTION).doc(taoDocId(maKhachHang, diemDi, diemDen));
  await docRef.set({
    maKhachHang,
    diemDi,
    diemDen,
    ngayDi,
    ngayVe: ngayVe || null,
    soLuongVe: soLuongVe || 1,
    thoiGianTimKiem: FieldValue.serverTimestamp(),
  });

  const snapshot = await db.collection(TIMKIEM_COLLECTION).where('maKhachHang', '==', maKhachHang).get();
  if (snapshot.size <= SO_LUOT_TOI_DA) return;

  // Sắp theo thời gian tăng dần rồi xóa phần dôi ra ở đầu (cũ nhất)
  const docs = snapshot.docs
    .map((doc) => ({ ref: doc.ref, thoiGian: doc.data().thoiGianTimKiem?.toMillis?.() || 0 }))
    .sort((a, b) => a.thoiGian - b.thoiGian);

  const batch = db.batch();
  docs.slice(0, docs.length - SO_LUOT_TOI_DA).forEach(({ ref }) => batch.delete(ref));
  await batch.commit();
}

// READ: danh sách tìm kiếm gần đây của 1 khách, mới nhất trước
async function layTimKiemGanDay(maKhachHang) {
  const snapshot = await db.collection(TIMKIEM_COLLECTION).where('maKhachHang', '==', maKhachHang).get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        diemDi: data.diemDi,
        diemDen: data.diemDen,
        ngayDi: data.ngayDi,
        ngayVe: data.ngayVe || null,
        soLuongVe: data.soLuongVe || 1,
        thoiGianTimKiem: data.thoiGianTimKiem?.toDate?.()?.toISOString() || null,
      };
    })
    .sort((a, b) => (b.thoiGianTimKiem || '').localeCompare(a.thoiGianTimKiem || ''));
}

// DELETE: xóa toàn bộ lịch sử của 1 khách (nút "Xóa lịch sử")
async function xoaTimKiemGanDay(maKhachHang) {
  const snapshot = await db.collection(TIMKIEM_COLLECTION).where('maKhachHang', '==', maKhachHang).get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snapshot.size;
}

module.exports = { luuTimKiem, layTimKiemGanDay, xoaTimKiemGanDay };
