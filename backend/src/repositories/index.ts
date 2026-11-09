// backend/src/repositories/index.ts
// Ví/thanh toán/hoàn tiền chạy trên ví nội Firestore; blockchain chỉ dùng cho vé NFT (xem TicketNftRepository).
import {
    FirestoreWalletRepository,
    FirestorePaymentRepository,
    FirestoreRefundRepository,
} from "./firestore/FirestoreWalletRepository";

export class RepositoryFactory {
    private static walletRepository: FirestoreWalletRepository;
    private static paymentRepository: FirestorePaymentRepository;
    private static refundRepository: FirestoreRefundRepository;

    // Ví và "token" (nạp/rút) dùng chung một kho số dư nên cùng một đối tượng.
    static getWalletRepository() {
        if (!this.walletRepository) this.walletRepository = new FirestoreWalletRepository();
        return this.walletRepository;
    }

    static getTokenRepository() {
        return this.getWalletRepository();
    }

    static getPaymentRepository() {
        if (!this.paymentRepository) this.paymentRepository = new FirestorePaymentRepository();
        return this.paymentRepository;
    }

    static getRefundRepository() {
        if (!this.refundRepository) this.refundRepository = new FirestoreRefundRepository();
        return this.refundRepository;
    }
}
