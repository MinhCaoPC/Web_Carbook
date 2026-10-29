// backend/src/controllers/walletController.ts
import { Request, Response } from "express";
import { WalletService } from "../services/walletService";
import { RepositoryFactory } from "../repositories";
import { db } from "../config/firebase";

const walletRepository = RepositoryFactory.getWalletRepository();
const walletService = new WalletService(walletRepository);

export class WalletController {
    static async createWallet(req: Request, res: Response) {
        try {
            const { userId } = req.body;
            if (!userId) {
                return res.status(400).json({ success: false, message: "userId is required" });
            }
            const result = await walletService.createUserWallet(userId);

            // KMS-lite: mã hóa AES-256-GCM private key của khách bằng master key rồi mới lưu
            // (không bao giờ lưu/log key thô; master key nằm ngoài DB — production dùng KMS/Vault)
            let maKhoiPhuc: string | null = null;
            if (result.privateKey) {
                try {
                    const { storeEncryptedKey, taoVaLuuMaKhoiPhuc } = require("../services/keyVaultService");
                    await storeEncryptedKey(result.walletAddress, result.privateKey);
                    // Mã khôi phục ví: bí mật riêng (KHÔNG phải private key thật) để khách chứng minh
                    // sở hữu ví khi cần liên kết lại sang tài khoản khác — chỉ trả về THÔ đúng 1 lần.
                    maKhoiPhuc = await taoVaLuuMaKhoiPhuc(result.walletAddress);
                    console.log(`✓ Encrypted key + recovery code stored for wallet ${result.walletAddress}`);
                } catch (kmsError) {
                    console.error("⚠️ Failed to store encrypted wallet key:", kmsError);
                }
                delete (result as any).privateKey; // không trả key ra ngoài API
            }

            // Cập nhật Firebase database TAIKHOAN
            try {
                await db.collection("TAIKHOAN").doc(userId).update({
                    walletAddress: result.walletAddress,
                    walletStatus: "ACTIVE",
                    ngayCapNhat: new Date()
                });
                console.log(`✓ Updated Firestore for user ${userId} with wallet address ${result.walletAddress}`);
            } catch (firebaseError) {
                console.error("⚠️ Failed to update user wallet info in Firestore:", firebaseError);
            }

            return res.status(200).json({
                success: true,
                walletAddress: result.walletAddress,
                txHash: result.txHash,
                maKhoiPhuc
            });
        } catch (error) {
            console.error("Wallet creation controller error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    // Liên kết lại 1 ví đã tồn tại (tạo ở lần kích hoạt trước, có thể ở tài khoản khác đã mất
    // quyền truy cập) vào tài khoản đang đăng nhập hiện tại. Xác thực bằng "mã khôi phục ví"
    // (xem keyVaultService) chứ không dùng private key thật. Nếu ví đang gắn với 1 tài khoản
    // khác, tài khoản đó sẽ bị gỡ liên kết (walletAddress + walletStatus) để tránh 2 tài khoản
    // cùng "sở hữu" 1 ví.
    static async linkExistingWallet(req: Request, res: Response) {
        try {
            const { userId, walletAddress, maKhoiPhuc } = req.body;
            if (!userId || !walletAddress || !maKhoiPhuc) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng nhập đầy đủ địa chỉ ví và mã khôi phục."
                });
            }
            if (!/^0x[a-fA-F0-9]{40}$/.test(String(walletAddress))) {
                return res.status(400).json({ success: false, message: "Địa chỉ ví không hợp lệ." });
            }

            const { xacThucMaKhoiPhuc, taoVaLuuMaKhoiPhuc } = require("../services/keyVaultService");
            // Trả về đúng casing (checksummed) đã lưu — tránh lệch case khi khách tự gõ tay địa chỉ
            const diaChiChuan: string | null = await xacThucMaKhoiPhuc(walletAddress, maKhoiPhuc);
            if (!diaChiChuan) {
                return res.status(400).json({ success: false, message: "Mã khôi phục hoặc địa chỉ ví không đúng." });
            }

            const currentDoc = await db.collection("TAIKHOAN").doc(userId).get();
            if (!currentDoc.exists) {
                return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản." });
            }
            const currentData = currentDoc.data() || {};
            if (
                currentData.walletAddress &&
                currentData.walletStatus === "ACTIVE" &&
                String(currentData.walletAddress).toLowerCase() !== diaChiChuan.toLowerCase()
            ) {
                return res.status(409).json({
                    success: false,
                    message: "Tài khoản này đã có ví đang hoạt động. Vui lòng liên hệ hỗ trợ nếu cần gộp ví."
                });
            }

            // Gỡ liên kết ở (các) tài khoản khác đang giữ ví này — "xóa thông tin ví bên tài khoản mất"
            const chuCuSnap = await db.collection("TAIKHOAN").where("walletAddress", "==", diaChiChuan).get();
            const batch = db.batch();
            let daGoLienKetTaiKhoanCu = false;
            chuCuSnap.forEach((doc) => {
                if (doc.id !== userId) {
                    batch.update(doc.ref, {
                        walletAddress: null,
                        walletStatus: "DA_HUY_LIEN_KET",
                        ngayCapNhat: new Date()
                    });
                    daGoLienKetTaiKhoanCu = true;
                }
            });
            batch.update(currentDoc.ref, {
                walletAddress: diaChiChuan,
                walletStatus: "ACTIVE",
                ngayCapNhat: new Date()
            });
            await batch.commit();

            // Xoay mã khôi phục ngay sau khi dùng — mã cũ coi như đã lộ (vừa nhập/gửi qua mạng)
            const maKhoiPhucMoi = await taoVaLuuMaKhoiPhuc(diaChiChuan);

            console.log(`✓ Wallet ${diaChiChuan} linked to user ${userId}${daGoLienKetTaiKhoanCu ? " (đã gỡ liên kết tài khoản cũ)" : ""}`);

            return res.status(200).json({
                success: true,
                walletAddress: diaChiChuan,
                daGoLienKetTaiKhoanCu,
                maKhoiPhuc: maKhoiPhucMoi
            });
        } catch (error) {
            console.error("Link existing wallet controller error:", error);
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

            // 1. Kiểm tra Firestore trước để tăng độ phản hồi và tránh lỗi desync smart contract
            const userDoc = await db.collection("TAIKHOAN").doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData && userData.walletAddress && userData.walletStatus === "ACTIVE") {
                    return res.status(200).json({
                        success: true,
                        userId,
                        walletAddress: userData.walletAddress
                    });
                }
                // Tài khoản này đã từng có ví nhưng bị gỡ liên kết (relink sang tài khoản khác) —
                // KHÔNG fallback xuống blockchain, vì mapping userToWallet trên smart contract
                // không có cách xóa/đổi chủ nên vẫn còn trỏ tới ví cũ. Coi như tài khoản hiện
                // không có ví để tránh "sống lại" quyền truy cập ví đã chuyển đi.
                if (userData && userData.walletStatus === "DA_HUY_LIEN_KET") {
                    return res.status(200).json({ success: true, userId, walletAddress: null });
                }
            }

            // 2. Fallback kiểm tra blockchain mapping (chỉ áp dụng khi Firestore chưa từng có
            // thông tin ví cho tài khoản này — vd dữ liệu cũ/ghi Firestore lỗi giữa chừng)
            const walletAddress = await walletService.getWalletByUserId(userId);
            return res.status(200).json({
                success: true,
                userId,
                walletAddress
            });
        } catch (error) {
            console.error("Get wallet by userId controller error:", error);
            // Nếu không tìm thấy ở bước 2, ta cũng có thể thử trả về walletAddress từ Firestore nếu có
            try {
                const { userId } = req.params;
                const userDoc = await db.collection("TAIKHOAN").doc(userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData && userData.walletAddress) {
                        return res.status(200).json({
                            success: true,
                            userId,
                            walletAddress: userData.walletAddress
                        });
                    }
                }
            } catch (fsErr) {
                console.error("Second fallback error:", fsErr);
            }
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }
}
