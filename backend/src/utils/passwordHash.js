const crypto = require('crypto');

// SHA-256, không salt — giữ đúng quy ước đang dùng cho TAIKHOAN.password (xem authController.js)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

module.exports = { hashPassword };
