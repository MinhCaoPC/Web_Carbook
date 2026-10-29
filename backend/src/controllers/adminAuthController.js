const { Timestamp } = require('firebase-admin/firestore');
const { db } = require('../config/firebase');
const { hashPassword } = require('../utils/passwordHash');

const TAIKHOAN_COLLECTION = 'TAIKHOAN';

// POST /api/admin/auth/login — đăng nhập trang quản trị (chỉ tài khoản loaiTaiKhoan = 'AD')
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const snapshot = await db.collection(TAIKHOAN_COLLECTION)
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng.' });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    if (userData.loaiTaiKhoan !== 'AD') {
      return res.status(403).json({ success: false, message: 'Tài khoản này không có quyền truy cập trang quản trị.' });
    }

    if (userData.password !== hashPassword(password)) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng.' });
    }

    if (userData.trangThai !== 'active') {
      return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa.' });
    }

    await userDoc.ref.update({ lastLogin: Timestamp.now() });

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công.',
      user: {
        id: userDoc.id,
        email: userData.email,
        hoTen: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        loaiTaiKhoan: userData.loaiTaiKhoan,
      },
    });
  } catch (error) {
    console.error('adminAuthController.login error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập.' });
  }
};
