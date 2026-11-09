const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

// Băm mật khẩu / mã PIN bằng scrypt với salt ngẫu nhiên cho từng giá trị.
// Định dạng lưu: scrypt$<N>$<r>$<p>$<salt hex>$<hash hex>  (tự mô tả tham số để sau này tăng độ khó
// mà không làm hỏng hash cũ).
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
const PREFIX = 'scrypt';

async function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = await scrypt(String(plain), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [PREFIX, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('hex'), derived.toString('hex')].join('$');
}

// Hash cũ của hệ thống: SHA-256 không salt = đúng 64 ký tự hex.
function isLegacySha256(stored) {
  return typeof stored === 'string' && /^[a-f0-9]{64}$/i.test(stored);
}

function safeEqualHex(aHex, bHex) {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// So khớp mật khẩu với giá trị đã lưu. Trả về { ok, needsUpgrade }:
//  - ok: mật khẩu đúng
//  - needsUpgrade: giá trị đang lưu là SHA-256 cũ -> nơi gọi nên băm lại bằng hashPassword()
//    rồi ghi đè (di trú dần khi người dùng đăng nhập, không cần reset hàng loạt).
async function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return { ok: false, needsUpgrade: false };

  if (stored.startsWith(`${PREFIX}$`)) {
    const [, n, r, p, saltHex, hashHex] = stored.split('$');
    if (!saltHex || !hashHex) return { ok: false, needsUpgrade: false };
    const derived = await scrypt(String(plain), Buffer.from(saltHex, 'hex'), hashHex.length / 2, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    return { ok: safeEqualHex(derived.toString('hex'), hashHex), needsUpgrade: false };
  }

  if (isLegacySha256(stored)) {
    const legacy = crypto.createHash('sha256').update(String(plain)).digest('hex');
    const ok = safeEqualHex(legacy, stored.toLowerCase());
    return { ok, needsUpgrade: ok };
  }

  return { ok: false, needsUpgrade: false };
}

module.exports = { hashPassword, verifyPassword };
