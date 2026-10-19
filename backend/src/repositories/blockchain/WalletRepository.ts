/**
 * @file WalletRepository.ts
 * @description Cài đặt cụ thể của IWalletRepository
 * DỌC CẩN THẬN: Đây là NƠI DÙNG ETHERS.JS - không nơi khác nên gọi ethers.js
 */

import { ethers } from "ethers";
import { IWalletRepository } from "../interfaces/IWalletRepository";
import { BLOCKCHAIN_CONFIG, CONTRACT_ADDRESSES, CONTRACT_ABIS, PRIVATE_KEYS } from "../../config/blockchain.config";

export class WalletRepository implements IWalletRepository {
    private provider: ethers.JsonRpcProvider;
    private walletSigner: ethers.Wallet;
    private walletContract: ethers.Contract;

    constructor() {
        // Tạo provider kết nối đến Sepolia
        this.provider = new ethers.JsonRpcProvider(BLOCKCHAIN_CONFIG.RPC_URL);

        // Tạo signer từ deployer private key (owner của contract)
        this.walletSigner = new ethers.Wallet(PRIVATE_KEYS.DEPLOYER, this.provider);

        // Tạo contract instance (chỉ read-only nếu không phải owner, hoặc write nếu là owner)
        this.walletContract = new ethers.Contract(
            CONTRACT_ADDRESSES.WALLET,
            CONTRACT_ABIS.WALLET_ABI,
            this.walletSigner
        );
    }

    /**
     * Tạo ví mới cho user
     */
    async createWallet(userId: string): Promise<{ walletAddress: string; txHash: string; privateKey?: string }> {
        try {
            // Tạo địa chỉ ví mới từ random key
            const newWallet = ethers.Wallet.createRandom();
            const walletAddress = newWallet.address;

            // Gọi smart contract để đăng ký ví
            // function createWallet(address _walletAddress, string memory _userId)
            const tx = await this.walletContract.createWallet(walletAddress, userId);
            const receipt = await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);

            console.log(`✓ Wallet created for user ${userId}: ${walletAddress}`);

            return {
                walletAddress,
                txHash: receipt!.hash,
                // Trả về cho tầng trên MÃ HÓA rồi lưu (keyVaultService) — không được log/ghi thô
                privateKey: newWallet.privateKey,
            };
        } catch (error) {
            console.error("❌ Error creating wallet:", error);
            throw new Error(`Failed to create wallet: ${(error as Error).message}`);
        }
    }

    /**
     * Lấy số dư hiện tại từ blockchain
     */
    async getBalance(walletAddress: string): Promise<number> {
        try {
            // Gọi view function getBalance(address)
            const balance = await this.walletContract.getBalance(walletAddress);
            return Number(balance);
        } catch (error) {
            console.error(`❌ Error getting balance for ${walletAddress}:`, error);
            throw new Error(`Failed to get balance: ${(error as Error).message}`);
        }
    }

    /**
     * Lấy số tiền bị khóa
     */
    async getLockedBalance(walletAddress: string): Promise<number> {
        try {
            const locked = await this.walletContract.getLockedBalance(walletAddress);
            return Number(locked);
        } catch (error) {
            console.error(`❌ Error getting locked balance:`, error);
            throw new Error(`Failed to get locked balance: ${(error as Error).message}`);
        }
    }

    /**
     * Lấy số tiền khả dụng
     */
    async getAvailableBalance(walletAddress: string): Promise<number> {
        try {
            const available = await this.walletContract.getAvailableBalance(walletAddress);
            return Number(available);
        } catch (error) {
            console.error(`❌ Error getting available balance:`, error);
            throw new Error(`Failed to get available balance: ${(error as Error).message}`);
        }
    }

    /**
     * Cập nhật số dư (gọi bởi Event Listener)
     */
    async updateBalance(walletAddress: string, newBalance: number): Promise<string> {
        try {
            const tx = await this.walletContract.updateBalance(walletAddress, newBalance);
            const receipt = await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
            console.log(`✓ Balance updated for ${walletAddress}: ${newBalance}`);
            return receipt!.hash;
        } catch (error) {
            console.error("❌ Error updating balance:", error);
            throw new Error(`Failed to update balance: ${(error as Error).message}`);
        }
    }

    // Bản "gửi trước, xác nhận sau" của updateBalance — dùng để chạy song song với mint/burn
    // (2 giao dịch cùng ví Deployer sẽ nhận nonce liên tiếp và vào cùng 1 block)
    async updateBalanceAsync(walletAddress: string, newBalance: number): Promise<{ txHash: string; confirm: () => Promise<void> }> {
        try {
            const tx = await this.walletContract.updateBalance(walletAddress, newBalance);
            return {
                txHash: tx.hash,
                confirm: async () => {
                    await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
                    console.log(`✓ Balance updated for ${walletAddress}: ${newBalance}`);
                },
            };
        } catch (error) {
            console.error("❌ Error updating balance:", error);
            throw new Error(`Failed to update balance: ${(error as Error).message}`);
        }
    }

    /**
     * Khóa số tiền tạm
     */
    async lockBalance(walletAddress: string, amount: number): Promise<string> {
        try {
            const tx = await this.walletContract.lockBalance(walletAddress, amount);
            const receipt = await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
            console.log(`✓ Balance locked for ${walletAddress}: ${amount}`);
            return receipt!.hash;
        } catch (error) {
            console.error("❌ Error locking balance:", error);
            throw new Error(`Failed to lock balance: ${(error as Error).message}`);
        }
    }

    /**
     * Mở khóa số tiền
     */
    async unlockBalance(walletAddress: string, amount: number): Promise<string> {
        try {
            const tx = await this.walletContract.unlockBalance(walletAddress, amount);
            const receipt = await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
            console.log(`✓ Balance unlocked for ${walletAddress}: ${amount}`);
            return receipt!.hash;
        } catch (error) {
            console.error("❌ Error unlocking balance:", error);
            throw new Error(`Failed to unlock balance: ${(error as Error).message}`);
        }
    }

    /**
     * Kiểm tra ví tồn tại
     */
    async walletExists(walletAddress: string): Promise<boolean> {
        try {
            const exists = await this.walletContract.walletExists(walletAddress);
            return exists;
        } catch (error) {
            console.error("❌ Error checking wallet existence:", error);
            throw new Error(`Failed to check wallet: ${(error as Error).message}`);
        }
    }

    /**
     * Lấy địa chỉ ví từ userId
     */
    async getWalletByUserId(userId: string): Promise<string> {
        try {
            const walletAddress = await this.walletContract.userToWallet(userId);
            if (walletAddress === "0x0000000000000000000000000000000000000000") {
                throw new Error("Wallet not found for this user");
            }
            return walletAddress;
        } catch (error) {
            console.error("❌ Error getting wallet by user ID:", error);
            throw new Error(`Failed to get wallet: ${(error as Error).message}`);
        }
    }
}
