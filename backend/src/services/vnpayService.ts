import * as crypto from "crypto";

export class VnPayService {
    static createPaymentUrl({
        orderId,
        amount,
        orderInfo,
        ipAddr,
        returnUrl,
        tmnCode,
        hashSecret,
        vnpUrl
    }: {
        orderId: string;
        amount: number;
        orderInfo: string;
        ipAddr: string;
        returnUrl: string;
        tmnCode: string;
        hashSecret: string;
        vnpUrl: string;
    }): string {
        const date = new Date();
        const pad = (n: number) => n.toString().padStart(2, "0");
        
        // vnp_CreateDate format YYYYMMDDHHmmss
        const createDate = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
        
        // Expire date is 15 minutes after creation
        const expDateObj = new Date(date.getTime() + 15 * 60 * 1000);
        const expireDate = `${expDateObj.getFullYear()}${pad(expDateObj.getMonth() + 1)}${pad(expDateObj.getDate())}${pad(expDateObj.getHours())}${pad(expDateObj.getMinutes())}${pad(expDateObj.getSeconds())}`;

        const params: Record<string, string | number> = {
            vnp_Version: "2.1.0",
            vnp_Command: "pay",
            vnp_TmnCode: tmnCode,
            vnp_Locale: "vn",
            vnp_CurrCode: "VND",
            vnp_TxnRef: orderId,
            vnp_OrderInfo: orderInfo,
            vnp_OrderType: "other",
            vnp_Amount: Math.floor(amount * 100), // Multiply by 100 for VNPAY format
            vnp_ReturnUrl: returnUrl,
            vnp_IpAddr: ipAddr,
            vnp_CreateDate: createDate,
            vnp_ExpireDate: expireDate,
        };

        // Sort keys alphabetically
        const sortedKeys = Object.keys(params).sort();
        
        const signDataParts: string[] = [];
        const urlParamsParts: string[] = [];

        for (const key of sortedKeys) {
            const val = params[key].toString();
            // Encode key and value replacing %20 with + as per VNPAY SDK standard
            const encodedKey = encodeURIComponent(key).replace(/%20/g, "+");
            const encodedVal = encodeURIComponent(val).replace(/%20/g, "+");
            
            signDataParts.push(`${encodedKey}=${encodedVal}`);
            urlParamsParts.push(`${encodedKey}=${encodedVal}`);
        }

        const signData = signDataParts.join("&");
        const hmac = crypto.createHmac("sha512", hashSecret);
        const secureHash = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

        // Chế độ giả lập (VNP_MOCK=true): dùng khi tài khoản merchant VNPay sandbox không còn được duyệt
        // (VNPay báo lỗi 71 "Website not approved") -> chuyển tới cổng thanh toán DEMO nội bộ
        if (process.env.VNP_MOCK === "true") {
            const origin = new URL(returnUrl).origin;
            const q = new URLSearchParams({ txnRef: orderId, amount: String(Math.floor(amount)), info: orderInfo, returnUrl });
            return `${origin}/vnpay-mock.html?${q.toString()}`;
        }

        const urlParams = urlParamsParts.join("&");
        return `${vnpUrl}?${urlParams}&vnp_SecureHash=${secureHash}`;
    }

    // Đối soát giao dịch với VNPay (API querydr): hỏi VNPay xem đơn đã thanh toán thật chưa.
    // Dùng khi WebView không quay về được backend (đơn kẹt PENDING) để hoàn tất/đóng đơn.
    static async queryTransaction({
        orderId,
        transactionDate, // yyyyMMddHHmmss — thời điểm tạo giao dịch gốc
        orderInfo,
        ipAddr,
        tmnCode,
        hashSecret,
    }: {
        orderId: string;
        transactionDate: string;
        orderInfo: string;
        ipAddr: string;
        tmnCode: string;
        hashSecret: string;
    }): Promise<{ paid: boolean; raw: Record<string, any> }> {
        // Giả lập: không có giao dịch thật để truy vấn -> coi là "không tìm thấy" (91) để đơn chưa trả tiền được đóng FAILED
        if (process.env.VNP_MOCK === "true") {
            return { paid: false, raw: { vnp_ResponseCode: "91", vnp_Message: "Mock gateway: transaction not found" } };
        }
        const pad = (n: number) => n.toString().padStart(2, "0");
        const now = new Date();
        const createDate = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const requestId = `RQ${Date.now()}`;

        // Chuỗi ký theo đúng thứ tự spec querydr 2.1.0 (nối bằng dấu |)
        const signData = [
            requestId, "2.1.0", "querydr", tmnCode, orderId,
            transactionDate, createDate, ipAddr, orderInfo,
        ].join("|");
        const secureHash = crypto.createHmac("sha512", hashSecret).update(Buffer.from(signData, "utf-8")).digest("hex");

        const response = await fetch("https://sandbox.vnpayment.vn/merchant_webapi/api/transaction", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                vnp_RequestId: requestId,
                vnp_Version: "2.1.0",
                vnp_Command: "querydr",
                vnp_TmnCode: tmnCode,
                vnp_TxnRef: orderId,
                vnp_OrderInfo: orderInfo,
                vnp_TransactionDate: transactionDate,
                vnp_CreateDate: createDate,
                vnp_IpAddr: ipAddr,
                vnp_SecureHash: secureHash,
            }),
        });

        const raw = (await response.json()) as Record<string, any>;
        // vnp_ResponseCode = 00: truy vấn thành công; vnp_TransactionStatus = 00: đã thanh toán
        const paid = raw.vnp_ResponseCode === "00" && raw.vnp_TransactionStatus === "00";
        return { paid, raw };
    }

    static verifySecureHash(params: Record<string, any>, hashSecret: string): boolean {
        const secureHash = params.vnp_SecureHash;
        if (!secureHash) return false;
        
        // Remove secure hash keys from params
        const vnpParams = { ...params };
        delete vnpParams.vnp_SecureHash;
        delete vnpParams.vnp_SecureHashType;

        // Sort parameters alphabetically
        const sortedKeys = Object.keys(vnpParams).sort();
        
        const signDataParts: string[] = [];
        for (const key of sortedKeys) {
            const val = vnpParams[key].toString();
            // Encode key and value replacing %20 with +
            const encodedKey = encodeURIComponent(key).replace(/%20/g, "+");
            const encodedVal = encodeURIComponent(val).replace(/%20/g, "+");
            
            signDataParts.push(`${encodedKey}=${encodedVal}`);
        }

        const signData = signDataParts.join("&");
        const checkHmac = crypto.createHmac("sha512", hashSecret);
        const computedHash = checkHmac.update(Buffer.from(signData, "utf-8")).digest("hex");

        return computedHash.toLowerCase() === secureHash.toLowerCase();
    }
}
