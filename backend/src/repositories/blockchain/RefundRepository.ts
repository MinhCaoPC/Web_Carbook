// backend/src/repositories/blockchain/RefundRepository.ts
import { ethers } from "ethers";
import { IRefundRepository } from "../interfaces/IRefundRepository";
import { BLOCKCHAIN_CONFIG, CONTRACT_ADDRESSES, CONTRACT_ABIS, PRIVATE_KEYS } from "../../config/blockchain.config";
import { fetchContractEvents, addressTopic } from "../../utils/etherscanLogs";

export class RefundRepository implements IRefundRepository {
    private provider: ethers.JsonRpcProvider;
    private relayerSigner: ethers.Wallet;
    private refundContract: ethers.Contract;

    constructor() {
        this.provider = new ethers.JsonRpcProvider(BLOCKCHAIN_CONFIG.RPC_URL);
        this.relayerSigner = new ethers.Wallet(PRIVATE_KEYS.RELAYER, this.provider);
        this.refundContract = new ethers.Contract(
            CONTRACT_ADDRESSES.REFUND,
            CONTRACT_ABIS.REFUND_ABI,
            this.relayerSigner
        );
    }

    async refundTicket(
        ticketId: string,
        userWallet: string,
        amount: number
    ): Promise<{ txHash: string; status: string }> {
        try {
            const tx = await this.refundContract.refundTicket(ticketId, userWallet, amount);
            const receipt = await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
            console.log(`✓ Refund for ticket ${ticketId} processed`);
            return { txHash: receipt!.hash, status: "SUCCESS" };
        } catch (error) {
            console.error("❌ Refund failed:", error);
            throw new Error(`Refund failed: ${(error as Error).message}`);
        }
    }

    async getRefund(ticketId: string): Promise<{
        ticketId: string;
        userWallet: string;
        amount: number;
        status: string;
    }> {
        try {
            const refund = await this.refundContract.getRefund(ticketId);
            return {
                ticketId: refund.ticketId,
                userWallet: refund.userWallet,
                amount: Number(refund.amount),
                status: refund.status,
            };
        } catch (error) {
            console.error("❌ Get refund failed:", error);
            throw new Error(`Get refund failed: ${(error as Error).message}`);
        }
    }

    async getRefundHistory(walletAddress: string): Promise<Array<{
        txHash: string;
        amount: number;
        status: "SUCCESS" | "FAILED";
        reason?: string;
        blockNumber: number;
        timestamp: number;
    }>> {
        const apiKey = BLOCKCHAIN_CONFIG.ETHERSCAN_API_KEY;
        if (!apiKey) throw new Error("Thiếu ETHERSCAN_API_KEY trong backend/.env");

        const iface = this.refundContract.interface;
        const topicFilters = { 2: addressTopic(walletAddress) } as const;

        const [successLogs, failedLogs] = await Promise.all([
            fetchContractEvents(apiKey, CONTRACT_ADDRESSES.REFUND, iface, "RefundSuccess", BLOCKCHAIN_CONFIG.EVENTS_FROM_BLOCK, topicFilters),
            fetchContractEvents(apiKey, CONTRACT_ADDRESSES.REFUND, iface, "RefundFailed", BLOCKCHAIN_CONFIG.EVENTS_FROM_BLOCK, topicFilters),
        ]);

        const success = successLogs.map((log) => ({
            txHash: log.txHash,
            amount: Number(log.args.amount),
            status: "SUCCESS" as const,
            blockNumber: log.blockNumber,
            timestamp: log.timestamp,
        }));
        const failed = failedLogs.map((log) => ({
            txHash: log.txHash,
            amount: 0,
            status: "FAILED" as const,
            reason: log.args.reason as string,
            blockNumber: log.blockNumber,
            timestamp: log.timestamp,
        }));

        return [...success, ...failed];
    }
}
