// backend/src/routes/walletRoutes.ts
import { Router } from "express";
import { WalletController } from "../controllers/walletController";

const router = Router();

router.post("/create", WalletController.createWallet);
router.post("/link", WalletController.linkExistingWallet);
router.get("/balance/:address", WalletController.getBalance);
router.get("/userId/:userId", WalletController.getWalletByUserId);

export default router;
