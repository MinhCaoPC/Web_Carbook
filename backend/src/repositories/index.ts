// backend/src/repositories/index.ts
import { WalletRepository } from "./blockchain/WalletRepository";
import { TokenRepository } from "./blockchain/TokenRepository";
import { PaymentRepository } from "./blockchain/PaymentRepository";
import { RefundRepository } from "./blockchain/RefundRepository";

export class RepositoryFactory {
    private static walletRepository: WalletRepository;
    private static tokenRepository: TokenRepository;
    private static paymentRepository: PaymentRepository;
    private static refundRepository: RefundRepository;

    static getWalletRepository() {
        if (!this.walletRepository) {
            this.walletRepository = new WalletRepository();
        }
        return this.walletRepository;
    }

    static getTokenRepository() {
        if (!this.tokenRepository) {
            this.tokenRepository = new TokenRepository();
        }
        return this.tokenRepository;
    }

    static getPaymentRepository() {
        if (!this.paymentRepository) {
            this.paymentRepository = new PaymentRepository();
        }
        return this.paymentRepository;
    }

    static getRefundRepository() {
        if (!this.refundRepository) {
            this.refundRepository = new RefundRepository();
        }
        return this.refundRepository;
    }
}
