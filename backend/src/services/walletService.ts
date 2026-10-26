// backend/src/services/walletService.ts
import { IWalletRepository } from "../repositories/interfaces/IWalletRepository";

export class WalletService {
    constructor(private walletRepository: IWalletRepository) {}

    async createUserWallet(userId: string) {
        try {
            const result = await this.walletRepository.createWallet(userId);
            console.log(`✓ Wallet created for user ${userId}`);
            return result;
        } catch (error) {
            throw new Error(`Failed to create wallet: ${(error as Error).message}`);
        }
    }

    async getUserBalance(walletAddress: string) {
        try {
            const balance = await this.walletRepository.getBalance(walletAddress);
            return balance;
        } catch (error) {
            throw new Error(`Failed to get balance: ${(error as Error).message}`);
        }
    }

    async getAvailableBalance(walletAddress: string) {
        try {
            return await this.walletRepository.getAvailableBalance(walletAddress);
        } catch (error) {
            throw new Error(`Failed to get available balance: ${(error as Error).message}`);
        }
    }

    async getWalletByUserId(userId: string) {
        try {
            return await this.walletRepository.getWalletByUserId(userId);
        } catch (error) {
            throw new Error(`Failed to get wallet for user: ${(error as Error).message}`);
        }
    }
}
