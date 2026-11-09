/**
 * @file blockchain.config.ts
 * @description Cấu hình blockchain — CHỈ dùng cho vé NFT (TicketNFT + TicketMarket).
 * Tiền/ví không còn trên chain (ví nội Firestore), nên chỉ còn 2 hợp đồng.
 * Thiếu địa chỉ hợp đồng/khóa relayer => tính năng NFT tự tắt, phần đặt vé & ví vẫn chạy bình thường.
 */
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../../blockchain/.env") });

export const BLOCKCHAIN_CONFIG = {
    RPC_URL: process.env.SEPOLIA_RPC_URL || "",
    CHAIN_ID: Number(process.env.CHAIN_ID || 11155111), // Ethereum Sepolia
    NETWORK_NAME: process.env.CHAIN_NAME || "Ethereum Sepolia Testnet",
    EXPLORER: process.env.CHAIN_EXPLORER || "https://sepolia.etherscan.io",
    CONFIRMATIONS: 1,
};

// Relayer: ví hệ thống ký & trả gas thay người dùng (mint, check-in, hoàn vé, bán lại)
export const PRIVATE_KEYS = {
    RELAYER: process.env.RELAYER_PRIVATE_KEY || "",
};

export const CONTRACT_ADDRESSES = {
    TICKET_NFT: process.env.TICKET_NFT_ADDRESS || "",
    TICKET_MARKET: process.env.TICKET_MARKET_ADDRESS || "",
};

// Hoa hồng bán lại (basis points) — phải khớp royalty đã đặt khi deploy TicketNFT (mặc định 5%)
export const ROYALTY_BPS = Number(process.env.ROYALTY_BPS || 500);
// Giá bán lại tối đa so với giá gốc (basis points) — khớp TicketMarket.maxMarkupBps (mặc định 110%)
export const MAX_MARKUP_BPS = Number(process.env.MAX_MARKUP_BPS || 11000);

export function isNftConfigured(): boolean {
    return !!(BLOCKCHAIN_CONFIG.RPC_URL && PRIVATE_KEYS.RELAYER && CONTRACT_ADDRESSES.TICKET_NFT && CONTRACT_ADDRESSES.TICKET_MARKET);
}

function docAbi(contract: string) {
    const file = path.resolve(__dirname, `../../../blockchain/artifacts/contracts/${contract}.sol/${contract}.json`);
    return JSON.parse(fs.readFileSync(file, "utf8")).abi;
}

// ABI đọc từ artifact Hardhat (npx hardhat compile). Nạp lười để backend vẫn chạy khi chưa compile.
export function getAbis() {
    return { TICKET_NFT_ABI: docAbi("TicketNFT"), TICKET_MARKET_ABI: docAbi("TicketMarket") };
}
