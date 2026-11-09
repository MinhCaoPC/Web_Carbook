const { db } = require('../config/firebase');
const { verifyToken } = require('../utils/authToken');
const { layHoacTaoKhachHang } = require('../services/customerService');

// Xác thực bằng token phiên (JWT) do /api/auth/login, /api/auth/google, /api/admin/auth/login cấp.
// Client gửi: Authorization: Bearer <token>. Danh tính (maTaiKhoan, role) CHỈ lấy từ token đã ký,
// không bao giờ tin header/body do client tự khai.

function deny(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function authenticate(req, res) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    deny(res, 401, 'Thiếu thông tin xác thực. Vui lòng đăng nhập.');
    return null;
  }
  try {
    const auth = verifyToken(match[1].trim());
    req.auth = auth; // { maTaiKhoan, role }
    return auth;
  } catch (err) {
    deny(res, 401, err.name === 'TokenExpiredError'
      ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      : 'Token không hợp lệ.');
    return null;
  }
}

// Bất kỳ người dùng đã đăng nhập (khách hoặc admin)
function requireAuth(req, res, next) {
  if (!authenticate(req, res)) return;
  next();
}

// Chỉ tài khoản quản trị (loaiTaiKhoan = 'AD')
function requireAdmin(req, res, next) {
  const auth = authenticate(req, res);
  if (!auth) return;
  if (auth.role !== 'AD') return deny(res, 403, 'Chỉ quản trị viên mới có quyền thực hiện thao tác này.');
  next();
}

// Khách hàng đã đăng nhập. Gắn req.maKhachHangDangNhap (suy ra từ token, không phải từ client) và
// chặn nếu maKhachHang trong body/query khác chính chủ token.
async function verifyKhachHang(req, res, next) {
  const auth = authenticate(req, res);
  if (!auth) return;
  if (auth.role !== 'KH') return deny(res, 403, 'Chức năng này dành cho tài khoản khách hàng.');

  try {
    const kh = await layHoacTaoKhachHang(auth.maTaiKhoan);
    req.maKhachHangDangNhap = kh.maKhachHang;
  } catch (err) {
    return deny(res, err.statusCode || 401, err.message || 'Không xác định được khách hàng.');
  }

  const maKhachHangTrongRequest = req.body?.maKhachHang || req.query?.maKhachHang;
  if (maKhachHangTrongRequest && maKhachHangTrongRequest !== req.maKhachHangDangNhap) {
    return deny(res, 403, 'Không có quyền thao tác trên tài khoản khách hàng khác.');
  }
  next();
}

// Route công khai nhưng có thêm hành vi cho người đã đăng nhập (vd: lưu lịch sử tìm kiếm, xem
// thông tin vé không che). Không có/sai token thì cứ coi là khách vãng lai, KHÔNG báo lỗi.
async function optionalKhachHang(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (match) {
    try {
      const auth = verifyToken(match[1].trim());
      if (auth.role === 'KH') {
        req.auth = auth;
        req.maKhachHangDangNhap = (await layHoacTaoKhachHang(auth.maTaiKhoan)).maKhachHang;
      }
    } catch (_) { /* token xấu -> bỏ qua, coi như chưa đăng nhập */ }
  }
  next();
}

// Route có :id/:userId là mã TÀI KHOẢN — chỉ chính chủ (hoặc admin) được truy cập.
// source: 'params' | 'body'
function requireSelfAccount(field = 'id', source = 'params') {
  return (req, res, next) => {
    const auth = authenticate(req, res);
    if (!auth) return;
    const value = (source === 'body' ? req.body : req.params)?.[field];
    if (auth.role !== 'AD' && String(value || '') !== auth.maTaiKhoan) {
      return deny(res, 403, 'Không có quyền truy cập tài khoản của người khác.');
    }
    next();
  };
}

// Route có :id là mã KHÁCH HÀNG (KHACHHANG) — chỉ chính chủ (hoặc admin).
function requireSelfKhachHang(field = 'id', source = 'params') {
  return async (req, res, next) => {
    const auth = authenticate(req, res);
    if (!auth) return;
    if (auth.role === 'AD') return next();
    try {
      const kh = await layHoacTaoKhachHang(auth.maTaiKhoan);
      req.maKhachHangDangNhap = kh.maKhachHang;
    } catch (err) {
      return deny(res, err.statusCode || 401, err.message);
    }
    const value = (source === 'body' ? req.body : req.params)?.[field];
    if (String(value || '') !== req.maKhachHangDangNhap) {
      return deny(res, 403, 'Không có quyền truy cập dữ liệu của khách hàng khác.');
    }
    next();
  };
}

// Mã ví nội (VI…) đang ACTIVE của 1 tài khoản (null nếu chưa có)
async function layViCuaTaiKhoan(maTaiKhoan) {
  const doc = await db.collection('TAIKHOAN').doc(maTaiKhoan).get();
  if (!doc.exists) return null;
  const d = doc.data();
  return d.walletAddress ? String(d.walletAddress) : null;
}

// Route nhận mã ví (body/params/query): ví đó phải là ví của chính người đang đăng nhập.
// Admin được bỏ qua. Đây là chốt chặn chính chống rút/nạp/xem ví của người khác.
function requireOwnWallet(field = 'userWallet', source = 'body') {
  return async (req, res, next) => {
    const auth = authenticate(req, res);
    if (!auth) return;
    if (auth.role === 'AD') return next();

    const value = String((req[source] || {})[field] || '').toLowerCase();
    if (!value) return deny(res, 400, `Thiếu ${field}.`);

    try {
      const viCuaToi = await layViCuaTaiKhoan(auth.maTaiKhoan);
      if (!viCuaToi || viCuaToi.toLowerCase() !== value) {
        return deny(res, 403, 'Ví này không thuộc tài khoản của bạn.');
      }
    } catch (err) {
      console.error('requireOwnWallet error:', err);
      return deny(res, 500, 'Không kiểm tra được quyền sở hữu ví.');
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireAdmin,
  verifyKhachHang,
  optionalKhachHang,
  requireSelfAccount,
  requireSelfKhachHang,
  requireOwnWallet,
  layViCuaTaiKhoan,
};
