# CARBOOK Web – Đồ án Blockchain căn bản

Website đặt **vé xe khách khu vực miền Tây** (đồng bằng sông Cửu Long). Tiền đi qua **ví nội CarbookPay trên Firebase Firestore**;
blockchain (Ethereum Sepolia) dùng cho **vé NFT** — mỗi vé đã thanh toán là một NFT như vé concert: chống vé giả, kiểm chứng công khai,
bán lại có giá trần chống phe vé.

```
BlockchainBase/
├── frontend/    Giao diện web (HTML + CSS + JavaScript thuần, responsive điện thoại / iPad / laptop)
├── backend/     Node.js + Express + Firestore + ethers (REST API, cổng 5050; phục vụ luôn frontend)
├── blockchain/  Smart contract Solidity (TicketNFT, TicketMarket) – Hardhat
└── phan-cong/   Phân công 2 ngày cho 2 thành viên (A, B)
```

## Kiến trúc: ai giữ cái gì

| Việc | Nằm ở đâu | Vì sao |
|---|---|---|
| Số dư, nạp/rút, thanh toán, hoàn tiền | **Firestore** (`VI`, `GIAODICH_VI` sổ cái, `THANHTOAN_VI`) | Giao dịch nguyên tử, không tốn gas, hoàn tiền tức thì |
| Giữ chỗ, ghế, chuyến, hóa đơn | **Firestore** | Dữ liệu vận hành thay đổi liên tục |
| **Quyền sở hữu vé** | **Blockchain – `TicketNFT` (ERC-721 + ERC-2981)** | Chống vé giả, minh bạch lịch sử đổi chủ |
| **Bán lại vé** | **Blockchain – `TicketMarket`** (+ tiền trên ví nội) | Giá trần 110%, khoá 2 giờ trước giờ chạy, hoa hồng 5% về nhà xe |

Luồng vé: thanh toán bằng ví nội (PIN) → backend mint NFT (relayer trả gas) → khách rao bán trên chợ vé → người mua trả tiền ví nội,
NFT đổi chủ, **mã QR được cấp lại** → nhà xe quét QR (`markUsed`) → hủy vé thì NFT bị đốt và 70% giá vé về ví.
Chủ NFT là **địa chỉ lưu ký** suy ra từ tài khoản (HMAC), người dùng không cần MetaMask; chỉ operator (relayer/TicketMarket) chuyển được vé.

## Chạy

```bash
cd backend
npm install
npm run dev        # BẮT BUỘC dùng npm run dev (tsx) để nạp các route .ts của ví/thanh toán
```

Mở **http://localhost:5050**. Cần có `backend/.env` (xem `.env.example`) và `backend/serviceAccountKey.json` (không đưa lên git).

NFT là tùy chọn: bỏ trống `TICKET_NFT_ADDRESS`/`TICKET_MARKET_ADDRESS`/`RELAYER_PRIVATE_KEY` thì vé không phát hành NFT nhưng đặt vé, ví, thanh toán vẫn chạy.

### Chạy thử với blockchain giả lập (không cần Sepolia)

```bash
cd blockchain && npm install && npx hardhat node      # terminal 1
cd backend && npm run dev:local                        # terminal 2: deploy hợp đồng lên node cục bộ rồi bật server
```

### Deploy lên Sepolia

```bash
cd blockchain && npx hardhat compile
npx hardhat run scripts/deploy.ts --network sepolia   # in ra TICKET_NFT_ADDRESS / TICKET_MARKET_ADDRESS để dán vào backend/.env
```

### Kiểm thử

```bash
cd backend && npm test            # ví nội, miền Tây, vé NFT + chợ (Firestore giả), băm mật khẩu, xác thực, rút tiền
cd blockchain && npx hardhat test # 20 test hợp đồng TicketNFT / TicketMarket
cd backend && npm run test:e2e    # cần `npx hardhat node`: ethers thật <-> hợp đồng thật
```

## Phạm vi miền Tây

Chỉ bán tuyến có ít nhất một đầu ở 5 tỉnh/thành ĐBSCL (địa giới mới sau sáp nhập 2025), đầu kia ở miền Tây hoặc TP.HCM (đầu mối). Tuyến sang miền Đông/Vũng Tàu bị loại; mỗi tuyến tối đa
`MEKONG_TRIPS_PER_ROUTE` (mặc định 2) chuyến/ngày → từ 64 tuyến/192 chuyến còn **58 tuyến/116 chuyến mỗi ngày**. Logic ở `backend/src/utils/mekong.js`,
áp dụng cho tìm chuyến và cron sinh lịch. Đồng bộ dữ liệu Firestore:

```bash
cd backend
node scripts/narrowToMekong.js            # xem thử
node scripts/narrowToMekong.js --apply    # ghi LOTRINH/CHUYENXE
```

## Chuyển từ ví blockchain cũ sang ví nội

```bash
cd backend
npx tsx scripts/migrateWalletsToInternal.js [--apply] [--balances so-du.json]
```

## Cấu trúc frontend

- `index.html` – khung trang (thanh điều hướng, tab bar điện thoại)
- `css/styles.css` – design system + responsive (breakpoint 768px, 1100px; hỗ trợ chế độ tối)
- `js/core.js` – icon, định dạng, gọi API, phiên đăng nhập, toast/modal/PIN
- `js/app.js` – router theo hash (`#/...`), bảo vệ trang cần đăng nhập
- `js/pages/` – auth, home, booking (tìm chuyến → chọn ghế → hành khách), payment, tickets (vé + rao bán), wallet (ví nội), **market** (chợ vé NFT, trang `#/blockchain` = vé NFT & hợp đồng), account

## Đăng nhập Google

1. Google Cloud Console → APIs & Services → Credentials → tạo **OAuth client ID loại Web application**; thêm `http://localhost:5050` vào *Authorized JavaScript origins*.
2. Dán client ID vào `backend/.env`: `GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com`, rồi khởi động lại backend. Web tự hiện nút Google; backend xác minh ID token với Google.
3. Mobile: dán cùng client ID vào `googleServerClientId` trong `mobile/lib/config/api_config.dart`; tạo thêm OAuth client loại **Android** (package `com.example.doan3` + SHA-1 của keystore, lấy bằng `cd mobile/android && ./gradlew signingReport`), rồi tải lại `google-services.json`.

## Lịch chuyến xe & VNPay

- Chuyến chỉ bán trong **4 ngày** (hôm nay + 3 ngày tới), do `scripts/generateDailySchedules.js` sinh ra (cron tự chạy 00:05 khi server đang chạy).
  Nếu mở web mà không thấy chuyến: `cd backend && node scripts/generateDailySchedules.js` (chạy lại được nhiều lần, chỉ sinh phần thiếu).
- Chuyến hôm nay chỉ hiện khi giờ khởi hành chưa qua.
- VNPay sandbox: merchant hiện tại bị VNPay báo **lỗi 71 "Website not approved"**. Tạm thời `backend/.env` đặt `VNP_MOCK=true`
  để dùng cổng thanh toán **giả lập** (`frontend/vnpay-mock.html`, chỉ demo). Khi có `VNP_TMN_CODE`/`VNP_HASH_SECRET` mới
  (đăng ký tại https://sandbox.vnpayment.vn/devreg) hãy cập nhật `.env` và đặt `VNP_MOCK=false`.
