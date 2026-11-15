// Đọc cấu hình từ backend/.env (xem .env.example) và gom về MỘT chỗ.
// Các file khác chỉ require('./cau-hinh') thay vì đọc process.env rải rác.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const THU_MUC_BACKEND = path.join(__dirname, '..');
const THU_MUC_BLOCKCHAIN = path.join(THU_MUC_BACKEND, '..', 'blockchain');

function soNguyen(giaTri, macDinh) {
  const n = Number(giaTri);
  return Number.isFinite(n) && n > 0 ? n : macDinh;
}

const MANG_BLOCKCHAIN = process.argv.includes('--sepolia') || process.env.MANG_BLOCKCHAIN === 'sepolia' ? 'sepolia' : 'localhost';

const CAU_HINH = Object.freeze({
  cong: soNguyen(process.env.PORT, 5050),

  // ----- Đăng nhập -----
  khoaJwt: process.env.JWT_SECRET || 'chi-dung-de-chay-thu-hay-doi-trong-env',
  hanJwt: process.env.JWT_EXPIRES_IN || '7d',

  // ----- Đăng nhập Google: OAuth client ID loại Web (có thể nhiều ID, cách nhau dấu phẩy) -----
  googleClientIds: (process.env.GOOGLE_CLIENT_ID || '').split(',').map((s) => s.trim()).filter(Boolean),

  // ----- Gửi mail mã OTP quên mật khẩu (Gmail + App Password) -----
  gmailUser: (process.env.GMAIL_USER || '').trim(),
  gmailMatKhauUngDung: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
  // production: tắt đường vòng demo (in mã OTP ra cửa sổ backend khi gửi mail lỗi)
  laMoiTruongThat: process.env.NODE_ENV === 'production',

  // ----- Lưu dữ liệu off-chain -----
  // 'firebase' : dùng Firestore (cần backend/serviceAccountKey.json)
  // 'tep'      : lưu file JSON trong backend/du-lieu/ — KHÔNG tốn lượt truy cập Firebase (hợp để demo)
  noiLuuDuLieu: (process.env.NOI_LUU_DU_LIEU || 'firebase').toLowerCase() === 'tep' ? 'tep' : 'firebase',
  fileKhoaFirebase: path.join(THU_MUC_BACKEND, 'serviceAccountKey.json'),
  thuMucDuLieu: path.join(THU_MUC_BACKEND, 'du-lieu'),
  // Danh mục chuyến xe đọc từ Firebase rồi lưu ra file; quá số giờ này mới đọc lại Firebase
  soGioLamMoiDanhMuc: soNguyen(process.env.SO_GIO_LAM_MOI_DANH_MUC, 24),

  // ----- Nghiệp vụ -----
  soNgayBanVe: soNguyen(process.env.SO_NGAY_BAN_VE, 4), // hôm nay + 3 ngày tới
  soChuyenMoiTuyen: soNguyen(process.env.SO_CHUYEN_MOI_TUYEN, 2),
  // Tỷ giá DEMO để đổi giá vé VNĐ sang ETH: 1 ETH = 100.000.000đ -> vé 240.000đ = 0,0024 ETH
  tyGiaVndMoiEth: soNguyen(process.env.TY_GIA_VND_MOI_ETH, 100_000_000),

  // ----- Blockchain -----
  // 'localhost' (mạng ảo Hardhat/Ganache) hoặc 'sepolia'.
  // Chọn Sepolia bằng `npm run start:sepolia` (thêm cờ --sepolia) hoặc MANG_BLOCKCHAIN=sepolia trong .env
  mangBlockchain: MANG_BLOCKCHAIN,
  // Mạng ảo: RPC_URL (mặc định máy mình). Sepolia: RPC_URL_SEPOLIA, bỏ trống thì dùng RPC công khai miễn phí
  rpcUrl: MANG_BLOCKCHAIN === 'sepolia'
    ? process.env.RPC_URL_SEPOLIA || 'https://ethereum-sepolia-rpc.publicnode.com'
    : process.env.RPC_URL || 'http://127.0.0.1:8545',
  fileDiaChiHopDong: path.join(THU_MUC_BLOCKCHAIN, 'dia-chi-hop-dong.json'),
  fileAbiHopDong: path.join(THU_MUC_BLOCKCHAIN, 'artifacts', 'contracts', 'VeXeNFT.sol', 'VeXeNFT.json'),
  thuMucBlockchain: THU_MUC_BLOCKCHAIN,
});

module.exports = { CAU_HINH };
