// backend/src/services/paymentService.ts
import { IWalletRepository } from "../repositories/interfaces/IWalletRepository";
import { IPaymentRepository } from "../repositories/interfaces/IPaymentRepository";

export class PaymentService {
    constructor(
        private walletRepository: IWalletRepository,
        private paymentRepository: IPaymentRepository
    ) {}

    // Trừ tiền ví nội + ghi nhận thanh toán nằm trong MỘT Firestore transaction
    // (FirestorePaymentRepository.payForTicket) nên không cần khóa mềm riêng: hai request đồng
    // thời trên cùng ví được Firestore tuần tự hóa, request thứ hai thấy số dư mới và bị
    // "Insufficient balance" nếu không đủ; cùng một khóa thanh toán chỉ trả được một lần.
    async payForTicket(ticketId: string, userWallet: string, amount: number) {
        try {
            return await this.paymentRepository.payForTicket(ticketId, userWallet, amount);
        } catch (error) {
            throw new Error(`Payment failed: ${(error as Error).message}`);
        }
    }
}
