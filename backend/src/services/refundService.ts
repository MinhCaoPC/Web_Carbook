// backend/src/services/refundService.ts
import { IWalletRepository } from "../repositories/interfaces/IWalletRepository";
import { IRefundRepository } from "../repositories/interfaces/IRefundRepository";

export class RefundService {
    constructor(
        private walletRepository: IWalletRepository,
        private refundRepository: IRefundRepository
    ) {}

    async refundTicket(ticketId: string, userWallet: string, amount: number) {
        try {
            // 1. Kiểm tra ví tồn tại
            const exists = await this.walletRepository.walletExists(userWallet);
            if (!exists) throw new Error("Wallet not found");

            // 2. Thực hiện hoàn tiền trên smart contract.
            //    LƯU Ý: Refund.sol._processRefund ĐÃ TỰ CỘNG tiền hoàn vào sổ cái Wallet —
            //    backend KHÔNG được updateBalance thêm lần nữa (bug cũ: cộng ĐÔI tiền hoàn).
            const result = await this.refundRepository.refundTicket(ticketId, userWallet, amount);

            return result;
        } catch (error) {
            throw new Error(`Refund failed: ${(error as Error).message}`);
        }
    }
}
