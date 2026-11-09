# CARBOOK Backend

Node.js + Express + Firebase Firestore (+ ethers cho vé NFT).

## Ví nội CarbookPay (Firestore)

Tiền **không** nằm trên blockchain. `src/repositories/firestore/` cài đặt các interface `IWalletRepository`, `ITokenRepository`,
`IPaymentRepository`, `IRefundRepository` trên Firestore nên service/controller phía trên dùng chung:

- `VI/{walletId}` số dư; `GIAODICH_VI` sổ cái chỉ ghi thêm (tổng sổ cái = số dư); `THANHTOAN_VI/{maNhomDat}` theo dõi số đã hoàn.
- Mọi thay đổi số dư nằm trong **Firestore transaction** (`walletLedger.ts`): không âm số dư, không tiêu trùng khi nhiều request đồng thời,
  mỗi `maNhomDat` chỉ thanh toán một lần, mỗi mã hoàn chỉ hoàn một lần, tổng hoàn ≤ số đã trả.
- `walletAddress` trong API nay là mã ví nội (`VI…`); `txHash` là mã giao dịch sổ cái.

## Vé NFT & chợ bán lại

- `ticketNftService.js`: mint sau thanh toán (nền, lỗi → `nftStatus=MINT_LOI`, thử lại bằng `POST /api/admin/nft/retry-mint`), đốt khi hoàn vé, soát vé `POST /api/admin/nft/check-in {maQR}`.
- `ticketMarketService.js`: rao bán (giá ≤ 110% giá gốc), huỷ rao, mua (PIN → chuyển tiền giữa hai ví nội → `TicketMarket.buy`; NFT lỗi thì hoàn tác tiền), cấp lại mã QR cho chủ mới.
- Routes: `GET /api/nft/config`, `GET /api/nft/my`, `GET /api/nft/market`, `POST /api/nft/market/{list,cancel,buy}`.
- Biến môi trường: xem `.env.example`. Địa chỉ chủ vé suy ra bằng HMAC từ mã tài khoản (`utils/nftAddress.js`) — đừng đổi `NFT_ADDRESS_SECRET` sau khi đã mint.

## Phạm vi miền Tây

`src/utils/mekong.js` + `scripts/narrowToMekong.js` (xem README gốc).

## Kiểm thử

`npm test` (Firestore giả, không đụng dữ liệu thật) · `npm run test:e2e` (cần `npx hardhat node`).

```bash
npm install
npm run dev   # nodemon src/server.js, mặc định cổng 5050
```

## Xác thực

`/api/auth/login`, `/api/auth/google` (khách) và `/api/admin/auth/login` (quản trị) trả về `token`
(JWT HS256, ký bằng `JWT_SECRET` trong `.env`, hết hạn sau `JWT_EXPIRES_IN`, mặc định 12h). Mọi
endpoint cần đăng nhập đều nhận:

```
Authorization: Bearer <token>
```

Danh tính (mã tài khoản, vai trò `KH`/`AD`) chỉ lấy từ token đã ký — header/body do client tự
khai không được tin. Middleware ở `src/middlewares/auth.js`:

- `requireAdmin`: toàn bộ `/api/admin/*` (trừ `/api/admin/auth/login`), `/api/payment/*`.
- `verifyKhachHang`: đặt vé/thanh toán/ví PIN/hủy vé; `maKhachHang` suy ra từ token.
- `requireOwnWallet`: các route nhận mã ví (nạp/rút/số dư/lịch sử) — ví phải thuộc người đăng nhập.
- `requireSelfAccount` / `requireSelfKhachHang`: route có `:id` — chỉ chính chủ (hoặc admin).

Mật khẩu và mã PIN ví được băm bằng scrypt có salt (`src/utils/passwordHash.js`); hash SHA-256 cũ
vẫn đăng nhập được và tự được băm lại lúc đăng nhập thành công.

## API đặt vé & thanh toán

### 1. Giữ chỗ

```bash
curl -X POST http://localhost:5050/api/dat-ve/giu-cho \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "maKhachHang": "KH001",
    "maChuyenXe": "CX001",
    "danhSachMaGhe": ["A12", "A14"],
    "maDiemDon": null,
    "maDiemTra": null
  }'
```

Tạo VEXE trạng thái `GIU_CHO` cho từng ghế + giữ ghế 10 phút (dùng `giuGhe()`).

### 2. Kiểm tra thông tin vé

```bash
curl "http://localhost:5050/api/dat-ve/kiem-tra?danhSachMaDatVe=MM-2026-...,MM-2026-..."
```

Trả về chuyến xe, hành khách (sđt/email đã mask), danh sách ghế, điểm đón/trả kèm giờ dự kiến.

### 3. Cập nhật thông tin hành khách

```bash
curl -X PATCH http://localhost:5050/api/dat-ve/thong-tin-hanh-khach \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "danhSachMaDatVe": ["MM-2026-..."],
    "hoTen": "Pham Thi Thuy Vy",
    "email": "vy@example.com",
    "sdt": "0393429767",
    "cmnd": "091234567890"
  }'
```

Chỉ cập nhật các vé đang `GIU_CHO`.

### 4. Đổi điểm đón/trả

```bash
curl -X PATCH http://localhost:5050/api/dat-ve/diem-don-tra \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "danhSachMaDatVe": ["MM-2026-..."],
    "maDiemDon": "DTC0007",
    "maDiemTra": "DTC0016"
  }'
```

### 5. Nhả ghế để chọn lại

```bash
curl -X POST http://localhost:5050/api/dat-ve/nha-ghe-va-chon-lai \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "danhSachMaDatVe": ["MM-2026-..."] }'
```

Nhả ghế (GHEXE về `TRONG`) và chuyển các VEXE liên quan sang `HUY`.

### 6. Thông tin màn Thanh toán

```bash
curl "http://localhost:5050/api/dat-ve/thanh-toan?danhSachMaDatVe=MM-2026-...,MM-2026-..."
```

Giống endpoint 2 nhưng có thêm `chiTietThanhToan` (tổng tiền, số dư ví nội bộ) và `diemLenXe`
(điểm đón kèm cảnh báo giờ).

### 7. Thanh toán

```bash
curl -X POST http://localhost:5050/api/thanh-toan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "maKhachHang": "KH001",
    "danhSachMaDatVe": ["MM-2026-..."],
    "phuongThucTT": "CARBOOKPAY"
  }'
```

Trong 1 Firestore transaction: assert tất cả vé còn `GIU_CHO` và chưa hết hạn giữ (`hetHanGiuVe`),
trừ ví nội nếu thanh toán bằng `CARBOOKPAY` (yêu cầu mã PIN), đổi `VEXE` → `DA_TT` (sinh `maQR`), `GHEXE` → `DA_DAT`,
tạo `HOADON` cho từng vé. Nếu vé đã hết hạn giữ khi gọi endpoint này, trả về **410 Gone**.

## Cloud Function `nhaGheHetHan`

`functions/nhaGheHetHan.js` chạy mỗi phút: quét `GHEXE` đang `DANG_GIU` quá hạn để trả về `TRONG`
và cộng lại `CHUYENXE.soGheConTrong`, đồng thời quét `VEXE` đang `GIU_CHO` quá hạn `hetHanGiuVe` để
chuyển sang `HUY`.
