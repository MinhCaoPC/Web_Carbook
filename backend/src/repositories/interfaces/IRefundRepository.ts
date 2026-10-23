/**
 * @file IRefundRepository.ts
 * @description Interface cho hoàn tiền
 */

export interface IRefundRepository {
    /**
     * Hoàn tiền cho user
     */
    refundTicket(
        ticketId: string,
        userWallet: string,
        amount: number
    ): Promise<{ txHash: string; status: string }>;

    /**
     * Lấy thông tin hoàn tiền
     */
    getRefund(ticketId: string): Promise<{
        ticketId: string;
        userWallet: string;
        amount: number;
        status: string;
    }>;

    /**
     * Đối chiếu lịch sử hoàn tiền trực tiếp từ event on-chain (RefundSuccess/RefundFailed)
     * thay vì đọc bản ghi mirror trong Firestore — không thể lệch vì đọc thẳng sổ cái.
     */
    getRefundHistory(walletAddress: string): Promise<Array<{
        txHash: string;
        amount: number;
        status: "SUCCESS" | "FAILED";
        reason?: string;
        blockNumber: number;
        timestamp: number;
    }>>;
}
