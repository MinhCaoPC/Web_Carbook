// Chợ bán lại vé NFT (như bán lại vé concert) có luật chống phe vé:
//   - giá rao ≤ MAX_MARKUP_BPS (110%) giá gốc; không rao vé đã dùng / sát giờ xe chạy;
//   - tiền chuyển giữa HAI VÍ NỘI trong một transaction (người mua -> người bán + hoa hồng nhà xe),
//     quyền sở hữu chuyển trên blockchain (TicketMarket.buy); một trong hai lỗi thì hoàn tác bên kia;
//   - mã QR của vé được cấp lại cho chủ mới, mã cũ (ảnh chụp màn hình của người bán) vô hiệu.
const crypto = require('crypto');
const { Timestamp } = require('firebase-admin/firestore');
const { db } = require('../config/firebase');
const { httpError } = require('./reservationService');
const nftService = require('./ticketNftService');

const RAOBAN = 'RAOBAN_VE';
const LICHSU = 'LICHSU_CHUYENNHUONG';
const KHOA_CHUYEN_NHUONG_MS = 2 * 60 * 60 * 1000; // khớp TicketNFT.transferLockSeconds

function cauHinhGia() {
  const { ROYALTY_BPS, MAX_MARKUP_BPS } = require('../config/blockchain.config');
  return { royaltyBps: ROYALTY_BPS, maxMarkupBps: MAX_MARKUP_BPS };
}

function tinhGiaTran(giaGoc) {
  return Math.floor((giaGoc * cauHinhGia().maxMarkupBps) / 10000);
}
function tinhHoaHong(gia) {
  return Math.floor((gia * cauHinhGia().royaltyBps) / 10000);
}

async function layViCuaKhach(maKhachHang) {
  const kh = await db.collection('KHACHHANG').doc(maKhachHang).get();
  if (!kh.exists) throw httpError('Không tìm thấy khách hàng.', 404);
  const tk = kh.data().maTaiKhoan ? await db.collection('TAIKHOAN').doc(kh.data().maTaiKhoan).get() : null;
  const wallet = tk && tk.exists ? tk.data().walletAddress : null;
  if (!wallet) throw httpError('Bạn chưa kích hoạt ví CarbookPay.', 400);
  return wallet;
}

async function docVeCuaChu(maKhachHang, maDatVe) {
  const ref = db.collection('VEXE').doc(maDatVe);
  const d = await ref.get();
  if (!d.exists) throw httpError('Không tìm thấy vé.', 404);
  const ve = d.data();
  if (ve.maKhachHang !== maKhachHang) throw httpError('Đây không phải vé của bạn.', 403);
  return { ref, ve };
}

async function thongTinChuyen(ve) {
  const cx = await db.collection('CHUYENXE').doc(ve.maChuyenXe).get();
  const lt = cx.exists ? await db.collection('LOTRINH').doc(cx.data().maLoTrinh).get() : null;
  const gio = await nftService.layGioXuatPhatUnix(ve);
  return {
    tenLoTrinh: lt && lt.exists ? lt.data().tenLoTrinh : '',
    diemKhoiHanh: lt && lt.exists ? lt.data().diemKhoiHanh : '',
    diemKetThuc: lt && lt.exists ? lt.data().diemKetThuc : '',
    gioXuatPhatUnix: gio,
  };
}

// Rao bán vé
async function raoBan({ maKhachHang, maDatVe, gia }) {
  const repo = nftService.batBuocRepo();
  const giaInt = Number(gia);
  if (!Number.isSafeInteger(giaInt) || giaInt <= 0) throw httpError('Giá rao bán phải là số nguyên dương.', 400);

  const { ref, ve } = await docVeCuaChu(maKhachHang, maDatVe);
  if (ve.trangThaiVe !== 'DA_TT') throw httpError('Chỉ vé đã thanh toán, chưa dùng mới rao bán được.', 400);
  if (ve.nftStatus !== 'DA_MINT' || !ve.nftTokenId) throw httpError('Vé chưa có NFT (đang tạo hoặc bị lỗi) nên chưa rao bán được.', 400);

  const giaGoc = Number(ve.thanhTien || ve.giaVeGoc || 0);
  const tran = tinhGiaTran(giaGoc);
  if (giaInt > tran) throw httpError(`Giá rao tối đa ${tran.toLocaleString('vi-VN')}đ (${cauHinhGia().maxMarkupBps / 100}% giá gốc).`, 400);

  const info = await thongTinChuyen(ve);
  if (Date.now() + KHOA_CHUYEN_NHUONG_MS >= info.gioXuatPhatUnix * 1000) {
    throw httpError('Quá sát giờ xe chạy (dưới 2 giờ) nên không thể rao bán vé.', 400);
  }

  // Chiếm cờ dangRaoBan nguyên tử trước khi động vào blockchain
  const chiem = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const d = cur.data();
    if (!cur.exists || d.dangRaoBan || d.trangThaiVe !== 'DA_TT') return false;
    tx.update(ref, { dangRaoBan: true });
    return true;
  });
  if (!chiem) throw httpError('Vé đang được rao bán rồi.', 409);

  try {
    const owner = await nftService.layDiaChiChuVe(maKhachHang);
    const { txHash } = await repo.list(ve.nftTokenId, owner, giaInt);
    await db.collection(RAOBAN).doc(maDatVe).set({
      maDatVe,
      tokenId: ve.nftTokenId,
      maNguoiBan: maKhachHang,
      maChuyenXe: ve.maChuyenXe,
      ngayDi: ve.ngayDi,
      maGhe: ve.maGhe,
      ...info,
      giaGoc,
      gia: giaInt,
      trangThai: 'DANG_BAN',
      txHashRao: txHash,
      ngayRao: Timestamp.now(),
    });
    await ref.update({ giaRaoBan: giaInt });
    return { thanhCong: true, maDatVe, gia: giaInt, giaTran: tran, txHash };
  } catch (err) {
    await ref.update({ dangRaoBan: false }).catch(() => {});
    throw err.statusCode ? err : httpError('Rao bán thất bại: ' + (err.shortMessage || err.message), 502);
  }
}

// Huỷ tin rao
async function huyRaoBan({ maKhachHang, maDatVe }) {
  const repo = nftService.batBuocRepo();
  const { ref, ve } = await docVeCuaChu(maKhachHang, maDatVe);
  if (!ve.dangRaoBan) throw httpError('Vé này không đang rao bán.', 400);
  const owner = await nftService.layDiaChiChuVe(maKhachHang);
  const { txHash } = await repo.cancelListing(ve.nftTokenId, owner);
  await db.collection(RAOBAN).doc(maDatVe).update({ trangThai: 'DA_HUY', txHashHuy: txHash });
  await ref.update({ dangRaoBan: false, giaRaoBan: null });
  return { thanhCong: true, maDatVe, txHash };
}

// Mua vé đang rao
async function muaVe({ maKhachHang, maDatVe, maPin }) {
  const repo = nftService.batBuocRepo();
  const { verifyPin } = require('./walletPinService');
  await verifyPin(maKhachHang, maPin);

  const rbRef = db.collection(RAOBAN).doc(maDatVe);
  // Chiếm tin rao nguyên tử: DANG_BAN -> DANG_XU_LY (hai người mua cùng lúc chỉ một người thắng)
  const rb = await db.runTransaction(async (tx) => {
    const d = await tx.get(rbRef);
    if (!d.exists || d.data().trangThai !== 'DANG_BAN') return null;
    if (d.data().maNguoiBan === maKhachHang) return { tuMua: true };
    tx.update(rbRef, { trangThai: 'DANG_XU_LY', maNguoiMua: maKhachHang });
    return d.data();
  });
  if (!rb) throw httpError('Vé này không còn được rao bán.', 409);
  if (rb.tuMua) throw httpError('Bạn không thể tự mua vé của chính mình.', 400);

  const hoanLaiTin = () => rbRef.update({ trangThai: 'DANG_BAN', maNguoiMua: null }).catch(() => {});

  let viMua, viBan;
  try {
    [viMua, viBan] = await Promise.all([layViCuaKhach(maKhachHang), layViCuaKhach(rb.maNguoiBan)]);
  } catch (err) { await hoanLaiTin(); throw err; }

  if (Date.now() + KHOA_CHUYEN_NHUONG_MS >= rb.gioXuatPhatUnix * 1000) {
    await rbRef.update({ trangThai: 'DA_HUY', ghiChu: 'Quá sát giờ xe chạy' });
    await db.collection('VEXE').doc(maDatVe).update({ dangRaoBan: false, giaRaoBan: null });
    throw httpError('Quá sát giờ xe chạy nên không thể mua vé này nữa.', 400);
  }

  // 1. Chuyển tiền giữa hai ví nội (nguyên tử): người mua -> người bán (trừ hoa hồng) + ví nhà xe
  const { chuyenTien, apDungButToan, damBaoViNhaXe } = require('../repositories/firestore/walletLedger');
  const viNhaXe = await damBaoViNhaXe();
  const hoaHong = tinhHoaHong(rb.gia);
  const maLanBan = `${maDatVe}_${rb.tokenId}_${crypto.randomBytes(3).toString('hex')}`;
  let maGDTien;
  try {
    maGDTien = await chuyenTien(
      { walletId: viMua, loai: 'MUA_VE_LAI' },
      [
        { walletId: viBan, soTien: rb.gia - hoaHong, loai: 'BAN_VE_LAI' },
        ...(hoaHong > 0 ? [{ walletId: viNhaXe, soTien: hoaHong, loai: 'HOA_HONG' }] : []),
      ],
      `MARKET_${maLanBan}`
    );
  } catch (err) {
    await hoanLaiTin();
    if (String(err.message).includes('Insufficient balance')) throw httpError('Số dư ví CarbookPay không đủ để mua vé này.', 400);
    throw httpError('Không thực hiện được giao dịch ví: ' + err.message, 502);
  }

  // 2. Chuyển quyền sở hữu NFT trên blockchain; lỗi thì hoàn tiền lại cho người mua
  let txHash;
  try {
    const diaChiMua = await nftService.layDiaChiChuVe(maKhachHang);
    txHash = (await repo.buy(rb.tokenId, diaChiMua)).txHash;
  } catch (err) {
    console.error(`❌ Chuyển NFT vé ${maDatVe} thất bại, hoàn tiền người mua:`, err.message);
    try {
      await apDungButToan(
        [
          { walletId: viMua, soTien: rb.gia, loai: 'HOAN_GIAO_DICH', ghiChu: 'Hoàn tiền: chuyển vé NFT thất bại' },
          { walletId: viBan, soTien: -(rb.gia - hoaHong), loai: 'HOAN_GIAO_DICH' },
          ...(hoaHong > 0 ? [{ walletId: viNhaXe, soTien: -hoaHong, loai: 'HOAN_GIAO_DICH' }] : []),
        ],
        `MARKET_${maLanBan}_HOAN`
      );
    } catch (reverseErr) {
      await db.collection('GIAODICH_CANXULY').doc(`GD${Date.now()}`).set({
        loai: 'BAN_LAI_VE_CHUYEN_NFT_LOI_HOAN_TIEN_LOI', maDatVe, maNguoiMua: maKhachHang, maNguoiBan: rb.maNguoiBan,
        soTien: rb.gia, thoiGian: Timestamp.now(), loi: String(reverseErr.message),
      });
    }
    await hoanLaiTin();
    throw httpError('Chuyển vé NFT thất bại, tiền đã được hoàn lại. Vui lòng thử lại.', 502);
  }

  // 3. Chốt trong Firestore: đổi chủ vé, cấp mã QR mới, ghi lịch sử
  const veRef = db.collection('VEXE').doc(maDatVe);
  const veHienTai = (await veRef.get()).data();
  const khMua = await db.collection('KHACHHANG').doc(maKhachHang).get();
  const tkMua = khMua.exists && khMua.data().maTaiKhoan ? await db.collection('TAIKHOAN').doc(khMua.data().maTaiKhoan).get() : null;
  const { genMaQR } = require('../utils/qrGenerator');
  const maQRMoi = genMaQR(veHienTai.maChuyenXe, veHienTai.maGhe, `${maDatVe}-${crypto.randomBytes(2).toString('hex')}`);
  const diaChiMua = await nftService.layDiaChiChuVe(maKhachHang);
  await veRef.update({
    maKhachHang,
    maKhachHangCu: rb.maNguoiBan,
    hoTenHanhKhach: khMua.exists ? khMua.data().hoTen || '' : '',
    emailHanhKhach: tkMua && tkMua.exists ? tkMua.data().email || '' : '',
    sdtHanhKhach: khMua.exists ? khMua.data().sdt || '' : '',
    maQR: maQRMoi,
    nftOwner: diaChiMua,
    dangRaoBan: false,
    giaRaoBan: null,
    soLanChuyenNhuong: (veHienTai.soLanChuyenNhuong || 0) + 1,
  });
  await rbRef.update({ trangThai: 'DA_BAN', txHashBan: txHash, ngayBan: Timestamp.now() });
  await db.collection(LICHSU).doc(maLanBan).set({
    maDatVe, tokenId: rb.tokenId, nguoiBan: rb.maNguoiBan, nguoiMua: maKhachHang,
    gia: rb.gia, hoaHong, maGiaoDichVi: maGDTien, txHash, thoiGian: Timestamp.now(),
  });
  return { thanhCong: true, maDatVe, tokenId: rb.tokenId, gia: rb.gia, hoaHong, txHash, maQR: maQRMoi };
}

// Danh sách tin đang rao (công khai). maKhachHang (nếu có) dùng để đánh dấu tin của chính mình.
async function danhSachRaoBan({ maKhachHang, tuNgay } = {}) {
  const snap = await db.collection(RAOBAN).where('trangThai', '==', 'DANG_BAN').get();
  const now = Date.now();
  return snap.docs
    .map((d) => d.data())
    .filter((r) => r.gioXuatPhatUnix * 1000 - KHOA_CHUYEN_NHUONG_MS > now)
    .filter((r) => !tuNgay || r.ngayDi >= tuNgay)
    .map((r) => ({
      maDatVe: r.maDatVe,
      tokenId: r.tokenId,
      tenLoTrinh: r.tenLoTrinh,
      diemKhoiHanh: r.diemKhoiHanh,
      diemKetThuc: r.diemKetThuc,
      ngayDi: r.ngayDi,
      maGhe: r.maGhe,
      gioXuatPhatUnix: r.gioXuatPhatUnix,
      giaGoc: r.giaGoc,
      gia: r.gia,
      laCuaToi: !!maKhachHang && r.maNguoiBan === maKhachHang,
    }))
    .sort((a, b) => a.gioXuatPhatUnix - b.gioXuatPhatUnix);
}

module.exports = { raoBan, huyRaoBan, muaVe, danhSachRaoBan, tinhGiaTran, tinhHoaHong };
