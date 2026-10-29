const { db } = require('../config/firebase');

const VEXE_COLLECTION = 'VEXE';
const CHUYENXE_COLLECTION = 'CHUYENXE';
const LOTRINH_COLLECTION = 'LOTRINH';
const XE_COLLECTION = 'XE';

// 1. Lấy thống kê: Tổng doanh thu, Số HD đã thanh toán, Số HD đã hủy
exports.getInvoiceStats = async (req, res) => {
  try {
    const hoadonSnap = await db.collection('HOADON').where('trangThaiTT', '==', 'TC').get();
    let totalRevenue = 0;
    let paidCount = hoadonSnap.size;
    hoadonSnap.forEach(doc => {
      totalRevenue += (doc.data().tongTien || 0);
    });

    const cancelledSnap = await db.collection(VEXE_COLLECTION).where('trangThaiVe', '==', 'HUY').get();
    let cancelledCount = cancelledSnap.size;

    return res.status(200).json({
      success: true,
      data: {
        totalRevenue,
        paidCount,
        cancelledCount
      }
    });
  } catch (error) {
    console.error('getInvoiceStats error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

// 2. Lấy danh sách hóa đơn (đơn đặt chuyến xe)
exports.getInvoices = async (req, res) => {
  try {
    const { startDate, endDate, status, search } = req.query;
    
    let query = db.collection(VEXE_COLLECTION).where('trangThaiVe', 'in', ['DA_TT', 'HUY']);
    
    const snap = await query.get();
    
    let results = [];
    const start = startDate ? new Date(startDate).setHours(0,0,0,0) : 0;
    const end = endDate ? new Date(endDate).setHours(23,59,59,999) : Infinity;
    const searchTerm = search ? search.toLowerCase() : '';

    // Lấy phương thức thanh toán thật từ HOADON (maDatVe -> phuongThucTT), tránh vòng lặp
    // N+1 bằng cách gộp truy vấn theo lô 30 (giới hạn "in" của Firestore).
    const paymentMethodByTicket = {};
    const ticketIds = snap.docs.map((doc) => doc.id);
    for (let i = 0; i < ticketIds.length; i += 30) {
      const chunk = ticketIds.slice(i, i + 30);
      if (chunk.length === 0) continue;
      const hoadonSnap = await db.collection('HOADON').where('maDatVe', 'in', chunk).get();
      hoadonSnap.forEach((hd) => {
        const hdData = hd.data();
        paymentMethodByTicket[hdData.maDatVe] = hdData.phuongThucTT;
      });
    }
    const PAYMENT_METHOD_LABEL = { CARBOOKPAY: 'Ví CarbookPay', VNPAY: 'VNPay' };

    // Lấy thông tin phụ (Chuyến xe, Lộ trình, Xe) để cache giảm tải reads
    const tripsCache = {};
    const routesCache = {};
    const vehiclesCache = {};

    for (const doc of snap.docs) {
      const data = doc.data();
      
      // Filter by Status
      if (status && status !== 'ALL') {
        if (status === 'DA_THANH_TOAN' && data.trangThaiVe !== 'DA_TT') continue;
        if (status === 'DA_HOAN_TIEN' && data.trangThaiVe !== 'HUY') continue;
      }
      
      // Lấy thời gian thanh toán/hủy (dùng thoiGianDat hoặc ngayCapNhat)
      const timeDate = data.ngayCapNhat ? data.ngayCapNhat.toDate() : (data.thoiGianDat ? data.thoiGianDat.toDate() : new Date());
      const time = timeDate.getTime();
      
      // Filter by Date range
      if (time >= start && time <= end) {
        // Filter by Search (Mã vé hoặc tên khách)
        const ticketId = data.maDatVe || doc.id;
        const customerName = data.hoTenHanhKhach || 'Khách vãng lai';
        const customerPhone = data.sdtHanhKhach || '';
        
        if (searchTerm) {
          if (!ticketId.toLowerCase().includes(searchTerm) && 
              !customerName.toLowerCase().includes(searchTerm) &&
              !customerPhone.toLowerCase().includes(searchTerm)) {
            continue;
          }
        }

        // Fetch Trip details
        let tripDetails = 'Đang tải...';
        if (data.maChuyenXe) {
          if (!tripsCache[data.maChuyenXe]) {
            const tripDoc = await db.collection(CHUYENXE_COLLECTION).doc(data.maChuyenXe).get();
            if (tripDoc.exists) {
              const tripData = tripDoc.data();
              tripsCache[data.maChuyenXe] = tripData;
              
              if (!routesCache[tripData.maLoTrinh]) {
                const routeDoc = await db.collection(LOTRINH_COLLECTION).doc(tripData.maLoTrinh).get();
                routesCache[tripData.maLoTrinh] = routeDoc.exists ? routeDoc.data() : { tenLoTrinh: 'Không xác định' };
              }
              if (!vehiclesCache[tripData.maXe]) {
                const vehicleDoc = await db.collection(XE_COLLECTION).doc(tripData.maXe).get();
                vehiclesCache[tripData.maXe] = vehicleDoc.exists ? vehicleDoc.data() : { bienSoXe: 'N/A' };
              }
            } else {
              tripsCache[data.maChuyenXe] = null;
            }
          }

          const tripInfo = tripsCache[data.maChuyenXe];
          if (tripInfo) {
            const routeInfo = routesCache[tripInfo.maLoTrinh];
            const vehicleInfo = vehiclesCache[tripInfo.maXe];
            const startName = routeInfo.diemKhoiHanh ? routeInfo.diemKhoiHanh.split('(')[0].trim() : '';
            const endName = routeInfo.diemKetThuc ? routeInfo.diemKetThuc.split('(')[0].trim() : '';
            tripDetails = {
              route: `${startName} → ${endName}`,
              vehicle: `Xe: ${vehicleInfo.bienSoXe || 'N/A'}`
            };
          } else {
            tripDetails = { route: 'Chuyến xe bị xóa', vehicle: '' };
          }
        }

        results.push({
          id: doc.id,
          invoiceId: ticketId,
          customerName,
          customerPhone,
          tripDetails,
          paymentDate: timeDate.toISOString(),
          paymentMethod: PAYMENT_METHOD_LABEL[paymentMethodByTicket[ticketId]] || 'Không xác định',
          amount: data.thanhTien || data.giaVeGoc || 0,
          status: data.trangThaiVe === 'DA_TT' ? 'DA_THANH_TOAN' : 'DA_HOAN_TIEN'
        });
      }
    }
    
    // Sắp xếp mới nhất lên đầu
    results.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());

    return res.status(200).json({ success: true, data: results });
  } catch (error) {
    console.error('getInvoices error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

// 3. Xem chi tiết hóa đơn (Tương tự như API khách hàng xem vé)
exports.getInvoiceDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(VEXE_COLLECTION).doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn' });
    }
    const data = doc.data();

    // Convert Firestore Timestamp to string for ticket
    if (data.thoiGianDat && data.thoiGianDat.toDate) data.thoiGianDat = data.thoiGianDat.toDate().toISOString();
    if (data.ngayCapNhat && data.ngayCapNhat.toDate) data.ngayCapNhat = data.ngayCapNhat.toDate().toISOString();
    if (data.hetHanGiuVe && data.hetHanGiuVe.toDate) data.hetHanGiuVe = data.hetHanGiuVe.toDate().toISOString();

    const { layChiTietNhomVe } = require('../services/reservationService');
    const chiTiet = await layChiTietNhomVe([id]);

    // Convert timestamps in chiTiet
    if (chiTiet.chuyenXe) {
      if (chiTiet.chuyenXe.thoiGianXuatPhat && chiTiet.chuyenXe.thoiGianXuatPhat.toDate) {
        chiTiet.chuyenXe.thoiGianXuatPhat = chiTiet.chuyenXe.thoiGianXuatPhat.toDate().toISOString();
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ticket: data,
        details: chiTiet
      }
    });
  } catch (error) {
    console.error('getInvoiceDetail error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
};
