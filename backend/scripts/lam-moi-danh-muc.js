// Đọc lại danh mục (lộ trình, chuyến, xe, sơ đồ ghế) từ Firebase và ghi đè du-lieu/danh-muc.json.
// Chạy khi bạn vừa sửa dữ liệu chuyến xe trên Firebase Console.
//
//   npm run lam-moi-danh-muc
const path = require('path');
const { CAU_HINH } = require('../src/cau-hinh');
const { KhoLuuTruFirestore } = require('../src/kho-du-lieu/kho-luu-tru-firestore');
const { KhoDanhMuc } = require('../src/kho-du-lieu/kho-danh-muc');

(async () => {
  const kho = new KhoDanhMuc(new KhoLuuTruFirestore(CAU_HINH.fileKhoaFirebase), {
    fileDanhMuc: path.join(CAU_HINH.thuMucDuLieu, 'danh-muc.json'),
    soGioLamMoi: CAU_HINH.soGioLamMoiDanhMuc,
    soChuyenMoiTuyen: CAU_HINH.soChuyenMoiTuyen,
  });
  await kho.taiDuLieu(true);
  console.log(`Có ${kho.danhSachLoTrinh().length} lộ trình miền Tây, ${kho.danhSachChuyenMau().length} chuyến được bán mỗi ngày.`);
  process.exit(0);
})().catch((loi) => {
  console.error('❌', loi.message);
  process.exit(1);
});
