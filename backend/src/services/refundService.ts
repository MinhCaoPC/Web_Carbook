// backend/src/services/refundService.ts
import { IWalletRepository } from "../repositories/interfaces/IWalletRepository";
import { IRefundRepository } from "../repositories/interfaces/IRefundRepository";

export class RefundService {
    constructor(
        private walletRepository: IWalletRepository,
        private refundRepository: IRefundRepository
    ) {}

    async refundTicket(paymentId: string, refundId: string, userWallet: string, amount: number) {
        try {
            // 1. Kiểm tra ví tồn tại
            const exists = await this.walletRepository.walletExists(userWallet);
            if (!exists) throw new Error("Wallet not found");

            // 2. Hoàn tiền về ví nội. Repository tự kiểm tra trong một transaction: thanh toán gốc có
            //    thật / đúng chủ ví / tổng hoàn chưa vượt số đã trả / mã hoàn chưa dùng — rồi mới cộng
            //    tiền. Backend không cộng tiền ở bước nào khác.
            const result = await this.refundRepository.refundTicket(paymentId, refundId, userWallet, amount);

            return result;
        } catch (error) {
            throw new Error(`Refund failed: ${(error as Error).message}`);
        }
    }
}
