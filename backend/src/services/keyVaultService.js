// "KMS-lite": mã hóa và lưu trữ private key ví của khách theo mô hình envelope encryption
// (cùng nguyên lý AWS KMS / Vault — dữ liệu mã hóa bằng master key, master key giữ ngoài DB).
// - Thuật toán: AES-256-GCM (có xác thực toàn vẹn, chống sửa trộm ciphertext).
// - Master key: biến môi trường WALLET_MASTER_KEY (production thì chuyển vào AWS KMS/Vault,
//   code chỉ cần đổi chỗ lấy key — phần còn lại giữ nguyên).
// - Private key KHÔNG BAO GIỜ trả ra qua API; chỉ backend giải mã khi cần ký giao dịch thay khách.
const crypto = require('crypto');
const { db } = require('../config/firebase');

const KEY_COLLECTION = 'WALLET_KEYS';
const ALGORITHM = 'aes-256-gcm';

function layMasterKey() {
  const hex = (process.env.WALLET_MASTER_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('WALLET_MASTER_KEY chưa cấu hình (cần 64 ký tự hex — tạo bằng: openssl rand -hex 32).');
  }
  return Buffer.from(hex, 'hex');
}

// Mã hóa private key -> { ciphertext, iv, authTag } (hex)
function encryptPrivateKey(privateKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, layMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

// Giải mã (chỉ backend dùng nội bộ khi cần ký thay khách)
function decryptPrivateKey({ ciphertext, iv, authTag }) {
  const decipher = crypto.createDecipheriv(ALGORITHM, layMasterKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8');
}

// CREATE: mã hóa + lưu private key của ví mới tạo
async function storeEncryptedKey(walletAddress, privateKey) {
  const encrypted = encryptPrivateKey(privateKey);
  await db.collection(KEY_COLLECTION).doc(walletAddress.toLowerCase()).set({
    walletAddress,
    algorithm: ALGORITHM,
    ...encrypted,
    createdAt: new Date(),
  });
}

// READ (nội bộ): lấy và giải mã private key theo địa chỉ ví
async function getDecryptedKey(walletAddress) {
  const doc = await db.collection(KEY_COLLECTION).doc(walletAddress.toLowerCase()).get();
  if (!doc.exists) return null;
  return decryptPrivateKey(doc.data());
}

// ===== Mã khôi phục ví ("Wallet Recovery Code") =====
// KHÔNG PHẢI private key blockchain thật — đây là một bí mật riêng do hệ thống tự sinh,
// chỉ dùng để chứng minh quyền sở hữu ví khi khách muốn liên kết lại ví cũ vào 1 tài khoản
// khác (vd: mất quyền truy cập tài khoản trước đó). Vì private key thật chưa bao giờ được
// trả ra ngoài API (và cũng không dùng để ký giao dịch — mọi giao dịch on-chain do backend
// relayer ký), dùng mã riêng này để tránh phải phơi bày private key thật ra client.
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm: 0,O,1,I,L
const RECOVERY_CODE_LENGTH = 20; // ~ 100 bit entropy, đủ chống brute-force

function chuanHoaMaKhoiPhuc(ma) {
  return String(ma || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function taoMaKhoiPhuc() {
  const bytes = crypto.randomBytes(RECOVERY_CODE_LENGTH);
  let raw = '';
  for (const b of bytes) raw += RECOVERY_CODE_ALPHABET[b % RECOVERY_CODE_ALPHABET.length];
  return raw.match(/.{1,4}/g).join('-'); // định dạng dễ đọc/gõ tay: XXXX-XXXX-...
}

function hashMaKhoiPhuc(ma) {
  return crypto.createHash('sha256').update(chuanHoaMaKhoiPhuc(ma)).digest('hex');
}

// Sinh mã khôi phục mới (ghi đè mã cũ nếu có) cho 1 ví, trả về mã THÔ để hiển thị đúng 1 lần.
// Gọi lúc: (1) kích hoạt ví lần đầu, (2) ngay sau khi liên kết lại thành công (xoay mã cũ vì
// mã cũ đã được nhập/truyền đi nên coi như có thể đã lộ).
async function taoVaLuuMaKhoiPhuc(walletAddress) {
  const maKhoiPhuc = taoMaKhoiPhuc();
  await db.collection(KEY_COLLECTION).doc(walletAddress.toLowerCase()).set(
    { recoveryCodeHash: hashMaKhoiPhuc(maKhoiPhuc), recoveryCodeUpdatedAt: new Date() },
    { merge: true }
  );
  return maKhoiPhuc;
}

// So khớp mã khôi phục khách nhập với hash đã lưu (constant-time, chống timing attack).
// Trả về địa chỉ ví ĐÚNG CASING đã lưu (checksummed) nếu khớp, null nếu sai địa chỉ/mã.
async function xacThucMaKhoiPhuc(walletAddress, maKhoiPhuc) {
  const doc = await db.collection(KEY_COLLECTION).doc(String(walletAddress || '').toLowerCase()).get();
  if (!doc.exists || !doc.data().recoveryCodeHash) return null;

  const hashNhap = Buffer.from(hashMaKhoiPhuc(maKhoiPhuc), 'hex');
  const hashLuu = Buffer.from(doc.data().recoveryCodeHash, 'hex');
  const khop = hashNhap.length === hashLuu.length && crypto.timingSafeEqual(hashNhap, hashLuu);
  return khop ? doc.data().walletAddress : null;
}

module.exports = {
  encryptPrivateKey,
  decryptPrivateKey,
  storeEncryptedKey,
  getDecryptedKey,
  taoVaLuuMaKhoiPhuc,
  xacThucMaKhoiPhuc,
};
