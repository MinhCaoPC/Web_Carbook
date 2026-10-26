// Cổng VNPay GIẢ LẬP (chỉ bật khi VNP_MOCK=true) — phục vụ demo khi VNPay sandbox không khả dụng.
// Trang frontend/vnpay-mock.html gọi GET /api/vnpay-mock/complete để lấy URL "return" đã ký giống hệt VNPay thật,
// nên backend vẫn xác thực chữ ký + chạy đúng luồng chốt vé / mint token như khi thanh toán thật.
const crypto = require('crypto');

const enc = (v) => encodeURIComponent(v).replace(/%20/g, '+');

function kyThamSo(params, hashSecret) {
  const keys = Object.keys(params).sort();
  const signData = keys.map((k) => `${enc(k)}=${enc(String(params[k]))}`).join('&');
  const hash = crypto.createHmac('sha512', hashSecret).update(Buffer.from(signData, 'utf-8')).digest('hex');
  return `${signData}&vnp_SecureHash=${hash}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

exports.complete = (req, res) => {
  if (process.env.VNP_MOCK !== 'true') return res.status(404).json({ success: false, message: 'Cổng giả lập chưa được bật (VNP_MOCK).' });
  const { txnRef, amount, returnUrl, ok } = req.query;
  if (!txnRef || !amount || !returnUrl) return res.status(400).json({ success: false, message: 'Thiếu tham số.' });

  const hashSecret = (process.env.VNP_HASH_SECRET || 'mock-secret').trim();
  const now = new Date();
  const params = {
    vnp_Amount: Math.floor(Number(amount)) * 100,
    vnp_BankCode: 'NCB',
    vnp_BankTranNo: `MOCK${Date.now()}`,
    vnp_CardType: 'ATM',
    vnp_OrderInfo: `Mock payment ${txnRef}`,
    vnp_PayDate: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    vnp_ResponseCode: ok === '1' ? '00' : '24',
    vnp_TmnCode: (process.env.VNP_TMN_CODE || 'MOCK').trim(),
    vnp_TransactionNo: String(Date.now()).slice(-8),
    vnp_TransactionStatus: ok === '1' ? '00' : '02',
    vnp_TxnRef: txnRef,
  };
  return res.redirect(`${returnUrl}?${kyThamSo(params, hashSecret)}`);
};
