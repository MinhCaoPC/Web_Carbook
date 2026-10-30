const { db } = require('../config/firebase');
const { ngayHopLe, layDanhSachNgayChoPhep } = require('../utils/schedule');

const CHUYENXE_NGAY_COLLECTION = 'CHUYENXE_NGAY';
const GHEXE_COLLECTION = 'GHEXE'; // ghế theo từng (chuyến, ngày) cụ thể

function isValidDateStr(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}

// GET /api/seats/:maChuyenXe/:ngayDi
// Trả về ghế của đúng (chuyến, ngày) đó — GHEXE scope theo cả maChuyenXe + ngayDi vì chuyến
// lặp lại mỗi ngày, mỗi ngày có bộ ghế/trạng thái độc lập (sinh sẵn bởi
// scripts/generateDailySchedules.js). Chỉ đọc trạng thái, KHÔNG đặt/giữ ghế ở đây — việc giữ
// ghế nằm ở POST /api/dat-ve/giu-cho, và ghế chỉ chuyển DA_DAT sau khi thanh toán thành công.
exports.getAvailableSeats = async (req, res) => {
  try {
    const { maChuyenXe, ngayDi } = req.params;

    if (!maChuyenXe || !isValidDateStr(ngayDi)) {
      return res.status(400).json({ success: false, message: 'Thiếu mã chuyến xe hoặc ngày đi không hợp lệ (YYYY-MM-DD).' });
    }

    if (!ngayHopLe(ngayDi)) {
      return res.status(400).json({
        success: false,
        message: `Chỉ hỗ trợ xem/đặt ghế trong ${layDanhSachNgayChoPhep().length} ngày tới.`,
      });
    }

    const chuyenXeNgayDoc = await db.collection(CHUYENXE_NGAY_COLLECTION).doc(`${maChuyenXe}_${ngayDi}`).get();
    if (!chuyenXeNgayDoc.exists) {
      return res.status(404).json({ success: false, message: 'Chuyến xe chưa mở bán cho ngày này.' });
    }

    const gheSnap = await db.collection(GHEXE_COLLECTION)
      .where('maChuyenXe', '==', maChuyenXe)
      .where('ngayDi', '==', ngayDi)
      .get();

    // Ghế DANG_GIU nhưng đã quá hạn giữ (khách bỏ ngang không thanh toán) hiển thị là TRONG
    // — đồng bộ với logic thu hồi ghế quá hạn trong seatHoldService.giuGhe
    const now = Date.now();
    const seats = gheSnap.docs
      .map((doc) => doc.data())
      .sort((a, b) => (a.maGhe > b.maGhe ? 1 : -1))
      .map(({ maGhe, trangThai, hetHanGiu }) => ({
        maGhe,
        trangThai:
          trangThai === 'DANG_GIU' && hetHanGiu && hetHanGiu.toMillis() <= now ? 'TRONG' : trangThai,
      }));

    return res.status(200).json({
      success: true,
      maChuyenXe,
      ngayDi,
      soGheTrong: seats.filter((s) => s.trangThai === 'TRONG').length,
      tongSoGhe: seats.length,
      seats,
    });
  } catch (error) {
    console.error('getAvailableSeats error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách ghế.' });
  }
};
