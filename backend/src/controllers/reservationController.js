const reservationService = require('../services/reservationService');

function parseDanhSachMaDatVe(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function handleError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({ success: false, message: error.message || fallbackMessage });
}

// POST /api/dat-ve/giu-cho
exports.giuCho = async (req, res) => {
  try {
    const result = await reservationService.giuCho(req.body);
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi giữ chỗ.');
  }
};

// GET /api/dat-ve/kiem-tra?danhSachMaDatVe=...
// Token đăng nhập (nếu có và đúng chủ vé) sẽ trả về thông tin gốc (không mask) để hiển thị/sửa
exports.kiemTra = async (req, res) => {
  try {
    const danhSachMaDatVe = parseDanhSachMaDatVe(req.query.danhSachMaDatVe);
    const result = await reservationService.kiemTraThongTin(danhSachMaDatVe, {
      maskThongTin: true,
      maKhachHangDangNhap: req.maKhachHangDangNhap,
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi kiểm tra thông tin vé.');
  }
};

// PATCH /api/dat-ve/thong-tin-hanh-khach
exports.thongTinHanhKhach = async (req, res) => {
  try {
    const result = await reservationService.capNhatThongTinHanhKhach({
      ...req.body,
      maKhachHangDangNhap: req.maKhachHangDangNhap,
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi cập nhật thông tin hành khách.');
  }
};

// PATCH /api/dat-ve/diem-don-tra
exports.diemDonTra = async (req, res) => {
  try {
    const result = await reservationService.capNhatDiemDonTra({
      ...req.body,
      maKhachHangDangNhap: req.maKhachHangDangNhap,
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi cập nhật điểm đón/trả.');
  }
};

// POST /api/dat-ve/nha-ghe-va-chon-lai
exports.nhaGheVaChonLai = async (req, res) => {
  try {
    const result = await reservationService.nhaGheVaChonLai({
      ...req.body,
      maKhachHangDangNhap: req.maKhachHangDangNhap,
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi nhả ghế.');
  }
};

// GET /api/dat-ve/thanh-toan?danhSachMaDatVe=...
exports.thongTinThanhToan = async (req, res) => {
  try {
    const danhSachMaDatVe = parseDanhSachMaDatVe(req.query.danhSachMaDatVe);
    const result = await reservationService.layThongTinThanhToan(danhSachMaDatVe, {
      maskThongTin: true,
      maKhachHangDangNhap: req.maKhachHangDangNhap,
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, 'Lỗi máy chủ khi lấy thông tin thanh toán.');
  }
};
