require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { generateDailySchedules } = require('./services/tripScheduleGenerationService');
const authRoutes = require('./routes/authRoutes');
const tripRoutes = require('./routes/tripRoutes');
const seatRoutes = require('./routes/seatRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const ticketPaymentRoutes = require('./routes/ticketPaymentRoutes');
const customerRoutes = require('./routes/customerRoutes');
const supportRoutes = require('./routes/supportRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const searchHistoryRoutes = require('./routes/searchHistoryRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const walletPinRoutes = require('./routes/walletPinRoutes');
const { requireAdmin } = require('./middlewares/auth');

// Routes cho trang quản trị (website/admin) — CRUD tuyến/trạm/xe/chuyến + dashboard + hỗ trợ.
// Toàn bộ đọc/ghi Firestore trực tiếp, không đụng tới các service phục vụ app mobile ở trên.
const adminLoTrinhRoutes = require('./routes/lotrinhRoutes');
const adminStationRoutes = require('./routes/diemtrungchuyen.routes');
const adminTripRoutes = require('./routes/adminTripRoutes');
const adminVehicleRoutes = require('./routes/xe.routes');
const adminDashboardRoutes = require('./routes/dashboardRoutes');
const adminSupportRoutes = require('./routes/adminSupportRoutes');

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

// Phục vụ luôn web khách hàng (HTML/CSS/JS thuần, thư mục ../frontend) trên cùng cổng 5050.
// Truy cập: http://localhost:5050
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Backend is running' });
});

app.get('/api/vnpay-mock/complete', require('./services/vnpayMock').complete);
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/seats', seatRoutes);
app.use('/api/dat-ve', reservationRoutes);
app.use('/api/thanh-toan', ticketPaymentRoutes);
app.use('/api/khach-hang', customerRoutes);
app.use('/api/tim-kiem', searchHistoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/wallet-pin', walletPinRoutes);
// Vé NFT + chợ bán lại vé (blockchain chỉ dùng cho phần này)
app.use('/api/nft', require('./routes/nftRoutes'));

// Trang quản trị (website/admin).
// Đăng nhập admin là route DUY NHẤT không cần token; mọi route /api/admin/* còn lại đi qua
// requireAdmin (token hợp lệ + role AD) — đặt guard ở đây để route admin mới thêm sau này
// mặc định cũng được bảo vệ.
app.use('/api/admin/auth', require('./routes/adminAuthRoutes'));
app.use('/api/admin', requireAdmin);
app.use('/api/admin/routes', adminLoTrinhRoutes);
app.use('/api/admin/stations', adminStationRoutes);
app.use('/api/admin/trips', adminTripRoutes);
app.use('/api/admin/vehicles', adminVehicleRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/support', adminSupportRoutes);
app.use('/api/admin/notifications', require('./routes/adminNotificationRoutes'));
app.use('/api/admin/reports', require('./routes/adminReportRoutes'));
app.use('/api/admin/accounts', require('./routes/adminAccountRoutes'));
app.use('/api/admin/invoices', require('./routes/adminInvoiceRoutes'));
app.use('/api/admin/nft', require('./routes/adminNftRoutes'));

// Ví nội (Firestore) + nạp/rút tiền + hủy vé hoàn tiền. Các route này viết bằng TypeScript nên cần chạy
// bằng tsx (npm run dev / npm start). Không dùng blockchain nữa — NFT nằm ở /api/nft.
try {
  app.use('/api/wallet', require('./routes/walletRoutes').default);
  app.use('/api/token', require('./routes/tokenRoutes').default);
  app.use('/api/payment', require('./routes/paymentRoutes').default);
  // Alias /api/ticket/cancel (web dùng đường dẫn này) (hủy vé + hoàn tiền vào ví)
  app.use('/api/ticket', require('./routes/paymentRoutes').default);
} catch (error) {
  console.warn("⚠️ Bỏ qua route ví/thanh toán (.ts) — chạy bằng `npm run dev` (tsx):", error.message);
}

// Tự sinh lịch chuyến-theo-ngày (CHUYENXE_NGAY/GHEXE) mỗi ngày lúc 00:05 — trước đây phải chạy
// tay script scripts/generateDailySchedules.js nên hay bị quên, làm cửa sổ ngày cho phép đặt vé
// (hôm nay + 3 ngày tới) không trượt tới, hết chuyến để đặt.
// LƯU Ý: KHÔNG chạy ngay lúc khởi động server nữa — lúc dev, nodemon restart server mỗi lần
// lưu file, mà job này ghi hàng nghìn document nên có thể chạy vài phút và làm nghẽn các
// request khác dùng chung kết nối Firestore (vd: login bị treo). Cần bắt kịp ngay (sau khi mới
// deploy, hoặc cửa sổ đang thiếu nhiều ngày) thì chạy tay: node scripts/generateDailySchedules.js
cron.schedule('5 0 * * *', () => {
  generateDailySchedules()
    .then(() => console.log('✓ [Lịch chuyến xe] Cron 00:05 chạy xong.'))
    .catch((err) => console.error('❌ [Lịch chuyến xe] Cron 00:05 lỗi:', err.message));
}, { timezone: 'Asia/Ho_Chi_Minh' });

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

app.use('/api/support', supportRoutes);
app.use('/api/bookings', bookingRoutes);
