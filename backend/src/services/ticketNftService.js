// Vé xe = NFT (như vé concert). Firestore (VEXE) vẫn là nguồn sự thật cho GIỮ CHỖ / THANH TOÁN;
// blockchain chứng nhận QUYỀN SỞ HỮU vé sau khi thanh toán xong:
//   thanh toán xong -> mint NFT | hoàn/huỷ vé -> burn NFT | lên xe (check-in) -> markUsed | bán lại -> TicketMarket.
// NFT chưa cấu hình (thiếu địa chỉ hợp đồng / khóa relayer) thì mọi hàm ở đây tự bỏ qua, đặt vé vẫn chạy.
const { Timestamp } = require('firebase-admin/firestore');
const { db } = require('../config/firebase');
const { diaChiNftCuaTaiKhoan } = require('../utils/nftAddress');
const { httpError } = require('./reservationService');

let repoDungChung = null;
let repoGia = null;

// Test chèn bản giả (không cần blockchain thật)
function datRepoChoTest(repo) { repoGia = repo; }

function layRepo() {
  if (repoGia) return repoGia;
  if (!repoDungChung) {
    const { isNftConfigured } = require('../config/blockchain.config');
    if (!isNftConfigured()) return null;
    const { TicketNftRepository } = require('../repositories/blockchain/TicketNftRepository');
    repoDungChung = new TicketNftRepository();
  }
  return repoDungChung;
}

function batBuocRepo() {
  const repo = layRepo();
  if (!repo) throw httpError('Tính năng vé NFT chưa được cấu hình trên máy chủ.', 503);
  return repo;
}

async function layDiaChiChuVe(maKhachHang) {
  const kh = await db.collection('KHACHHANG').doc(maKhachHang).get();
  if (!kh.exists || !kh.data().maTaiKhoan) throw httpError('Không tìm thấy tài khoản của khách hàng.', 404);
  return diaChiNftCuaTaiKhoan(kh.data().maTaiKhoan);
}

// Giờ xe chạy THẬT của ngày đi (CHUYENXE_NGAY), thiếu thì dùng giờ mẫu của CHUYENXE. Trả về unix giây.
async function layGioXuatPhatUnix(ve) {
  let ts = null;
  const ngayDoc = await db.collection('CHUYENXE_NGAY').doc(`${ve.maChuyenXe}_${ve.ngayDi}`).get();
  if (ngayDoc.exists) ts = ngayDoc.data().thoiGianXuatPhat;
  if (!ts) {
    const cx = await db.collection('CHUYENXE').doc(ve.maChuyenXe).get();
    if (cx.exists) ts = cx.data().thoiGianXuatPhat;
  }
  if (!ts) throw new Error('Không xác định được giờ xe chạy.');
  const ms = typeof ts.toDate === 'function' ? ts.toDate().getTime() : new Date(ts).getTime();
  return Math.floor(ms / 1000);
}

const MINT_TIMEOUT_MS = 3 * 60 * 1000;

// Mint NFT cho 1 vé đã thanh toán. Idempotent: vé đã có token thì trả lại, hai tiến trình mint cùng lúc
// thì chỉ một bên thắng (chiếm DANG_MINT trong transaction).
async function mintVe(maDatVe) {
  const repo = layRepo();
  if (!repo) return { boQua: true, lyDo: 'NFT chưa cấu hình' };

  const ref = db.collection('VEXE').doc(maDatVe);
  const chiem = await db.runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (!d.exists) throw httpError('Không tìm thấy vé.', 404);
    const ve = d.data();
    if (ve.trangThaiVe !== 'DA_TT') return { loai: 'khong-hop-le' };
    if (ve.nftTokenId) return { loai: 'da-co', tokenId: ve.nftTokenId };
    const dangMint = ve.nftStatus === 'DANG_MINT' && ve.nftMintBatDau && Date.now() - ve.nftMintBatDau < MINT_TIMEOUT_MS;
    if (dangMint) return { loai: 'dang-xu-ly' };
    tx.update(ref, { nftStatus: 'DANG_MINT', nftMintBatDau: Date.now() });
    return { loai: 'chiem-duoc', ve };
  });
  if (chiem.loai !== 'chiem-duoc') return chiem;

  const ve = chiem.ve;
  try {
    const [owner, departureUnix] = await Promise.all([layDiaChiChuVe(ve.maKhachHang), layGioXuatPhatUnix(ve)]);
    const { tokenId, txHash } = await repo.mintTicket({
      ownerAddress: owner,
      maDatVe,
      maChuyenXe: ve.maChuyenXe,
      ngayDi: ve.ngayDi,
      maGhe: ve.maGhe,
      departureUnix,
      facePrice: Number(ve.thanhTien || ve.giaVeGoc || 0),
    });
    await ref.update({ nftTokenId: tokenId, nftOwner: owner, nftTxHash: txHash, nftStatus: 'DA_MINT', nftMintBatDau: null, nftError: null });
    return { loai: 'da-mint', tokenId, txHash };
  } catch (err) {
    console.error(`❌ Mint NFT vé ${maDatVe} thất bại:`, err.message);
    await ref.update({ nftStatus: 'MINT_LOI', nftError: String(err.message || err).slice(0, 300), nftMintBatDau: null });
    return { loai: 'loi', loi: err.message };
  }
}

// Mint tuần tự cả nhóm vé (mỗi vé lỗi riêng không cản vé khác). Chạy nền sau khi thanh toán.
async function mintNhomVe(danhSachMaDatVe) {
  const ketQua = [];
  for (const maDatVe of danhSachMaDatVe) ketQua.push({ maDatVe, ...(await mintVe(maDatVe)) });
  return ketQua;
}

// Hoàn/huỷ vé: đốt NFT. Lỗi đốt KHÔNG chặn hoàn tiền (tiền là việc của ví nội) nhưng được ghi lại để xử lý.
async function dotNftVe(maDatVe) {
  const repo = layRepo();
  if (!repo) return { boQua: true };
  const ref = db.collection('VEXE').doc(maDatVe);
  const d = await ref.get();
  if (!d.exists || !d.data().nftTokenId || d.data().nftStatus === 'DA_DOT') return { boQua: true };
  try {
    const { txHash } = await repo.burnTicket(d.data().nftTokenId);
    await ref.update({ nftStatus: 'DA_DOT', nftBurnTxHash: txHash });
    return { daDot: true, txHash };
  } catch (err) {
    console.error(`❌ Đốt NFT vé ${maDatVe} thất bại:`, err.message);
    await ref.update({ nftStatus: 'DOT_LOI', nftError: String(err.message || err).slice(0, 300) });
    return { loi: err.message };
  }
}

const CHECKIN_TRUOC_MS = 3 * 60 * 60 * 1000; // cho phép soát vé từ 3 giờ trước giờ chạy
const CHECKIN_SAU_MS = 12 * 60 * 60 * 1000;

// Soát vé lên xe bằng mã QR: vé phải đang hợp lệ, trong khung giờ, và (có NFT) thì chủ NFT trên chain
// phải đúng là chủ vé hiện tại trong hệ thống. Thành công => markUsed trên chain, vé không bán lại được nữa.
async function checkIn(maQR) {
  if (!maQR) throw httpError('Thiếu mã QR.', 400);
  const snap = await db.collection('VEXE').where('maQR', '==', maQR).limit(1).get();
  if (snap.empty) throw httpError('Mã QR không tồn tại.', 404);
  const doc = snap.docs[0];
  const ve = doc.data();
  if (ve.trangThaiVe === 'DA_SU_DUNG') throw httpError('Vé này đã được dùng để lên xe.', 409);
  if (ve.trangThaiVe !== 'DA_TT') throw httpError(`Vé không hợp lệ (trạng thái ${ve.trangThaiVe}).`, 400);
  if (ve.dangRaoBan) throw httpError('Vé đang được rao bán — chủ vé cần huỷ rao bán trước.', 409);

  const gio = (await layGioXuatPhatUnix(ve)) * 1000;
  const now = Date.now();
  if (now < gio - CHECKIN_TRUOC_MS) throw httpError('Chưa đến giờ soát vé của chuyến này.', 400);
  if (now > gio + CHECKIN_SAU_MS) throw httpError('Vé đã quá hạn sử dụng.', 400);

  let txHash = null;
  const repo = layRepo();
  if (repo && ve.nftTokenId) {
    const tren = await repo.getTicket(ve.nftTokenId);
    if (tren.used) throw httpError('NFT của vé này đã được dùng.', 409);
    const chuHienTai = await layDiaChiChuVe(ve.maKhachHang);
    if (String(tren.owner).toLowerCase() !== chuHienTai.toLowerCase()) {
      throw httpError('Chủ NFT trên blockchain không khớp chủ vé trong hệ thống — từ chối soát vé.', 409);
    }
    txHash = (await repo.markUsed(ve.nftTokenId)).txHash;
  }

  await doc.ref.update({ trangThaiVe: 'DA_SU_DUNG', daLenXeLuc: Timestamp.now(), nftUsedTxHash: txHash });
  return { thanhCong: true, maDatVe: doc.id, maGhe: ve.maGhe, hoTen: ve.hoTenHanhKhach || '', nftTokenId: ve.nftTokenId || null, txHash };
}

// Mint lại các vé mint lỗi lần trước (admin bấm hoặc chạy nền)
async function thuLaiMintLoi(gioiHan = 20) {
  const snap = await db.collection('VEXE').where('nftStatus', '==', 'MINT_LOI').limit(gioiHan).get();
  const ketQua = [];
  for (const d of snap.docs) ketQua.push({ maDatVe: d.id, ...(await mintVe(d.id)) });
  return ketQua;
}

module.exports = { mintVe, mintNhomVe, dotNftVe, checkIn, thuLaiMintLoi, layRepo, batBuocRepo, layDiaChiChuVe, layGioXuatPhatUnix, datRepoChoTest };
