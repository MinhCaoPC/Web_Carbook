/**
 * @file IWalletRepository.ts
 * @description Interface trừu tượng cho ví blockchain
 * Service chỉ phụ thuộc vào interface này, không biết cài đặt cụ thể
 */

export interface IWalletRepository {
    /**
     * Tạo ví mới cho user (privateKey trả về để tầng service mã hóa lưu trữ — KMS-lite)
     */
    createWallet(userId: string): Promise<{ walletAddress: string; txHash: string; privateKey?: string }>;

    /**
     * Lấy số dư hiện tại từ blockchain
     * @param walletAddress - địa chỉ ví
     */
    getBalance(walletAddress: string): Promise<number>;

    /**
     * Lấy số tiền bị khóa (đang xử lý thanh toán)
     */
    getLockedBalance(walletAddress: string): Promise<number>;

    /**
     * Lấy số tiền khả dụng (balance - locked)
     */
    getAvailableBalance(walletAddress: string): Promise<number>;

    /**
     * Cập nhật số dư (gọi bởi Event Listener)
     */
    updateBalance(walletAddress: string, newBalance: number): Promise<string>;

    /**
     * updateBalance không chờ xác nhận — chạy song song với mint/burn cùng block
     */
    updateBalanceAsync(walletAddress: string, newBalance: number): Promise<{ txHash: string; confirm: () => Promise<void> }>;

    /**
     * Khóa số tiền tạm để tránh double spending
     */
    lockBalance(walletAddress: string, amount: number): Promise<string>;

    /**
     * Mở khóa số tiền
     */
    unlockBalance(walletAddress: string, amount: number): Promise<string>;

    /**
     * Kiểm tra ví tồn tại
     */
    walletExists(walletAddress: string): Promise<boolean>;

    /**
     * Lấy địa chỉ ví từ userId
     */
    getWalletByUserId(userId: string): Promise<string>;
}
