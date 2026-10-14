const nodemailer = require('nodemailer');

// Gửi mail bằng Gmail: cần GMAIL_USER + GMAIL_APP_PASSWORD trong file .env
// GMAIL_APP_PASSWORD là "Mật khẩu ứng dụng" (App Password) của Google, không phải mật khẩu Gmail thường.
// Cách tạo: bật xác minh 2 bước cho tài khoản Gmail -> vào myaccount.google.com/apppasswords
// -> tạo app password cho "Mail" -> dán chuỗi 16 ký tự đó vào GMAIL_APP_PASSWORD.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendOtpEmail(toEmail, otp) {
  await transporter.sendMail({
    from: `"CARBOOK" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Mã xác thực đặt lại mật khẩu - CARBOOK',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 16px;">
        <h2 style="color:#0A2342;">Đặt lại mật khẩu</h2>
        <p>Mã xác thực (OTP) của bạn là:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color:#0A2342;">${otp}</p>
        <p>Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
      </div>
    `,
  });
}

async function sendWithdrawOtpEmail(toEmail, otp, amount) {
  await transporter.sendMail({
    from: `"CARBOOK PAY" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Xác thực giao dịch rút tiền - CARBOOK PAY',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 16px;">
        <h2 style="color:#0A2342;">Xác thực giao dịch rút tiền</h2>
        <p>Bạn đã yêu cầu rút số tiền: <strong>${amount.toLocaleString('vi-VN')} VNĐ</strong> từ ví CarbookPay.</p>
        <p>Mã xác thực giao dịch (OTP) của bạn là:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color:#0A2342;">${otp}</p>
        <p>Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai để đảm bảo an toàn tài chính.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail, sendWithdrawOtpEmail };
