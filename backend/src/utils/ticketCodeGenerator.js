const crypto = require('crypto');
const { db } = require('../config/firebase');

// Sinh maDatVe dạng MM-YYYY-NNNNNNNN, retry nếu trùng document đã tồn tại
async function genMaDatVe() {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt++) {
    const maDatVe = `MM-${year}-${crypto.randomInt(10000000, 99999999)}`;
    const doc = await db.collection('VEXE').doc(maDatVe).get();
    if (!doc.exists) return maDatVe;
  }

  throw new Error('Không thể sinh mã đặt vé, vui lòng thử lại.');
}

module.exports = { genMaDatVe };
