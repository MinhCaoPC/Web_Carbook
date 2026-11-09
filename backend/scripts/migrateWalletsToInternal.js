// Chuyển tài khoản đang giữ ví blockchain cũ (walletAddress dạng 0x…) sang ví nội Firestore (VI…).
//   npx tsx scripts/migrateWalletsToInternal.js                      -> chỉ IN kế hoạch
//   npx tsx scripts/migrateWalletsToInternal.js --apply              -> tạo ví nội, cập nhật TAIKHOAN
//   npx tsx scripts/migrateWalletsToInternal.js --apply --balances so-du.json
//        so-du.json = { "0xdiaChiCu": 150000, ... }  -> cộng số dư cũ vào ví mới (ghi vào sổ cái, loại NAP)
// Chạy lại được nhiều lần: tài khoản đã có ví nội (VI…) thì bỏ qua. Địa chỉ cũ được giữ ở TAIKHOAN.viBlockchainCu.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { db } = require('../src/config/firebase');
const { RepositoryFactory } = require('../src/repositories/index.ts');

(async () => {
  const apply = process.argv.includes('--apply');
  const bi = process.argv.indexOf('--balances');
  const soDuCu = bi > -1 ? JSON.parse(fs.readFileSync(process.argv[bi + 1], 'utf8')) : {};
  const wallets = RepositoryFactory.getWalletRepository();

  const snap = await db.collection('TAIKHOAN').get();
  const can = snap.docs.filter((d) => /^0x/i.test(String(d.data().walletAddress || '')));
  console.log(`Tài khoản có ví blockchain cũ: ${can.length}/${snap.size}`);
  if (!apply) { can.forEach((d) => console.log('  -', d.id, d.data().walletAddress, 'số dư cũ:', soDuCu[d.data().walletAddress] ?? 0)); console.log('\n(Xem thử — thêm --apply để ghi.)'); process.exit(0); }

  for (const d of can) {
    const cu = d.data().walletAddress;
    const { walletAddress } = await wallets.createWallet(d.id);
    await d.ref.update({ walletAddress, walletStatus: 'ACTIVE', viBlockchainCu: cu, ngayCapNhat: new Date() });
    const so = Math.floor(Number(soDuCu[cu] || 0));
    if (so > 0) await wallets.mint(walletAddress, so);
    console.log(`✓ ${d.id}: ${cu} -> ${walletAddress}${so > 0 ? ` (+${so}đ)` : ''}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
