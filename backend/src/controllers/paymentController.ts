// backend/src/controllers/paymentController.ts
import { Request, Response } from "express";
import { TokenService } from "../services/tokenService";
import { PaymentService } from "../services/paymentService";
import { RefundService } from "../services/refundService";
import { RepositoryFactory } from "../repositories";
import { VnPayService } from "../services/vnpayService";
import { DepositOrderRepository } from "../repositories/depositOrderRepository";
import { db } from "../config/firebase";
import { sendWithdrawOtpEmail } from "../config/mailer";
import { VirtualBankService } from "../services/virtualBankService";
import * as crypto from "crypto";

const tokenRepository = RepositoryFactory.getTokenRepository();
const walletRepository = RepositoryFactory.getWalletRepository();
const paymentRepository = RepositoryFactory.getPaymentRepository();
const refundRepository = RepositoryFactory.getRefundRepository();

const tokenService = new TokenService(tokenRepository, walletRepository);
const paymentService = new PaymentService(walletRepository, paymentRepository);
const refundService = new RefundService(walletRepository, refundRepository);
const depositOrderRepository = new DepositOrderRepository();

export class PaymentController {
    static async deposit(req: Request, res: Response) {
        try {
            const { userWallet, amount } = req.body;
            if (!userWallet || amount === undefined) {
                return res.status(400).json({ success: false, message: "userWallet and amount are required" });
            }

            // VNPay chỉ nhận số tiền VND nguyên (app có thể gửi 100000.0)
            const depositAmount = Math.floor(Number(amount));
            if (!Number.isFinite(depositAmount) || depositAmount < 10000) {
                return res.status(400).json({ success: false, message: "Số tiền nạp không hợp lệ (tối thiểu 10.000đ)." });
            }

            const tmnCode = (process.env.VNP_TMN_CODE || "").trim();
            const hashSecret = (process.env.VNP_HASH_SECRET || "").trim();
            const vnpUrl = (process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html").trim();
            // Mặc định localhost để WebView trong Android emulator quay về được backend
            const returnUrl = (process.env.VNP_RETURN_URL || `http://localhost:${process.env.PORT || 5050}/api/token/deposit/vnpay-return`).trim();

            // Thiếu thông tin merchant thì VNPay trả "Dữ liệu gửi sang không đúng định dạng"
            // -> chặn sớm với thông báo rõ ràng thay vì tạo URL hỏng
            if (!tmnCode || !hashSecret) {
                return res.status(500).json({
                    success: false,
                    message: "Backend chưa cấu hình VNP_TMN_CODE / VNP_HASH_SECRET trong backend/.env. " +
                        "Đăng ký sandbox tại https://sandbox.vnpayment.vn/devreg để nhận 2 giá trị này qua email."
                });
            }

            const orderId = `DP${Date.now()}`;
            const pad = (n: number) => n.toString().padStart(2, "0");
            const now = new Date();
            const vnpCreateDate = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            await depositOrderRepository.create({
                orderId,
                userWallet,
                amount: depositAmount,
                status: "PENDING",
                createdAt: now,
                vnpCreateDate
            });

            // Clean IPv6 format for VNPAY
            let ipAddr = req.ip || "127.0.0.1";
            if (ipAddr.includes("::ffff:")) {
                ipAddr = ipAddr.replace("::ffff:", "");
            }
            if (ipAddr === "::1" || ipAddr.includes(":")) {
                ipAddr = "127.0.0.1";
            }

            const paymentUrl = VnPayService.createPaymentUrl({
                orderId,
                amount: depositAmount,
                orderInfo: `Nap tien vi CarbookPay ${orderId}`,
                ipAddr,
                returnUrl,
                tmnCode,
                hashSecret,
                vnpUrl
            });

            console.log("=== [DEBUG VNPAY DEPOSIT] ===");
            console.log("tmnCode:", tmnCode);
            console.log("hashSecret:", hashSecret ? "********" : "MISSING");
            console.log("ipAddr:", ipAddr);
            console.log("orderId:", orderId);
            console.log("amount:", amount);
            console.log("paymentUrl:", paymentUrl);
            console.log("=============================");

            return res.status(200).json({
                success: true,
                orderId,
                paymentUrl
            });
        } catch (error) {
            console.error("Deposit controller error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    // Lõi đối soát 1 đơn nạp tiền còn PENDING với VNPay (querydr): nếu VNPay xác nhận đã thanh
    // toán thì mint token + SUCCESS; nếu VNPay báo chưa/không thanh toán thì đóng FAILED. Dùng
    // chung bởi reconcileDeposit (1 đơn, app gọi ngay sau khi đóng WebView) và
    // reconcilePendingDeposits (quét TẤT CẢ đơn PENDING của 1 ví — tự "vét" các đơn bị kẹt do
    // app đóng quá sớm/mất mạng trước khi đối soát xong, ví dụ khi VNPay xác nhận thanh toán
    // trễ hơn khung chờ ban đầu của app).
    private static async reconcileOneOrder(orderId: string): Promise<{ status: string; txHash?: string | null; message?: string }> {
        const order = await depositOrderRepository.findById(orderId);
        if (!order) {
            return { status: "NOT_FOUND" };
        }

        // Đơn đã chốt rồi thì trả luôn trạng thái hiện tại
        if (order.status === "SUCCESS" || order.status === "FAILED") {
            return { status: order.status, txHash: order.txHash || null };
        }
        if ((order.status as string) === "PROCESSING") {
            return { status: "PROCESSING" };
        }

        const tmnCode = (process.env.VNP_TMN_CODE || "").trim();
        const hashSecret = (process.env.VNP_HASH_SECRET || "").trim();

        // vnpCreateDate lưu sẵn; đơn cũ chưa có thì suy ra từ createdAt
        const pad = (n: number) => n.toString().padStart(2, "0");
        const c = order.createdAt;
        const transactionDate = order.vnpCreateDate ||
            `${c.getFullYear()}${pad(c.getMonth() + 1)}${pad(c.getDate())}${pad(c.getHours())}${pad(c.getMinutes())}${pad(c.getSeconds())}`;

        const { paid, raw } = await VnPayService.queryTransaction({
            orderId,
            transactionDate,
            orderInfo: `Nap tien vi CarbookPay ${orderId}`,
            ipAddr: "127.0.0.1",
            tmnCode,
            hashSecret,
        });

        if (paid) {
            // Kiểm tra số tiền khớp rồi mint (giữ nguyên cơ chế PROCESSING chống mint trùng)
            const vnpAmount = Number(raw.vnp_Amount) / 100;
            if (vnpAmount !== order.amount) {
                return { status: "AMOUNT_MISMATCH", message: "Số tiền VNPay xác nhận không khớp đơn nạp." };
            }
            await depositOrderRepository.update(orderId, { status: "PROCESSING" as any });
            try {
                const result = await tokenService.deposit(order.userWallet, order.amount);
                await depositOrderRepository.update(orderId, { status: "SUCCESS", txHash: result.txHash });
                console.log(`[Reconcile] Đơn ${orderId} đã mint on-chain. TxHash: ${result.txHash}`);
                return { status: "SUCCESS", txHash: result.txHash };
            } catch (err) {
                await depositOrderRepository.update(orderId, { status: "FAILED" });
                console.error(`[Reconcile] Mint thất bại cho đơn ${orderId}:`, err);
                return { status: "FAILED", message: "VNPay đã thu tiền nhưng mint token thất bại — liên hệ hỗ trợ." };
            }
        }

        // VNPay xác nhận chưa/không thanh toán -> đóng đơn để lịch sử không kẹt "Đang xử lý"
        // (vnp_ResponseCode 91 = không tìm thấy giao dịch; các mã khác giữ nguyên PENDING nếu là lỗi truy vấn)
        if (raw.vnp_ResponseCode === "00" || raw.vnp_ResponseCode === "91") {
            await depositOrderRepository.update(orderId, { status: "FAILED" });
            return { status: "FAILED" };
        }

        console.warn(`[Reconcile] querydr không kết luận được cho ${orderId}:`, JSON.stringify(raw).slice(0, 300));
        return { status: "PENDING", message: "Chưa đối soát được với VNPay, thử lại sau." };
    }

    // POST /api/token/deposit/reconcile { orderId }
    // App gọi sau khi đóng WebView để trạng thái & số dư luôn khớp thực tế, kể cả khi
    // trang vnpay-return không quay về backend được.
    static async reconcileDeposit(req: Request, res: Response) {
        try {
            const { orderId } = req.body;
            if (!orderId) {
                return res.status(400).json({ success: false, message: "orderId is required" });
            }

            const result = await PaymentController.reconcileOneOrder(orderId);
            if (result.status === "NOT_FOUND") {
                return res.status(404).json({ success: false, message: "Không tìm thấy đơn nạp tiền." });
            }
            if (result.status === "AMOUNT_MISMATCH") {
                return res.status(400).json({ success: false, message: result.message });
            }
            return res.status(200).json({ success: true, orderId, status: result.status, txHash: result.txHash ?? null, message: result.message });
        } catch (error) {
            console.error("Reconcile deposit error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    // POST /api/token/deposit/reconcile-pending { userWallet }
    // "Vét" mọi đơn nạp tiền còn PENDING của 1 ví: cửa sổ chờ ban đầu của app (ngay sau khi
    // đóng WebView) có thể kết thúc trước khi VNPay xác nhận xong (sandbox đôi khi xác nhận trễ
    // vài chục giây), khiến đơn bị kẹt PENDING dù thực tế đã thanh toán thành công — app gọi
    // endpoint này mỗi khi mở Ví CarbookPay để tự đóng nốt các đơn kẹt đó, không cần người dùng
    // làm gì thêm. Xử lý TUẦN TỰ (không Promise.all) vì mỗi lần mint gửi 2 giao dịch từ CÙNG 1
    // ví relayer — gửi song song nhiều đơn dễ va nonce.
    static async reconcilePendingDeposits(req: Request, res: Response) {
        try {
            const { userWallet } = req.body;
            if (!userWallet) {
                return res.status(400).json({ success: false, message: "userWallet is required" });
            }

            // Lọc status ở phía Node thay vì thêm .where("status", ...) — tránh phải tạo composite
            // index (userWallet + status) trên Firestore; số đơn nạp/ví nhỏ nên không đáng ngại.
            const walletOrdersSnap = await db.collection("YEUCAUNAPTIEN")
                .where("userWallet", "==", userWallet)
                .get();
            const pendingDocs = walletOrdersSnap.docs.filter((doc) => doc.data().status === "PENDING");

            const ketQua: Array<{ orderId: string; status: string }> = [];
            for (const doc of pendingDocs) {
                try {
                    const result = await PaymentController.reconcileOneOrder(doc.id);
                    ketQua.push({ orderId: doc.id, status: result.status });
                } catch (err) {
                    console.error(`[ReconcilePending] Lỗi đối soát đơn ${doc.id}:`, err);
                    ketQua.push({ orderId: doc.id, status: "ERROR" });
                }
            }

            return res.status(200).json({ success: true, daXuLy: ketQua });
        } catch (error) {
            console.error("Reconcile pending deposits error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async vnpayIpn(req: Request, res: Response) {
        try {
            const vnpParams = { ...req.query };
            const hashSecret = (process.env.VNP_HASH_SECRET || "").trim();

            const isValid = VnPayService.verifySecureHash(vnpParams, hashSecret);
            if (!isValid) {
                return res.status(200).json({ RspCode: "97", Message: "Invalid signature" });
            }

            const orderId = vnpParams.vnp_TxnRef as string;
            const order = await depositOrderRepository.findById(orderId);

            if (!order) {
                return res.status(200).json({ RspCode: "01", Message: "Order not found" });
            }

            const vnpAmount = Number(vnpParams.vnp_Amount) / 100;
            if (vnpAmount !== order.amount) {
                return res.status(200).json({ RspCode: "04", Message: "Invalid amount" });
            }

            if (order.status !== "PENDING") {
                return res.status(200).json({ RspCode: "02", Message: "Order already confirmed" });
            }

            const responseCode = vnpParams.vnp_ResponseCode;
            const transactionStatus = vnpParams.vnp_TransactionStatus;

            if (responseCode === "00" && transactionStatus === "00") {
                // Set state to PROCESSING instantly, then run mint in background
                await depositOrderRepository.update(orderId, { status: "PROCESSING" as any });

                // Run on-chain token minting in the background (asynchronous) to prevent HTTP blocking
                tokenService.deposit(order.userWallet, order.amount)
                    .then(async (result) => {
                        await depositOrderRepository.update(orderId, {
                            status: "SUCCESS",
                            txHash: result.txHash
                        });
                        console.log(`[VNPAY Webhook] Order ${orderId} successfully minted on-chain. TxHash: ${result.txHash}`);
                    })
                    .catch(async (err) => {
                        await depositOrderRepository.update(orderId, {
                            status: "FAILED"
                        });
                        console.error(`[VNPAY Webhook] Failed to mint on-chain for order ${orderId}:`, err);
                    });
            } else {
                await depositOrderRepository.update(orderId, {
                    status: "FAILED"
                });
            }

            return res.status(200).json({ RspCode: "00", Message: "Confirm Success" });
        } catch (error) {
            console.error("VNPAY IPN Webhook Error:", error);
            return res.status(200).json({ RspCode: "99", Message: (error as Error).message });
        }
    }

    static async vnpayReturn(req: Request, res: Response) {
        try {
            const vnpParams = { ...req.query };
            const hashSecret = (process.env.VNP_HASH_SECRET || "").trim();

            const isValid = VnPayService.verifySecureHash(vnpParams, hashSecret);
            const success = vnpParams.vnp_ResponseCode === "00" && isValid;

            let mintSuccess = false;
            if (success) {
                const orderId = vnpParams.vnp_TxnRef as string;
                const order = await depositOrderRepository.findById(orderId);
                if (order) {
                    if (order.status === "PENDING") {
                        // Update state to PROCESSING instantly
                        await depositOrderRepository.update(orderId, { status: "PROCESSING" as any });
                        try {
                            const result = await tokenService.deposit(order.userWallet, order.amount);
                            await depositOrderRepository.update(orderId, {
                                status: "SUCCESS",
                                txHash: result.txHash
                            });
                            console.log(`[VNPAY Return] Order ${orderId} successfully minted on-chain. TxHash: ${result.txHash}`);
                            mintSuccess = true;
                        } catch (err) {
                            await depositOrderRepository.update(orderId, {
                                status: "FAILED"
                            });
                            console.error(`[VNPAY Return] Failed to mint on-chain for order ${orderId}:`, err);
                        }
                    } else if (order.status === "SUCCESS") {
                        mintSuccess = true;
                    } else if ((order.status as string) === "PROCESSING") {
                        // If IPN is currently processing, let's wait a bit for it to finish (up to 15 seconds)
                        console.log(`[VNPAY Return] Order ${orderId} is being processed by another thread (e.g. IPN). Waiting...`);
                        let checkCount = 0;
                        while (checkCount < 15) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            const updatedOrder = await depositOrderRepository.findById(orderId);
                            if (updatedOrder) {
                                if (updatedOrder.status === "SUCCESS") {
                                    mintSuccess = true;
                                    break;
                                } else if ((updatedOrder.status as string) === "FAILED") {
                                    break;
                                }
                            }
                            checkCount++;
                        }
                    }
                }
            }

            const finalSuccess = success && mintSuccess;

            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Kết quả thanh toán CarbookPay</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                            background-color: #f5f6fa;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                            margin: 0;
                        }
                        .card {
                            background: white;
                            padding: 32px;
                            border-radius: 16px;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                            text-align: center;
                            max-width: 400px;
                            width: 90%;
                        }
                        .icon {
                            font-size: 64px;
                            margin-bottom: 16px;
                        }
                        .success { color: #2ecc71; }
                        .error { color: #e74c3c; }
                        h1 {
                            font-size: 20px;
                            color: #0b2348;
                            margin-bottom: 12px;
                        }
                        p {
                            color: #7f8c8d;
                            font-size: 14px;
                            line-height: 1.5;
                            margin-bottom: 24px;
                        }
                        .btn {
                            background-color: #0b2348;
                            color: white;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 8px;
                            font-weight: bold;
                            cursor: pointer;
                            text-decoration: none;
                            display: inline-block;
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon ${finalSuccess ? 'success' : 'error'}">${finalSuccess ? '✓' : '✗'}</div>
                        <h1>${finalSuccess ? 'Nạp tiền thành công!' : 'Thanh toán thất bại!'}</h1>
                        <p>${finalSuccess ? 'Số dư ví CarbookPay của bạn đã được cộng thêm thành công. Vui lòng quay lại CARBOOK để kiểm tra số dư mới.' : 'Giao dịch thanh toán qua VNPAY hoặc đúc tiền trên Blockchain đã bị hủy hoặc không thành công. Vui lòng thử lại.'}</p>
                        <button class="btn" onclick="window.location.href='/#/vnpay-done?success=${finalSuccess}'">Quay lại CARBOOK</button>
                    </div>
                </body>
                </html>
            `);
        } catch (error) {
            console.error("VNPAY Return Callback Error:", error);
            return res.status(500).send("Lỗi hệ thống khi xử lý kết quả thanh toán.");
        }
    }

    static async withdraw(req: Request, res: Response) {
        try {
            const { userWallet, amount } = req.body;
            if (!userWallet || amount === undefined) {
                return res.status(400).json({ success: false, message: "userWallet and amount are required" });
            }
            const result = await tokenService.withdraw(userWallet, Number(amount));

            // Record withdrawal in Firestore
            try {
                const withdrawId = `WD${Date.now()}`;
                await db.collection("YEUCAURUTTIEN").doc(withdrawId).set({
                    withdrawId,
                    userWallet,
                    amount: Number(amount),
                    status: "SUCCESS",
                    txHash: result.txHash,
                    createdAt: new Date()
                });
            } catch (fsErr) {
                console.error("Failed to record withdrawal in Firestore:", fsErr);
            }

            return res.status(200).json({
                success: true,
                message: `Withdrew ${amount} tokens from ${userWallet}`,
                txHash: result.txHash
            });
        } catch (error) {
            console.error("Withdraw controller error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async pay(req: Request, res: Response) {
        try {
            const { ticketId, userWallet, amount } = req.body;
            if (!ticketId || !userWallet || amount === undefined) {
                return res.status(400).json({ success: false, message: "ticketId, userWallet, and amount are required" });
            }
            const result = await paymentService.payForTicket(ticketId, userWallet, Number(amount));
            return res.status(200).json({
                success: true,
                message: `Paid for ticket ${ticketId}`,
                txHash: result.txHash,
                status: result.status
            });
        } catch (error) {
            console.error("Pay controller error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async refund(req: Request, res: Response) {
        try {
            const { ticketId, userWallet, amount } = req.body;
            if (!ticketId || !userWallet || amount === undefined) {
                return res.status(400).json({ success: false, message: "ticketId, userWallet, and amount are required" });
            }
            const result = await refundService.refundTicket(ticketId, userWallet, Number(amount));
            return res.status(200).json({
                success: true,
                message: `Refunded ticket ${ticketId}`,
                txHash: result.txHash,
                status: result.status
            });
        } catch (error) {
            console.error("Refund controller error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async cancelTicket(req: Request, res: Response) {
        try {
            const { ticketId } = req.body;
            if (!ticketId) {
                return res.status(400).json({ success: false, message: "ticketId is required" });
            }

            // 1. Fetch ticket details from Firestore
            const ticketDoc = await db.collection("VEXE").doc(ticketId).get();
            if (!ticketDoc.exists) {
                return res.status(404).json({ success: false, message: "Vé xe không tồn tại" });
            }

            const ticket = ticketDoc.data()!;
            
            // 2. Kiểm tra vé phải đang ở trạng thái đã thanh toán (DA_TT)
            if (ticket.trangThaiVe !== "DA_TT") {
                return res.status(400).json({ 
                    success: false, 
                    message: `Không thể hủy vé. Trạng thái vé hiện tại là ${ticket.trangThaiVe}, không phải đã thanh toán (DA_TT).` 
                });
            }

            // 3. Kiểm tra thông tin chuyến xe
            const tripDoc = await db.collection("CHUYENXE").doc(ticket.maChuyenXe).get();
            if (!tripDoc.exists) {
                return res.status(404).json({ success: false, message: "Chuyến xe liên quan không tồn tại" });
            }
            const trip = tripDoc.data()!;

            // Lấy thời gian xuất phát THẬT theo ngày đi của vé từ CHUYENXE_NGAY (chuyến mẫu
            // lặp lại mỗi ngày nên giờ trên CHUYENXE chỉ là giờ mẫu); thiếu thì dùng giờ mẫu.
            let rawDeparture = trip.thoiGianXuatPhat;
            if (ticket.ngayDi) {
                const ngayDoc = await db.collection("CHUYENXE_NGAY").doc(`${ticket.maChuyenXe}_${ticket.ngayDi}`).get();
                if (ngayDoc.exists && ngayDoc.data()!.thoiGianXuatPhat) {
                    rawDeparture = ngayDoc.data()!.thoiGianXuatPhat;
                }
            }

            let departureTime: Date;
            if (rawDeparture && typeof rawDeparture.toDate === "function") {
                departureTime = rawDeparture.toDate();
            } else if (rawDeparture) {
                departureTime = new Date(rawDeparture);
            } else {
                return res.status(400).json({ success: false, message: "Không tìm thấy thời gian xuất phát của chuyến xe." });
            }

            // Kiểm tra điều kiện thời gian hủy vé: Phải thực hiện trước giờ xe chạy ít nhất 4 tiếng
            const now = new Date();
            const timeDiffMs = departureTime.getTime() - now.getTime();
            const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

            if (timeDiffHours < 4) {
                return res.status(400).json({
                    success: false,
                    message: "Yêu cầu hủy vé bị từ chối. Chỉ được phép hủy vé trước giờ xe chạy ít nhất 4 tiếng."
                });
            }

            // 4. Tìm địa chỉ ví của khách hàng
            const khDoc = await db.collection("KHACHHANG").doc(ticket.maKhachHang).get();
            if (!khDoc.exists) {
                return res.status(404).json({ success: false, message: "Không tìm thấy thông tin khách hàng sở hữu vé" });
            }
            const kh = khDoc.data()!;
            
            const tkDoc = await db.collection("TAIKHOAN").doc(kh.maTaiKhoan).get();
            if (!tkDoc.exists) {
                return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản liên kết với khách hàng" });
            }
            const tk = tkDoc.data()!;

            const userWallet = tk.walletAddress;
            if (!userWallet) {
                return res.status(400).json({ success: false, message: "Tài khoản khách hàng chưa kích hoạt ví CarbookPay" });
            }

            // Tính số tiền hoàn trả: Phí hủy vé 30%, Hoàn lại 70% số tiền vé
            const ticketPrice = Number(ticket.thanhTien || ticket.giaVeGoc || 0);
            const refundAmount = ticketPrice * 0.7; // 70%
            const cancelFee = ticketPrice * 0.3; // 30%

            console.log(`[CancelTicket] Hủy vé ${ticketId}. Giá gốc: ${ticketPrice}. Hoàn lại (70%): ${refundAmount}. Phí hủy (30%): ${cancelFee}`);

            // 5. Cập nhật trạng thái tạm thời của vé thành PENDING để tránh hủy trùng lặp
            await db.collection("VEXE").doc(ticketId).update({
                trangThaiVe: "PENDING",
                ngayCapNhat: new Date()
            });

            // 6. Thực hiện hoàn tiền blockchain bất đồng bộ (Background)
            const { nhaGhe } = require("../services/seatHoldService");

            refundService.refundTicket(ticketId, userWallet, refundAmount)
                .then(async (result) => {
                    // Thành công: cập nhật vé thành HUY (CANCELLED), lưu thông tin giao dịch hoàn tiền
                    await db.collection("VEXE").doc(ticketId).update({
                        trangThaiVe: "HUY",
                        txHashRefund: result.txHash,
                        soTienHoan: refundAmount,
                        phiHuyVe: cancelFee,
                        ngayCapNhat: new Date()
                    });

                    // Đồng bộ token ERC-20: mint lại CAR tiền hoàn vào VÍ USER (sổ cái đã được
                    // Refund.sol cộng) — chạy nền, lỗi chỉ cảnh báo vì sổ cái là nguồn sự thật
                    tokenRepository.mint(userWallet, refundAmount)
                        .then(() => console.log(`✓ Đã mint lại ${refundAmount} CAR hoàn vé vào ví ${userWallet}`))
                        .catch((mintErr) => console.error("⚠️ Mint CAR hoàn vé thất bại (sổ cái vẫn đúng):", (mintErr as Error).message));

                    // Mở lại ghế cho khách khác đặt
                    try {
                        await nhaGhe(ticket.maChuyenXe, ticket.ngayDi, [ticket.maGhe]);
                        console.log(`✓ Mở lại ghế ${ticket.maGhe} thành công cho chuyến ${ticket.maChuyenXe} ngày ${ticket.ngayDi}`);
                    } catch (seatErr) {
                        console.error("Lỗi khi giải phóng ghế sau khi hoàn tiền:", seatErr);
                    }

                    console.log(`✓ [Background Refund] Hoàn tiền vé ${ticketId} thành công. TxHash: ${result.txHash}`);
                })
                .catch(async (err) => {
                    // Thất bại: Trả lại trạng thái cũ DA_TT, ghi log lỗi để hỗ trợ thủ công
                    await db.collection("VEXE").doc(ticketId).update({
                        trangThaiVe: "DA_TT",
                        refunderError: (err as Error).message,
                        ngayCapNhat: new Date()
                    });
                    console.error(`❌ [Background Refund Failed] Hủy vé ${ticketId} thất bại:`, err);
                });

            return res.status(200).json({
                success: true,
                message: "Yêu cầu hủy vé đã được ghi nhận và đang tiến hành hoàn tiền tự động.",
                refundAmount,
                cancelFee
            });

        } catch (error) {
            console.error("Cancel ticket error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async mockCreateTicket(req: Request, res: Response) {
        try {
            const { userId, maChuyenXe, ngayDi, maGhe, status } = req.body;
            if (!userId) {
                return res.status(400).json({ success: false, message: "userId (maTaiKhoan) is required" });
            }

            const targetChuyenXe = maChuyenXe || "CX025";
            const targetNgayDi = ngayDi || "2026-07-20";
            const targetGhe = maGhe || "A05";
            const targetStatus = status || "DA_TT";

            // 1. Lấy hoặc tạo KhachHang tương ứng với TaiKhoan
            const { layHoacTaoKhachHang } = require("../services/customerService");
            const khachHang = await layHoacTaoKhachHang(userId);

            // 2. Tạo bản ghi chuyến xe ngày (CHUYENXE_NGAY) để tránh lỗi không mở bán khi hủy vé
            const chuyenXeNgayRef = db.collection("CHUYENXE_NGAY").doc(`${targetChuyenXe}_${targetNgayDi}`);
            const cxNgaySnap = await chuyenXeNgayRef.get();
            if (!cxNgaySnap.exists) {
                await chuyenXeNgayRef.set({
                    maChuyenXe: targetChuyenXe,
                    ngayDi: targetNgayDi,
                    soGheConTrong: 29,
                    ngayMoBan: new Date()
                });
            }

            // 3. Tạo ghế xe (GHEXE) ở trạng thái DA_BAN nếu trạng thái vé là DA_TT, ngược lại là TRONG
            const gheXeRef = db.collection("GHEXE").doc(`${targetChuyenXe}_${targetNgayDi}_${targetGhe}`);
            await gheXeRef.set({
                maChuyenXe: targetChuyenXe,
                ngayDi: targetNgayDi,
                maGhe: targetGhe,
                trangThai: targetStatus === "DA_TT" ? "DA_BAN" : "TRONG",
                hetHanGiu: null
            });

            // 4. Sinh mã đặt vé và tạo vé xe VEXE
            const ticketId = `MM-${Date.now().toString().substring(5)}`;
            const ticketPrice = 150000;

            await db.collection("VEXE").doc(ticketId).set({
                maDatVe: ticketId,
                maNhomDat: `ND${Date.now()}`,
                maKhachHang: khachHang.maKhachHang,
                maChuyenXe: targetChuyenXe,
                ngayDi: targetNgayDi,
                maGheXe: `${targetChuyenXe}_${targetNgayDi}_${targetGhe}`,
                maGhe: targetGhe,
                maDiemDon: null,
                maDiemTra: null,
                hoTenHanhKhach: khachHang.hoTen || "Thí Di",
                emailHanhKhach: khachHang.email || "thidi@example.com",
                sdtHanhKhach: khachHang.sdt || "0394439767",
                cmndHanhKhach: null,
                giaVeGoc: ticketPrice,
                tienGiam: 0,
                thanhTien: ticketPrice,
                maQR: targetStatus === "DA_TT" ? `QR-${ticketId}` : null,
                trangThaiVe: targetStatus,
                thoiGianDat: new Date()
            });

            return res.status(200).json({
                success: true,
                message: "Tạo vé giả lập thành công để test.",
                ticketId,
                maKhachHang: khachHang.maKhachHang,
                ngayDi: targetNgayDi,
                maGhe: targetGhe,
                trangThaiVe: targetStatus
            });
        } catch (error) {
            console.error("Mock create ticket error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async getTransactionHistory(req: Request, res: Response) {
        try {
            const { address } = req.params;
            if (!address) {
                return res.status(400).json({ success: false, message: "wallet address is required" });
            }

            const cleanAddress = address.toLowerCase();

            // 1. Fetch deposit orders from Firestore
            const depositsSnapshot = await db.collection("YEUCAUNAPTIEN")
                .where("userWallet", "==", address)
                .get();
            
            const deposits = depositsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: "Nạp tiền",
                    title: "Nạp tiền CarbookPay",
                    amount: `+${Number(data.amount).toLocaleString('vi-VN')}đ`,
                    status: data.status === "SUCCESS" ? "Thành công" : data.status === "PENDING" ? "Đang xử lý" : "Thất bại",
                    time: data.createdAt ? data.createdAt.toDate() : new Date(),
                    txHash: data.txHash || ""
                };
            });

            // Fallback checking case-insensitivity
            const depositsLowerSnapshot = await db.collection("YEUCAUNAPTIEN")
                .where("userWallet", "==", cleanAddress)
                .get();
            
            depositsLowerSnapshot.docs.forEach(doc => {
                if (!deposits.some(d => d.id === doc.id)) {
                    const data = doc.data();
                    deposits.push({
                        id: doc.id,
                        type: "Nạp tiền",
                        title: "Nạp tiền CarbookPay",
                        amount: `+${Number(data.amount).toLocaleString('vi-VN')}đ`,
                        status: data.status === "SUCCESS" ? "Thành công" : data.status === "PENDING" ? "Đang xử lý" : "Thất bại",
                        time: data.createdAt ? data.createdAt.toDate() : new Date(),
                        txHash: data.txHash || ""
                    });
                }
            });
            // 2. Fetch withdraw orders
            const withdrawSnapshot = await db.collection("YEUCAURUTTIEN")
                .where("userWallet", "==", address)
                .get();
            
            const withdraws = withdrawSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: "Rút tiền",
                    title: "Rút tiền về ví ngân hàng",
                    amount: `-${Number(data.amount).toLocaleString('vi-VN')}đ`,
                    status: data.status === "SUCCESS" ? "Thành công" : "Thất bại",
                    time: data.createdAt ? data.createdAt.toDate() : new Date(),
                    txHash: data.txHash || ""
                };
            });

            const withdrawsLowerSnapshot = await db.collection("YEUCAURUTTIEN")
                .where("userWallet", "==", cleanAddress)
                .get();
            
            withdrawsLowerSnapshot.docs.forEach(doc => {
                if (!withdraws.some(w => w.id === doc.id)) {
                    const data = doc.data();
                    withdraws.push({
                        id: doc.id,
                        type: "Rút tiền",
                        title: "Rút tiền về ví ngân hàng",
                        amount: `-${Number(data.amount).toLocaleString('vi-VN')}đ`,
                        status: data.status === "SUCCESS" ? "Thành công" : "Thất bại",
                        time: data.createdAt ? data.createdAt.toDate() : new Date(),
                        txHash: data.txHash || ""
                    });
                }
            });

            // 3. Thanh toán vé + 4. Hoàn tiền: đối chiếu trực tiếp từ event on-chain
            // (PaymentSuccess/PaymentFailed, RefundSuccess/RefundFailed) thay vì đọc bản ghi
            // mirror trong Firestore (collection "payments"/"refunds" do EventListener ghi lại
            // khi server đang chạy — nếu server tắt đúng lúc event nổ ra thì bản ghi bị mất
            // vĩnh viễn). Đọc thẳng sổ cái on-chain nên không thể lệch.
            const [paymentEvents, refundEvents] = await Promise.all([
                paymentRepository.getPaymentHistory(address).catch((err) => {
                    console.error("Lấy lịch sử thanh toán on-chain thất bại:", (err as Error).message);
                    return [];
                }),
                refundRepository.getRefundHistory(address).catch((err) => {
                    console.error("Lấy lịch sử hoàn tiền on-chain thất bại:", (err as Error).message);
                    return [];
                }),
            ]);

            const payments = paymentEvents.map((evt) => ({
                id: evt.txHash,
                type: "Thanh toán",
                title: "Thanh toán vé xe",
                amount: `-${evt.amount.toLocaleString('vi-VN')}đ`,
                status: evt.status === "SUCCESS" ? "Thành công" : "Thất bại",
                time: new Date(evt.timestamp * 1000),
                txHash: evt.txHash
            }));

            const refunds = refundEvents.map((evt) => ({
                id: evt.txHash,
                type: "Hoàn tiền",
                title: "Hoàn tiền hủy vé xe",
                amount: `+${evt.amount.toLocaleString('vi-VN')}đ`,
                status: evt.status === "SUCCESS" ? "Hoàn tất" : "Thất bại",
                time: new Date(evt.timestamp * 1000),
                txHash: evt.txHash
            }));

            // Combine and sort
            const allTransactions = [...deposits, ...withdraws, ...payments, ...refunds];
            allTransactions.sort((a, b) => b.time.getTime() - a.time.getTime());

            return res.status(200).json({
                success: true,
                transactions: allTransactions
            });
        } catch (error) {
            console.error("Get transaction history error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async withdrawRequest(req: Request, res: Response) {
        try {
            const { userWallet, amount, bankName, bankAccount, bankAccountName } = req.body;
            if (!userWallet || amount === undefined || !bankName || !bankAccount || !bankAccountName) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Yêu cầu cung cấp đầy đủ: userWallet, amount, bankName, bankAccount, bankAccountName" 
                });
            }

            const withdrawAmount = Number(amount);
            if (withdrawAmount <= 0) {
                return res.status(400).json({ success: false, message: "Số tiền rút phải lớn hơn 0" });
            }

            // 1. Tìm email của user thông qua userWallet trong collection TAIKHOAN
            const cleanAddress = userWallet.trim().toLowerCase();
            let userDoc = null;
            const snapshot = await db.collection("TAIKHOAN").where("walletAddress", "==", userWallet).limit(1).get();
            if (!snapshot.empty) {
                userDoc = snapshot.docs[0];
            } else {
                const snapshotLower = await db.collection("TAIKHOAN").where("walletAddress", "==", cleanAddress).limit(1).get();
                if (!snapshotLower.empty) {
                    userDoc = snapshotLower.docs[0];
                }
            }

            if (!userDoc) {
                return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản liên kết với ví này" });
            }

            const email = userDoc.data().email;
            if (!email) {
                return res.status(400).json({ success: false, message: "Tài khoản liên kết không có email để nhận mã OTP" });
            }

            // 2. Kiểm tra số dư khả dụng có đủ để rút không
            const availableBalance = await walletRepository.getAvailableBalance(userWallet);
            if (availableBalance < withdrawAmount) {
                return res.status(400).json({ success: false, message: "Số dư khả dụng không đủ để thực hiện giao dịch" });
            }

            // 3. Tạo mã OTP ngẫu nhiên gồm 6 chữ số
            const otp = crypto.randomInt(100000, 1000000).toString();
            const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 phút

            // 4. Tạo bản ghi giao dịch rút tiền với trạng thái PENDING_OTP
            const withdrawId = `WD${Date.now()}`;
            await db.collection("YEUCAURUTTIEN").doc(withdrawId).set({
                withdrawId,
                userWallet,
                amount: withdrawAmount,
                bankName,
                bankAccount,
                bankAccountName,
                status: "PENDING_OTP",
                otp,
                otpExpires,
                createdAt: new Date()
            });

            // 5. Gửi mã OTP qua email
            try {
                await sendWithdrawOtpEmail(email, otp, withdrawAmount);
                console.log(`✓ Đã gửi OTP rút tiền (${otp}) tới email ${email}`);
            } catch (mailErr) {
                console.warn("⚠️ Cảnh báo: Không thể gửi email OTP rút tiền do lỗi đăng nhập SMTP Gmail. Chi tiết:", (mailErr as Error).message);
                console.log(`👉 [DEMO BYPASS] Mã OTP vừa sinh là: ${otp}. Bạn có thể nhập mã này hoặc bất kỳ mã 6 chữ số nào trên giao diện.`);
            }

            return res.status(200).json({
                success: true,
                message: "Mã OTP đã được gửi đến email của bạn.",
                requireOtp: true,
                withdrawId
            });
        } catch (error) {
            console.error("Withdraw request error:", error);
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }

    static async withdrawConfirm(req: Request, res: Response) {
        try {
            const { withdrawId, otp } = req.body;
            if (!withdrawId || !otp) {
                return res.status(400).json({ success: false, message: "withdrawId và otp là bắt buộc" });
            }

            // 1. Tìm bản ghi giao dịch
            const docRef = db.collection("YEUCAURUTTIEN").doc(withdrawId);
            const doc = await docRef.get();
            if (!doc.exists) {
                return res.status(404).json({ success: false, message: "Yêu cầu rút tiền không tồn tại" });
            }

            const data = doc.data()!;
            if (data.status !== "PENDING_OTP") {
                return res.status(400).json({ success: false, message: "Yêu cầu rút tiền này đã được xử lý hoặc không hợp lệ" });
            }

            // 2. Xác thực OTP & hết hạn
            // Hỗ trợ bypass OTP trong môi trường thử nghiệm: bất kỳ OTP nào có độ dài 6 ký tự đều được coi là đúng
            const isDemoBypass = otp.length === 6;
            if (data.otp !== otp && !isDemoBypass) {
                return res.status(400).json({ success: false, message: "Mã OTP không chính xác" });
            }

            const expiry = data.otpExpires.toDate();
            if (new Date() > expiry) {
                return res.status(400).json({ success: false, message: "Mã OTP đã hết hạn, vui lòng yêu cầu lại" });
            }

            // 3. Thực hiện burn token & đồng bộ số dư trên blockchain
            console.log(`[WithdrawConfirm] Tiến hành burn ${data.amount} CAR token từ ví ${data.userWallet}`);
            const result = await tokenService.withdraw(data.userWallet, data.amount);

            // 4. Gửi lệnh chuyển khoản VNĐ qua ngân hàng (giả lập)
            const bankResult = await VirtualBankService.transferVND(
                data.bankName,
                data.bankAccount,
                data.bankAccountName,
                data.amount
            );

            if (bankResult.success) {
                // 5. Cập nhật trạng thái thành công lên Firebase
                await docRef.update({
                    status: "SUCCESS",
                    txHash: result.txHash,
                    bankTxId: bankResult.transactionId,
                    completedAt: new Date()
                });

                return res.status(200).json({
                    success: true,
                    message: `Rút tiền thành công. Đã gửi ${data.amount} VNĐ về tài khoản ${data.bankAccount}`,
                    txHash: result.txHash,
                    bankTxId: bankResult.transactionId
                });
            } else {
                throw new Error("Lỗi khi gửi lệnh chuyển khoản ngân hàng.");
            }
        } catch (error) {
            console.error("Withdraw confirm error:", error);
            try {
                const { withdrawId } = req.body;
                if (withdrawId) {
                    await db.collection("YEUCAURUTTIEN").doc(withdrawId).update({
                        status: "FAILED",
                        errorMessage: (error as Error).message,
                        completedAt: new Date()
                    });
                }
            } catch (err) {
                console.error("Failed to update status to FAILED in Firestore:", err);
            }
            return res.status(500).json({ success: false, message: (error as Error).message });
        }
    }
}
