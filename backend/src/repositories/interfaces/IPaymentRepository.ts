/**
 * @file IPaymentRepository.ts
 * @description Interface cho thanh toán vé
 */

export interface IPaymentRepository {
    /**
     * Thanh toán vé
     */
    payForTicket(
        ticketId: string,
        userWallet: string,
        amount: number
    ): Promise<{ txHash: string; status: string }>;

    /**
     * Lấy thông tin thanh toán
     */
    getPayment(ticketId: string): Promise<{
        ticketId: string;
        userWallet: string;
        amount: number;
        status: string;
    }>;

    /**
     * Đối chiếu lịch sử thanh toán trực tiếp từ event on-chain (PaymentSuccess/PaymentFailed)
     * thay vì đọc bản ghi mirror trong Firestore — không thể lệch vì đọc thẳng sổ cái.
     */
    getPaymentHistory(walletAddress: string): Promise<Array<{
        txHash: string;
        amount: number;
        status: "SUCCESS" | "FAILED";
        reason?: string;
        blockNumber: number;
        timestamp: number;
    }>>;
}
