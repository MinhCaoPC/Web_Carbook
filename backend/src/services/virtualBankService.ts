// backend/src/services/virtualBankService.ts

export class VirtualBankService {
    /**
     * Giả lập gửi lệnh chuyển khoản VNĐ về tài khoản ngân hàng thụ hưởng của khách hàng
     * @param bankName Tên ngân hàng nhận (Vietcombank, MB Bank...)
     * @param bankAccount Số tài khoản nhận tiền
     * @param bankAccountName Tên chủ tài khoản thụ hưởng
     * @param amount Số tiền chuyển khoản (VNĐ)
     */
    static async transferVND(
        bankName: string,
        bankAccount: string,
        bankAccountName: string,
        amount: number
    ): Promise<{ success: boolean; transactionId: string }> {
        console.log(`[VirtualBank Gateway] Đang xử lý chuyển khoản...`);
        console.log(`[VirtualBank Gateway] Ngân hàng nhận: ${bankName}`);
        console.log(`[VirtualBank Gateway] Số tài khoản: ${bankAccount}`);
        console.log(`[VirtualBank Gateway] Chủ tài khoản: ${bankAccountName}`);
        console.log(`[VirtualBank Gateway] Số tiền chuyển: ${amount.toLocaleString('vi-VN')} VNĐ`);

        // Mô phỏng độ trễ xử lý mạng của ngân hàng
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const transactionId = `VNB${Date.now()}`;
        console.log(`[VirtualBank Gateway] ✓ Chuyển khoản thành công! Transaction ID: ${transactionId}`);

        return {
            success: true,
            transactionId
        };
    }
}
