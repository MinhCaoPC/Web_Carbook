/**
 * @file IRefundRepository.ts
 * @description Interface cho hoàn tiền
 */

export interface IRefundRepository {
    /**
     * Hoàn tiền cho user. Contract chỉ chấp nhận nếu paymentId là một thanh toán thật đã SUCCESS
     * của đúng ví này và tổng hoàn chưa vượt số đã trả.
     * @param paymentId khóa thanh toán gốc (maNhomDat)
     * @param refundId  mã từng vé được hoàn (maDatVe), duy nhất
     */
    refundTicket(
        paymentId: string,
        refundId: string,
        userWallet: string,
        amount: number
    ): Promise<{ txHash: string; status: string }>;

    /**
     * Lấy thông tin hoàn tiền
     */
    getRefund(refundId: string): Promise<{
        ticketId: string;
        paymentId: string;
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
