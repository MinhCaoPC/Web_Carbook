/**
 * @file TicketNftRepository.ts
 * @description Cài đặt ITicketNftRepository bằng ethers.js — NƠI DUY NHẤT gọi blockchain.
 * Mọi giao dịch do relayer ký (người dùng không cần ví crypto, không trả gas).
 */
import { ethers } from "ethers";
import { ITicketNftRepository, MintTicketInput, TicketOnChain } from "../interfaces/ITicketNftRepository";
import { BLOCKCHAIN_CONFIG, CONTRACT_ADDRESSES, PRIVATE_KEYS, getAbis, isNftConfigured } from "../../config/blockchain.config";

export class TicketNftRepository implements ITicketNftRepository {
    private nft: ethers.Contract;
    private market: ethers.Contract;
    // Hàng đợi: relayer chỉ gửi MỘT giao dịch tại một thời điểm và chờ biên nhận rồi mới gửi tiếp, nên nonce
    // luôn đúng (ethers NonceManager tăng nonce cả khi giao dịch revert lúc ước tính gas -> lệch nonce).
    private hangDoi: Promise<unknown> = Promise.resolve();

    constructor() {
        if (!isNftConfigured()) {
            throw new Error("NFT chưa cấu hình (SEPOLIA_RPC_URL, RELAYER_PRIVATE_KEY, TICKET_NFT_ADDRESS, TICKET_MARKET_ADDRESS).");
        }
        const provider = new ethers.JsonRpcProvider(BLOCKCHAIN_CONFIG.RPC_URL);
        const relayer = new ethers.Wallet(PRIVATE_KEYS.RELAYER, provider);
        const abis = getAbis();
        this.nft = new ethers.Contract(CONTRACT_ADDRESSES.TICKET_NFT, abis.TICKET_NFT_ABI, relayer);
        this.market = new ethers.Contract(CONTRACT_ADDRESSES.TICKET_MARKET, abis.TICKET_MARKET_ABI, relayer);
    }

    private guiVaCho(gui: () => Promise<ethers.ContractTransactionResponse>): Promise<ethers.ContractTransactionReceipt> {
        const chay = async () => {
            const receipt = await (await gui()).wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
            if (!receipt || receipt.status !== 1) throw new Error("Giao dịch blockchain thất bại");
            return receipt;
        };
        const p = this.hangDoi.then(chay, chay);
        this.hangDoi = p.catch(() => undefined);
        return p;
    }

    async mintTicket(i: MintTicketInput) {
        const receipt = await this.guiVaCho(() =>
            this.nft.mintTicket(i.ownerAddress, i.maDatVe, i.maChuyenXe, i.ngayDi, i.maGhe, i.departureUnix, i.facePrice)
        );
        // tokenId lấy từ event TicketMinted (đáng tin hơn đọc lastTokenId khi có nhiều mint song song)
        let tokenId: number | null = null;
        for (const log of receipt.logs) {
            try {
                const parsed = this.nft.interface.parseLog(log);
                if (parsed && parsed.name === "TicketMinted") tokenId = Number(parsed.args.tokenId);
            } catch (_) { /* log của contract khác */ }
        }
        if (tokenId === null) throw new Error("Không đọc được tokenId từ event TicketMinted");
        return { tokenId, txHash: receipt.hash };
    }

    async burnTicket(tokenId: number) {
        return { txHash: (await this.guiVaCho(() => this.nft.burnTicket(tokenId))).hash };
    }

    async markUsed(tokenId: number) {
        return { txHash: (await this.guiVaCho(() => this.nft.markUsed(tokenId))).hash };
    }

    async getTicket(tokenId: number): Promise<TicketOnChain> {
        const [owner, info] = await Promise.all([this.nft.ownerOf(tokenId), this.nft.tradeInfo(tokenId)]);
        return { tokenId, owner, departure: Number(info.departure), facePrice: Number(info.facePrice), used: info.used };
    }

    async list(tokenId: number, sellerAddress: string, price: number) {
        return { txHash: (await this.guiVaCho(() => this.market.list(tokenId, sellerAddress, price))).hash };
    }

    async cancelListing(tokenId: number, sellerAddress: string) {
        return { txHash: (await this.guiVaCho(() => this.market.cancel(tokenId, sellerAddress))).hash };
    }

    async buy(tokenId: number, buyerAddress: string) {
        return { txHash: (await this.guiVaCho(() => this.market.buy(tokenId, buyerAddress))).hash };
    }
}
