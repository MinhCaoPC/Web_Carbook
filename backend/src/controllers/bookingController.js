const { db } = require('../config/firebase');
const { kiemTraThongTin } = require('../services/reservationService');

// GET /api/bookings/ticket/:maDatVe — chi tiết "vé lên xe" (boarding pass) của 1 vé.
// Tự gộp mọi vé cùng nhóm đặt (maNhomDat) để hiển thị đủ chỗ ngồi; chỉ chủ vé
// (header x-ma-khach-hang khớp) mới xem được thông tin không che.
exports.getTicketDetail = async (req, res) => {
  try {
    const { maDatVe } = req.params;
    const veDoc = await db.collection('VEXE').doc(maDatVe).get();
    if (!veDoc.exists) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy vé.' });
    }

    const maKhachHangDangNhap = req.headers['x-ma-khach-hang'];
    if (!maKhachHangDangNhap || veDoc.data().maKhachHang !== maKhachHangDangNhap) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem vé của khách hàng khác.' });
    }

    // Gộp các vé đặt cùng lượt (vé cũ thiếu maNhomDat thì hiển thị riêng vé đó)
    let danhSachMaDatVe = [maDatVe];
    const maNhomDat = veDoc.data().maNhomDat;
    if (maNhomDat) {
      const nhomSnap = await db.collection('VEXE').where('maNhomDat', '==', maNhomDat).get();
      danhSachMaDatVe = nhomSnap.docs.map((doc) => doc.id);
    }

    const result = await kiemTraThongTin(danhSachMaDatVe, { maskThongTin: true, maKhachHangDangNhap });
    return res.status(200).json({ ...result, danhSachMaDatVe });
  } catch (error) {
    console.error('getTicketDetail error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message || 'Lỗi máy chủ khi lấy chi tiết vé.' });
  }
};

// GET /api/bookings/history/:customerId
exports.getBookingHistory = async (req, res) => {
  try {
    const customerId = req.params.customerId;
    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Missing customer ID' });
    }

    // 1. Truy vấn tất cả vé của khách hàng
    const ticketSnap = await db.collection('VEXE').where('maKhachHang', '==', customerId).get();
    
    if (ticketSnap.empty) {
      return res.status(200).json({ success: true, data: [] });
    }

    const now = new Date();
    const results = [];

    // 2. Lặp qua từng vé để lấy thông tin Chuyến Xe và Lộ Trình
    for (const doc of ticketSnap.docs) {
      const ticket = doc.data();
      
      // Bỏ qua các vé đang giữ chỗ (chưa thanh toán)
      if (ticket.trangThaiVe === 'GIU_CHO') continue;

      // Bỏ qua vé nháp bị hủy khi khách "chọn lại ghế" (nha-ghe-va-chon-lai): các vé này
      // CHƯA TỪNG thanh toán (không có maQR/thông tin hoàn tiền) nên không phải lịch sử
      // thật — nếu hiển thị sẽ tạo ra các dòng "Đã huỷ" trùng lặp với vé thật cùng chuyến.
      const chuaTungThanhToan = !ticket.maQR && !ticket.txHashRefund && ticket.soTienHoan === undefined;
      if (ticket.trangThaiVe === 'HUY' && chuaTungThanhToan) continue;

      // Lấy thông tin chuyến xe
      const tripDoc = await db.collection('CHUYENXE').doc(ticket.maChuyenXe).get();
      if (!tripDoc.exists) continue;
      const trip = tripDoc.data();

      // Lấy thông tin lộ trình
      const routeDoc = await db.collection('LOTRINH').doc(trip.maLoTrinh).get();
      const route = routeDoc.exists ? routeDoc.data() : {};

      // Giờ khởi hành thật của ĐÚNG ngày đi lấy từ CHUYENXE_NGAY (chuyến mẫu lặp lại mỗi ngày
      // nên thoiGianXuatPhat trên CHUYENXE chỉ là giờ mẫu); thiếu thì fallback giờ mẫu.
      let departureTime = trip.thoiGianXuatPhat ? trip.thoiGianXuatPhat.toDate() : new Date();
      if (ticket.ngayDi) {
        const ngayDoc = await db.collection('CHUYENXE_NGAY').doc(`${ticket.maChuyenXe}_${ticket.ngayDi}`).get();
        if (ngayDoc.exists && ngayDoc.data().thoiGianXuatPhat) {
          departureTime = ngayDoc.data().thoiGianXuatPhat.toDate();
        }
      }

      // 3. Phân loại trạng thái (Sắp đi, Đã đi, Đã huỷ)
      // PENDING = đang hủy/hoàn tiền dở dang -> coi như đã hủy (refresh sẽ cập nhật kết quả cuối)
      let statusStr = 'completed';
      if (ticket.trangThaiVe === 'HUY' || ticket.trangThaiVe === 'HOAN' || ticket.trangThaiVe === 'PENDING') {
        statusStr = 'cancelled';
      } else if (ticket.trangThaiVe === 'DA_TT') {
        if (departureTime > now) {
          statusStr = 'upcoming';
        } else {
          statusStr = 'completed';
        }
      }

      // 4. Định dạng hiển thị
      const dateStr = `${String(departureTime.getDate()).padStart(2, '0')}/${String(departureTime.getMonth() + 1).padStart(2, '0')}/${departureTime.getFullYear()}`;
      const timeStr = `${String(departureTime.getHours()).padStart(2, '0')}:${String(departureTime.getMinutes()).padStart(2, '0')}`;

      const price = ticket.thanhTien || ticket.giaVeGoc || 0;

      results.push({
        // Mã đặt vé là doc id của VEXE (không phải field trong document)
        id: doc.id,
        date: dateStr,
        time: timeStr,
        company: 'CARBOOK Express',
        from: route.diemKhoiHanh || 'Unknown',
        to: route.diemKetThuc || 'Unknown',
        // Số ghế để phân biệt các vé mua cùng chuyến (tránh nhìn như "vé trùng")
        seat: ticket.maGhe || '',
        price: `${Number(price).toLocaleString('vi-VN')}đ`,
        status: statusStr,
        timestamp: departureTime.getTime()
      });
    }

    // 5. Sắp xếp chuyến xe mới nhất lên đầu
    results.sort((a, b) => b.timestamp - a.timestamp);

    return res.status(200).json({ success: true, data: results });
  } catch (error) {
    console.error('Error in getBookingHistory:', error);
    return res.status(500).json({ success: false, message: 'Internal server error while fetching booking history.' });
  }
};