// backend/src/routes/paymentRoutes.ts
import { Router } from "express";
import { PaymentController } from "../controllers/paymentController";
import { requireAdmin, verifyKhachHang } from "../middlewares/auth";

const router = Router();

// Khách hàng chỉ hủy được VÉ CỦA CHÍNH MÌNH (kiểm tra chủ vé nằm trong controller).
router.post("/cancel", verifyKhachHang, PaymentController.cancelTicket);

// Các thao tác tiền trực tiếp trên contract (không đi qua kiểm tra vé/chủ vé/chính sách hủy) —
// CHỈ quản trị viên. Luồng của khách là /api/thanh-toan (thanh toán) và /api/ticket/cancel (hoàn tiền).
router.post("/pay", requireAdmin, PaymentController.pay);
router.post("/refund", requireAdmin, PaymentController.refund);
router.post("/mock-create", requireAdmin, PaymentController.mockCreateTicket); // thêm chặn ở production trong controller

export default router;
