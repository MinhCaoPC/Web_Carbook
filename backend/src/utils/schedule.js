// Chuyến xe lặp lại mỗi ngày theo cùng 1 giờ cố định (CHUYENXE là "mẫu"). Hệ thống chỉ hỗ trợ
// xem/đặt vé trong đúng SO_NGAY_LAP_LAI ngày tới — dữ liệu ghế cho các ngày này được sinh sẵn
// bằng script scripts/generateDailySchedules.js (chạy lại mỗi ngày để cửa sổ luôn trượt tới).
const SO_NGAY_LAP_LAI = 4;

function localDateStr(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function congNgay(date, soNgay) {
  const result = new Date(date);
  result.setDate(result.getDate() + soNgay);
  return result;
}

// Danh sách ngày (yyyy-MM-dd) được phép xem/đặt: hôm nay + 3 ngày tiếp theo
function layDanhSachNgayChoPhep(tuNgay = new Date()) {
  const danhSach = [];
  for (let i = 0; i < SO_NGAY_LAP_LAI; i++) {
    danhSach.push(localDateStr(congNgay(tuNgay, i)));
  }
  return danhSach;
}

function ngayHopLe(ngayDiStr, tuNgay = new Date()) {
  return layDanhSachNgayChoPhep(tuNgay).includes(ngayDiStr);
}

// Ghép ngày cụ thể (yyyy-MM-dd) với giờ:phút:giây của 1 timestamp mẫu (dùng để chiếu giờ cố
// định của chuyến/lịch trình lên đúng ngày người dùng chọn — chỉ áp dụng cho hiển thị thông
// tin, KHÔNG áp dụng cho trạng thái ghế/vé).
function ghepNgayGio(ngayDiStr, gioMau) {
  const [year, month, day] = ngayDiStr.split('-').map(Number);
  const result = new Date(gioMau);
  result.setFullYear(year, month - 1, day);
  return result;
}

module.exports = { SO_NGAY_LAP_LAI, localDateStr, congNgay, layDanhSachNgayChoPhep, ngayHopLe, ghepNgayGio };
