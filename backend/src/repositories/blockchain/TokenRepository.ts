// backend/src/repositories/blockchain/TokenRepository.ts
import { ethers } from "ethers";
import { ITokenRepository } from "../interfaces/ITokenRepository";
import { BLOCKCHAIN_CONFIG, CONTRACT_ADDRESSES, CONTRACT_ABIS, PRIVATE_KEYS } from "../../config/blockchain.config";

export class TokenRepository implements ITokenRepository {
    private provider: ethers.JsonRpcProvider;
    private walletSigner: ethers.Wallet;
    private tokenContract: ethers.Contract;

    constructor() {
        this.provider = new ethers.JsonRpcProvider(BLOCKCHAIN_CONFIG.RPC_URL);
        this.walletSigner = new ethers.Wallet(PRIVATE_KEYS.DEPLOYER, this.provider);
        this.tokenContract = new ethers.Contract(
            CONTRACT_ADDRESSES.CAR_TOKEN,
            CONTRACT_ABIS.CAR_TOKEN_ABI,
            this.walletSigner
        );
    }

    async mint(to: string, amount: number): Promise<{ txHash: string }> {
        try {
            const tx = await this.tokenContract.mint(to, amount);
            const receipt = await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
            console.log(`✓ Minted ${amount} CAR tokens to ${to}`);
            return { txHash: receipt!.hash };
        } catch (error) {
            console.error("❌ Mint failed:", error);
            throw new Error(`Mint failed: ${(error as Error).message}`);
        }
    }

    // Bản "gửi trước, xác nhận sau": broadcast tx rồi trả về ngay để tầng service gửi tiếp
    // giao dịch kế (nonce tự xếp n, n+1 -> cùng vào 1 block), sau đó chờ xác nhận song song.
    async mintAsync(to: string, amount: number): Promise<{ txHash: string; confirm: () => Promise<void> }> {
        try {
            const tx = await this.tokenContract.mint(to, amount);
            return {
                txHash: tx.hash,
                confirm: async () => {
                    await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
                    console.log(`✓ Minted ${amount} CAR tokens to ${to}`);
                },
            };
        } catch (error) {
            console.error("❌ Mint failed:", error);
            throw new Error(`Mint failed: ${(error as Error).message}`);
        }
    }

    async burn(from: string, amount: number): Promise<{ txHash: string }> {
        try {
            const tx = await this.tokenContract.burn(from, amount);
            const receipt = await tx.wait(BLOCKCHAIN_CONFIG.CONFIRMATIONS);
            console.log(`✓ Burned ${amount} CAR tokens from ${from}`);
            return { txHash: receipt!.hash };
        } catch (error) {
            console.error("❌ Burn failed:", error);
            throw new Error(`Burn failed: ${(error as Error).message}`);
        }
    }

    async getTokenBalance(address: string): Promise<number> {
        try {
            const balance = await this.tokenContract.balanceOf(address);
            return Number(balance);
        } catch (error) {
            console.error("❌ Get token balance failed:", error);
            throw new Error(`Get balance failed: ${(error as Error).message}`);
        }
    }
}
