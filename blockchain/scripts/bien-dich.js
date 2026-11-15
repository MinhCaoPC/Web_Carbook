// Biên dịch hợp đồng bằng solc-js (trình biên dịch Solidity viết bằng JavaScript/WebAssembly).
// Dùng thay cho `npx hardhat compile` trên máy Windows bật Smart App Control (chặn file .node của Hardhat).
// Kết quả ghi ra artifacts/contracts/<Ten>.sol/<Ten>.json — CÙNG định dạng với Hardhat,
// nên script triển khai và backend đọc được dù bạn biên dịch bằng cách nào.
//
//   node scripts/bien-dich.js
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const solc = require("solc");

const THU_MUC_GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THU_MUC_HOP_DONG = path.join(THU_MUC_GOC, "contracts");
const CAC_HOP_DONG = ["VeXeNFT"]; // QuanLyChuyenXe là lớp cha (abstract) nên đã nằm gọn trong VeXeNFT

// Gom mã nguồn mọi file .sol trong contracts/
const nguon = {};
for (const ten of fs.readdirSync(THU_MUC_HOP_DONG).filter((f) => f.endsWith(".sol"))) {
  nguon[`contracts/${ten}`] = { content: fs.readFileSync(path.join(THU_MUC_HOP_DONG, ten), "utf8") };
}

// solc gọi hàm này khi gặp `import "@openzeppelin/..."`
function timFileImport(duongDan) {
  try {
    return { contents: fs.readFileSync(require.resolve(duongDan), "utf8") };
  } catch {
    return { error: `Không tìm thấy ${duongDan}` };
  }
}

const dauVao = {
  language: "Solidity",
  sources: nguon,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai", // khớp hardhat.config.ts; chạy được trên Hardhat, Ganache và Sepolia
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

console.log(`Đang biên dịch bằng solc ${solc.version()} ...`);
const ketQua = JSON.parse(solc.compile(JSON.stringify(dauVao), { import: timFileImport }));

const loi = (ketQua.errors || []).filter((e) => e.severity === "error");
for (const e of ketQua.errors || []) console.log(e.severity === "error" ? "❌" : "⚠️ ", e.formattedMessage);
if (loi.length) process.exit(1);

for (const ten of CAC_HOP_DONG) {
  const nguonFile = `contracts/${ten}.sol`;
  const hd = ketQua.contracts[nguonFile][ten];
  const thuMucRa = path.join(THU_MUC_GOC, "artifacts", "contracts", `${ten}.sol`);
  fs.mkdirSync(thuMucRa, { recursive: true });
  fs.writeFileSync(
    path.join(thuMucRa, `${ten}.json`),
    JSON.stringify(
      {
        _format: "hh-sol-artifact-1",
        contractName: ten,
        sourceName: nguonFile,
        abi: hd.abi,
        bytecode: "0x" + hd.evm.bytecode.object,
        deployedBytecode: "0x" + hd.evm.deployedBytecode.object,
        linkReferences: {},
        deployedLinkReferences: {},
      },
      null,
      2
    )
  );
  console.log(`✅ ${ten}: ${(hd.evm.deployedBytecode.object.length / 2 / 1024).toFixed(1)} KB bytecode`);
}

// Lưu "gói mã nguồn" (Standard JSON Input) để XÁC MINH trên Etherscan: gồm TOÀN BỘ file .sol đã dùng
// (cả thư viện OpenZeppelin) + đúng cài đặt biên dịch -> Etherscan biên dịch lại và so khớp bytecode.
const nguonDayDu = {};
for (const tenFile of Object.keys(ketQua.sources)) {
  nguonDayDu[tenFile] = nguon[tenFile] || { content: timFileImport(tenFile).contents };
}
const thuMucXacMinh = path.join(THU_MUC_GOC, "artifacts", "xac-minh");
fs.mkdirSync(thuMucXacMinh, { recursive: true });
fs.writeFileSync(
  path.join(thuMucXacMinh, "VeXeNFT.json"),
  JSON.stringify(
    {
      phienBanTrinhBienDich: "v" + solc.version().replace(/\.Emscripten.*$/, ""), // vd v0.8.28+commit.7893614a
      tenHopDong: "contracts/VeXeNFT.sol:VeXeNFT",
      dauVao: { language: "Solidity", sources: nguonDayDu, settings: { ...dauVao.settings, outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } } } },
    },
    null,
    2
  )
);
console.log(`📦 Gói mã nguồn để xác minh trên Etherscan: artifacts/xac-minh/VeXeNFT.json (${Object.keys(nguonDayDu).length} file .sol)`);
