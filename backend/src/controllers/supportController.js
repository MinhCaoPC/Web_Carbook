const { db } = require('../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');

const YEUCAUHOTRO_COLLECTION = 'YEUCAUHOTRO';

// 1. API: Tạo yêu cầu hỗ trợ mới (POST)
exports.createSupportRequest = async (req, res) => {
  try {
    const { maKhachHang, maDatVe, loaiYeuCau, noiDungYeuCau, thongTinLienHe } = req.body;

    if (!maKhachHang || !loaiYeuCau || !noiDungYeuCau) {
      return res.status(400).json({ 
        success: false, 
        message: 'Thiếu thông tin bắt buộc (maKhachHang, loaiYeuCau, noiDungYeuCau).' 
      });
    }

    const newRequestRef = db.collection(YEUCAUHOTRO_COLLECTION).doc();

    const requestData = {
      maYeuCau: newRequestRef.id,
      maKhachHang: maKhachHang,
      maDatVe: maDatVe || null,
      loaiYeuCau: loaiYeuCau,
      noiDungYeuCau: noiDungYeuCau,
      thongTinLienHe: thongTinLienHe,
      trangThai: 'CHO', 
      phanHoiAdmin: null,
      thoiGianTao: FieldValue.serverTimestamp(),
    };

    await newRequestRef.set(requestData);

    return res.status(201).json({ 
      success: true, 
      message: 'Gửi yêu cầu hỗ trợ thành công!', 
      data: requestData 
    });

  } catch (error) {
    console.error('Lỗi khi tạo yêu cầu hỗ trợ:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi máy chủ khi gửi yêu cầu hỗ trợ.' 
    });
  }
};

// 2. API: Lấy danh sách lịch sử yêu cầu hỗ trợ của khách hàng (GET)
exports.getSupportHistory = async (req, res) => {
  try {
    const { maKhachHang } = req.params;

    if (!maKhachHang) {
      return res.status(400).json({ 
        success: false, 
        message: 'Thiếu mã khách hàng.' 
      });
    }

    // Truy vấn các yêu cầu của user này
    const snapshot = await db.collection(YEUCAUHOTRO_COLLECTION)
      .where('maKhachHang', '==', maKhachHang)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ 
        success: true, 
        data: [] 
      });
    }

    let requests = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Định dạng lại thời gian (nếu lấy từ Firestore Timestamp)
      let thoiGianTaoStr = '';
      if (data.thoiGianTao) {
        // Chuyển Timestamp thành String ngày/tháng/năm giờ:phút
        const dateObj = data.thoiGianTao.toDate();
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const yyyy = dateObj.getFullYear();
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        thoiGianTaoStr = `${dd}/${mm}/${yyyy} ${hh}:${min}`;
      }

      // Logic xử lý phản hồi từ Admin
      const phanHoi = (data.phanHoiAdmin && data.phanHoiAdmin.trim() !== '') 
        ? data.phanHoiAdmin 
        : 'Yêu cầu hiện đang chờ xử lý.';

      requests.push({
        maYeuCau: data.maYeuCau,
        loaiYeuCau: data.loaiYeuCau,
        noiDungYeuCau: data.noiDungYeuCau,
        thongTinLienHe: data.thongTinLienHe,
        trangThai: data.trangThai,
        thoiGianTao: thoiGianTaoStr,
        phanHoiAdmin: phanHoi // Trả về phản hồi hoặc câu mặc định
      });
    });

    // Sắp xếp giảm dần theo thời gian tạo (mới nhất lên đầu)
    // Sắp xếp bằng JS để tránh lỗi thiếu Index trên Firestore khi kết hợp .where() và .orderBy()
    requests.sort((a, b) => {
      // Vì chuỗi ngày đang dạng DD/MM/YYYY HH:mm nên cần tách ra để so sánh
      const parseDate = (str) => {
        if (!str) return 0;
        const [datePart, timePart] = str.split(' ');
        const [d, m, y] = datePart.split('/');
        return new Date(`${y}-${m}-${d}T${timePart}:00`).getTime();
      };
      return parseDate(b.thoiGianTao) - parseDate(a.thoiGianTao);
    });

    return res.status(200).json({ 
      success: true, 
      data: requests 
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách yêu cầu hỗ trợ:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi máy chủ khi lấy dữ liệu hỗ trợ.' 
    });
  }
};