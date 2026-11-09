// Test middleware xác thực token (không cần Firestore/blockchain). Chạy: npm test
const express = require('express');
// Firestore giả: auth.js nạp config/firebase.js, test này không được cần serviceAccountKey.json thật
require('./fakeFirestore').stub('src/config/firebase.js', { db: require('./fakeFirestore').createFakeDb() });
const { requireAdmin, requireAuth, requireSelfAccount } = require('../src/middlewares/auth');
const { signToken } = require('../src/utils/authToken');
const jwt = require('jsonwebtoken');

const app = express(); app.use(express.json());
app.get('/admin', requireAdmin, (q, r) => r.json({ ok: true }));
app.get('/me', requireAuth, (q, r) => r.json({ ok: true, who: q.auth }));
app.get('/acct/:id', requireSelfAccount('id'), (q, r) => r.json({ ok: true }));
const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, headers = {}) => (await fetch(base + path, { headers })).status;
  const kh = signToken({ maTaiKhoan: 'TK1', role: 'KH' });
  const ad = signToken({ maTaiKhoan: 'TK9', role: 'AD' });
  const forged = jwt.sign({ role: 'AD' }, 'wrong-secret-wrong-secret-wrong-secret', { subject: 'TK1', issuer: 'carbook-backend' });
  const noneAlg = jwt.sign({ role: 'AD' }, '', { algorithm: 'none', subject: 'TK1', issuer: 'carbook-backend' });
  const expired = jwt.sign({ role: 'AD' }, 'x'.repeat(40), { subject: 'TK1', issuer: 'carbook-backend', expiresIn: -10 });
  const B = (t) => ({ Authorization: `Bearer ${t}` });
  const rows = [
    ['admin: no token (want 401)', await call('/admin'), 401],
    ['admin: legacy x-ma-khach-hang header only (want 401)', await call('/admin', { 'x-ma-khach-hang': 'KH1' }), 401],
    ['admin: customer token (want 403)', await call('/admin', B(kh)), 403],
    ['admin: forged AD token wrong secret (want 401)', await call('/admin', B(forged)), 401],
    ['admin: alg=none token (want 401)', await call('/admin', B(noneAlg)), 401],
    ['admin: expired token (want 401)', await call('/admin', B(expired)), 401],
    ['admin: valid admin token (want 200)', await call('/admin', B(ad)), 200],
    ['me: valid customer (want 200)', await call('/me', B(kh)), 200],
    ['acct/TK1 own (want 200)', await call('/acct/TK1', B(kh)), 200],
    ['acct/TK2 other user (want 403)', await call('/acct/TK2', B(kh)), 403],
    ['acct/TK2 as admin (want 200)', await call('/acct/TK2', B(ad)), 200],
  ];
  let bad = 0;
  for (const [n, got, want] of rows) { const ok = got === want; if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', n, '->', got); }
  srv.close(); process.exit(bad ? 1 : 0);
});
