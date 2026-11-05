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

// Routes cho trang quản trị (website/admin) — CRUD tuyến/trạm/xe/chuyến + dashboard + hỗ trợ.
// Toàn bộ đọc/ghi Firestore trực tiếp, không đụng tới các service phục vụ app mobile ở trên.
const adminLoTrinhRoutes = require('./routes/lotrinhRoutes');
const adminStationRoutes = require('./routes/diemtrungchuyen.routes');
const adminTripRoutes = require('./routes/adminTripRoutes');
const adminVehicleRoutes = require('./routes/xe.routes');
const adminDashboardRoutes = require('./routes/dashboardRoutes');
const adminSupportRoutes = require('./routes/adminSupportRoutes');

// Blockchain routes (walletRoutes/paymentRoutes/tokenRoutes) là file .ts chưa build nên chưa
// require() trực tiếp được ở đây — ví/thanh toán blockchain để làm sau, xem ghi chú trong
// reservationService.js/ticketPaymentService.js. Khi triển khai lại, cần build TS hoặc dùng ts-node.

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

// Thông tin mạng + địa chỉ smart contract (công khai) cho trang minh bạch on-chain
app.get('/api/blockchain/info', (req, res) => {
  try {
    const { BLOCKCHAIN_CONFIG, CONTRACT_ADDRESSES } = require('./config/blockchain.config');
    res.json({
      success: true,
      network: { name: 'Ethereum Sepolia Testnet', chainId: BLOCKCHAIN_CONFIG.CHAIN_ID, explorer: 'https://sepolia.etherscan.io' },
      contracts: [
        { name: 'CARToken', label: 'Token CAR (ERC-20)', address: CONTRACT_ADDRESSES.CAR_TOKEN },
        { name: 'Wallet', label: 'Quản lý ví', address: CONTRACT_ADDRESSES.WALLET },
        { name: 'TicketPayment', label: 'Thanh toán vé', address: CONTRACT_ADDRESSES.TICKET_PAYMENT },
        { name: 'Refund', label: 'Hoàn tiền', address: CONTRACT_ADDRESSES.REFUND },
      ],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Chưa cấu hình blockchain: ' + error.message });
  }
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

// Trang quản trị (website/admin)
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
app.use('/api/admin/auth', require('./routes/adminAuthRoutes'));

// Blockchain routes: cần contract đã compile (blockchain/artifacts) và private key hợp lệ
// trong blockchain/.env. Chưa đủ điều kiện thì bỏ qua để API vé xe vẫn chạy.
// (Không còn Event Listener nền: lịch sử thanh toán/hoàn tiền giờ đối chiếu trực tiếp từ
// event on-chain mỗi khi có request, xem PaymentController.getTransactionHistory.)
try {
  app.use('/api/wallet', require('./routes/walletRoutes').default);
  app.use('/api/token', require('./routes/tokenRoutes').default);
  app.use('/api/payment', require('./routes/paymentRoutes').default);
  // Alias /api/ticket/cancel (web dùng đường dẫn này) (hủy vé + hoàn tiền vào ví)
  app.use('/api/ticket', require('./routes/paymentRoutes').default);
} catch (error) {
  console.warn("⚠️ Bỏ qua blockchain (wallet/token/payment) — chưa cấu hình xong:", error.message);
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
