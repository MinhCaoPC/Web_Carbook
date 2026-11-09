const { db } = require('../config/firebase');
const { ngayHopLe, layDanhSachNgayChoPhep } = require('../utils/schedule');
const { luuTimKiem } = require('../services/searchHistoryService');
const { laLoTrinhMienTay, chonChuyenMoiTuyen } = require('../utils/mekong');

const LOTRINH_COLLECTION = 'LOTRINH';
const CHUYENXE_COLLECTION = 'CHUYENXE';
const CHUYENXE_NGAY_COLLECTION = 'CHUYENXE_NGAY';
const XE_COLLECTION = 'XE';
const GHEXE_COLLECTION = 'GHEXE';

// Chuẩn hóa để so khớp: bỏ dấu tiếng Việt, gộp khoảng trắng thừa, không phân biệt hoa thường
function normalize(text) {
  return (text || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatHHmm(date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Cache danh sách lộ trình trong RAM 5 phút: dữ liệu lộ trình gần như tĩnh, trong khi
// getLocations/search bị gọi rất thường xuyên (mỗi lần đọc cả 64 document) — cache giúp
// giảm mạnh lượt đọc Firestore, tránh cạn quota gói miễn phí (Spark: 50k lượt đọc/ngày).
let lotrinhCache = { data: null, expireAt: 0 };

async function layLoTrinhHoatDong() {
  const now = Date.now();
  if (lotrinhCache.data && now < lotrinhCache.expireAt) return lotrinhCache.data;

  const snapshot = await db.collection(LOTRINH_COLLECTION).where('trangThai', '==', 'HoatDong').get();
  lotrinhCache = {
    // Chỉ phục vụ khu vực miền Tây (xem utils/mekong.js)
    data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(laLoTrinhMienTay),
    expireAt: now + 5 * 60 * 1000,
  };
  return lotrinhCache.data;
}

// Tìm tất cả lộ trình khớp điểm đi / điểm đến (không phân biệt hoa thường, khoảng trắng)
async function findMatchingRoutes(from, to) {
  const routes = await layLoTrinhHoatDong();
  const nFrom = normalize(from);
  const nTo = normalize(to);

  return routes.filter(
    (r) => normalize(r.diemKhoiHanh) === nFrom && normalize(r.diemKetThuc) === nTo
  );
}

// Chuyến (CHUYENXE) là "mẫu" lặp lại mỗi ngày theo cùng 1 giờ. Ghế/trạng thái của mỗi ngày
// nằm ở CHUYENXE_NGAY + GHEXE (scope theo ngayDi) — được sinh sẵn bởi
// scripts/generateDailySchedules.js cho SO_NGAY_LAP_LAI ngày tới. Chỉ những chuyến đã có
// CHUYENXE_NGAY cho đúng ngày mới hiển thị được (script chưa chạy -> chưa mở bán ngày đó).
async function timChuyenTheoNgay(from, to, date) {
  const routes = await findMatchingRoutes(from, to);
  if (routes.length === 0) {
    return [];
  }

  const routeIds = routes.map((r) => r.id);
  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));

  // Firestore giới hạn 'in' tối đa 30 giá trị / query
  const chunks = [];
  for (let i = 0; i < routeIds.length; i += 30) {
    chunks.push(routeIds.slice(i, i + 30));
  }

  const chuyenXeDocs = [];
  for (const chunk of chunks) {
    const snapshot = await db.collection(CHUYENXE_COLLECTION).where('maLoTrinh', 'in', chunk).get();
    snapshot.forEach((doc) => chuyenXeDocs.push({ id: doc.id, ...doc.data() }));
  }

  // Giới hạn số chuyến mỗi tuyến/ngày (khớp lịch do tripScheduleGenerationService sinh)
  const activeTrips = chonChuyenMoiTuyen(chuyenXeDocs.filter((trip) => trip.trangThai !== 'Huy'));

  // Đọc CHUYENXE_NGAY cho đúng ngày được chọn (đã sinh sẵn bằng script)
  const chuyenXeNgayById = {};
  const idChunks = [];
  for (let i = 0; i < activeTrips.length; i += 30) {
    idChunks.push(activeTrips.slice(i, i + 30).map((t) => `${t.id}_${date}`));
  }
  for (const chunk of idChunks) {
    if (chunk.length === 0) continue;
    const snapshot = await db.collection(CHUYENXE_NGAY_COLLECTION).where('__name__', 'in', chunk).get();
    snapshot.forEach((doc) => (chuyenXeNgayById[doc.id] = doc.data()));
  }

  const currentTime = new Date(); // Lấy thời gian hiện tại để so sánh

  const tripsWithInstance = activeTrips
    .map((trip) => ({ trip, chuyenXeNgay: chuyenXeNgayById[`${trip.id}_${date}`] }))
    .filter(({ chuyenXeNgay }) => {
        if (!chuyenXeNgay || chuyenXeNgay.trangThai === 'Huy' || !chuyenXeNgay.thoiGianXuatPhat) return false;

        // Chuyển đổi thoiGianXuatPhat từ Firestore Timestamp sang Javascript Date
        const departureTime = chuyenXeNgay.thoiGianXuatPhat.toDate();

        // Loại bỏ chuyến xe nếu thời gian xuất phát đã qua (chỉ ảnh hưởng ngày hôm nay,
        // các ngày tương lai luôn có giờ xuất phát > hiện tại nên không bị ẩn nhầm)
        if (departureTime < currentTime) {
            return false;
        }

        return true;
    });

  const xeIds = [...new Set(tripsWithInstance.map(({ trip }) => trip.maXe))];
  const xeById = {};
  for (let i = 0; i < xeIds.length; i += 30) {
    const chunk = xeIds.slice(i, i + 30);
    const snapshot = await db.collection(XE_COLLECTION).where('__name__', 'in', chunk).get();
    snapshot.forEach((doc) => (xeById[doc.id] = doc.data()));
  }

  const trips = await Promise.all(
    tripsWithInstance.map(async ({ trip, chuyenXeNgay }) => {
      const departure = chuyenXeNgay.thoiGianXuatPhat.toDate();
      const arrival = chuyenXeNgay.thoiGianDenDich.toDate();

      const seatsSnapshot = await db
        .collection(GHEXE_COLLECTION)
        .where('maChuyenXe', '==', trip.id)
        .where('ngayDi', '==', date)
        .where('trangThai', '==', 'TRONG')
        .count()
        .get();

      const route = routeById[trip.maLoTrinh];
      const xe = xeById[trip.maXe] || {};

      return {
        maChuyenXe: trip.id,
        maLoTrinh: trip.maLoTrinh,
        tenLoTrinh: route?.tenLoTrinh || '',
        diemKhoiHanh: route?.diemKhoiHanh || '',
        diemKetThuc: route?.diemKetThuc || '',
        thoiGianXuatPhat: departure.toISOString(),
        thoiGianDenDich: arrival.toISOString(),
        gioXuatPhat: formatHHmm(departure),
        gioDenDich: formatHHmm(arrival),
        tenLoaiXe: xe.tenLoaiXe || '',
        bienSoXe: xe.bienSoXe || '',
        giaVe: trip.giaVe,
        soGheConTrong: seatsSnapshot.data().count,
        tongSoGhe: xe.tongSoGhe || chuyenXeNgay.soGheConTrong,
      };
    })
  );

  trips.sort((a, b) => new Date(a.thoiGianXuatPhat) - new Date(b.thoiGianXuatPhat));

  return trips;
}

// GET /api/trips/search?from=&to=&date=&soLuongVe=&ngayVe=
// - soLuongVe (tùy chọn, mặc định 1): mỗi chuyến trả thêm cờ `duVe` = còn đủ ghế trống cho số vé cần.
// - ngayVe (tùy chọn, khứ hồi): trả thêm `tripsVe` là các chuyến chiều về (đảo điểm đi/đến).
// - Cả ngày đi lẫn ngày về đều phải nằm trong cửa sổ ngày đã sinh lịch trình (ngayHopLe).
// - Nếu request có token đăng nhập hợp lệ thì lưu vào lịch sử "Tìm kiếm gần đây".
exports.searchTrips = async (req, res) => {
  try {
    const { from, to, date, ngayVe } = req.query;

    if (!from || !to || !date) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp điểm đi, điểm đến và ngày đi.' });
    }

    const soLuongVe = Number(req.query.soLuongVe || 1);
    if (!Number.isInteger(soLuongVe) || soLuongVe < 1 || soLuongVe > 5) {
      return res.status(400).json({ success: false, message: 'Số lượng vé phải là số nguyên từ 1 đến 5.' });
    }

    const thongBaoCuaSoNgay = (nhan) =>
      `${nhan} không hợp lệ: chỉ hỗ trợ trong ${layDanhSachNgayChoPhep().length} ngày tới (${layDanhSachNgayChoPhep().join(', ')}).`;

    if (!ngayHopLe(date)) {
      return res.status(400).json({ success: false, message: thongBaoCuaSoNgay('Ngày đi') });
    }

    if (ngayVe) {
      if (!ngayHopLe(ngayVe)) {
        return res.status(400).json({ success: false, message: thongBaoCuaSoNgay('Ngày về') });
      }
      if (ngayVe < date) {
        return res.status(400).json({ success: false, message: 'Ngày về phải sau hoặc trùng ngày đi.' });
      }
    }

    const ganCoDuVe = (trip) => ({ ...trip, duVe: trip.soGheConTrong >= soLuongVe });

    const trips = (await timChuyenTheoNgay(from, to, date)).map(ganCoDuVe);
    const tripsVe = ngayVe ? (await timChuyenTheoNgay(to, from, ngayVe)).map(ganCoDuVe) : undefined;

    // Lưu lịch sử tìm kiếm nếu đã đăng nhập — không chặn/không làm hỏng kết quả khi lưu lỗi
    const maKhachHang = req.maKhachHangDangNhap;
    if (maKhachHang) {
      luuTimKiem(maKhachHang, { diemDi: from, diemDen: to, ngayDi: date, ngayVe: ngayVe || null, soLuongVe }).catch(
        (err) => console.error('luuTimKiem error:', err)
      );
    }

    return res.status(200).json({
      success: true,
      soLuongVe,
      trips,
      ...(ngayVe ? { ngayVe, tripsVe } : {}),
    });
  } catch (error) {
    console.error('searchTrips error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tìm kiếm chuyến xe.' });
  }
};

// Trả về danh sách điểm đi/điểm đến duy nhất để hiển thị màn hình chọn điểm
exports.getLocations = async (req, res) => {
  try {
    const routes = await layLoTrinhHoatDong(); // dùng cache, không đọc Firestore mỗi lần
    const set = new Set();
    routes.forEach((data) => {
      if (data.diemKhoiHanh) set.add(data.diemKhoiHanh);
      if (data.diemKetThuc) set.add(data.diemKetThuc);
    });

    // Sắp theo bảng chữ cái tiếng Việt (sort() mặc định xếp sai các tên có dấu như "Đầm Dơi")
    return res.status(200).json({ success: true, locations: [...set].sort((a, b) => a.localeCompare(b, 'vi')) });
  } catch (error) {
    console.error('getLocations error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách điểm đi/đến.' });
  }
};

// Trả về các ngày còn cho phép tìm/đặt vé (cửa sổ lặp lại) để hiển thị lịch chọn ngày
exports.getNgayChoPhep = async (req, res) => {
  return res.status(200).json({ success: true, danhSachNgay: layDanhSachNgayChoPhep() });
};

// GET /api/trips/tuyen — các cặp (điểm đi -> điểm đến) CÓ lộ trình hoạt động, để giao diện chỉ cho chọn tuyến có thật
exports.getTuyen = async (req, res) => {
  try {
    const routes = await layLoTrinhHoatDong();
    const seen = new Set();
    const tuyen = [];
    routes.forEach((r) => {
      const k = `${r.diemKhoiHanh}|${r.diemKetThuc}`;
      if (r.diemKhoiHanh && r.diemKetThuc && !seen.has(k)) { seen.add(k); tuyen.push({ from: r.diemKhoiHanh, to: r.diemKetThuc }); }
    });
    return res.status(200).json({ success: true, tuyen });
  } catch (error) {
    console.error('getTuyen error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tuyến.' });
  }
};
