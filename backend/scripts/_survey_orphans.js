const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const [tkSnap, khSnap] = await Promise.all([
    db.collection('TAIKHOAN').get(),
    db.collection('KHACHHANG').get(),
  ]);

  const validTaiKhoanIds = new Set(tkSnap.docs.map((d) => d.id));
  const khDocs = khSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const orphanKH = khDocs.filter((kh) => kh.maTaiKhoan && !validTaiKhoanIds.has(kh.maTaiKhoan));
  const validKhachHangIds = new Set(khDocs.filter((kh) => !kh.maTaiKhoan || validTaiKhoanIds.has(kh.maTaiKhoan)).map((kh) => kh.id));

  console.log(`TAIKHOAN hợp lệ: ${validTaiKhoanIds.size}`);
  console.log(`KHACHHANG: ${khSnap.size} tổng, ${orphanKH.length} mồ côi (maTaiKhoan không còn tồn tại).`);
  orphanKH.forEach((kh) => console.log(`  - ${kh.id} (maTaiKhoan=${kh.maTaiKhoan}, hoTen=${kh.hoTen})`));

  // Với mỗi collection, so khớp maKhachHang với CẢ 2 không gian id (KHACHHANG hợp lệ VÀ
  // TAIKHOAN hợp lệ) để không nhầm khi 1 số nơi trong code lỡ lưu nhầm id loại khác.
  const collectionsToCheck = ['VEXE', 'HOADON', 'YEUCAUHOTRO', 'TIMKIEM_GANDAY', 'THONGBAO', 'DON_TT_VE', 'GIAODICH_CANXULY'];

  console.log('\n--- Đối chiếu maKhachHang (thử cả không gian id KHACHHANG lẫn TAIKHOAN) ---');
  for (const name of collectionsToCheck) {
    const snap = await db.collection(name).get();
    let matchAsKH = 0, matchAsTK = 0, orphan = 0, missing = 0;
    const orphanSample = [];
    snap.docs.forEach((doc) => {
      const val = doc.data().maKhachHang;
      if (!val) { missing++; return; }
      if (validKhachHangIds.has(val)) { matchAsKH++; return; }
      if (validTaiKhoanIds.has(val)) { matchAsTK++; return; }
      orphan++;
      if (orphanSample.length < 5) orphanSample.push(`${doc.id} (maKhachHang=${val})`);
    });
    console.log(`${name}: ${snap.size} tổng | khớp KHACHHANG hợp lệ: ${matchAsKH} | khớp TAIKHOAN hợp lệ: ${matchAsTK} | MỒ CÔI THẬT: ${orphan} | thiếu field: ${missing}`);
    if (orphanSample.length > 0) console.log(`  Mẫu mồ côi: ${orphanSample.join(', ')}`);
  }

  console.log('\n--- WALLET_KEYS theo walletAddress (đối chiếu TAIKHOAN.walletAddress) ---');
  const validWalletAddresses = new Set(
    tkSnap.docs.map((d) => d.data().walletAddress).filter(Boolean).map((w) => w.toLowerCase())
  );
  const wkSnap = await db.collection('WALLET_KEYS').get();
  let orphanWK = 0;
  const orphanWkSample = [];
  wkSnap.docs.forEach((doc) => {
    const addr = (doc.data().walletAddress || doc.id).toLowerCase();
    if (!validWalletAddresses.has(addr)) {
      orphanWK++;
      if (orphanWkSample.length < 10) orphanWkSample.push(doc.id);
    }
  });
  console.log(`WALLET_KEYS: ${wkSnap.size} tổng, ${orphanWK} không khớp walletAddress tài khoản nào còn tồn tại.`);
  if (orphanWkSample.length > 0) console.log(`  Mẫu: ${orphanWkSample.join(', ')}`);

  console.log('\nHoàn tất (không có thay đổi nào được ghi).');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi khảo sát:', err.message);
    process.exit(1);
  });
