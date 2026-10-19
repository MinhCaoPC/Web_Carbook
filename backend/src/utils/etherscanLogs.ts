// backend/src/utils/etherscanLogs.ts
// Đọc log sự kiện on-chain qua Etherscan API (module=logs&action=getLogs) thay vì eth_getLogs
// thẳng qua RPC — Alchemy free tier chỉ cho quét 10 block/lần (không khả thi để quét cả lịch
// sử hợp đồng), còn Etherscan getLogs không giới hạn theo block-range kiểu đó.
import { ethers } from "ethers";

const ETHERSCAN_API_BASE = "https://api.etherscan.io/v2/api";
const SEPOLIA_CHAIN_ID = 11155111;

// Free tier Etherscan giới hạn ~3 lượt gọi/giây. Nhiều repository (payment, refund) có thể
// gọi fetchContractEvents song song (Promise.all) trong cùng 1 request lịch sử giao dịch,
// nên cần xếp hàng + giãn cách ở đây thay vì bắt từng nơi gọi phải tự biết giới hạn này.
const MIN_INTERVAL_MS = 350;
let throttleQueue: Promise<void> = Promise.resolve();
let lastCallAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const result = throttleQueue.then(async () => {
        const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        lastCallAt = Date.now();
        return fn();
    });
    // Giữ chuỗi hàng đợi sống dù 1 lượt gọi lỗi, không để lỗi đó chặn các lượt sau.
    throttleQueue = result.then(() => undefined, () => undefined);
    return result;
}

export interface DecodedEventLog {
    txHash: string;
    blockNumber: number;
    timestamp: number;
    args: ethers.Result;
}

// topicFilters: vị trí topic (1, 2 hoặc 3) -> giá trị 32-byte hex cần khớp (AND với topic0).
export async function fetchContractEvents(
    apiKey: string,
    contractAddress: string,
    iface: ethers.Interface,
    eventName: string,
    fromBlock: number,
    topicFilters: Partial<Record<1 | 2 | 3, string>> = {}
): Promise<DecodedEventLog[]> {
    const fragment = iface.getEvent(eventName);
    if (!fragment) throw new Error(`Không tìm thấy event ${eventName} trong ABI`);

    const params = new URLSearchParams({
        chainid: String(SEPOLIA_CHAIN_ID),
        module: "logs",
        action: "getLogs",
        address: contractAddress,
        topic0: fragment.topicHash,
        fromBlock: String(fromBlock),
        toBlock: "latest",
        apikey: apiKey,
    });

    for (const [pos, value] of Object.entries(topicFilters)) {
        params.set(`topic${pos}`, value as string);
        params.set(`topic0_${pos}_opr`, "and");
    }

    const res = await throttled(() => fetch(`${ETHERSCAN_API_BASE}?${params.toString()}`));
    const json = await res.json();

    if (json.status === "0") {
        if (json.message === "No records found") return [];
        throw new Error(`Etherscan getLogs lỗi: ${json.message || JSON.stringify(json)}`);
    }

    return (json.result as any[]).map((log) => {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        return {
            txHash: log.transactionHash,
            blockNumber: parseInt(log.blockNumber, 16),
            timestamp: parseInt(log.timeStamp, 16),
            args: parsed!.args,
        };
    });
}

// Pad địa chỉ ví thành topic 32-byte để lọc theo tham số `address indexed` trong event.
export function addressTopic(address: string): string {
    return ethers.zeroPadValue(ethers.getAddress(address), 32).toLowerCase();
}
