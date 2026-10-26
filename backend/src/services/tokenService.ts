// backend/src/services/tokenService.ts
import { ITokenRepository } from "../repositories/interfaces/ITokenRepository";
import { IWalletRepository } from "../repositories/interfaces/IWalletRepository";

export class TokenService {
    constructor(
        private tokenRepository: ITokenRepository,
        private walletRepository: IWalletRepository
    ) {}

    async deposit(userWallet: string, amount: number) {
        try {
            // Tối ưu tốc độ: đọc số dư sổ cái hiện tại, rồi GỬI LIỀN 2 giao dịch
            // (mint token + cập nhật sổ cái Wallet) — chúng nhận nonce liên tiếp nên vào
            // CÙNG 1 BLOCK, thời gian chờ giảm từ ~2 block (24-30s) còn ~1 block (12-15s).
            const currentBalance = await this.walletRepository.getBalance(userWallet);

            const mintPending = await this.tokenRepository.mintAsync(userWallet, amount);
            const updatePending = await this.walletRepository.updateBalanceAsync(userWallet, currentBalance + amount);

            await Promise.all([mintPending.confirm(), updatePending.confirm()]);
            return { txHash: mintPending.txHash };
        } catch (error) {
            throw new Error(`Deposit failed: ${(error as Error).message}`);
        }
    }

    async withdraw(userWallet: string, amount: number) {
        try {
            // 1. Kiểm tra ví tồn tại
            const exists = await this.walletRepository.walletExists(userWallet);
            if (!exists) throw new Error("Wallet not found");

            // 2. Kiểm tra số dư khả dụng có đủ không
            const availableBalance = await this.walletRepository.getAvailableBalance(userWallet);
            if (availableBalance < amount) {
                throw new Error("Số dư khả dụng không đủ để thực hiện giao dịch");
            }

            // 3. Thực hiện burn token
            const result = await this.tokenRepository.burn(userWallet, amount);

            // 4. Đồng bộ số dư mới sang Wallet contract
            const newBalance = await this.tokenRepository.getTokenBalance(userWallet);
            await this.walletRepository.updateBalance(userWallet, newBalance);
            return result;
        } catch (error) {
            throw new Error((error as Error).message);
        }
    }

    async getBalance(address: string) {
        try {
            return await this.tokenRepository.getTokenBalance(address);
        } catch (error) {
            throw new Error(`Failed to get token balance: ${(error as Error).message}`);
        }
    }
}
