// Test ví nội Firestore: nạp/rút, thanh toán vé, hoàn tiền, chống double-spend, chuyển tiền nguyên tử. Chạy: npm test
const path = require('path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const { createFakeDb, stub, createChecker } = require('./fakeFirestore');
const db = createFakeDb();
stub('src/config/firebase.js', { db });
const { check, rejects, failed } = createChecker();

(async () => {
  const { RepositoryFactory } = require(root + '/src/repositories/index.ts');
  const ledger = require(root + '/src/repositories/firestore/walletLedger.ts');
  const wallets = RepositoryFactory.getWalletRepository();
  const payments = RepositoryFactory.getPaymentRepository();
  const refunds = RepositoryFactory.getRefundRepository();
  // Gọi thẳng repository thanh toán (phần của ví nội) để test không phụ thuộc service của vai B
  const payService = payments;

  // ---- Tạo ví ----
  const w1 = await wallets.createWallet('TK1');
  const w1b = await wallets.createWallet('TK1');
  check('mỗi tài khoản đúng một ví (gọi lại trả ví cũ)', w1.walletAddress === w1b.walletAddress && /^VI[0-9A-F]{12}$/.test(w1.walletAddress), w1.walletAddress);
  const A = w1.walletAddress;
  const B = (await wallets.createWallet('TK2')).walletAddress;
  check('ví mới có số dư 0', (await wallets.getBalance(A)) === 0);
  check('getWalletByUserId đúng', (await wallets.getWalletByUserId('TK2')) === B);
  check('walletExists', (await wallets.walletExists(A)) && !(await wallets.walletExists('VIKHONGCO')));

  // ---- Nạp / rút ----
  await wallets.mint(A, 100000);
  check('nạp 100.000 -> số dư 100.000', (await wallets.getBalance(A)) === 100000);
  check('nạp số tiền âm bị chặn', /non-zero|positive/i.test(await rejects(wallets.mint(A, 0)) || '') );
  check('rút quá số dư bị chặn, số dư giữ nguyên',
    /Insufficient balance/.test(await rejects(wallets.burn(A, 100001)) || '') && (await wallets.getBalance(A)) === 100000);
  await wallets.burn(A, 10000);
  check('rút 10.000 -> còn 90.000', (await wallets.getBalance(A)) === 90000);

  // ---- Thanh toán vé ----
  const p1 = await payService.payForTicket('NHOM1', A, 60000);
  check('thanh toán 60.000 thành công, trả mã giao dịch', p1.status === 'SUCCESS' && p1.txHash === 'PAY_NHOM1', JSON.stringify(p1));
  check('số dư còn 30.000', (await wallets.getBalance(A)) === 30000);
  const e1 = await rejects(payService.payForTicket('NHOM1', A, 1000));
  check('cùng khóa thanh toán không trả hai lần', /Payment already exists/.test(e1 || ''), e1);
  check('lần trả trùng không trừ thêm tiền', (await wallets.getBalance(A)) === 30000);
  const e2 = await rejects(payService.payForTicket('NHOM2', A, 30001));
  check('không đủ tiền -> Insufficient balance', /Insufficient balance/.test(e2 || ''), e2);
  check('thanh toán lỗi không để lại bản ghi thanh toán mồ côi', !(db._store.THANHTOAN_VI || {}).NHOM2);
  const e3 = await rejects(payService.payForTicket('NHOM3', 'VIKHONGCO', 1000));
  check('ví không tồn tại -> Wallet not found', /Wallet not found/.test(e3 || ''), e3);

  // ---- Chống double-spend khi nhiều request đồng thời ----
  await wallets.mint(B, 100000);
  const kq = await Promise.allSettled([1, 2, 3, 4, 5, 6].map((i) => payService.payForTicket(`DONG${i}`, B, 30000)));
  const ok = kq.filter((r) => r.status === 'fulfilled').length;
  check('6 request × 30.000 trên ví 100.000: đúng 3 thành công', ok === 3, `thành công ${ok}`);
  check('số dư ví không âm, còn 10.000', (await wallets.getBalance(B)) === 10000, await wallets.getBalance(B));

  // ---- Hoàn tiền ----
  const r1 = await refunds.refundTicket('NHOM1', 'VE1', A, 21000); // 70% của 30.000
  check('hoàn 21.000 thành công', r1.status === 'SUCCESS' && (await wallets.getBalance(A)) === 51000);
  check('hoàn cùng mã vé hai lần bị chặn', /already exists/.test((await rejects(refunds.refundTicket('NHOM1', 'VE1', A, 1000))) || ''));
  check('hoàn vượt số đã trả bị chặn', /exceeds/.test((await rejects(refunds.refundTicket('NHOM1', 'VE2', A, 40000))) || ''));
  check('hoàn vào ví người khác bị chặn', /another wallet/.test((await rejects(refunds.refundTicket('NHOM1', 'VE3', B, 1000))) || ''));
  check('hoàn cho thanh toán không có thật bị chặn', /Payment not found/.test((await rejects(refunds.refundTicket('NHOMMA', 'VE4', A, 1000))) || ''));
  check('số dư không đổi sau các lần hoàn bị chặn', (await wallets.getBalance(A)) === 51000);
  await refunds.refundTicket('NHOM1', 'VE5', A, 39000); // đủ 60.000 tổng
  check('hoàn đủ số đã trả -> thanh toán chuyển REFUNDED', (await payments.getPayment('NHOM1')).status === 'REFUNDED');

  // ---- Lịch sử + sổ cái khớp số dư ----
  const lsTT = await payments.getPaymentHistory(A);
  const lsHoan = await refunds.getRefundHistory(A);
  check('lịch sử thanh toán/hoàn tiền đọc từ sổ cái', lsTT.length === 1 && lsHoan.length === 2 && lsTT[0].amount === 60000, JSON.stringify({ lsTT, lsHoan }));
  const tong = (id) => Object.values(db._store.GIAODICH_VI).filter((g) => g.walletId === id).reduce((s, g) => s + g.soTien, 0);
  check('tổng sổ cái = số dư (ví A)', tong(A) === (await wallets.getBalance(A)), `${tong(A)} vs ${await wallets.getBalance(A)}`);
  check('tổng sổ cái = số dư (ví B)', tong(B) === (await wallets.getBalance(B)));

  // ---- Chuyển tiền nguyên tử (chợ vé) ----
  const C = (await wallets.createWallet('TK3')).walletAddress;
  const nhaXe = await ledger.damBaoViNhaXe();
  const truoc = [await wallets.getBalance(A), await wallets.getBalance(C), await wallets.getBalance(nhaXe)];
  const eg = await rejects(ledger.chuyenTien({ walletId: C, loai: 'MUA_VE_LAI' }, [{ walletId: A, soTien: 9500, loai: 'BAN_VE_LAI' }, { walletId: nhaXe, soTien: 500, loai: 'HOA_HONG' }], 'T1'));
  check('người mua không đủ tiền -> không ví nào đổi', /Insufficient/.test(eg || '') && (await wallets.getBalance(A)) === truoc[0] && (await wallets.getBalance(nhaXe)) === truoc[2]);
  await wallets.mint(C, 20000);
  await ledger.chuyenTien({ walletId: C, loai: 'MUA_VE_LAI' }, [{ walletId: A, soTien: 9500, loai: 'BAN_VE_LAI' }, { walletId: nhaXe, soTien: 500, loai: 'HOA_HONG' }], 'T2');
  check('chuyển 10.000: người mua −10.000, bán +9.500, nhà xe +500',
    (await wallets.getBalance(C)) === 10000 && (await wallets.getBalance(A)) === truoc[0] + 9500 && (await wallets.getBalance(nhaXe)) === 500);

  // ---- Khóa số dư ----
  await wallets.lockBalance(C, 4000);
  check('khóa 4.000 -> khả dụng 6.000', (await wallets.getAvailableBalance(C)) === 6000);
  check('không tiêu được phần đang khóa', /Insufficient/.test((await rejects(wallets.burn(C, 7000))) || ''));
  await wallets.unlockBalance(C, 4000);
  check('mở khóa -> khả dụng 10.000', (await wallets.getAvailableBalance(C)) === 10000);

  console.log(failed() ? `\n${failed()} test FAIL` : '\nTất cả test ví nội đều PASS');
  process.exit(failed() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
