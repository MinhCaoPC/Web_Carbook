const REGION_MAP = {
  // Miền Bắc
  "Hà Nội": "MienBac", "Hải Phòng": "MienBac", "Hà Giang": "MienBac", "Cao Bằng": "MienBac",
  "Lai Châu": "MienBac", "Lào Cai": "MienBac", "Tuyên Quang": "MienBac", "Lạng Sơn": "MienBac",
  "Bắc Kạn": "MienBac", "Thái Nguyên": "MienBac", "Yên Bái": "MienBac", "Sơn La": "MienBac",
  "Phú Thọ": "MienBac", "Vĩnh Phúc": "MienBac", "Quảng Ninh": "MienBac", "Bắc Giang": "MienBac",
  "Bắc Ninh": "MienBac", "Hải Dương": "MienBac", "Hưng Yên": "MienBac", "Hòa Bình": "MienBac",
  "Hà Nam": "MienBac", "Nam Định": "MienBac", "Thái Bình": "MienBac", "Ninh Bình": "MienBac",
  // Miền Trung
  "Thanh Hóa": "MienTrung", "Nghệ An": "MienTrung", "Hà Tĩnh": "MienTrung",
  "Quảng Bình": "MienTrung", "Quảng Trị": "MienTrung", "Thừa Thiên Huế": "MienTrung",
  "Đà Nẵng": "MienTrung", "Quảng Nam": "MienTrung", "Quảng Ngãi": "MienTrung",
  "Bình Định": "MienTrung", "Phú Yên": "MienTrung", "Khánh Hòa": "MienTrung",
  "Ninh Thuận": "MienTrung", "Bình Thuận": "MienTrung", "Kon Tum": "MienTrung",
  "Gia Lai": "MienTrung", "Đắk Lắk": "MienTrung", "Đắk Nông": "MienTrung", "Lâm Đồng": "MienTrung",
  // Miền Nam
  "TP. Hồ Chí Minh": "MienNam", "TP.HCM": "MienNam", "Bình Phước": "MienNam", "Tây Ninh": "MienNam",
  "Bình Dương": "MienNam", "Đồng Nai": "MienNam", "Bà Rịa - Vũng Tàu": "MienNam",
  "Long An": "MienNam", "Đồng Tháp": "MienNam", "Tiền Giang": "MienNam", "An Giang": "MienNam",
  "Bến Tre": "MienNam", "Vĩnh Long": "MienNam", "Trà Vinh": "MienNam", "Hậu Giang": "MienNam",
  "Kiên Giang": "MienNam", "Sóc Trăng": "MienNam", "Bạc Liêu": "MienNam", "Cà Mau": "MienNam",
  "Cần Thơ": "MienNam"
};

function normalizeProvinceName(name) {
  if (!name) return "";
  let n = name.trim();
  
  const hcmAliases = ["tp.hcm", "tp hcm", "tphcm", "hồ chí minh", "ho chi minh", "tp. hồ chí minh", "tp hồ chí minh", "tp.hồ chí minh"];
  if (hcmAliases.includes(n.toLowerCase())) {
    return "TP.HCM";
  }

  // Capitalize first letters for matching existing provinces
  return n.split(/\s+/).map(word => {
    if (word.length === 0) return "";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(" ");
}

function getRegionFromProvince(tinhThanh) {
  const normalized = normalizeProvinceName(tinhThanh);
  return REGION_MAP[normalized] || "KhongXacDinh";
}

module.exports = { getRegionFromProvince, normalizeProvinceName, REGION_MAP };
