// backend/src/routes/walletRoutes.ts
import { Router } from "express";
import { WalletController } from "../controllers/walletController";
import { requireOwnWallet, requireSelfAccount } from "../middlewares/auth";

const router = Router();

// userId ở đây là mã TÀI KHOẢN — chỉ chính chủ (hoặc admin) được tạo/liên kết/tra ví của tài khoản đó.
router.post("/create", requireSelfAccount("userId", "body"), WalletController.createWallet);
router.get("/balance/:address", requireOwnWallet("address", "params"), WalletController.getBalance);
router.get("/userId/:userId", requireSelfAccount("userId", "params"), WalletController.getWalletByUserId);

export default router;
