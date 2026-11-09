const { db } = require('../config/firebase');
const nftService = require('../services/ticketNftService');
const marketService = require('../services/ticketMarketService');

function xuLyLoi(res, error, tenHam) {
  console.error(`${tenHam} error:`, error);
  return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Lỗi máy chủ.' });
}

// GET /api/nft/config (công khai) — thông tin hợp đồng cho trang minh bạch
exports.layCauHinh = (req, res) => {
  const { BLOCKCHAIN_CONFIG, CONTRACT_ADDRESSES, ROYALTY_BPS, MAX_MARKUP_BPS, isNftConfigured } = require('../config/blockchain.config');
  res.json({
    success: true,
    daCauHinh: isNftConfigured(),
    network: { name: BLOCKCHAIN_CONFIG.NETWORK_NAME, chainId: BLOCKCHAIN_CONFIG.CHAIN_ID, explorer: BLOCKCHAIN_CONFIG.EXPLORER },
    contracts: [
      { name: 'TicketNFT', label: 'Vé xe NFT (ERC-721)', address: CONTRACT_ADDRESSES.TICKET_NFT },
      { name: 'TicketMarket', label: 'Chợ bán lại vé', address: CONTRACT_ADDRESSES.TICKET_MARKET },
    ],
    luat: { giaTranPhanTram: MAX_MARKUP_BPS / 100, hoaHongPhanTram: ROYALTY_BPS / 100, khoaChuyenNhuongGio: 2 },
  });
};

// GET /api/nft/my — các vé NFT của khách đang đăng nhập
exports.veNftCuaToi = async (req, res) => {
  try {
    const snap = await db.collection('VEXE').where('maKhachHang', '==', req.maKhachHangDangNhap).get();
    const data = snap.docs
      .map((d) => ({ maDatVe: d.id, ...d.data() }))
      .filter((v) => v.nftTokenId)
      .map((v) => ({
        maDatVe: v.maDatVe, tokenId: v.nftTokenId, nftStatus: v.nftStatus, trangThaiVe: v.trangThaiVe,
        maChuyenXe: v.maChuyenXe, ngayDi: v.ngayDi, maGhe: v.maGhe, dangRaoBan: !!v.dangRaoBan,
        giaRaoBan: v.giaRaoBan || null, giaGoc: v.thanhTien || v.giaVeGoc || 0, txHash: v.nftTxHash || null,
        soLanChuyenNhuong: v.soLanChuyenNhuong || 0,
      }));
    res.json({ success: true, data });
  } catch (e) { xuLyLoi(res, e, 'veNftCuaToi'); }
};

// Chợ
exports.danhSachRaoBan = async (req, res) => {
  try {
    res.json({ success: true, data: await marketService.danhSachRaoBan({ maKhachHang: req.maKhachHangDangNhap }) });
  } catch (e) { xuLyLoi(res, e, 'danhSachRaoBan'); }
};
exports.raoBan = async (req, res) => {
  try {
    res.json({ success: true, ...(await marketService.raoBan({ maKhachHang: req.maKhachHangDangNhap, maDatVe: req.body.maDatVe, gia: req.body.gia })) });
  } catch (e) { xuLyLoi(res, e, 'raoBan'); }
};
exports.huyRaoBan = async (req, res) => {
  try {
    res.json({ success: true, ...(await marketService.huyRaoBan({ maKhachHang: req.maKhachHangDangNhap, maDatVe: req.body.maDatVe })) });
  } catch (e) { xuLyLoi(res, e, 'huyRaoBan'); }
};
exports.muaVe = async (req, res) => {
  try {
    res.json({ success: true, ...(await marketService.muaVe({ maKhachHang: req.maKhachHangDangNhap, maDatVe: req.body.maDatVe, maPin: req.body.maPin })) });
  } catch (e) { xuLyLoi(res, e, 'muaVe'); }
};

// Admin: soát vé + mint lại vé lỗi
exports.checkIn = async (req, res) => {
  try { res.json({ success: true, ...(await nftService.checkIn(req.body.maQR)) }); } catch (e) { xuLyLoi(res, e, 'checkIn'); }
};
exports.thuLaiMint = async (req, res) => {
  try { res.json({ success: true, data: await nftService.thuLaiMintLoi() }); } catch (e) { xuLyLoi(res, e, 'thuLaiMint'); }
};
