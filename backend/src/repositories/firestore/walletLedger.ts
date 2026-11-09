/**
 * @file walletLedger.ts
 * @description Lõi ví nội CARBOOK trên Firestore.
 *
 * - `VI/{walletId}`         : số dư hiện tại (đơn vị VNĐ, số nguyên).
 * - `GIAODICH_VI/{id}`      : sổ cái CHỈ GHI THÊM — mỗi lần tiền vào/ra ví đúng một dòng (soTien có dấu,
 *                             soDuSau chụp lại số dư). Số dư có thể đối chiếu lại bằng cách cộng sổ cái.
 * - `THANHTOAN_VI/{khóa}`   : mỗi khóa thanh toán (maNhomDat) đúng một bản ghi, theo dõi số đã hoàn.
 *
 * Mọi thay đổi số dư đều nằm trong Firestore transaction (đọc–kiểm–ghi nguyên tử, tự thử lại khi
 * tranh chấp) nên hai request đồng thời không thể cùng tiêu một khoản tiền (chống double-spend).
 * Thông báo lỗi giữ nguyên các chuỗi tiếng Anh cũ ("Insufficient balance", "Wallet not found") vì
 * tầng trên (ticketPaymentService) dựa vào đó để dịch ra thông báo tiếng Việt.
 */
import { db } from "../../config/firebase";
import { randomBytes } from "crypto";

export const VI_COLLECTION = "VI";
export const GIAODICH_COLLECTION = "GIAODICH_VI";
export const THANHTOAN_COLLECTION = "THANHTOAN_VI";

// Ví của hệ thống/nhà xe: nhận tiền hoa hồng (royalty) khi vé được bán lại.
export const NHA_XE_WALLET_ID = "VI-NHAXE";

export type LoaiGiaoDich =
    | "TAO_VI"
    | "NAP"
    | "RUT"
    | "THANH_TOAN"
    | "HOAN_TIEN"
    | "MUA_VE_LAI"
    | "BAN_VE_LAI"
    | "HOA_HONG"
    | "HOAN_GIAO_DICH";

export interface DongSoCai {
    maGiaoDich: string;
    walletId: string;
    loai: LoaiGiaoDich;
    soTien: number; // có dấu: + vào ví, − ra khỏi ví
    soDuSau: number;
    thamChieu: string | null;
    ghiChu?: string;
    thoiGian: Date;
}

export function taoWalletId(): string {
    return `VI${randomBytes(6).toString("hex").toUpperCase()}`;
}

function kiemTraSoTien(soTien: number) {
    if (!Number.isSafeInteger(soTien) || soTien <= 0) {
        throw new Error("Amount must be a positive integer");
    }
}

function layVi(doc: FirebaseFirestore.DocumentSnapshot, walletId: string) {
    if (!doc.exists) throw new Error("Wallet not found");
    const vi = doc.data() as any;
    if (vi.trangThai && vi.trangThai !== "ACTIVE") throw new Error("Wallet is not active");
    return vi;
}

export interface ButToan {
    walletId: string;
    soTien: number; // có dấu
    loai: LoaiGiaoDich;
    ghiChu?: string;
    maGiaoDich?: string; // cố định để chống ghi trùng (idempotent) — trùng sẽ ném "Transaction already exists"
}

/**
 * Áp một nhóm bút toán trong MỘT transaction: hoặc tất cả cùng thành công, hoặc không gì thay đổi.
 * Ví bị ghi nợ phải đủ số dư khả dụng. Trả về mã giao dịch của từng bút toán theo thứ tự đầu vào.
 */
export async function apDungButToan(
    butToan: ButToan[],
    thamChieu: string | null,
    truocKhiGhi?: (tx: FirebaseFirestore.Transaction) => Promise<void>
): Promise<string[]> {
    for (const b of butToan) {
        if (!Number.isSafeInteger(b.soTien) || b.soTien === 0) throw new Error("Amount must be a non-zero integer");
    }
    return db.runTransaction(async (tx) => {
        // 1. Đọc hết trước khi ghi (yêu cầu của Firestore transaction)
        const viRefs = [...new Set(butToan.map((b) => b.walletId))].map((id) => db.collection(VI_COLLECTION).doc(id));
        const viDocs = await Promise.all(viRefs.map((r) => tx.get(r)));
        const soDu = new Map<string, number>();
        const khoa = new Map<string, number>();
        viDocs.forEach((d, i) => {
            const vi = layVi(d, viRefs[i].id);
            soDu.set(viRefs[i].id, Number(vi.soDu) || 0);
            khoa.set(viRefs[i].id, Number(vi.soDuKhoa) || 0);
        });

        // Kiểm tra nghiệp vụ riêng (vd: khóa thanh toán đã tồn tại) trước, để báo đúng nguyên nhân
        if (truocKhiGhi) await truocKhiGhi(tx);

        const ledgerRefs = butToan.map((b) =>
            b.maGiaoDich
                ? db.collection(GIAODICH_COLLECTION).doc(b.maGiaoDich)
                : db.collection(GIAODICH_COLLECTION).doc()
        );
        const ledgerDocs = await Promise.all(
            ledgerRefs.map((r, i) => (butToan[i].maGiaoDich ? tx.get(r) : Promise.resolve(null)))
        );
        ledgerDocs.forEach((d) => {
            if (d && d.exists) throw new Error("Transaction already exists");
        });

        // 2. Tính số dư mới, chặn âm
        const soDuSau: number[] = [];
        for (const b of butToan) {
            const moi = (soDu.get(b.walletId) as number) + b.soTien;
            const kha = moi - (khoa.get(b.walletId) as number);
            if (b.soTien < 0 && kha < 0) throw new Error("Insufficient balance");
            soDu.set(b.walletId, moi);
            soDuSau.push(moi);
        }

        // 3. Ghi
        const now = new Date();
        viRefs.forEach((ref) => tx.update(ref, { soDu: soDu.get(ref.id), ngayCapNhat: now }));
        butToan.forEach((b, i) => {
            const dong: DongSoCai = {
                maGiaoDich: ledgerRefs[i].id,
                walletId: b.walletId,
                loai: b.loai,
                soTien: b.soTien,
                soDuSau: soDuSau[i],
                thamChieu,
                thoiGian: now,
                ...(b.ghiChu ? { ghiChu: b.ghiChu } : {}),
            };
            tx.set(ledgerRefs[i], dong);
        });
        return ledgerRefs.map((r) => r.id);
    });
}

/** Chuyển tiền giữa các ví trong một transaction (người mua → người bán + nhà xe, ...). */
export async function chuyenTien(
    tu: { walletId: string; loai: LoaiGiaoDich },
    den: Array<{ walletId: string; soTien: number; loai: LoaiGiaoDich }>,
    thamChieu: string,
    maGiaoDichGoc?: string
): Promise<string[]> {
    const tong = den.reduce((s, d) => s + d.soTien, 0);
    kiemTraSoTien(tong);
    return apDungButToan(
        [
            { walletId: tu.walletId, soTien: -tong, loai: tu.loai, maGiaoDich: maGiaoDichGoc ? `${maGiaoDichGoc}_TRU` : undefined },
            ...den.map((d, i) => ({
                walletId: d.walletId,
                soTien: d.soTien,
                loai: d.loai,
                maGiaoDich: maGiaoDichGoc ? `${maGiaoDichGoc}_CONG${i}` : undefined,
            })),
        ],
        thamChieu
    );
}

/** Đảm bảo ví nhà xe tồn tại (nhận hoa hồng bán lại). */
export async function damBaoViNhaXe(): Promise<string> {
    const ref = db.collection(VI_COLLECTION).doc(NHA_XE_WALLET_ID);
    await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) {
            tx.set(ref, {
                walletId: NHA_XE_WALLET_ID,
                maTaiKhoan: null,
                loaiVi: "HE_THONG",
                soDu: 0,
                soDuKhoa: 0,
                trangThai: "ACTIVE",
                ngayTao: new Date(),
                ngayCapNhat: new Date(),
            });
        }
    });
    return NHA_XE_WALLET_ID;
}
