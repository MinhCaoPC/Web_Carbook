// Test rút tiền OTP + quyền hủy vé với Firestore giả. Chạy: npm test
const path = require('path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const { FieldValue } = require('firebase-admin/firestore');

// ---- Firestore giả (đủ cho withdraw/cancel) ----
const store = {};
const isInc = (v) => v && v.constructor && /Increment/i.test(v.constructor.name);
const applyUpdate = (cur, patch) => { const n = { ...cur }; for (const [k, v] of Object.entries(patch)) {
  if (isInc(v)) n[k] = (n[k] || 0) + (v.operand ?? v._operand ?? 1);
  else if (v && v.constructor && /Delete/i.test(v.constructor.name)) delete n[k];
  else n[k] = v; } return n; };
const wrapDate = (o) => { const r = { ...o }; for (const k of Object.keys(r)) if (r[k] instanceof Date) { const d = r[k]; r[k] = { toDate: () => d }; } return r; };
const docRef = (c, id) => ({
  id,
  async get() { const d = (store[c] || {})[id]; return { exists: !!d, id, data: () => d }; },
  async set(v) { (store[c] ||= {})[id] = wrapDate(v); },
  async update(p) { store[c][id] = wrapDate(applyUpdate(store[c][id], p)); },
});
const fakeDb = {
  collection: (c) => ({ doc: (id) => docRef(c, id) }),
  async runTransaction(fn) { return fn({ async get(ref) { return ref.get(); }, update(ref, p) { return ref.update(p); } }); },
};
const sent = [];
const stub = (rel, exports) => { const f = require.resolve(path.join(root, rel)); require.cache[f] = { id: f, filename: f, loaded: true, exports, children: [], paths: [] }; };
stub('src/config/firebase.js', { db: fakeDb });
stub('src/config/mailer.js', { sendWithdrawOtpEmail: async (email, otp) => { sent.push({ email, otp }); }, sendOtpEmail: async () => {} });

(async () => {
  const { PaymentController } = require(root + '/src/controllers/paymentController.ts');
  const { TokenService } = require(root + '/src/services/tokenService.ts');
  const { VirtualBankService } = require(root + '/src/services/virtualBankService.ts');
  let burns = 0;
  TokenService.prototype.withdraw = async () => { burns++; return { txHash: '0xBURN' }; };
  VirtualBankService.transferVND = async () => ({ success: true, transactionId: 'BANK1' });
  // số dư ví giả: repository của controller
  const { RepositoryFactory } = require(root + '/src/repositories/index.ts');
  RepositoryFactory.getWalletRepository().getAvailableBalance = async () => 1_000_000;

  store.TAIKHOAN = { TKA: { email: 'a@x.vn' }, TKB: { email: 'b@x.vn' } };
  const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const call = async (fn, req) => { const res = mkRes(); await fn(req, res); return res; };
  const A = { auth: { maTaiKhoan: 'TKA', role: 'KH' } }, B = { auth: { maTaiKhoan: 'TKB', role: 'KH' } };
  let bad = 0; const check = (n, ok, extra = '') => { if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', n, extra); };

  const mkReq = () => call(PaymentController.withdrawRequest, { ...A, body: { userWallet: '0xW', amount: 50000, bankName: 'VCB', bankAccount: '123', bankAccountName: 'A' } });

  let r = await mkReq();
  const wid = r.body.withdrawId; const otp = sent.at(-1).otp;
  check('request tạo yêu cầu, OTP gửi tới email chủ tài khoản', r.code === 200 && sent.at(-1).email === 'a@x.vn');
  check('OTP KHÔNG lưu thô trong DB', !JSON.stringify(store.YEUCAURUTTIEN[wid]).includes(otp) && !!store.YEUCAURUTTIEN[wid].otpHash);
  r = await call(PaymentController.withdrawRequest, { ...A, body: { userWallet: '0xW', amount: 10.5, bankName: 'V', bankAccount: '1', bankAccountName: 'A' } });
  check('số tiền lẻ bị từ chối', r.code === 400);

  const wrong = otp === '123456' ? '654321' : '123456';
  r = await call(PaymentController.withdrawConfirm, { ...A, body: { withdrawId: wid, otp: wrong } });
  check('OTP sai 6 ký tự (đường bypass cũ) bị từ chối', r.code === 400 && burns === 0, `code=${r.code}`);
  check('đếm lần sai', store.YEUCAURUTTIEN[wid].otpAttempts === 1);

  r = await call(PaymentController.withdrawConfirm, { ...B, body: { withdrawId: wid, otp } });
  check('tài khoản khác dùng đúng OTP vẫn bị chặn (403)', r.code === 403 && burns === 0);

  r = await call(PaymentController.withdrawConfirm, { ...A, body: { withdrawId: wid, otp } });
  check('đúng chủ + đúng OTP -> rút thành công, burn 1 lần', r.code === 200 && burns === 1 && store.YEUCAURUTTIEN[wid].status === 'SUCCESS', `code=${r.code} ${r.body?.message}`);

  r = await call(PaymentController.withdrawConfirm, { ...A, body: { withdrawId: wid, otp } });
  check('dùng lại OTP/ yêu cầu đã xong bị từ chối, không burn lần 2', r.code === 400 && burns === 1);

  r = await mkReq(); const wid2 = r.body.withdrawId; const otp2 = sent.at(-1).otp;
  const wrong2 = otp2 === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) r = await call(PaymentController.withdrawConfirm, { ...A, body: { withdrawId: wid2, otp: wrong2 } });
  check('sai 5 lần -> yêu cầu bị khóa FAILED', store.YEUCAURUTTIEN[wid2].status === 'FAILED');
  r = await call(PaymentController.withdrawConfirm, { ...A, body: { withdrawId: wid2, otp: otp2 } });
  check('khóa rồi thì đúng OTP cũng không rút được', r.code === 400 && burns === 1);

  // ---- cancel vé: chủ vé ----
  store.VEXE = { V1: { maKhachHang: 'KH_A', trangThaiVe: 'DA_TT', maChuyenXe: 'CX1' } };
  r = await call(PaymentController.cancelTicket, { maKhachHangDangNhap: 'KH_B', body: { ticketId: 'V1' } });
  check('người không phải chủ vé hủy vé -> 403, vé giữ nguyên DA_TT', r.code === 403 && store.VEXE.V1.trangThaiVe === 'DA_TT', `code=${r.code}`);

  console.log(bad ? `\n${bad} FAILED` : '\nALL PASS'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
