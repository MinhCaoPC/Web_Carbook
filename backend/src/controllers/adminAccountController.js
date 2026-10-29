const { db } = require('../config/firebase');
const { Timestamp } = require('firebase-admin/firestore');
const { hashPassword } = require('../utils/passwordHash');

const DEFAULT_PASSWORD = '123456';

const TAIKHOAN_COLLECTION = 'TAIKHOAN';
const TAIXE_COLLECTION = 'TAIXE';
const KHACHHANG_COLLECTION = 'KHACHHANG';

// 1. Lấy danh sách tài khoản
exports.getAllAccounts = async (req, res) => {
  try {
    const { role } = req.query; // all, KH, TX, AD
    
    let query = db.collection(TAIKHOAN_COLLECTION);
    if (role && role !== 'all') {
      query = query.where('loaiTaiKhoan', '==', role);
    }
    
    const snapshot = await query.orderBy('ngayTao', 'desc').get();
    let accounts = [];

    // Lấy thông tin họ tên, SĐT từ các bảng liên quan
    for (const doc of snapshot.docs) {
      const data = doc.data();
      let hoTen = data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : (data.hoTen || 'Chưa cập nhật');
      let sdt = data.phone || data.sdt || 'Chưa cập nhật';
      let chiTiet = null;

      // Map thông tin bổ sung tùy theo loại tài khoản
      if (data.loaiTaiKhoan === 'KH') {
        const khSnap = await db.collection(KHACHHANG_COLLECTION).where('maTaiKhoan', '==', doc.id).limit(1).get();
        if (!khSnap.empty) {
          const khData = khSnap.docs[0].data();
          hoTen = khData.hoTen || hoTen;
          sdt = khData.sdt || sdt;
        }
      } else if (data.loaiTaiKhoan === 'TX') {
        const txSnap = await db.collection(TAIXE_COLLECTION).where('maTaiKhoan', '==', doc.id).limit(1).get();
        if (!txSnap.empty) {
          const txData = txSnap.docs[0].data();
          hoTen = txData.hoTen || hoTen;
          sdt = txData.sdt || sdt;
          chiTiet = { bangLai: txData.bangLai };
        }
      }

      accounts.push({
        id: doc.id,
        email: data.email || '',
        hoTen,
        sdt,
        loaiTaiKhoan: data.loaiTaiKhoan || 'KH',
        trangThai: data.trangThai || 'active',
        hinhThucDangNhap: data.hinhThucDangNhap || 'Local',
        photoUrl: data.photoUrl || data.photoURL || null,
        googleId: data.googleId || null,
        ngayTao: data.ngayTao ? data.ngayTao.toDate().toISOString() : null,
        ngayCapNhat: data.ngayCapNhat ? data.ngayCapNhat.toDate().toISOString() : null,
        lastLogin: data.lastLogin ? data.lastLogin.toDate().toISOString() : null,
        chiTiet
      });
    }

    res.status(200).json({ success: true, data: accounts });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách tài khoản:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// 2. Thêm mới tài khoản
exports.createAccount = async (req, res) => {
  try {
    const { email, hoTen, sdt, loaiTaiKhoan, bangLai } = req.body;
    
    if (!email || !loaiTaiKhoan) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đủ email và loại tài khoản.' });
    }

    // Kiểm tra email trùng lặp
    const existSnap = await db.collection(TAIKHOAN_COLLECTION).where('email', '==', email).limit(1).get();
    if (!existSnap.empty) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại trong hệ thống.' });
    }

    const now = Timestamp.now();
    const maTaiKhoan = `TK${Date.now()}`;

    // Tạo tài khoản gốc
    const taiKhoanData = {
      email,
      loaiTaiKhoan, // KH, TX, AD
      trangThai: 'active',
      hinhThucDangNhap: 'Local',
      password: hashPassword(DEFAULT_PASSWORD), // Mật khẩu mặc định đã băm SHA-256 — có thể làm luồng đổi pass sau
      firstName: hoTen?.split(' ')[0] || '',
      lastName: hoTen?.split(' ').slice(1).join(' ') || '',
      phone: sdt || '',
      ngayTao: now,
      ngayCapNhat: now,
    };
    
    await db.collection(TAIKHOAN_COLLECTION).doc(maTaiKhoan).set(taiKhoanData);

    // Lưu thông tin cụ thể dựa vào role
    if (loaiTaiKhoan === 'TX') {
      await db.collection(TAIXE_COLLECTION).doc(`TX${Date.now()}`).set({
        maTaiKhoan,
        hoTen: hoTen || '',
        sdt: sdt || '',
        bangLai: bangLai || 'D',
        trangThai: 'SanSang', // SanSang, DangLai, Nghi
        ngayTao: now
      });
    } else if (loaiTaiKhoan === 'KH') {
      await db.collection(KHACHHANG_COLLECTION).doc(`KH${Date.now()}`).set({
        maTaiKhoan,
        hoTen: hoTen || '',
        sdt: sdt || '',
        diaChi: '',
        gioiTinh: 'Khác',
        ngaySinh: null
      });
    }

    res.status(201).json({ success: true, message: 'Tạo tài khoản thành công', data: { id: maTaiKhoan, ...taiKhoanData } });
  } catch (error) {
    console.error('Lỗi tạo tài khoản:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// 3. Khóa/Mở khóa tài khoản
exports.toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { trangThai } = req.body; // active, locked

    if (!['active', 'locked'].includes(trangThai)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
    }

    const docRef = db.collection(TAIKHOAN_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại.' });
    }

    await docRef.update({
      trangThai,
      ngayCapNhat: Timestamp.now()
    });

    res.status(200).json({ success: true, message: 'Đã cập nhật trạng thái tài khoản.' });
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
