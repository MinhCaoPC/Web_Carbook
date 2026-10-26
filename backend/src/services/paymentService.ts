// backend/src/services/paymentService.ts
import { IWalletRepository } from "../repositories/interfaces/IWalletRepository";
import { IPaymentRepository } from "../repositories/interfaces/IPaymentRepository";
import { db } from "../config/firebase";

// Khóa mềm chống double-spending đặt ở TẦNG DATABASE thay vì on-chain:
// trước đây mỗi lần thanh toán tốn 3 giao dịch blockchain (lock -> unlock -> pay, ~35-50s);
// giờ chỉ còn DUY NHẤT 1 giao dịch payForTicket (~12-18s) — contract vẫn tự
// require(balance >= amount) và trừ tiền atomic nên an toàn tuyệt đối ở lớp cuối.
const LOCK_COLLECTION = "WALLET_LOCKS";
const LOCK_TTL_MS = 90_000; // khóa tự hết hạn sau 90s phòng trường hợp process chết giữa chừng

export class PaymentService {
    constructor(
        private walletRepository: IWalletRepository,
        private paymentRepository: IPaymentRepository
    ) {}

    // Giành khóa thanh toán cho 1 ví bằng Firestore transaction (atomic):
    // ví đang có giao dịch khác chưa xong -> từ chối ngay, không tốn gas.
    private async acquireLock(walletAddress: string): Promise<boolean> {
        const ref = db.collection(LOCK_COLLECTION).doc(walletAddress.toLowerCase());
        return db.runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            const now = Date.now();
            if (doc.exists && (doc.data() as any).expireAt > now) {
                return false; // ví đang bận thanh toán ở request khác
            }
            transaction.set(ref, { walletAddress, expireAt: now + LOCK_TTL_MS, createdAt: now });
            return true;
        });
    }

    private async releaseLock(walletAddress: string): Promise<void> {
        try {
            await db.collection(LOCK_COLLECTION).doc(walletAddress.toLowerCase()).delete();
        } catch (e) {
            console.error("Error releasing wallet lock:", e);
        }
    }

    async payForTicket(ticketId: string, userWallet: string, amount: number) {
        // 1. Khóa mềm tại DB — thay cho lockBalance/unlockBalance on-chain (tiết kiệm 2/3 gas + thời gian)
        const daGiuKhoa = await this.acquireLock(userWallet);
        if (!daGiuKhoa) {
            throw new Error("Wallet busy: ví đang có giao dịch khác đang xử lý");
        }

        try {
            // 2. Kiểm tra ví tồn tại + số dư thật từ Smart Contract (chặn sớm, chưa tốn gas)
            const exists = await this.walletRepository.walletExists(userWallet);
            if (!exists) throw new Error("Wallet not found");

            const availableBalance = await this.walletRepository.getAvailableBalance(userWallet);
            if (availableBalance < amount) throw new Error("Insufficient balance");

            // 3. DUY NHẤT 1 giao dịch on-chain: TicketPayment.sol tự kiểm tra
            //    require(available >= amount) và TRỪ tiền atomic trong cùng transaction
            //    -> kể cả 2 request lọt qua bước 2 cùng lúc, contract vẫn chỉ cho 1 bên trừ thành công.
            const result = await this.paymentRepository.payForTicket(ticketId, userWallet, amount);

            return result;
        } catch (error) {
            throw new Error(`Payment failed: ${(error as Error).message}`);
        } finally {
            // 4. Luôn nhả khóa (thành công lẫn thất bại)
            await this.releaseLock(userWallet);
        }
    }
}
