const ticketPaymentService = require('../services/ticketPaymentService');

// POST /api/thanh-toan — thanh toán bằng ví CarbookPay (blockchain, cần mã PIN)
exports.thanhToan = async (req, res) => {
  try {
    const result = await ticketPaymentService.thanhToan(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error('thanhToan error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message || 'Lỗi máy chủ khi thanh toán.' });
  }
};

// POST /api/thanh-toan/vnpay — tạo đơn + link thanh toán vé trực tiếp qua cổng VNPay
exports.taoDonVnpay = async (req, res) => {
  try {
    let ipAddr = req.ip || '127.0.0.1';
    if (ipAddr.includes('::')) ipAddr = '127.0.0.1';
    const result = await ticketPaymentService.taoDonThanhToanVnpay({ ...req.body, ipAddr });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('taoDonVnpay error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi máy chủ khi tạo thanh toán VNPay.' });
  }
};

// GET /api/thanh-toan/vnpay-return — VNPay redirect trình duyệt/WebView về sau khi khách trả tiền
exports.vnpayReturnVe = async (req, res) => {
  let thanhCong = false;
  let message = '';
  try {
    const ketQua = await ticketPaymentService.xuLyVnpayReturn({ ...req.query });
    thanhCong = ketQua.thanhCong;
    message = ketQua.message || '';
  } catch (error) {
    console.error('vnpayReturnVe error:', error);
    message = error.message || 'Lỗi xử lý kết quả thanh toán.';
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Kết quả thanh toán vé</title>
<style>body{font-family:-apple-system,Roboto,Arial,sans-serif;background:#f5f6fa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;padding:32px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center;max-width:400px;width:90%}
.icon{font-size:64px;margin-bottom:16px}.ok{color:#2ecc71}.err{color:#e74c3c}
h1{font-size:20px;color:#0b2348;margin-bottom:12px}p{color:#7f8c8d;font-size:14px;line-height:1.5;margin-bottom:24px}
.btn{background:#0b2348;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-weight:bold;cursor:pointer}</style></head>
<body><div class="card">
<div class="icon ${thanhCong ? 'ok' : 'err'}">${thanhCong ? '✓' : '✗'}</div>
<h1>${thanhCong ? 'Thanh toán vé thành công!' : 'Thanh toán vé thất bại!'}</h1>
<p>${thanhCong ? 'Vé của bạn đã được xác nhận. Vui lòng quay lại CARBOOK để xem vé và mã QR lên xe.' : (message || 'Giao dịch bị hủy hoặc không thành công. Ghế của bạn vẫn đang được giữ — hãy thử thanh toán lại.')}</p>
<button class="btn" onclick="window.location.href='/#/vnpay-done?success=${thanhCong}'">Quay lại CARBOOK</button>
</div></body></html>`);
};

// POST /api/thanh-toan/vnpay-reconcile — app đối soát đơn sau khi đóng WebView
exports.doiSoatVnpay = async (req, res) => {
  try {
    const result = await ticketPaymentService.doiSoatThanhToanVnpay(req.maKhachHangDangNhap, req.body?.orderId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('doiSoatVnpay error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi máy chủ khi đối soát thanh toán.' });
  }
};
