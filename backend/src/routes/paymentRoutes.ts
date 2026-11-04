// backend/src/routes/paymentRoutes.ts
import { Router } from "express";
import { PaymentController } from "../controllers/paymentController";

const router = Router();

router.post("/pay", PaymentController.pay);
router.post("/refund", PaymentController.refund);
router.post("/cancel", PaymentController.cancelTicket);
router.post("/mock-create", PaymentController.mockCreateTicket);

export default router;
