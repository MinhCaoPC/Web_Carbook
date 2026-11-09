// backend/src/controllers/walletController.ts
import { Request, Response } from "express";
import { WalletService } from "../services/walletService";
import { RepositoryFactory } from "../repositories";
import { db } from "../config/firebase";

const walletRepository = RepositoryFactory.getWalletRepository();
const walletService = new WalletService(walletRepository);

export class WalletController {
    // Tạo ví nội cho tài khoản (idempotent: đã có ví thì trả lại ví đó). Không còn khóa riêng / mã khôi phục
    // vì tiền nằm trong Firestore, không phải trên blockchain.
    static async createWallet(req: Request, res: Response) {
        try {
            const { userId } = req.body;
            if (!userId) {
                return res.status(400).json({ success: false, message: "userId is required" });
            }
            const userDoc = await db.collection("TAIKHOAN").doc(userId).get();
            if (!userDoc.exists) {
                return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản." });
            }

            const result = await walletService.createUserWallet(userId);

            await db.collection("TAIKHOAN").doc(userId).update({
                walletAddress: result.walletAddress,
                walletStatus: "ACTIVE",
                ngayCapNhat: new Date()
            });

            return res.status(200).json({
                success: true,
                walletAddress: result.walletAddress,
                txHash: result.txHash
            });
        } catch (error) {
            console.error("Wallet creation controller error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async getBalance(req: Request, res: Response) {
        try {
            const { address } = req.params;
            if (!address) {
                return res.status(400).json({ success: false, message: "Address is required" });
            }
            const balance = await walletService.getUserBalance(address);
            const available = await walletService.getAvailableBalance(address);
            return res.status(200).json({
                success: true,
                address,
                balance,
                availableBalance: available
            });
        } catch (error) {
            console.error("Get balance controller error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async getWalletByUserId(req: Request, res: Response) {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({ success: false, message: "userId is required" });
            }
            // Nguồn sự thật: collection VI (ví nội); TAIKHOAN.walletAddress chỉ là bản sao để tra nhanh
            const userDoc = await db.collection("TAIKHOAN").doc(userId).get();
            const data = userDoc.exists ? userDoc.data() : null;
            if (data && data.walletAddress && data.walletStatus === "ACTIVE") {
                return res.status(200).json({ success: true, userId, walletAddress: data.walletAddress });
            }
            let walletAddress: string | null = null;
            try {
                walletAddress = await walletService.getWalletByUserId(userId);
            } catch (_) {
                walletAddress = null; // chưa có ví
            }
            return res.status(200).json({ success: true, userId, walletAddress });
        } catch (error) {
            console.error("Get wallet by userId controller error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }
}
