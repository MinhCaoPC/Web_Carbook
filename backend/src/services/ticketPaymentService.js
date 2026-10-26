const crypto = require('crypto');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { db } = require('../config/firebase');
const { genMaQR } = require('../utils/qrGenerator');
const { httpError } = require('./reservationService');

const VEXE_COLLECTION = 'VEXE';
const HOADON_COLLECTION = 'HOADON';
const GHEXE_COLLECTION = 'GHEXE';
const KHACHHANG_COLLECTION = 'KHACHHANG';
const TAIKHOAN_COLLECTION = 'TAIKHOAN';
// Đơn thanh toán vé qua cổng VNPay (phương thức thứ 2 bên cạnh ví CarbookPay)
const DON_TT_VE_COLLECTION = 'DON_TT_VE';

function genMaHoaDon() {
  return `HD-${crypto.randomInt(10000000, 99999999)}`;
}

// Đọc nhóm vé và kiểm tra điều kiện thanh toán (chủ vé, đang GIU_CHO, còn hạn giữ)
async function kiemTraNhomVe(maKhachHang, danhSachMaDatVe) {
  const veDocs = await Promise.all(
    danhSachMaDatVe.map((maDatVe) => db.collection(VEXE_COLLECTION).doc(maDatVe).get())
  );

  const missing = veDocs.find((doc) => !doc.exists);
  if (missing) throw httpError('Không tìm thấy vé trong danh sách yêu cầu.', 404);

  const now = Timestamp.now();
  for (const doc of veDocs) {
    const ve = doc.data();
    if (ve.maKhachHang !== maKhachHang) {
      throw httpError('Vé không thuộc về khách hàng này.', 403);
    }
    if (ve.trangThaiVe !== 'GIU_CHO') {
      throw httpError('Vé không còn ở trạng thái giữ chỗ.', 400);
    }
    if (!ve.hetHanGiuVe || ve.hetHanGiuVe.toMillis() <= now.toMillis()) {
      throw httpError('Vé đã hết hạn giữ, vui lòng đặt lại.', 410);
    }
  }

  const tongTien = veDocs.reduce((sum, doc) => sum + (doc.data().thanhTien || 0), 0);
  return { veDocs, tongTien, maNhomDat: veDocs[0].data().maNhomDat };
}

// Tìm địa chỉ ví CarbookPay của khách: KHACHHANG -> TAIKHOAN.walletAddress
async function layViCuaKhachHang(maKhachHang) {
  const khDoc = await db.collection(KHACHHANG_COLLECTION).doc(maKhachHang).get();
  if (!khDoc.exists) throw httpError('Không tìm thấy khách hàng.', 404);

  const maTaiKhoan = khDoc.data().maTaiKhoan;
  const tkDoc = maTaiKhoan ? await db.collection(TAIKHOAN_COLLECTION).doc(maTaiKhoan).get() : null;
  const walletAddress = tkDoc && tkDoc.exists ? tkDoc.data().walletAddress : null;

  if (!walletAddress) {
    throw httpError('Tài khoản chưa kích hoạt ví CarbookPay. Vui lòng kích hoạt ví và nạp tiền trước khi thanh toán.', 400);
  }
  return walletAddress;
}

// Trừ tiền ví blockchain theo Luồng 3: đọc số dư thật từ Smart Contract -> khóa số dư
// (chống double spending) -> Relayer ký & trả gas gọi Payment() -> đồng bộ balance cache.
// Ví không đủ tiền / chưa kích hoạt sẽ throw lỗi tiếng Việt rõ ràng, vé vẫn GIU_CHO để thử lại.
async function truTienViBlockchain(maNhomDat, walletAddress, tongTien) {
  // Lazy require: chỉ nạp tầng blockchain khi thật sự thanh toán bằng ví
  const { RepositoryFactory } = require('../repositories');
  const { PaymentService } = require('./paymentService');
  const paymentService = new PaymentService(
    RepositoryFactory.getWalletRepository(),
    RepositoryFactory.getPaymentRepository()
  );

  try {
    const ketQua = await paymentService.payForTicket(maNhomDat, walletAddress, tongTien);

    // Đồng bộ token ERC-20 với sổ cái: đốt CAR từ ĐÚNG VÍ USER (owner của CARToken có quyền
    // burn(from) — không cần user ký/approve). Chạy nền để không cộng thêm thời gian chờ;
    // sổ cái Wallet.sol vẫn là nguồn sự thật nên nếu burn lỗi chỉ cần cảnh báo + đối soát sau.
    (async () => {
      try {
        await RepositoryFactory.getTokenRepository().burn(walletAddress, tongTien);
        console.log(`✓ Đã burn ${tongTien} CAR từ ví user ${walletAddress} (thanh toán ${maNhomDat})`);
      } catch (burnErr) {
        console.error(`⚠️ Burn CAR sau thanh toán thất bại (ví ${walletAddress}, sổ cái vẫn đúng):`, burnErr.message);
      }
    })();

    return ketQua;
  } catch (error) {
    const message = (error && error.message) || '';
    if (message.includes('Insufficient balance')) {
      throw httpError('Thanh toán không thành công: số dư ví CarbookPay không đủ. Vui lòng nạp thêm tiền vào ví.', 400);
    }
    if (message.includes('Wallet not found')) {
      throw httpError('Ví CarbookPay chưa được đăng ký trên hệ thống blockchain.', 400);
    }
    if (message.includes('Wallet busy')) {
      throw httpError('Ví đang có giao dịch khác đang xử lý. Vui lòng thử lại sau vài giây.', 409);
    }
    console.error('❌ Thanh toán blockchain thất bại:', message);
    throw httpError('Thanh toán qua ví CarbookPay thất bại. Vui lòng thử lại sau.', 502);
  }
}

// Chốt vé trong 1 transaction: assert còn hạn giữ, đổi trạng thái VEXE/GHEXE, sinh HOADON + maQR.
async function hoanTatVe({ maKhachHang, danhSachMaDatVe, phuongThucTT, txHash }) {
  return db.runTransaction(async (transaction) => {
    const veRefs = danhSachMaDatVe.map((maDatVe) => db.collection(VEXE_COLLECTION).doc(maDatVe));
    const veDocs = await Promise.all(veRefs.map((ref) => transaction.get(ref)));

    const missing = veDocs.find((doc) => !doc.exists);
    if (missing) throw httpError('Không tìm thấy vé trong danh sách yêu cầu.', 404);

    const now = Timestamp.now();
    for (const doc of veDocs) {
      const ve = doc.data();
      if (ve.maKhachHang !== maKhachHang) {
        throw httpError('Vé không thuộc về khách hàng này.', 403);
      }
      if (ve.trangThaiVe !== 'GIU_CHO') {
        throw httpError('Vé không còn ở trạng thái giữ chỗ.', 400);
      }
    }

    const tongTien = veDocs.reduce((sum, doc) => sum + (doc.data().thanhTien || 0), 0);
    const maNhomDat = veDocs[0].data().maNhomDat;
    const danhSachHoaDon = [];

    for (const veDoc of veDocs) {
      const ve = veDoc.data();
      const maQR = genMaQR(ve.maChuyenXe, ve.maGhe, veDoc.id);

      transaction.update(veDoc.ref, {
        trangThaiVe: 'DA_TT',
        maQR,
        ...(txHash ? { txHashThanhToan: txHash } : {}),
        hetHanGiuVe: FieldValue.delete(),
      });

      transaction.update(db.collection(GHEXE_COLLECTION).doc(`${ve.maChuyenXe}_${ve.ngayDi}_${ve.maGhe}`), {
        trangThai: 'DA_DAT',
        hetHanGiu: null,
      });

      const maHoaDon = genMaHoaDon();
      transaction.set(db.collection(HOADON_COLLECTION).doc(maHoaDon), {
        maDatVe: veDoc.id,
        maNhomDat,
        maKhachHang,
        phuongThucTT,
        giaVe: ve.thanhTien,
        phiThanhToan: 0,
        tongTien: ve.thanhTien,
        ngayThanhToan: now,
        trangThaiTT: 'TC',
        txHash: txHash || null,
        moTa: 'Thanh toán vé xe CARBOOK',
      });
      danhSachHoaDon.push(maHoaDon);
    }

    return { thanhCong: true, danhSachHoaDon, maNhomDat, tongTien };
  });
}

// Thanh toán nhóm vé đang giữ chỗ.
// - phuongThucTT = 'CARBOOKPAY' (mặc định): yêu cầu MÃ PIN ví đúng, rồi trừ tiền THẬT từ ví
//   blockchain trước khi chốt vé; ví không đủ tiền -> 400 và vé vẫn ở GIU_CHO để thử lại.
// - Phương thức khác: chỉ chốt vé (giữ hành vi cũ cho các luồng test/không dùng ví).
async function thanhToan({ maKhachHang, danhSachMaDatVe, phuongThucTT = 'CARBOOKPAY', maPin }) {
  if (!maKhachHang || !Array.isArray(danhSachMaDatVe) || danhSachMaDatVe.length === 0) {
    throw httpError('Thiếu thông tin thanh toán (maKhachHang, danhSachMaDatVe).', 400);
  }

  let txHash = null;

  if (phuongThucTT === 'CARBOOKPAY') {
    // Xác thực mã PIN ví TRƯỚC mọi thao tác tiền bạc (chưa đặt PIN / PIN sai -> 400)
    const { verifyPin } = require('./walletPinService');
    await verifyPin(maKhachHang, maPin);

    // Kiểm tra vé + tính tiền trước khi động vào blockchain
    const { tongTien, maNhomDat } = await kiemTraNhomVe(maKhachHang, danhSachMaDatVe);
    const walletAddress = await layViCuaKhachHang(maKhachHang);

    const ketQuaChain = await truTienViBlockchain(maNhomDat, walletAddress, tongTien);
    txHash = ketQuaChain.txHash;
    console.log(`✓ Đã trừ ${tongTien}đ từ ví ${walletAddress} cho nhóm vé ${maNhomDat}. Tx: ${txHash}`);
  }

  try {
    const ketQua = await hoanTatVe({ maKhachHang, danhSachMaDatVe, phuongThucTT, txHash });
    
    // Gửi thông báo thành công
    const notificationService = require('./notificationService');
    notificationService.createBookingSuccessNotification(maKhachHang, danhSachMaDatVe).catch(err => {
      console.error('Lỗi khi sinh thông báo đặt vé thành công:', err);
    });

    return ketQua;
  } catch (error) {
    if (txHash) {
      // Tiền đã trừ on-chain nhưng chốt vé thất bại (hiếm: hết hạn giữ đúng lúc thanh toán)
      // -> ghi nhận để hoàn tiền thủ công/tự động, không nuốt lỗi.
      console.error(`❌ Đã trừ tiền (tx ${txHash}) nhưng chốt vé thất bại — cần hoàn tiền cho nhóm vé:`, danhSachMaDatVe.join(', '));
      await db.collection('GIAODICH_CANXULY').doc(`GD${Date.now()}`).set({
        loai: 'CHOT_VE_THAT_BAI_SAU_TRU_TIEN',
        maKhachHang,
        danhSachMaDatVe,
        txHash,
        thoiGian: Timestamp.now(),
        loi: error.message || String(error),
      });
    }
    throw error;
  }
}

// ================== THANH TOÁN VÉ QUA CỔNG VNPAY (phương thức 2) ==================

function dinhDangNgayVnpay(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function layCauHinhVnpay() {
  const tmnCode = (process.env.VNP_TMN_CODE || '').trim();
  const hashSecret = (process.env.VNP_HASH_SECRET || '').trim();
  if (!tmnCode || !hashSecret) {
    throw httpError('Backend chưa cấu hình VNP_TMN_CODE / VNP_HASH_SECRET trong backend/.env.', 500);
  }
  return {
    tmnCode,
    hashSecret,
    vnpUrl: (process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html').trim(),
    returnUrl: (process.env.VNP_TICKET_RETURN_URL ||
      `http://localhost:${process.env.PORT || 5050}/api/thanh-toan/vnpay-return`).trim(),
  };
}

// CREATE: tạo đơn thanh toán vé qua VNPay -> trả paymentUrl cho app mở WebView.
// Vé vẫn GIU_CHO; chỉ chốt DA_TT sau khi VNPay xác nhận đã thu tiền.
async function taoDonThanhToanVnpay({ maKhachHang, danhSachMaDatVe, ipAddr }) {
  if (!maKhachHang || !Array.isArray(danhSachMaDatVe) || danhSachMaDatVe.length === 0) {
    throw httpError('Thiếu thông tin thanh toán (maKhachHang, danhSachMaDatVe).', 400);
  }

  const { tongTien } = await kiemTraNhomVe(maKhachHang, danhSachMaDatVe);
  const cauHinh = layCauHinhVnpay();

  const orderId = `TV${Date.now()}`;
  const now = new Date();
  await db.collection(DON_TT_VE_COLLECTION).doc(orderId).set({
    orderId,
    maKhachHang,
    danhSachMaDatVe,
    amount: tongTien,
    status: 'PENDING',
    createdAt: now,
    vnpCreateDate: dinhDangNgayVnpay(now),
  });

  const { VnPayService } = require('./vnpayService');
  const paymentUrl = VnPayService.createPaymentUrl({
    orderId,
    amount: tongTien,
    orderInfo: `Thanh toan ve xe CARBOOK ${orderId}`,
    ipAddr: ipAddr || '127.0.0.1',
    returnUrl: cauHinh.returnUrl,
    tmnCode: cauHinh.tmnCode,
    hashSecret: cauHinh.hashSecret,
    vnpUrl: cauHinh.vnpUrl,
  });

  return { orderId, paymentUrl, tongTien };
}

// Chốt vé cho đơn VNPay đã thu tiền; nếu chốt lỗi (hiếm: vé hết hạn giữ đúng lúc trả tiền)
// thì ghi GIAODICH_CANXULY để hoàn tiền thủ công — không nuốt lỗi.
async function chotVeChoDonVnpay(order, vnpTransactionNo) {
  try {
    const ketQua = await hoanTatVe({
      maKhachHang: order.maKhachHang,
      danhSachMaDatVe: order.danhSachMaDatVe,
      phuongThucTT: 'VNPAY',
      txHash: vnpTransactionNo ? `VNPAY-${vnpTransactionNo}` : null,
    });
    await db.collection(DON_TT_VE_COLLECTION).doc(order.orderId).update({
      status: 'SUCCESS',
      vnpTransactionNo: vnpTransactionNo || null,
      completedAt: new Date(),
    });

    // Gửi thông báo thành công
    const notificationService = require('./notificationService');
    notificationService.createBookingSuccessNotification(order.maKhachHang, order.danhSachMaDatVe).catch(err => {
      console.error('Lỗi khi sinh thông báo đặt vé thành công (VNPay):', err);
    });

    return ketQua;
  } catch (error) {
    console.error(`❌ VNPay đã thu tiền nhưng chốt vé lỗi (đơn ${order.orderId}):`, error.message);
    await db.collection('GIAODICH_CANXULY').doc(`GD${Date.now()}`).set({
      loai: 'VNPAY_DA_THU_TIEN_CHOT_VE_LOI',
      orderId: order.orderId,
      maKhachHang: order.maKhachHang,
      danhSachMaDatVe: order.danhSachMaDatVe,
      soTien: order.amount,
      thoiGian: Timestamp.now(),
      loi: error.message || String(error),
    });
    await db.collection(DON_TT_VE_COLLECTION).doc(order.orderId).update({ status: 'FAILED' });
    throw httpError('VNPay đã thu tiền nhưng chốt vé thất bại — vui lòng liên hệ hỗ trợ để được hoàn tiền.', 500);
  }
}

// Xử lý trang VNPay redirect về sau khi khách thanh toán (GET /api/thanh-toan/vnpay-return)
async function xuLyVnpayReturn(vnpParams) {
  const { hashSecret } = layCauHinhVnpay();
  const { VnPayService } = require('./vnpayService');

  if (!VnPayService.verifySecureHash(vnpParams, hashSecret)) {
    return { thanhCong: false, message: 'Chữ ký VNPay không hợp lệ.' };
  }

  const orderId = vnpParams.vnp_TxnRef;
  const doc = await db.collection(DON_TT_VE_COLLECTION).doc(orderId || '__x__').get();
  if (!doc.exists) return { thanhCong: false, message: 'Không tìm thấy đơn thanh toán.' };
  const order = doc.data();

  if (order.status === 'SUCCESS') return { thanhCong: true };
  if (order.status !== 'PENDING') return { thanhCong: false, message: 'Đơn đã được xử lý trước đó.' };

  const daTraTien = vnpParams.vnp_ResponseCode === '00' && vnpParams.vnp_TransactionStatus === '00';
  const dungSoTien = Number(vnpParams.vnp_Amount) / 100 === order.amount;
  if (!daTraTien || !dungSoTien) {
    await doc.ref.update({ status: 'FAILED' });
    return { thanhCong: false, message: 'Giao dịch VNPay không thành công hoặc bị hủy.' };
  }

  await doc.ref.update({ status: 'PROCESSING' });
  await chotVeChoDonVnpay(order, vnpParams.vnp_TransactionNo);
  return { thanhCong: true };
}

// READ/đối soát: app gọi sau khi WebView đóng — hỏi VNPay (querydr) đơn đã trả tiền thật chưa,
// xử lý cả trường hợp trang return không quay về được backend.
async function doiSoatThanhToanVnpay(maKhachHang, orderId) {
  if (!orderId) throw httpError('Thiếu orderId.', 400);

  const doc = await db.collection(DON_TT_VE_COLLECTION).doc(orderId).get();
  if (!doc.exists) throw httpError('Không tìm thấy đơn thanh toán.', 404);
  const order = doc.data();
  if (order.maKhachHang !== maKhachHang) throw httpError('Không có quyền trên đơn này.', 403);

  if (order.status === 'SUCCESS' || order.status === 'FAILED') return { orderId, status: order.status };
  if (order.status === 'PROCESSING') return { orderId, status: 'PROCESSING' };

  const { tmnCode, hashSecret } = layCauHinhVnpay();
  const { VnPayService } = require('./vnpayService');
  const { paid, raw } = await VnPayService.queryTransaction({
    orderId,
    transactionDate: order.vnpCreateDate,
    orderInfo: `Thanh toan ve xe CARBOOK ${orderId}`,
    ipAddr: '127.0.0.1',
    tmnCode,
    hashSecret,
  });

  if (paid) {
    if (Number(raw.vnp_Amount) / 100 !== order.amount) {
      throw httpError('Số tiền VNPay xác nhận không khớp đơn thanh toán.', 400);
    }
    await doc.ref.update({ status: 'PROCESSING' });
    await chotVeChoDonVnpay(order, raw.vnp_TransactionNo);
    return { orderId, status: 'SUCCESS' };
  }

  if (raw.vnp_ResponseCode === '00' || raw.vnp_ResponseCode === '91') {
    await doc.ref.update({ status: 'FAILED' });
    return { orderId, status: 'FAILED' };
  }

  return { orderId, status: 'PENDING' };
}

module.exports = { thanhToan, taoDonThanhToanVnpay, xuLyVnpayReturn, doiSoatThanhToanVnpay };
