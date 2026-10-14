// Sinh mã QR cho vé (chuỗi định danh, không phụ thuộc thư viện QR ngoài)
function genMaQR(maChuyenXe, maGhe, maDatVe) {
  return `MM-${maChuyenXe}-${maGhe}-${maDatVe}`;
}

module.exports = { genMaQR };
