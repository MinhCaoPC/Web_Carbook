// backend/src/routes/tokenRoutes.ts
import { Router } from "express";
import { PaymentController } from "../controllers/paymentController";
import { requireAuth, requireOwnWallet } from "../middlewares/auth";

const router = Router();

// Nạp tiền / đối soát / rút tiền / lịch sử: ví trong request PHẢI là ví của người đang đăng nhập.
router.post("/deposit", requireOwnWallet("userWallet", "body"), PaymentController.deposit);

// VNPay gọi từ server/trình duyệt, không có token đăng nhập — an toàn nhờ kiểm tra chữ ký HMAC trong controller
router.get("/deposit/vnpay-ipn", PaymentController.vnpayIpn);
router.get("/deposit/vnpay-return", PaymentController.vnpayReturn);

// Kiểm tra đơn nạp thuộc ví của người gọi nằm trong controller (orderId không chứa địa chỉ ví)
router.post("/deposit/reconcile", requireAuth, PaymentController.reconcileDeposit);
router.post("/deposit/reconcile-pending", requireOwnWallet("userWallet", "body"), PaymentController.reconcilePendingDeposits);

// Rút tiền BẮT BUỘC qua OTP (request -> confirm). Đã gỡ route POST /withdraw rút thẳng không OTP.
router.post("/withdraw/request", requireOwnWallet("userWallet", "body"), PaymentController.withdrawRequest);
router.post("/withdraw/confirm", requireAuth, PaymentController.withdrawConfirm);

router.get("/history/:address", requireOwnWallet("address", "params"), PaymentController.getTransactionHistory);

export default router;
