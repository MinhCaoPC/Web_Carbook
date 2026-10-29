const notificationService = require('../services/notificationService');
const { db } = require('../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');

// GET /api/admin/notifications
exports.listAdminNotifications = async (req, res) => {
  try {
    const limitNum = parseInt(req.query.limit, 10) || 3;
    const danhSach = await notificationService.listAdminNotifications(limitNum);
    return res.status(200).json({ success: true, danhSach });
  } catch (error) {
    console.error('listAdminNotifications error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thông báo admin.', error: error.message, stack: error.stack });
  }
};

// GET /api/admin/notifications/stats
exports.getAdminNotificationStats = async (req, res) => {
  try {
    // Đếm tổng số lượng vé + chuyến xe hoàn thành để hiện "trong số X thông báo"
    const veSnap = await db.collection('VEXE').count().get();
    // Bỏ where trangThai để không bị lỗi Missing Index nếu Firebase chưa cấu hình index
    const cxSnap = await db.collection('CHUYENXE_NGAY').count().get(); 
    const total = veSnap.data().count + Math.floor(cxSnap.data().count / 2); // Ước lượng 1 nửa hoàn thành
    return res.status(200).json({ success: true, total });
  } catch (error) {
    console.error('getAdminNotificationStats error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thống kê.', error: error.message });
  }
};

// POST /api/admin/notifications/broadcast — body { tieuDe, noiDung, maKhachHang? }
// Gửi thông báo trong app cho 1 khách hàng cụ thể (maKhachHang) hoặc toàn bộ khách hàng
// (bỏ trống maKhachHang). Ghi trực tiếp vào THONGBAO — đúng collection/field mà mobile app
// đang đọc (notificationService.listNotifications lọc theo maKhachHang), nên khách sẽ thấy
// ngay ở màn Thông báo mà không cần thêm cơ chế push (FCM) nào khác.
exports.broadcastNotification = async (req, res) => {
  try {
    const { tieuDe, noiDung, maKhachHang } = req.body;

    if (!tieuDe || !noiDung) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tiêu đề và nội dung thông báo.' });
    }

    let targetIds;
    if (maKhachHang) {
      targetIds = [maKhachHang];
    } else {
      const khSnap = await db.collection('KHACHHANG').get();
      targetIds = khSnap.docs.map((d) => d.id);
    }

    if (targetIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy khách hàng nào để gửi.' });
    }

    const batchId = Date.now();
    let writer = db.batch();
    let countInBatch = 0;

    targetIds.forEach((maKH, index) => {
      const ref = db.collection('THONGBAO').doc(`TB_ADMIN_${batchId}_${index}`);
      writer.set(ref, {
        maKhachHang: maKH,
        loai: 'THONG_BAO_QUAN_TRI',
        tieuDe,
        noiDung,
        daDoc: false,
        thoiGianTao: FieldValue.serverTimestamp(),
      });
      countInBatch++;
    });

    // Firestore giới hạn 500 thao tác/batch — nhưng chỉ 1 batch duy nhất ở đây vì số khách
    // hàng thật hiện còn nhỏ; nếu về sau vượt 450 cần chunk giống bulkCreateTrips.
    if (countInBatch > 450) {
      return res.status(400).json({ success: false, message: 'Quá nhiều người nhận trong 1 lần gửi, vui lòng thu hẹp đối tượng.' });
    }

    await writer.commit();

    return res.status(201).json({ success: true, message: 'Đã gửi thông báo.', soNguoiNhan: targetIds.length });
  } catch (error) {
    console.error('broadcastNotification error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi gửi thông báo.' });
  }
};

// GET /api/admin/notifications/history
// "Lịch sử gửi gần đây" chỉ nên hiện những thông báo ADMIN THẬT SỰ GỬI (loai =
// 'THONG_BAO_QUAN_TRI', xem broadcastNotification), không phải mọi thông báo tự sinh cho khách
// (nhắc chuyến, nhắc thanh toán...) như trước — 2 loại này mục đích khác hẳn nhau. Lọc bằng JS
// sau khi lấy 1 lô lớn hơn theo thời gian để tránh phải tạo composite index (where + orderBy
// 2 field khác nhau), theo đúng quy ước đã dùng ở các chỗ khác trong dự án.
exports.getCustomerNotificationHistory = async (req, res) => {
  try {
    const limitNum = parseInt(req.query.limit, 10) || 10;
    const snap = await db.collection('THONGBAO')
      .orderBy('thoiGianTao', 'desc')
      .limit(Math.max(limitNum * 5, 50))
      .get();

    const danhSach = snap.docs
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          thoiGianTao: data.thoiGianTao?.toDate?.()?.toISOString() || null
        };
      })
      .filter((tb) => tb.loai === 'THONG_BAO_QUAN_TRI')
      .slice(0, limitNum);

    return res.status(200).json({ success: true, danhSach });
  } catch (error) {
    console.error('getCustomerNotificationHistory error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy lịch sử.', error: error.message });
  }
};
