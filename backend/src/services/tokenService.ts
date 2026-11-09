// backend/src/services/tokenService.ts
import { ITokenRepository } from "../repositories/interfaces/ITokenRepository";
import { IWalletRepository } from "../repositories/interfaces/IWalletRepository";

export class TokenService {
    constructor(
        private tokenRepository: ITokenRepository,
        private walletRepository: IWalletRepository
    ) {}

    // Nạp tiền = cộng số dư ví nội trong một transaction Firestore (có dòng sổ cái đi kèm).
    async deposit(userWallet: string, amount: number) {
        try {
            const exists = await this.walletRepository.walletExists(userWallet);
            if (!exists) throw new Error("Wallet not found");

            const result = await this.tokenRepository.mint(userWallet, amount);
            return { txHash: result.txHash };
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

            // 3. Trừ số dư ví (transaction Firestore, tự kiểm tra lại số dư khả dụng)
            return await this.tokenRepository.burn(userWallet, amount);
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
