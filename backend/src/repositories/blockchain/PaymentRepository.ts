// backend/src/repositories/blockchain/PaymentRepository.ts
import { ethers } from "ethers";
import { IPaymentRepository } from "../interfaces/IPaymentRepository";
import { BLOCKCHAIN_CONFIG, CONTRACT_ADDRESSES, CONTRACT_ABIS, PRIVATE_KEYS } from "../../config/blockchain.config";
import { fetchContractEvents, addressTopic } from "../../utils/etherscanLogs";

export class PaymentRepository implements IPaymentRepository {
    private provider: ethers.JsonRpcProvider;
    private relayerSigner: ethers.Wallet;
    private paymentContract: ethers.Contract;

    constructor() {
        this.provider = new ethers.JsonRpcProvider(BLOCKCHAIN_CONFIG.RPC_URL);
        // Sử dụng Relayer wallet (trả gas thay user)
        this.relayerSigner = new ethers.Wallet(PRIVATE_KEYS.RELAYER, this.provider);
        this.paymentContract = new ethers.Contract(
            CONTRACT_ADDRESSES.TICKET_PAYMENT,
            CONTRACT_ABIS.TICKET_PAYMENT_ABI,
            this.relayerSigner
        );
    }

    async payForTicket(
        ticketId: string,
        userWallet: string,
        amount: number
    ): Promise<{ txHash: string; status: string }> {
        try {
            const tx = await this.paymentContract.payForTicket(ticketId, userWallet, amount);
            const receipt = await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
            console.log(`✓ Payment for ticket ${ticketId} processed`);
            return { txHash: receipt!.hash, status: "SUCCESS" };
        } catch (error) {
            console.error("❌ Payment failed:", error);
            throw new Error(`Payment failed: ${(error as Error).message}`);
        }
    }

    async getPayment(ticketId: string): Promise<{
        ticketId: string;
        userWallet: string;
        amount: number;
        status: string;
    }> {
        try {
            const payment = await this.paymentContract.getPayment(ticketId);
            return {
                ticketId: payment.ticketId,
                userWallet: payment.userWallet,
                amount: Number(payment.amount),
                status: payment.status,
            };
        } catch (error) {
            console.error("❌ Get payment failed:", error);
            throw new Error(`Get payment failed: ${(error as Error).message}`);
        }
    }

    async cancelPayment(ticketId: string): Promise<{ txHash: string }> {
        try {
            const tx = await this.paymentContract.cancelPayment(ticketId);
            const receipt = await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
            console.log(`✓ Payment for ticket ${ticketId} cancelled`);
            return { txHash: receipt!.hash };
        } catch (error) {
            console.error("❌ Cancel payment failed:", error);
            throw new Error(`Cancel payment failed: ${(error as Error).message}`);
        }
    }

    async getPaymentHistory(walletAddress: string): Promise<Array<{
        txHash: string;
        amount: number;
        status: "SUCCESS" | "FAILED";
        reason?: string;
        blockNumber: number;
        timestamp: number;
    }>> {
        const apiKey = BLOCKCHAIN_CONFIG.ETHERSCAN_API_KEY;
        if (!apiKey) throw new Error("Thiếu ETHERSCAN_API_KEY trong backend/.env");

        const iface = this.paymentContract.interface;
        // userWallet là tham số indexed thứ 2 -> topic2. ticketId (indexed thứ 1, topic1) là
        // `string indexed` nên log chỉ giữ hash, không lấy lại được chuỗi gốc — không sao vì
        // màn hình lịch sử giao dịch không hiển thị ticketId, chỉ cần số tiền/trạng thái/txHash.
        const topicFilters = { 2: addressTopic(walletAddress) } as const;

        const [successLogs, failedLogs] = await Promise.all([
            fetchContractEvents(apiKey, CONTRACT_ADDRESSES.TICKET_PAYMENT, iface, "PaymentSuccess", BLOCKCHAIN_CONFIG.EVENTS_FROM_BLOCK, topicFilters),
            fetchContractEvents(apiKey, CONTRACT_ADDRESSES.TICKET_PAYMENT, iface, "PaymentFailed", BLOCKCHAIN_CONFIG.EVENTS_FROM_BLOCK, topicFilters),
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
