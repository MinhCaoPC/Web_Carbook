// Thu hẹp dữ liệu chuyến xe về khu vực MIỀN TÂY (xem src/utils/mekong.js).
//   node scripts/narrowToMekong.js            -> chỉ IN kế hoạch (không ghi gì)
//   node scripts/narrowToMekong.js --apply    -> ghi vào Firestore
// - Lộ trình ngoài phạm vi: LOTRINH.trangThai = 'NgungHoatDong' (không còn hiện khi tìm chuyến)
// - Mỗi tuyến giữ tối đa MEKONG_TRIPS_PER_ROUTE chuyến (mặc định 2); chuyến dư: CHUYENXE.trangThai = 'Huy'
// - Vé đã bán cho chuyến cũ vẫn hợp lệ (không xoá CHUYENXE_NGAY / GHEXE / VEXE).
// Chạy lại được nhiều lần (idempotent); chạy sau đó `node scripts/generateDailySchedules.js` để sinh lịch mới.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { db } = require('../src/config/firebase');
const { laLoTrinhMienTay, chonChuyenMoiTuyen, soChuyenMoiTuyen } = require('../src/utils/mekong');

(async () => {
  const apply = process.argv.includes('--apply');
  const [lotrinhSnap, chuyenSnap] = await Promise.all([db.collection('LOTRINH').get(), db.collection('CHUYENXE').get()]);

  const tuyenGiu = new Set();
  const tuyenBo = [];
  lotrinhSnap.forEach((d) => (laLoTrinhMienTay(d.data()) ? tuyenGiu.add(d.id) : tuyenBo.push(`${d.id} ${d.data().tenLoTrinh}`)));

  const chuyenTrongPhamVi = chuyenSnap.docs
    .filter((d) => tuyenGiu.has(d.data().maLoTrinh))
    .map((d) => ({ id: d.id, ...d.data() }));
  const chuyenGiu = new Set(chonChuyenMoiTuyen(chuyenTrongPhamVi).map((t) => t.id));

  console.log(`Lộ trình: giữ ${tuyenGiu.size}, loại ${tuyenBo.length}`);
  tuyenBo.forEach((t) => console.log('  - loại:', t));
  console.log(`Chuyến mẫu: giữ ${chuyenGiu.size}/${chuyenSnap.size} (tối đa ${soChuyenMoiTuyen()} chuyến/tuyến)`);

  if (!apply) { console.log('\n(Chế độ xem thử — thêm --apply để ghi vào Firestore.)'); process.exit(0); }

  const thaoTac = [];
  lotrinhSnap.forEach((d) => thaoTac.push([d.ref, { trangThai: tuyenGiu.has(d.id) ? 'HoatDong' : 'NgungHoatDong' }]));
  chuyenSnap.forEach((d) => {
    const trangThai = chuyenGiu.has(d.id) ? (d.data().trangThai === 'Huy' ? 'SapChay' : d.data().trangThai) : 'Huy';
    if (trangThai !== d.data().trangThai) thaoTac.push([d.ref, { trangThai }]);
  });
  for (let i = 0; i < thaoTac.length; i += 400) {
    const batch = db.batch();
    thaoTac.slice(i, i + 400).forEach(([ref, data]) => batch.update(ref, data));
    await batch.commit();
  }
  console.log(`✓ Đã cập nhật ${thaoTac.length} document.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
