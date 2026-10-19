import { db } from "../config/firebase";

export interface DepositOrder {
    orderId: string;
    userWallet: string;
    amount: number;
    status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
    createdAt: Date;
    // Thời điểm tạo giao dịch định dạng VNPay (yyyyMMddHHmmss) — cần cho API đối soát querydr
    vnpCreateDate?: string;
    txHash?: string;
}

export class DepositOrderRepository {
    async create(order: DepositOrder): Promise<void> {
        await db.collection("YEUCAUNAPTIEN").doc(order.orderId).set(order);
    }

    async findById(orderId: string): Promise<DepositOrder | null> {
        const doc = await db.collection("YEUCAUNAPTIEN").doc(orderId).get();
        if (!doc.exists) return null;
        const data = doc.data();
        if (!data) return null;
        return {
            orderId: data.orderId,
            userWallet: data.userWallet,
            amount: data.amount,
            status: data.status,
            createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
            vnpCreateDate: data.vnpCreateDate,
            txHash: data.txHash
        };
    }

    async update(orderId: string, data: Partial<DepositOrder>): Promise<void> {
        await db.collection("YEUCAUNAPTIEN").doc(orderId).update(data);
    }
}
