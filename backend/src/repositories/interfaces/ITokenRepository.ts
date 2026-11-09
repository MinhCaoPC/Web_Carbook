/**
 * @file ITokenRepository.ts
 * @description Interface cho token (mint/burn)
 */

export interface ITokenRepository {
    /**
     * Mint token (nạp tiền)
     * @param to - địa chỉ ví nhận token
     * @param amount - số tiền (VNĐ)
     */
    mint(to: string, amount: number): Promise<{ txHash: string }>;

    /**
     * Mint không chờ xác nhận — trả txHash ngay + hàm confirm() để chờ song song
     */
    mintAsync(to: string, amount: number): Promise<{ txHash: string; confirm: () => Promise<void> }>;

    /**
     * Burn token (rút tiền)
     * @param from - địa chỉ ví gửi token
     * @param amount - số tiền (VNĐ)
     */
    burn(from: string, amount: number): Promise<{ txHash: string }>;

    /**
     * Lấy balance token của user
     */
    getTokenBalance(address: string): Promise<number>;
}
