const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Token phiên đăng nhập (JWT HS256) do chính backend ký.
// JWT_SECRET phải là chuỗi ngẫu nhiên dài, đặt trong backend/.env (tạo: openssl rand -hex 48).
// Production: bắt buộc có. Dev: thiếu thì sinh bí mật ngẫu nhiên cho tiến trình này (an toàn nhưng
// mọi token mất hiệu lực mỗi lần restart server) và in cảnh báo.
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '12h';
const ISSUER = 'carbook-backend';

let secret = (process.env.JWT_SECRET || '').trim();
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Thiếu JWT_SECRET trong môi trường production.');
  }
  secret = crypto.randomBytes(48).toString('hex');
  console.warn('⚠️ Chưa đặt JWT_SECRET trong .env — dùng khóa tạm theo tiến trình, token sẽ mất hiệu lực khi restart.');
} else if (secret.length < 32) {
  throw new Error('JWT_SECRET quá ngắn (cần ít nhất 32 ký tự).');
}

// role: 'KH' (khách hàng) hoặc 'AD' (quản trị) — lấy từ TAIKHOAN.loaiTaiKhoan
function signToken({ maTaiKhoan, role }) {
  return jwt.sign({ role }, secret, {
    algorithm: 'HS256',
    subject: String(maTaiKhoan),
    issuer: ISSUER,
    expiresIn: TOKEN_TTL,
  });
}

// Ném lỗi nếu chữ ký sai / hết hạn / thuật toán khác HS256.
function verifyToken(token) {
  const p = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER });
  return { maTaiKhoan: p.sub, role: p.role };
}

module.exports = { signToken, verifyToken };
