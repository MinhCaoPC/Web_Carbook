// Triển khai hợp đồng VeXeNFT lên blockchain, rồi ghi địa chỉ vào blockchain/dia-chi-hop-dong.json
// (backend và web tự đọc file này — KHÔNG cần copy địa chỉ bằng tay).
//
//   node scripts/trien-khai.js            -> mạng ảo trên máy (http://127.0.0.1:8545)
//   node scripts/trien-khai.js sepolia    -> mạng thử nghiệm Sepolia (cần SEPOLIA_RPC_URL, SEPOLIA_PRIVATE_KEY trong blockchain/.env)
//
// Biến tùy chọn trong blockchain/.env:
//   URL_METADATA       đường dẫn metadata vé (mặc định http://localhost:5050/api/metadata/)
//   NHAN_VIEN_SOAT_VE  danh sách ví nhân viên soát vé, cách nhau bằng dấu phẩy
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { xacMinhTrenEtherscan } from "./xac-minh-etherscan.js";

const THU_MUC_GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(THU_MUC_GOC, ".env"), quiet: true });

// Ví #0 và #1 MẶC ĐỊNH, CÔNG KHAI của Hardhat/Ganache — chỉ có giá trị trên mạng ảo.
const KHOA_VI_0_MANG_AO = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DIA_CHI_VI_1_MANG_AO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const tenMang = process.argv[2] === "sepolia" ? "sepolia" : "localhost";
const cauHinh =
  tenMang === "sepolia"
    ? { rpc: process.env.SEPOLIA_RPC_URL, khoa: process.env.SEPOLIA_PRIVATE_KEY }
    : { rpc: "http://127.0.0.1:8545", khoa: KHOA_VI_0_MANG_AO };

if (!cauHinh.rpc || !cauHinh.khoa) {
  console.error("❌ Thiếu SEPOLIA_RPC_URL hoặc SEPOLIA_PRIVATE_KEY trong blockchain/.env");
  process.exit(1);
}

const fileArtifact = path.join(THU_MUC_GOC, "artifacts", "contracts", "VeXeNFT.sol", "VeXeNFT.json");
if (!fs.existsSync(fileArtifact)) {
  console.error("❌ Chưa biên dịch hợp đồng. Chạy: npm run bien-dich");
  process.exit(1);
}
const artifact = JSON.parse(fs.readFileSync(fileArtifact, "utf8"));

const provider = new ethers.JsonRpcProvider(cauHinh.rpc);
try {
  await provider.getBlockNumber();
} catch {
  console.error(`❌ Không kết nối được ${cauHinh.rpc}. Với mạng ảo, mở terminal khác và chạy: npm run mang-ao`);
  process.exit(1);
}
const chuHopDong = new ethers.Wallet(cauHinh.khoa, provider);
const { chainId } = await provider.getNetwork();

console.log(`🚀 Triển khai VeXeNFT lên ${tenMang} (chainId ${chainId})`);
console.log(`   Ví nhà xe (chủ hợp đồng): ${chuHopDong.address}`);

const urlMetadata = process.env.URL_METADATA || "http://localhost:5050/api/metadata/";
const nhaMay = new ethers.ContractFactory(artifact.abi, artifact.bytecode, chuHopDong);
const hopDong = await nhaMay.deploy(urlMetadata);
const bienNhan = await hopDong.deploymentTransaction().wait();
const diaChi = await hopDong.getAddress();
console.log(`✅ Địa chỉ hợp đồng: ${diaChi} (khối ${bienNhan.blockNumber})`);

// Cấp quyền soát vé
const danhSachNhanVien = (process.env.NHAN_VIEN_SOAT_VE || "").split(",").map((s) => s.trim()).filter(Boolean);
if (tenMang === "localhost") danhSachNhanVien.push(DIA_CHI_VI_1_MANG_AO); // demo: ví #1 là nhân viên
for (const nv of danhSachNhanVien) {
  await (await hopDong.datNhanVienSoatVe(nv, true)).wait();
  console.log(`👮 Cấp quyền soát vé cho ${nv}`);
}

// Ghi địa chỉ ra file cho backend + web đọc
const fileDiaChi = path.join(THU_MUC_GOC, "dia-chi-hop-dong.json");
const tatCa = fs.existsSync(fileDiaChi) ? JSON.parse(fs.readFileSync(fileDiaChi, "utf8")) : {};
tatCa[tenMang] = {
  diaChi,
  chainId: Number(chainId),
  khoiTrienKhai: bienNhan.blockNumber,
  chuHopDong: chuHopDong.address,
  urlMetadata, // tham số constructor — cần khi xác minh mã nguồn trên Etherscan
  thoiGian: new Date().toISOString(),
};
fs.writeFileSync(fileDiaChi, JSON.stringify(tatCa, null, 2));
console.log(`📝 Đã ghi vào blockchain/dia-chi-hop-dong.json`);

if (tenMang === "sepolia") {
  console.log(`🌐 Xem trên Etherscan: https://sepolia.etherscan.io/address/${diaChi}`);
  try {
    await xacMinhTrenEtherscan({ diaChi, urlMetadata });
  } catch (loi) {
    console.log(`⚠️  Chưa xác minh được mã nguồn (${loi.message}). Thử lại sau bằng: npm run xac-minh`);
  }
  console.log(`\nBước tiếp theo: cd ../backend && npm run mo-ban-chuyen:sepolia && npm run start:sepolia`);
} else {
  console.log(`\nBước tiếp theo: cd ../backend && npm run mo-ban-chuyen   (mở bán các chuyến trong 4 ngày tới)`);
}
