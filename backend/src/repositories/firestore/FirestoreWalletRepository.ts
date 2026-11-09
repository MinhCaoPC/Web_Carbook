/**
 * @file FirestoreWalletRepository.ts
 * @description Ví nội CARBOOK (Firestore) — thay cho ví/token CAR trên blockchain.
 * Cài đặt các interface cũ (IWalletRepository, ITokenRepository, IPaymentRepository, IRefundRepository)
 * nên service/controller phía trên gần như không phải đổi. "walletAddress" nay là mã ví nội (VI…),
 * "txHash" là mã giao dịch trong sổ cái ví.
 */
import { db } from "../../config/firebase";
import { IWalletRepository } from "../interfaces/IWalletRepository";
import { ITokenRepository } from "../interfaces/ITokenRepository";
import { IPaymentRepository } from "../interfaces/IPaymentRepository";
import { IRefundRepository } from "../interfaces/IRefundRepository";
import {
    VI_COLLECTION,
    GIAODICH_COLLECTION,
    THANHTOAN_COLLECTION,
    apDungButToan,
    taoWalletId,
    LoaiGiaoDich,
} from "./walletLedger";

const toMillis = (v: any): number => (v && typeof v.toDate === "function" ? v.toDate().getTime() : new Date(v).getTime());

export class FirestoreWalletRepository implements IWalletRepository, ITokenRepository {
    // ===== IWalletRepository =====
    async createWallet(userId: string): Promise<{ walletAddress: string; txHash: string }> {
        // Mỗi tài khoản đúng một ví: tra trước, tạo trong transaction để 2 request cùng lúc không đẻ 2 ví
        const existing = await db.collection(VI_COLLECTION).where("maTaiKhoan", "==", userId).limit(1).get();
        if (!existing.empty) {
            return { walletAddress: existing.docs[0].id, txHash: `${existing.docs[0].id}-EXISTING` };
        }
        const walletId = taoWalletId();
        const ref = db.collection(VI_COLLECTION).doc(walletId);
        await db.runTransaction(async (tx) => {
            const d = await tx.get(ref);
            if (d.exists) throw new Error("Wallet id collision, retry");
            tx.set(ref, {
                walletId,
                maTaiKhoan: userId,
                loaiVi: "KHACH_HANG",
                soDu: 0,
                soDuKhoa: 0,
                trangThai: "ACTIVE",
                ngayTao: new Date(),
                ngayCapNhat: new Date(),
            });
        });
        return { walletAddress: walletId, txHash: `${walletId}-CREATE` };
    }

    private async docVi(walletId: string) {
        const d = await db.collection(VI_COLLECTION).doc(walletId).get();
        if (!d.exists) throw new Error("Wallet not found");
        return d.data() as any;
    }

    async getBalance(walletAddress: string): Promise<number> {
        return Number((await this.docVi(walletAddress)).soDu) || 0;
    }

    async getLockedBalance(walletAddress: string): Promise<number> {
        return Number((await this.docVi(walletAddress)).soDuKhoa) || 0;
    }

    async getAvailableBalance(walletAddress: string): Promise<number> {
        const vi = await this.docVi(walletAddress);
        return (Number(vi.soDu) || 0) - (Number(vi.soDuKhoa) || 0);
    }

    async lockBalance(walletAddress: string, amount: number): Promise<string> {
        return this.doiKhoa(walletAddress, amount);
    }

    async unlockBalance(walletAddress: string, amount: number): Promise<string> {
        return this.doiKhoa(walletAddress, -amount);
    }

    private async doiKhoa(walletId: string, delta: number): Promise<string> {
        const ref = db.collection(VI_COLLECTION).doc(walletId);
        await db.runTransaction(async (tx) => {
            const d = await tx.get(ref);
            if (!d.exists) throw new Error("Wallet not found");
            const vi = d.data() as any;
            const khoaMoi = (Number(vi.soDuKhoa) || 0) + delta;
            if (khoaMoi < 0) throw new Error("Cannot unlock more than locked");
            if ((Number(vi.soDu) || 0) - khoaMoi < 0) throw new Error("Insufficient balance");
            tx.update(ref, { soDuKhoa: khoaMoi, ngayCapNhat: new Date() });
        });
        return `${walletId}-LOCK`;
    }

    async walletExists(walletAddress: string): Promise<boolean> {
        const d = await db.collection(VI_COLLECTION).doc(walletAddress).get();
        return d.exists;
    }

    async getWalletByUserId(userId: string): Promise<string> {
        const snap = await db.collection(VI_COLLECTION).where("maTaiKhoan", "==", userId).limit(1).get();
        if (snap.empty) throw new Error("Wallet not found");
        return snap.docs[0].id;
    }

    // ===== ITokenRepository (nạp/rút tiền vào ví nội) =====
    async mint(to: string, amount: number): Promise<{ txHash: string }> {
        const [id] = await apDungButToan([{ walletId: to, soTien: amount, loai: "NAP" }], null);
        return { txHash: id };
    }

    async mintAsync(to: string, amount: number): Promise<{ txHash: string; confirm: () => Promise<void> }> {
        const { txHash } = await this.mint(to, amount);
        return { txHash, confirm: async () => {} };
    }

    async burn(from: string, amount: number): Promise<{ txHash: string }> {
        const [id] = await apDungButToan([{ walletId: from, soTien: -amount, loai: "RUT" }], null);
        return { txHash: id };
    }

    async getTokenBalance(address: string): Promise<number> {
        return this.getBalance(address);
    }

    // ===== Sổ cái (dùng cho lịch sử giao dịch) =====
    async layLichSu(walletId: string, loai: LoaiGiaoDich[]) {
        const snap = await db.collection(GIAODICH_COLLECTION).where("walletId", "==", walletId).get();
        return snap.docs
            .map((d) => d.data() as any)
            .filter((g) => loai.includes(g.loai))
            .sort((a, b) => toMillis(b.thoiGian) - toMillis(a.thoiGian));
    }
}

export class FirestorePaymentRepository implements IPaymentRepository {
    /**
     * Trừ tiền ví + ghi nhận thanh toán trong MỘT transaction: không thể "đã ghi nhận mà chưa trừ
     * tiền" hay ngược lại, và mỗi khóa thanh toán (maNhomDat) chỉ thanh toán được một lần.
     */
    async payForTicket(ticketId: string, userWallet: string, amount: number) {
        if (!ticketId) throw new Error("ticketId is required");
        const ttRef = db.collection(THANHTOAN_COLLECTION).doc(ticketId);
        const maGD = `PAY_${ticketId}`;
        await apDungButToan(
            [{ walletId: userWallet, soTien: -amount, loai: "THANH_TOAN", maGiaoDich: maGD, ghiChu: "Thanh toán vé xe" }],
            ticketId,
            async (tx) => {
                const tt = (await (tx as any).get(ttRef)) as FirebaseFirestore.DocumentSnapshot;
                if (tt.exists) throw new Error("Payment already exists");
                tx.set(ttRef, {
                    ticketId,
                    userWallet,
                    amount,
                    refundedAmount: 0,
                    status: "SUCCESS",
                    timestamp: new Date(),
                });
            }
        );
        return { txHash: maGD, status: "SUCCESS" };
    }

    async getPayment(ticketId: string) {
        const d = await db.collection(THANHTOAN_COLLECTION).doc(ticketId).get();
        if (!d.exists) throw new Error("Payment not found");
        const p = d.data() as any;
        return { ticketId: p.ticketId, userWallet: p.userWallet, amount: p.amount, status: p.status };
    }

    async getPaymentHistory(walletAddress: string) {
        const snap = await db.collection(GIAODICH_COLLECTION).where("walletId", "==", walletAddress).get();
        return snap.docs
            .map((d) => d.data() as any)
            .filter((g) => g.loai === "THANH_TOAN")
            .map((g) => ({
                txHash: g.maGiaoDich as string,
                amount: Math.abs(g.soTien) as number,
                status: "SUCCESS" as const,
                blockNumber: 0,
                timestamp: Math.floor(toMillis(g.thoiGian) / 1000),
            }));
    }
}

export class FirestoreRefundRepository implements IRefundRepository {
    /**
     * Hoàn tiền về ví: chỉ khi khóa thanh toán gốc có thật, đúng chủ ví, và tổng hoàn không vượt số đã trả.
     * Mỗi refundId (maDatVe) chỉ hoàn được một lần.
     */
    async refundTicket(paymentId: string, refundId: string, userWallet: string, amount: number) {
        const ttRef = db.collection(THANHTOAN_COLLECTION).doc(paymentId);
        const maGD = `REFUND_${refundId}`;
        await apDungButToan(
            [{ walletId: userWallet, soTien: amount, loai: "HOAN_TIEN", maGiaoDich: maGD, ghiChu: "Hoàn tiền hủy vé" }],
            refundId,
            async (tx) => {
                const tt = (await (tx as any).get(ttRef)) as FirebaseFirestore.DocumentSnapshot;
                if (!tt.exists) throw new Error("Payment not found");
                const p = tt.data() as any;
                if (p.userWallet !== userWallet) throw new Error("Payment belongs to another wallet");
                const daHoan = (Number(p.refundedAmount) || 0) + amount;
                if (daHoan > Number(p.amount)) throw new Error("Refund exceeds paid amount");
                tx.update(ttRef, {
                    refundedAmount: daHoan,
                    status: daHoan === Number(p.amount) ? "REFUNDED" : "SUCCESS",
                });
            }
        );
        return { txHash: maGD, status: "SUCCESS" };
    }

    async getRefund(refundId: string) {
        const d = await db.collection(GIAODICH_COLLECTION).doc(`REFUND_${refundId}`).get();
        if (!d.exists) throw new Error("Refund not found");
        const g = d.data() as any;
        return { ticketId: refundId, paymentId: g.thamChieu, userWallet: g.walletId, amount: g.soTien, status: "SUCCESS" };
    }

    async getRefundHistory(walletAddress: string) {
        const snap = await db.collection(GIAODICH_COLLECTION).where("walletId", "==", walletAddress).get();
        return snap.docs
            .map((d) => d.data() as any)
            .filter((g) => g.loai === "HOAN_TIEN")
            .map((g) => ({
                txHash: g.maGiaoDich as string,
                amount: g.soTien as number,
                status: "SUCCESS" as const,
                blockNumber: 0,
                timestamp: Math.floor(toMillis(g.thoiGian) / 1000),
            }));
    }
}
