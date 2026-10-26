const { db } = require('../config/firebase');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');

// Ghế được coi là "lấy được" khi đang TRONG, hoặc đang DANG_GIU nhưng ĐÃ QUÁ HẠN giữ
// (khách trước bỏ ngang không thanh toán -> ghế tự giải phóng cho khách sau, lazy-release)
function gheKhaDung(ghe, now) {
  if (ghe.trangThai === 'TRONG') return true;
  if (ghe.trangThai === 'DANG_GIU' && ghe.hetHanGiu && ghe.hetHanGiu.toMillis() <= now) return true;
  return false;
}

// Giữ ghế tạm thời cho 1 (chuyến, ngày) cụ thể (atomic bằng transaction).
// GHEXE được scope theo cả maChuyenXe + ngayDi vì 1 chuyến (giờ cố định) lặp lại mỗi ngày,
// mỗi ngày có bộ ghế/trạng thái độc lập — không dùng chung với ngày khác.
// Mặc định giữ 60 phút — quá hạn mà chưa thanh toán thì ghế tự mở lại cho người khác.
async function giuGhe(maChuyenXe, ngayDi, danhSachMaGhe, phutGiu = 60) {
  const hetHanGiu = Timestamp.fromDate(new Date(Date.now() + phutGiu * 60 * 1000));

  const gheDaGiu = await db.runTransaction(async (transaction) => {
    const now = Date.now();
    const gheQuery = db.collection('GHEXE')
      .where('maChuyenXe', '==', maChuyenXe)
      .where('ngayDi', '==', ngayDi)
      .where('maGhe', 'in', danhSachMaGhe);
    const gheSnap = await transaction.get(gheQuery);

    if (gheSnap.size !== danhSachMaGhe.length) {
      throw new Error('Không tìm thấy đủ ghế trong danh sách yêu cầu (có thể chuyến chưa mở bán cho ngày này)');
    }

    for (const doc of gheSnap.docs) {
      if (!gheKhaDung(doc.data(), now)) {
        throw new Error(`Ghế ${doc.data().maGhe} không còn trống`);
      }
    }

    const chuyenXeNgayRef = db.collection('CHUYENXE_NGAY').doc(`${maChuyenXe}_${ngayDi}`);
    const chuyenXeNgaySnap = await transaction.get(chuyenXeNgayRef);
    if (!chuyenXeNgaySnap.exists) {
      throw new Error(`Chuyến xe ${maChuyenXe} chưa mở bán cho ngày ${ngayDi}`);
    }

    // Chỉ trừ bộ đếm ghế trống cho ghế đang TRONG thật — ghế thu hồi từ lượt giữ quá hạn
    // đã bị trừ từ lần giữ trước, trừ nữa sẽ lệch số ghế còn trống.
    const soGheTrongThat = gheSnap.docs.filter((doc) => doc.data().trangThai === 'TRONG').length;

    for (const doc of gheSnap.docs) {
      transaction.update(doc.ref, { trangThai: 'DANG_GIU', hetHanGiu });
    }
    if (soGheTrongThat > 0) {
      transaction.update(chuyenXeNgayRef, {
        soGheConTrong: FieldValue.increment(-soGheTrongThat)
      });
    }

    return gheSnap.docs.map((doc) => doc.data().maGhe);
  });

  return { thoiHanGiu: hetHanGiu.toDate(), gheDaGiu };
}

// Nhả ghế đã giữ, trả về trạng thái TRONG
async function nhaGhe(maChuyenXe, ngayDi, danhSachMaGhe) {
  await db.runTransaction(async (transaction) => {
    const gheQuery = db.collection('GHEXE')
      .where('maChuyenXe', '==', maChuyenXe)
      .where('ngayDi', '==', ngayDi)
      .where('maGhe', 'in', danhSachMaGhe);
    const gheSnap = await transaction.get(gheQuery);

    const chuyenXeNgayRef = db.collection('CHUYENXE_NGAY').doc(`${maChuyenXe}_${ngayDi}`);
    const chuyenXeNgaySnap = await transaction.get(chuyenXeNgayRef);
    if (!chuyenXeNgaySnap.exists) {
      throw new Error(`Chuyến xe ${maChuyenXe} chưa mở bán cho ngày ${ngayDi}`);
    }

    for (const doc of gheSnap.docs) {
      transaction.update(doc.ref, { trangThai: 'TRONG', hetHanGiu: null });
    }
    transaction.update(chuyenXeNgayRef, {
      soGheConTrong: FieldValue.increment(gheSnap.size)
    });
  });
}

module.exports = { giuGhe, nhaGhe };
