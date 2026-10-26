// Tạo tài khoản quản trị (loaiTaiKhoan = 'AD') đầu tiên cho website/admin — hiện Firestore
// chưa có tài khoản AD nào nên trang đăng nhập admin không login được với ai cả.
//
//   node scripts/seedAdminAccount.js <email> [password] [firstName] [lastName]
//   node scripts/seedAdminAccount.js admin@carbook.vn 123456 Admin Carbook
//
// Mật khẩu mặc định (nếu không truyền) là "123456", được băm SHA-256 trước khi lưu — không bao
// giờ lưu plaintext (xem backend/src/utils/passwordHash.js).

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
const { hashPassword } = require('../src/utils/passwordHash');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const [, , emailArg, passwordArg, firstNameArg, lastNameArg] = process.argv;

  if (!emailArg) {
    console.error('Thiếu email. Cách dùng: node scripts/seedAdminAccount.js <email> [password] [firstName] [lastName]');
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  const password = passwordArg || '123456';
  const firstName = firstNameArg || 'Admin';
  const lastName = lastNameArg || 'Carbook';

  const existing = await db.collection('TAIKHOAN').where('email', '==', email).limit(1).get();
  if (!existing.empty) {
    console.error(`Email ${email} đã tồn tại (doc id: ${existing.docs[0].id}). Không tạo trùng.`);
    process.exit(1);
  }

  const maTaiKhoan = `TK${Date.now()}`;
  const now = Timestamp.now();

  await db.collection('TAIKHOAN').doc(maTaiKhoan).set({
    email,
    firstName,
    lastName,
    password: hashPassword(password),
    hinhThucDangNhap: 'Local',
    loaiTaiKhoan: 'AD',
    trangThai: 'active',
    ngayTao: now,
    ngayCapNhat: now,
  });

  console.log(`Đã tạo tài khoản admin: ${maTaiKhoan} (${email})`);
  console.log(`Mật khẩu đăng nhập: ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi khi tạo tài khoản admin:', err);
    process.exit(1);
  });
