// Test vé NFT + chợ bán lại: thanh toán -> mint, rao bán có giá trần, mua (tiền ví nội + chuyển NFT),
// hoàn tiền khi chuyển NFT lỗi, đổi mã QR, soát vé. Blockchain được giả lập bằng FakeChain (cùng luật
// với TicketNFT/TicketMarket đã kiểm bằng Hardhat). Chạy: npm test
process.env.JWT_SECRET = 'x'.repeat(48);
process.env.NFT_ADDRESS_SECRET = 'test-secret-'.repeat(4); // đặt sẵn để không phụ thuộc backend/.env thật
const path = require('path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const { createFakeDb, stub, createChecker } = require('./fakeFirestore');
const db = createFakeDb();
stub('src/config/firebase.js', { db });
stub('src/config/mailer.js', { sendWithdrawOtpEmail: async () => {}, sendOtpEmail: async () => {} });
stub('src/services/notificationService.js', { createBookingSuccessNotification: async () => {} });
stub('src/services/walletPinService.js', { verifyPin: async (kh, pin) => { if (pin !== '123456') { const e = new Error('Mã PIN không đúng.'); e.statusCode = 400; throw e; } } });
const { check, rejects, failed } = createChecker();
const HOUR = 3600 * 1000;

// ---- Blockchain giả: cùng luật với hợp đồng ----
class FakeChain {
  constructor() { this.tokens = {}; this.listings = {}; this.next = 1; this.failMint = false; this.failBuy = false; this.mintCalls = 0; }
  transferable(t) { return !t.used && Date.now() + 2 * HOUR < t.departure * 1000; }
  async mintTicket(i) {
    this.mintCalls++;
    if (this.failMint) throw new Error('RPC lỗi');
    if (Object.values(this.tokens).some((t) => t.maDatVe === i.maDatVe)) throw new Error('Booking already minted');
    const tokenId = this.next++;
    this.tokens[tokenId] = { tokenId, owner: i.ownerAddress, maDatVe: i.maDatVe, departure: i.departureUnix, facePrice: i.facePrice, used: false };
    return { tokenId, txHash: `0xmint${tokenId}` };
  }
  async burnTicket(id) { delete this.tokens[id]; return { txHash: `0xburn${id}` }; }
  async markUsed(id) { if (this.tokens[id].used) throw new Error('Ticket already used'); this.tokens[id].used = true; return { txHash: `0xuse${id}` }; }
  async getTicket(id) { const t = this.tokens[id]; if (!t) throw new Error('ERC721NonexistentToken'); return { ...t }; }
  async list(id, seller, price) {
    const t = this.tokens[id];
    if (t.owner !== seller) throw new Error('Not ticket owner');
    if (price > (t.facePrice * 11000) / 10000) throw new Error('Price above cap');
    if (!this.transferable(t)) throw new Error('Ticket not transferable');
    this.listings[id] = { seller, price }; return { txHash: `0xlist${id}` };
  }
  async cancelListing(id, seller) { if (!this.listings[id] || this.listings[id].seller !== seller) throw new Error('Not your listing'); delete this.listings[id]; return { txHash: `0xcancel${id}` }; }
  async buy(id, buyer) {
    if (this.failBuy) throw new Error('RPC lỗi khi mua');
    const l = this.listings[id]; if (!l) throw new Error('Not listed');
    if (!this.transferable(this.tokens[id])) throw new Error('Ticket not transferable');
    delete this.listings[id]; this.tokens[id].owner = buyer; return { txHash: `0xbuy${id}` };
  }
}

const ts = (ms) => ({ toDate: () => new Date(ms), toMillis: () => ms });

(async () => {
  const chain = new FakeChain();
  const nft = require(root + '/src/services/ticketNftService.js');
  nft.datRepoChoTest(chain);
  const market = require(root + '/src/services/ticketMarketService.js');
  const { thanhToan } = require(root + '/src/services/ticketPaymentService.js');
  const { diaChiNftCuaTaiKhoan } = require(root + '/src/utils/nftAddress.js');
  const { RepositoryFactory } = require(root + '/src/repositories/index.ts');
  const wallets = RepositoryFactory.getWalletRepository();

  // ---- Dữ liệu nền ----
  const dep = Date.now() + 24 * HOUR;
  const ngay = new Date(dep).toISOString().slice(0, 10);
  db._store.LOTRINH = { LT1: { tenLoTrinh: 'Cần Thơ - Cà Mau', diemKhoiHanh: 'Cần Thơ', diemKetThuc: 'Cà Mau' } };
  db._store.CHUYENXE = { CX1: { maLoTrinh: 'LT1', thoiGianXuatPhat: ts(dep) } };
  db._store.CHUYENXE_NGAY = { [`CX1_${ngay}`]: { thoiGianXuatPhat: ts(dep) } };
  db._store.KHACHHANG = { KH1: { maTaiKhoan: 'TK1', hoTen: 'An', sdt: '0900000001' }, KH2: { maTaiKhoan: 'TK2', hoTen: 'Bình', sdt: '0900000002' } };
  db._store.TAIKHOAN = { TK1: { email: 'a@x.vn' }, TK2: { email: 'b@x.vn' } };
  const viA = (await wallets.createWallet('TK1')).walletAddress; db._store.TAIKHOAN.TK1.walletAddress = viA;
  const viB = (await wallets.createWallet('TK2')).walletAddress; db._store.TAIKHOAN.TK2.walletAddress = viB;
  await wallets.mint(viA, 500000); await wallets.mint(viB, 500000);
  const giuCho = (id, ghe) => {
    (db._store.VEXE ||= {})[id] = { maNhomDat: 'NHOM1', maKhachHang: 'KH1', maChuyenXe: 'CX1', ngayDi: ngay, maGhe: ghe, thanhTien: 200000, giaVeGoc: 200000, trangThaiVe: 'GIU_CHO', hetHanGiuVe: ts(Date.now() + 10 * 60 * 1000), hoTenHanhKhach: 'An' };
    (db._store.GHEXE ||= {})[`CX1_${ngay}_${ghe}`] = { trangThai: 'GIU' };
  };
  giuCho('VE1', 'A01'); giuCho('VE2', 'A02');
  const doiMint = async (id) => { for (let i = 0; i < 50; i++) { if (db._store.VEXE[id].nftStatus === 'DA_MINT' || db._store.VEXE[id].nftStatus === 'MINT_LOI') return; await new Promise((r) => setTimeout(r, 10)); } };

  // ---- 1. Thanh toán -> mint NFT ----
  const kq = await thanhToan({ maKhachHang: 'KH1', danhSachMaDatVe: ['VE1', 'VE2'], phuongThucTT: 'CARBOOKPAY', maPin: '123456' });
  check('thanh toán 2 vé bằng ví nội thành công', kq.thanhCong && kq.tongTien === 400000, JSON.stringify(kq));
  check('ví A bị trừ 400.000', (await wallets.getBalance(viA)) === 100000);
  await doiMint('VE1'); await doiMint('VE2');
  const v1 = db._store.VEXE.VE1;
  check('mỗi vé có 1 NFT, trạng thái DA_MINT', v1.nftStatus === 'DA_MINT' && db._store.VEXE.VE2.nftStatus === 'DA_MINT' && Object.keys(chain.tokens).length === 2);
  check('chủ NFT là địa chỉ lưu ký suy ra từ tài khoản TK1', chain.tokens[v1.nftTokenId].owner === diaChiNftCuaTaiKhoan('TK1'));
  check('địa chỉ lưu ký khác nhau giữa 2 tài khoản & tất định', diaChiNftCuaTaiKhoan('TK1') !== diaChiNftCuaTaiKhoan('TK2') && diaChiNftCuaTaiKhoan('TK1') === diaChiNftCuaTaiKhoan('TK1'));
  await nft.mintVe('VE1');
  check('mint lại cùng vé không tạo NFT thứ hai (idempotent)', chain.mintCalls === 2);

  // ---- 2. Rao bán ----
  check('người không phải chủ vé không rao bán được', /không phải vé của bạn/.test((await rejects(market.raoBan({ maKhachHang: 'KH2', maDatVe: 'VE1', gia: 100000 }))) || ''));
  check('giá vượt 110% giá gốc bị từ chối (tối đa 220.000đ)', /220\.000/.test((await rejects(market.raoBan({ maKhachHang: 'KH1', maDatVe: 'VE1', gia: 220001 }))) || ''));
  check('giá không hợp lệ (âm/chữ) bị từ chối', !!(await rejects(market.raoBan({ maKhachHang: 'KH1', maDatVe: 'VE1', gia: -5 }))) && !!(await rejects(market.raoBan({ maKhachHang: 'KH1', maDatVe: 'VE1', gia: 'abc' }))));
  const rb = await market.raoBan({ maKhachHang: 'KH1', maDatVe: 'VE1', gia: 220000 });
  check('rao bán đúng giá trần (220.000) thành công', rb.thanhCong && db._store.VEXE.VE1.dangRaoBan === true && chain.listings[v1.nftTokenId].price === 220000);
  check('không rao bán hai lần', /đang được rao bán/.test((await rejects(market.raoBan({ maKhachHang: 'KH1', maDatVe: 'VE1', gia: 100000 }))) || ''));
  const ds = await market.danhSachRaoBan({ maKhachHang: 'KH2' });
  check('chợ liệt kê tin rao, có tuyến + giá', ds.length === 1 && ds[0].gia === 220000 && ds[0].tenLoTrinh === 'Cần Thơ - Cà Mau' && !ds[0].laCuaToi);
  check('đánh dấu tin của chính mình', (await market.danhSachRaoBan({ maKhachHang: 'KH1' }))[0].laCuaToi === true);

  // ---- Hủy vé khi đang rao bán bị chặn (PaymentController.cancelTicket) ----
  const { PaymentController } = require(root + '/src/controllers/paymentController.ts');
  const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const rs = mkRes(); await PaymentController.cancelTicket({ body: { ticketId: 'VE1' }, maKhachHangDangNhap: 'KH1' }, rs);
  check('đang rao bán thì không hủy vé được (409)', rs.code === 409, JSON.stringify(rs.body));

  // ---- 3. Mua vé ----
  check('sai PIN không mua được', /PIN/.test((await rejects(market.muaVe({ maKhachHang: 'KH2', maDatVe: 'VE1', maPin: '000000' }))) || ''));
  check('không tự mua vé của mình', /chính mình/.test((await rejects(market.muaVe({ maKhachHang: 'KH1', maDatVe: 'VE1', maPin: '123456' }))) || ''));

  // 3a. người mua không đủ tiền
  await wallets.burn(viB, 499000); // còn 1.000
  const eNo = await rejects(market.muaVe({ maKhachHang: 'KH2', maDatVe: 'VE1', maPin: '123456' }));
  check('mua không đủ tiền -> báo số dư không đủ', /số dư/i.test(eNo || ''), eNo);
  check('mua lỗi tiền: tin rao quay lại DANG_BAN, NFT chưa đổi chủ', db._store.RAOBAN_VE.VE1.trangThai === 'DANG_BAN' && chain.tokens[v1.nftTokenId].owner === diaChiNftCuaTaiKhoan('TK1'));
  await wallets.mint(viB, 499000);

  // 3b. chuyển NFT lỗi -> hoàn tiền
  const truocA = await wallets.getBalance(viA), truocB = await wallets.getBalance(viB);
  chain.failBuy = true;
  const eChain = await rejects(market.muaVe({ maKhachHang: 'KH2', maDatVe: 'VE1', maPin: '123456' }));
  chain.failBuy = false;
  check('chuyển NFT lỗi -> báo lỗi & đã hoàn tiền', /hoàn lại/.test(eChain || ''), eChain);
  check('sau hoàn tác: ví người mua/bán về đúng số cũ', (await wallets.getBalance(viB)) === truocB && (await wallets.getBalance(viA)) === truocA, `${await wallets.getBalance(viA)}/${await wallets.getBalance(viB)}`);
  check('sau hoàn tác: tin rao còn DANG_BAN', db._store.RAOBAN_VE.VE1.trangThai === 'DANG_BAN');

  // 3c. mua thành công
  const qrCu = db._store.VEXE.VE1.maQR;
  const mua = await market.muaVe({ maKhachHang: 'KH2', maDatVe: 'VE1', maPin: '123456' });
  check('mua thành công', mua.thanhCong && mua.gia === 220000 && mua.hoaHong === 11000, JSON.stringify(mua));
  check('người mua −220.000', (await wallets.getBalance(viB)) === truocB - 220000);
  check('người bán +209.000 (trừ 5% hoa hồng)', (await wallets.getBalance(viA)) === truocA + 209000);
  check('ví nhà xe nhận 11.000 hoa hồng', (await wallets.getBalance('VI-NHAXE')) === 11000);
  const v1sau = db._store.VEXE.VE1;
  check('NFT đổi chủ sang tài khoản người mua', chain.tokens[v1.nftTokenId].owner === diaChiNftCuaTaiKhoan('TK2') && v1sau.nftOwner === diaChiNftCuaTaiKhoan('TK2'));
  check('vé chuyển sang KH2, hết rao bán, thông tin hành khách đổi', v1sau.maKhachHang === 'KH2' && !v1sau.dangRaoBan && v1sau.hoTenHanhKhach === 'Bình' && v1sau.maKhachHangCu === 'KH1');
  check('mã QR được cấp lại (mã cũ vô hiệu)', v1sau.maQR && v1sau.maQR !== qrCu);
  check('tin rao DA_BAN, ghi lịch sử chuyển nhượng', db._store.RAOBAN_VE.VE1.trangThai === 'DA_BAN' && Object.keys(db._store.LICHSU_CHUYENNHUONG).length === 1);
  check('không mua lần hai (tin đã bán)', /không còn được rao bán/.test((await rejects(market.muaVe({ maKhachHang: 'KH2', maDatVe: 'VE1', maPin: '123456' }))) || ''));

  // ---- 4. Soát vé ----
  check('QR cũ của người bán không còn dùng được', /không tồn tại/.test((await rejects(nft.checkIn(qrCu))) || ''));
  check('chưa tới giờ soát (xe chạy sau 24h) -> từ chối', /Chưa đến giờ/.test((await rejects(nft.checkIn(v1sau.maQR))) || ''));
  // dời giờ xe lại gần để vào khung soát vé
  const gan = Date.now() + 1 * HOUR; db._store.CHUYENXE_NGAY[`CX1_${ngay}`].thoiGianXuatPhat = ts(gan);
  chain.tokens[v1.nftTokenId].owner = '0xkẻgian'; // giả lập lệch chủ NFT giữa chain và hệ thống
  check('chủ NFT trên chain lệch hệ thống -> từ chối soát vé', /không khớp/.test((await rejects(nft.checkIn(v1sau.maQR))) || ''));
  chain.tokens[v1.nftTokenId].owner = diaChiNftCuaTaiKhoan('TK2');
  const ci = await nft.checkIn(v1sau.maQR);
  check('soát vé thành công: vé DA_SU_DUNG, NFT used', ci.thanhCong && db._store.VEXE.VE1.trangThaiVe === 'DA_SU_DUNG' && chain.tokens[v1.nftTokenId].used);
  check('soát vé lần 2 bị từ chối', /đã được dùng/.test((await rejects(nft.checkIn(v1sau.maQR))) || ''));
  check('vé đã dùng không rao bán được', !!(await rejects(market.raoBan({ maKhachHang: 'KH2', maDatVe: 'VE1', gia: 100000 }))));

  // ---- 5. Hủy vé -> đốt NFT ----
  const r = await nft.dotNftVe('VE2');
  check('đốt NFT khi hủy/hoàn vé', r.daDot && !chain.tokens[db._store.VEXE.VE2.nftTokenId] && db._store.VEXE.VE2.nftStatus === 'DA_DOT');

  // ---- 6. Mint lỗi -> thử lại ----
  giuCho('VE3', 'A03'); db._store.VEXE.VE3.maNhomDat = 'NHOM3';
  chain.failMint = true;
  await wallets.mint(viA, 300000);
  await thanhToan({ maKhachHang: 'KH1', danhSachMaDatVe: ['VE3'], phuongThucTT: 'CARBOOKPAY', maPin: '123456' });
  await doiMint('VE3');
  check('mint lỗi: vé vẫn thanh toán xong (DA_TT) nhưng đánh dấu MINT_LOI', db._store.VEXE.VE3.trangThaiVe === 'DA_TT' && db._store.VEXE.VE3.nftStatus === 'MINT_LOI');
  check('vé chưa có NFT thì chưa rao bán được', /chưa có NFT/.test((await rejects(market.raoBan({ maKhachHang: 'KH1', maDatVe: 'VE3', gia: 100000 }))) || ''));
  chain.failMint = false;
  await nft.thuLaiMintLoi();
  check('thử lại mint lỗi thành công', db._store.VEXE.VE3.nftStatus === 'DA_MINT' && !!db._store.VEXE.VE3.nftTokenId);

  // ---- 7. NFT tắt (chưa cấu hình) thì thanh toán vẫn chạy ----
  nft.datRepoChoTest(null);
  const r2 = await nft.mintVe('VE3');
  check('NFT chưa cấu hình: các hàm bỏ qua êm, không lỗi', r2.boQua === true || r2.loai === 'da-co');

  console.log(failed() ? `\n${failed()} test FAIL` : '\nTất cả test vé NFT đều PASS');
  process.exit(failed() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
