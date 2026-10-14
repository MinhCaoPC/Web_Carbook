/**
 * @file blockchain.config.ts
 * @description Cấu hình kết nối blockchain, ABI, contract addresses
 * DỌC CẩN THẬN: Nơi duy nhất lưu contract addresses & ABIs
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../../blockchain/.env") });

// ===== Network Configuration =====
export const BLOCKCHAIN_CONFIG = {
    // RPC Endpoint để kết nối Ethereum Sepolia
    RPC_URL: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_KEY",

    // Chain ID của Sepolia
    CHAIN_ID: 11155111,

    // Gas limit tạo giao dịch
    GAS_LIMIT: 300000,

    // Số block cần xác nhận trước khi coi là SUCCESS
    CONFIRMATIONS: 1,

    // Timeout cho mỗi giao dịch (ms)
    TX_TIMEOUT: 60000,

    // Block bắt đầu quét log sự kiện (đối chiếu lịch sử giao dịch on-chain).
    // Mặc định = block lúc deploy bộ contract hiện tại trên Sepolia (11272372, xác định bằng
    // getCode binary-search, không có ở đâu ghi lại lúc deploy) — tránh quét dư từ block 0
    // (hàng nghìn lượt gọi eth_getLogs không cần thiết). Nếu deploy lại contract mới, đặt biến
    // môi trường EVENTS_FROM_BLOCK = block deploy mới (xem trên Etherscan).
    EVENTS_FROM_BLOCK: Number(process.env.EVENTS_FROM_BLOCK || 11272372),

    // API key Etherscan (miễn phí, đăng ký tại etherscan.io/myapikey) — dùng để đọc log sự kiện
    // qua Etherscan getLogs thay vì eth_getLogs thẳng qua RPC (Alchemy free tier giới hạn
    // eth_getLogs chỉ 10 block/lần, không đủ để quét lịch sử giao dịch).
    ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY || "",
};

// ===== Private Keys (Lấy từ .env, CHỈ ĐỌC - không bao giờ commit) =====
export const PRIVATE_KEYS = {
    // Tài khoản deploy & admin (owner của contracts)
    DEPLOYER: process.env.SEPOLIA_PRIVATE_KEY || "",

    // Relayer wallet (trả gas thay user)
    RELAYER: process.env.RELAYER_PRIVATE_KEY || "",
};

// ===== Contract Addresses (Cập nhật sau khi deploy) =====
// Note: Sau khi chạy deploy script, cập nhật những address này
export const CONTRACT_ADDRESSES = {
    // Token ERC-20 Carbook
    CAR_TOKEN: process.env.CAR_TOKEN_ADDRESS || "0x9BFcA381eDFA84dA250CC0a9e294F9E633dDb28d",

    // Wallet management contract
    WALLET: process.env.WALLET_ADDRESS || "0x815207840f369D1E39Ab24E526555F5E7B89B32e",

    // Payment contract
    TICKET_PAYMENT: process.env.TICKET_PAYMENT_ADDRESS || "0x921A36EF699688A8109FB7C8B2C623C357b40127",

    // Refund contract
    REFUND: process.env.REFUND_ADDRESS || "0xF9a5d13CE048070c3b414B15cf7F43733Af6a202",
};

// ===== Contract ABIs (Copy từ blockchain/artifacts sau deploy) =====
// Đây là JSON interface của contract, dùng để gọi hàm và lắng nghe event

// Read full ABIs dynamically from Hardhat compile artifacts
const carTokenArtifact = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../blockchain/artifacts/contracts/CARToken.sol/CARToken.json"), "utf8")
);
const walletArtifact = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../blockchain/artifacts/contracts/Wallet.sol/Wallet.json"), "utf8")
);
const ticketPaymentArtifact = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../blockchain/artifacts/contracts/TicketPayment.sol/TicketPayment.json"), "utf8")
);
const refundArtifact = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../blockchain/artifacts/contracts/Refund.sol/Refund.json"), "utf8")
);

export const CONTRACT_ABIS = {
    CAR_TOKEN_ABI: carTokenArtifact.abi,
    WALLET_ABI: walletArtifact.abi,
    TICKET_PAYMENT_ABI: ticketPaymentArtifact.abi,
    REFUND_ABI: refundArtifact.abi,
};

/**
 * Ghi chú: Sau khi deploy contracts lên Sepolia, cần:
 * 1. Copy contract addresses vào CONTRACT_ADDRESSES
 * 2. Copy ABIs từ blockchain/artifacts vào CONTRACT_ABIS
 * 3. Cập nhật .env file với các address mới
 */
