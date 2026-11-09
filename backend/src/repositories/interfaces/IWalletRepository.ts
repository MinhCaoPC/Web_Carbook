/**
 * @file IWalletRepository.ts
 * @description Interface trừu tượng cho ví nội (Firestore). "walletAddress" là mã ví nội (VI…)
 * Service chỉ phụ thuộc vào interface này, không biết cài đặt cụ thể
 */

export interface IWalletRepository {
    /**
     * Tạo ví nội cho tài khoản (mỗi tài khoản đúng một ví; gọi lại trả ví cũ)
     */
    createWallet(userId: string): Promise<{ walletAddress: string; txHash: string }>;

    /**
     * Lấy số dư hiện tại (VNĐ)
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
