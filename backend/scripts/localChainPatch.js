// Chỉ dùng cho blockchain giả lập cục bộ (npm run dev:local): node Hardhat tạo block tức thì,
// nhanh hơn thời gian cache 250ms của ethers nên các giao dịch gửi liên tiếp bị lấy nonce cũ.
// Preload này bắt ethers đọc nonce thẳng từ node. KHÔNG dùng với Sepolia (block 12s không cần).
const { ethers } = require('ethers');
ethers.JsonRpcProvider.prototype.getTransactionCount = async function (addr) {
  return parseInt(await this.send('eth_getTransactionCount', [String(addr), 'latest']), 16);
};
