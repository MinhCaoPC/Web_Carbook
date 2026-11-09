const crypto = require('crypto');

// Địa chỉ "lưu ký" của chủ vé NFT: suy ra TẤT ĐỊNH từ mã tài khoản bằng HMAC-SHA256 + bí mật máy chủ.
// Không ai giữ khóa riêng của địa chỉ này — mọi chuyển nhượng đều do relayer thực hiện qua TicketMarket
// (hợp đồng chỉ cho operator chuyển vé), nên người dùng không cần MetaMask và không lưu khóa nào trong DB.
// Cùng tài khoản luôn ra cùng địa chỉ; đổi NFT_ADDRESS_SECRET sẽ đổi toàn bộ địa chỉ (đừng đổi sau khi đã mint).
function layBiMat() {
  const s = (process.env.NFT_ADDRESS_SECRET || process.env.JWT_SECRET || '').trim();
  if (s.length < 16) throw new Error('Thiếu NFT_ADDRESS_SECRET (hoặc JWT_SECRET) trong backend/.env để suy ra địa chỉ chủ vé NFT.');
  return s;
}

function diaChiNftCuaTaiKhoan(maTaiKhoan) {
  if (!maTaiKhoan) throw new Error('Thiếu mã tài khoản.');
  const h = crypto.createHmac('sha256', layBiMat()).update(`nft-owner:${maTaiKhoan}`).digest('hex');
  return '0x' + h.slice(0, 40);
}

module.exports = { diaChiNftCuaTaiKhoan };
