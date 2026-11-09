// Test băm mật khẩu/PIN (scrypt có salt + tương thích hash SHA-256 cũ). Chạy: npm test
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('../src/utils/passwordHash');

(async () => {
  const hash = await hashPassword('abc123');
  const legacy = crypto.createHash('sha256').update('abc123').digest('hex');
  const rows = [
    ['đúng mật khẩu', (await verifyPassword('abc123', hash)).ok],
    ['sai mật khẩu', !(await verifyPassword('sai', hash)).ok],
    ['hash scrypt không cần nâng cấp', !(await verifyPassword('abc123', hash)).needsUpgrade],
    ['hash SHA-256 cũ vẫn đăng nhập được và được đánh dấu nâng cấp', (await verifyPassword('abc123', legacy)).needsUpgrade === true],
    ['hash SHA-256 cũ + sai mật khẩu bị từ chối', !(await verifyPassword('sai', legacy)).ok],
    ['salt khác nhau: cùng mật khẩu ra hash khác nhau', hash !== (await hashPassword('abc123'))],
    ['giá trị rỗng/không hợp lệ bị từ chối', !(await verifyPassword('a', undefined)).ok],
  ];
  let bad = 0;
  for (const [name, ok] of rows) { if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', name); }
  process.exit(bad ? 1 : 0);
})();
