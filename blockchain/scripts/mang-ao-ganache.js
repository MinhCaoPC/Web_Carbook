// Mạng blockchain ảo DỰ PHÒNG bằng Ganache (thuần JavaScript).
// Dùng khi `npx hardhat node` không chạy được (vd Windows bật Smart App Control chặn file .node của Hardhat).
// Cấu hình GIỐNG HỆT Hardhat: cổng 8545, chainId 31337, cùng 20 ví và khóa riêng, mỗi ví 10.000 ETH,
// nên MetaMask, script triển khai và backend không cần đổi gì.
//
//   node scripts/mang-ao-ganache.js
import ganache from "ganache";
import { ethers } from "ethers";

const CUM_TU_HARDHAT = "test test test test test test test test test test test junk";
const CONG = 8545;

const mayChu = ganache.server({
  logging: { quiet: true },
  chain: { chainId: 31337, hardfork: "shanghai" },
  wallet: { mnemonic: CUM_TU_HARDHAT, totalAccounts: 20, defaultBalance: 10000 },
});

mayChu.listen(CONG, (loi) => {
  if (loi) {
    console.error("❌ Không mở được cổng", CONG, "-", loi.message);
    process.exit(1);
  }
  console.log(`\n⛓️  Mạng ảo đang chạy tại http://127.0.0.1:${CONG}  (chainId 31337)\n`);
  console.log("Ví có sẵn (nhập khóa riêng vào MetaMask để dùng):");
  for (let i = 0; i < 5; i++) {
    const vi = ethers.HDNodeWallet.fromPhrase(CUM_TU_HARDHAT, undefined, `m/44'/60'/0'/0/${i}`);
    const vaiTro = i === 0 ? "nhà xe / chủ hợp đồng" : i === 1 ? "nhân viên soát vé" : "khách hàng";
    console.log(`  #${i} ${vi.address}  (${vaiTro})\n      khóa riêng: ${vi.privateKey}`);
  }
  console.log("\n⚠️  Các khóa trên CÔNG KHAI, chỉ dùng cho mạng ảo. Nhấn Ctrl+C để tắt.");
});
