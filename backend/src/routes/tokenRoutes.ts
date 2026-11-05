// backend/src/routes/tokenRoutes.ts
import { Router } from "express";
import { PaymentController } from "../controllers/paymentController";

const router = Router();

router.post("/deposit", PaymentController.deposit);
router.get("/deposit/vnpay-ipn", PaymentController.vnpayIpn);
router.get("/deposit/vnpay-return", PaymentController.vnpayReturn);
router.post("/deposit/reconcile", PaymentController.reconcileDeposit);
router.post("/deposit/reconcile-pending", PaymentController.reconcilePendingDeposits);
router.post("/withdraw", PaymentController.withdraw);
router.post("/withdraw/request", PaymentController.withdrawRequest);
router.post("/withdraw/confirm", PaymentController.withdrawConfirm);
router.get("/history/:address", PaymentController.getTransactionHistory);

export default router;
