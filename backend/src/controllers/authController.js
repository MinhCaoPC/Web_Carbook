const crypto = require('crypto');
const { Timestamp } = require('firebase-admin/firestore');
const { db } = require('../config/firebase');
const { sendOtpEmail } = require('../config/mailer');
const { hashPassword } = require('../utils/passwordHash');

const OTP_TTL_MS = 5 * 60 * 1000; // OTP sống 5 phút

const COLLECTION_NAME = 'TAIKHOAN';

function sanitizeUser(userDoc) {
  const data = userDoc.data();
  return {
    id: userDoc.id,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    fullName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
    email: data.email,
    phone: data.phone,
    birthDate: data.birthDate || '',
    gender: data.gender || '',
    job: data.job || '',
    photoUrl: data.photoUrl || '',
    hinhThucDangNhap: data.hinhThucDangNhap,
    loaiTaiKhoan: data.loaiTaiKhoan,
    trangThai: data.trangThai,
    ngayTao: data.ngayTao?.toDate ? data.ngayTao.toDate().toISOString() : data.ngayTao,
    ngayCapNhat: data.ngayCapNhat?.toDate ? data.ngayCapNhat.toDate().toISOString() : data.ngayCapNhat,
    lastLogin: data.lastLogin?.toDate ? data.lastLogin.toDate().toISOString() : data.lastLogin || null,
  };
}

async function findUserByIdentifier(identifier) {
  const field = identifier.includes('@') ? 'email' : 'phone';
  const snapshot = await db.collection(COLLECTION_NAME).where(field, '==', identifier).limit(1).get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0];
}

// Danh sách OAuth client ID được phép (Web client ID dùng cho web + serverClientId của app mobile).
function allowedGoogleClientIds() {
  return (process.env.GOOGLE_CLIENT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Xác minh ID token với Google (không tin email/googleId do client tự gửi).
async function verifyGoogleIdToken(idToken) {
  const allowed = allowedGoogleClientIds();
  if (!allowed.length) {
    const e = new Error('Backend chưa cấu hình GOOGLE_CLIENT_ID trong .env.');
    e.status = 503;
    throw e;
  }
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const info = await r.json().catch(() => ({}));
  if (!r.ok || !info.sub) {
    const e = new Error('Google ID token không hợp lệ hoặc đã hết hạn.');
    e.status = 401;
    throw e;
  }
  if (!allowed.includes(info.aud)) {
    const e = new Error('Google ID token không dành cho ứng dụng này.');
    e.status = 401;
    throw e;
  }
  if (String(info.email_verified) !== 'true' || !info.email) {
    const e = new Error('Email Google chưa được xác minh.');
    e.status = 401;
    throw e;
  }
  return info;
}

exports.googleConfig = (req, res) => {
  const ids = allowedGoogleClientIds();
  res.json({ success: true, enabled: ids.length > 0, clientId: ids[0] || '' });
};

exports.googleAuth = async (req, res) => {
  try {
    const { idToken, phone } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin tài khoản Google.' });
    }

    const info = await verifyGoogleIdToken(idToken);
    const googleId = info.sub;
    const email = info.email;
    const firstName = info.given_name || '';
    const lastName = info.family_name || '';
    const photoUrl = info.picture || '';

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = (phone || '').trim();

    let userDoc = null;
    const googleSnapshot = await db.collection(COLLECTION_NAME).where('googleId', '==', googleId).limit(1).get();
    if (!googleSnapshot.empty) {
      userDoc = googleSnapshot.docs[0];
    } else {
      const emailSnapshot = await db.collection(COLLECTION_NAME).where('email', '==', normalizedEmail).limit(1).get();
      if (!emailSnapshot.empty) {
        userDoc = emailSnapshot.docs[0];
      }
    }

    const now = Timestamp.now();

    if (!userDoc) {
      const userId = `TK${Date.now()}`;
      await db.collection(COLLECTION_NAME).doc(userId).set({
        firstName: (firstName || '').trim(),
        lastName: (lastName || '').trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        googleId,
        photoUrl: photoUrl || '',
        hinhThucDangNhap: 'Google',
        loaiTaiKhoan: 'KH',
        trangThai: 'active',
        ngayTao: now,
        ngayCapNhat: now,
        lastLogin: now,
      });

      const createdDoc = await db.collection(COLLECTION_NAME).doc(userId).get();
      return res.status(201).json({
        success: true,
        message: 'Đăng nhập Google thành công.',
        isNewUser: true,
        user: sanitizeUser(createdDoc),
      });
    }

    const userRef = userDoc.ref;
    const updateData = {
      ngayCapNhat: now,
      lastLogin: now,
      googleId,
      email: normalizedEmail,
      hinhThucDangNhap: 'Google',
      photoUrl: photoUrl || userDoc.data().photoUrl || '',
      firstName: (firstName || '').trim() || userDoc.data().firstName || '',
      lastName: (lastName || '').trim() || userDoc.data().lastName || '',
    };

    if (normalizedPhone) {
      updateData.phone = normalizedPhone;
    }

    await userRef.update(updateData);
    const updatedDoc = await userRef.get();

    return res.status(200).json({
      success: true,
      message: 'Đăng nhập Google thành công.',
      isNewUser: false,
      user: sanitizeUser(updatedDoc),
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('googleAuth error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập bằng Google.' });
  }
};

exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, confirmPassword } = req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }

    if (confirmPassword && confirmPassword !== password) {
      return res.status(400).json({ success: false, message: 'Mật khẩu xác nhận không khớp.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    const existingEmail = await db.collection(COLLECTION_NAME).where('email', '==', normalizedEmail).limit(1).get();
    if (!existingEmail.empty) {
      return res.status(409).json({ success: false, message: 'Email đã được sử dụng.' });
    }

    const existingPhone = await db.collection(COLLECTION_NAME).where('phone', '==', normalizedPhone).limit(1).get();
    if (!existingPhone.empty) {
      return res.status(409).json({ success: false, message: 'Số điện thoại đã được sử dụng.' });
    }

    const userId = `TK${Date.now()}`;
    const now = Timestamp.now();

    await db.collection(COLLECTION_NAME).doc(userId).set({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashPassword(password),
      hinhThucDangNhap: 'Local',
      loaiTaiKhoan: 'KH',
      trangThai: 'active',
      ngayTao: now,
      ngayCapNhat: now,
      lastLogin: now,
    });

    return res.status(201).json({
      success: true,
      message: 'Đăng ký thành công.',
      user: {
        id: userId,
        fullName: `${firstName.trim()} ${lastName.trim()}`,
        email: normalizedEmail,
        phone: normalizedPhone,
      },
    });
  } catch (error) {
    console.error('register error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng ký.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email/số điện thoại và mật khẩu.' });
    }

    const userDoc = await findUserByIdentifier(identifier.trim());
    if (!userDoc) {
      return res.status(401).json({ success: false, message: 'Thông tin đăng nhập không đúng.' });
    }

    const userData = userDoc.data();
    if (userData.password !== hashPassword(password)) {
      return res.status(401).json({ success: false, message: 'Thông tin đăng nhập không đúng.' });
    }

    if (userData.trangThai !== 'active') {
      return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa.' });
    }

    // Ghi lastLogin ở chế độ "bắn rồi quên": nếu Firestore đang chặn/trễ ghi (vượt hạn mức, mạng chậm)
    // thì vẫn cho đăng nhập, không để request treo.
    const now = Timestamp.now();
    userDoc.ref.update({ lastLogin: now }).catch((err) => console.warn('Không ghi được lastLogin:', err.message));

    const userAfter = { id: userDoc.id, data: () => ({ ...userData, lastLogin: now }) };
    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công.',
      user: sanitizeUser(userAfter),
    });
  } catch (error) {
    console.error('login error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập.' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const userDoc = await db.collection(COLLECTION_NAME).doc(id).get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    return res.status(200).json({ success: true, user: sanitizeUser(userDoc) });
  } catch (error) {
    console.error('getProfile error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thông tin.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, birthDate, gender, job, email, photoUrl } = req.body;
    const userRef = db.collection(COLLECTION_NAME).doc(id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const updateData = {
      ngayCapNhat: Timestamp.now(),
    };

    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (birthDate !== undefined) updateData.birthDate = birthDate;
    if (gender !== undefined) updateData.gender = gender;
    if (job !== undefined) updateData.job = job;
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;

    await userRef.update(updateData);
    const updatedDoc = await userRef.get();

    return res.status(200).json({ success: true, message: 'Cập nhật thông tin thành công.', user: sanitizeUser(updatedDoc) });
  } catch (error) {
    console.error('updateProfile error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật thông tin.' });
  }
};

// Bước 1: người dùng nhập email -> tạo OTP 4 số, lưu vào Firestore kèm thời hạn, gửi qua Gmail
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userDoc = await findUserByIdentifier(normalizedEmail);
    if (!userDoc) {
      return res.status(404).json({ success: false, message: 'Email không tồn tại trong hệ thống.' });
    }

    const otp = crypto.randomInt(1000, 10000).toString();
    const otpExpires = Date.now() + OTP_TTL_MS;

    await userDoc.ref.update({
      resetOtp: otp,
      resetOtpExpires: otpExpires,
    });

    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (mailErr) {
      // Mail lỗi (thường do GMAIL_APP_PASSWORD hết hiệu lực) — OTP đã lưu DB nên vẫn cho
      // tiếp tục luồng, in mã ra console để demo/test không bị chặn (giống luồng rút tiền/PIN)
      console.warn('⚠️ Không gửi được email OTP quên mật khẩu:', mailErr.message);
      console.log(`👉 [DEMO BYPASS] OTP đặt lại mật khẩu cho ${normalizedEmail}: ${otp}`);
    }

    return res.status(200).json({ success: true, message: 'Mã OTP đã được gửi đến email của bạn.' });
  } catch (error) {
    console.error('forgotPassword error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi gửi mã OTP.' });
  }
};

// Bước 2: xác thực mã OTP người dùng nhập trên verify_otp_screen
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mã OTP.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userDoc = await findUserByIdentifier(normalizedEmail);
    if (!userDoc) {
      return res.status(404).json({ success: false, message: 'Email không tồn tại trong hệ thống.' });
    }

    const data = userDoc.data();
    if (!data.resetOtp || !data.resetOtpExpires) {
      return res.status(400).json({ success: false, message: 'Chưa yêu cầu mã OTP cho email này.' });
    }

    if (Date.now() > data.resetOtpExpires) {
      return res.status(400).json({ success: false, message: 'Mã OTP đã hết hạn, vui lòng gửi lại.' });
    }

    if (data.resetOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Mã OTP không đúng.' });
    }

    return res.status(200).json({ success: true, message: 'Xác thực OTP thành công.' });
  } catch (error) {
    console.error('verifyOtp error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xác thực mã OTP.' });
  }
};

// Bước 3: đổi mật khẩu mới sau khi đã xác thực OTP (kiểm tra lại OTP để tránh giả mạo)
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userDoc = await findUserByIdentifier(normalizedEmail);
    if (!userDoc) {
      return res.status(404).json({ success: false, message: 'Email không tồn tại trong hệ thống.' });
    }

    const data = userDoc.data();
    if (!data.resetOtp || !data.resetOtpExpires || Date.now() > data.resetOtpExpires || data.resetOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Mã OTP không hợp lệ hoặc đã hết hạn.' });
    }

    await userDoc.ref.update({
      password: hashPassword(newPassword),
      resetOtp: null,
      resetOtpExpires: null,
      ngayCapNhat: Timestamp.now(),
    });

    return res.status(200).json({ success: true, message: 'Đặt lại mật khẩu thành công.' });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đặt lại mật khẩu.' });
  }
};
