// XÁC MINH (verify) mã nguồn hợp đồng trên Etherscan Sepolia.
//
// Sau khi xác minh, trang sepolia.etherscan.io/address/<địa chỉ> có thêm dấu ✅ và tab "Contract":
//   - Code      : ai cũng đọc được mã Solidity — chứng minh hợp đồng ĐÚNG là code trong đồ án
//   - Read/Write: bấm gọi hàm (layVe, layTrangThaiGhe, tinhTienHoan...) ngay trên Etherscan
//
// Cách làm: gửi "gói mã nguồn" (artifacts/xac-minh/VeXeNFT.json, do `npm run bien-dich` tạo) lên Etherscan;
// Etherscan tự biên dịch lại rồi so với bytecode đang nằm trên blockchain — khớp từng byte mới "Verified".
//
//   npm run xac-minh        (cần ETHERSCAN_API_KEY trong blockchain/.env — đăng ký miễn phí tại etherscan.io)
// `npm run trien-khai:sepolia` đã tự gọi bước này; chỉ cần chạy tay khi lần tự động bị lỗi.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as dotenv from "dotenv";
import { ethers } from "ethers";

const THU_MUC_GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(THU_MUC_GOC, ".env"), quiet: true });

const API_ETHERSCAN = "https://api.etherscan.io/v2/api?chainid=11155111"; // API v2, chainid Sepolia
const URL_METADATA_MAC_DINH = "http://localhost:5050/api/metadata/";
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

async function goiEtherscan(thamSo, phuongThuc = "GET") {
  const than = new URLSearchParams({ ...thamSo, apikey: process.env.ETHERSCAN_API_KEY });
  const phanHoi =
    phuongThuc === "POST"
      ? await fetch(API_ETHERSCAN, { method: "POST", body: than })
      : await fetch(`${API_ETHERSCAN}&${than}`);
  return phanHoi.json(); // { status: "1" | "0", result: ... }
}

/**
 * Gửi mã nguồn lên Etherscan và chờ kết quả.
 * @param {{ diaChi: string, urlMetadata?: string }} p  địa chỉ hợp đồng + tham số đã truyền vào constructor
 * @returns {Promise<boolean>} true nếu đã xác minh
 */
export async function xacMinhTrenEtherscan({ diaChi, urlMetadata = URL_METADATA_MAC_DINH }) {
  if (!process.env.ETHERSCAN_API_KEY) {
    console.log("⚠️  Thiếu ETHERSCAN_API_KEY trong blockchain/.env nên bỏ qua bước xác minh mã nguồn.");
    return false;
  }
  const fileGoi = path.join(THU_MUC_GOC, "artifacts", "xac-minh", "VeXeNFT.json");
  if (!fs.existsSync(fileGoi)) throw new Error("Chưa có gói mã nguồn. Chạy: npm run bien-dich");
  const goi = JSON.parse(fs.readFileSync(fileGoi, "utf8"));

  // Tham số constructor đã mã hóa ABI (Etherscan cần để tái tạo đúng bytecode lúc triển khai)
  const thamSoConstructor = ethers.AbiCoder.defaultAbiCoder().encode(["string"], [urlMetadata]).slice(2);

  console.log(`🔎 Gửi mã nguồn lên Etherscan để xác minh ${diaChi} ...`);
  // Hợp đồng vừa triển khai thì Etherscan cần vài chục giây mới "thấy" -> thử lại vài lần
  let maYeuCau;
  for (let lan = 1; lan <= 8 && !maYeuCau; lan++) {
    const kq = await goiEtherscan(
      {
        module: "contract",
        action: "verifysourcecode",
        contractaddress: diaChi,
        sourceCode: JSON.stringify(goi.dauVao),
        codeformat: "solidity-standard-json-input",
        contractname: goi.tenHopDong,
        compilerversion: goi.phienBanTrinhBienDich,
        constructorArguements: thamSoConstructor, // (Etherscan viết sai chính tả tên tham số này)
        licenseType: "3", // MIT
      },
      "POST"
    );
    if (kq.status === "1") maYeuCau = kq.result;
    else if (/already verified/i.test(kq.result)) {
      console.log("✅ Hợp đồng đã được xác minh từ trước.");
      return true;
    } else if (/unable to locate|not found|does not have bytecode/i.test(kq.result) && lan < 8) {
      console.log(`   Etherscan chưa thấy hợp đồng, chờ 15 giây rồi thử lại (${lan}/8)...`);
      await ngu(15000);
    } else throw new Error(`Etherscan từ chối: ${kq.result}`);
  }

  // Chờ Etherscan biên dịch xong
  for (let lan = 0; lan < 20; lan++) {
    await ngu(5000);
    const kq = await goiEtherscan({ module: "contract", action: "checkverifystatus", guid: maYeuCau });
    if (/pending/i.test(kq.result)) continue;
    if (kq.status === "1" || /already verified/i.test(kq.result)) {
      console.log(`✅ Đã xác minh mã nguồn: https://sepolia.etherscan.io/address/${diaChi}#code`);
      return true;
    }
    throw new Error(`Xác minh thất bại: ${kq.result}`);
  }
  throw new Error("Etherscan xử lý quá lâu, chạy lại `npm run xac-minh` sau ít phút.");
}

// Chạy trực tiếp: `npm run xac-minh` -> lấy địa chỉ hợp đồng Sepolia trong dia-chi-hop-dong.json
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fileDiaChi = path.join(THU_MUC_GOC, "dia-chi-hop-dong.json");
  const sepolia = fs.existsSync(fileDiaChi) ? JSON.parse(fs.readFileSync(fileDiaChi, "utf8")).sepolia : null;
  if (!sepolia) {
    console.error("❌ Chưa triển khai lên Sepolia. Chạy: npm run trien-khai:sepolia");
    process.exit(1);
  }
  xacMinhTrenEtherscan({ diaChi: sepolia.diaChi, urlMetadata: sepolia.urlMetadata })
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((loi) => {
      console.error("❌", loi.message);
      process.exit(1);
    });
}
