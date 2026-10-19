// Che thông tin nhạy cảm (sđt/email) khi trả về cho màn hình chỉ xem, không cho sửa

function maskPhone(phone) {
  if (!phone || phone.length < 5) return phone || '';
  const head = phone.slice(0, 3);
  const tail = phone.slice(-2);
  const stars = '*'.repeat(Math.max(phone.length - head.length - tail.length, 3));
  return `${head}${stars}${tail}`;
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0] || ''}*@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(local.length - 2)}@${domain}`;
}

module.exports = { maskPhone, maskEmail };
