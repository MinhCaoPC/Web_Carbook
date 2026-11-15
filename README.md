# CARBOOK – Vé xe khách miền Tây bằng NFT

Đồ án Blockchain: website đặt vé xe, **mỗi vé là một NFT (ERC-721) nằm trong ví MetaMask của khách**.

| Thành phần | Công nghệ |
|---|---|
| Frontend | Web (HTML + CSS + JavaScript thuần, các lớp ES6) — chuyển từ app Flutter |
| Backend | Node.js (Express) + Firebase Firestore |
| Blockchain | Solidity (ERC-721, OpenZeppelin) · ethers.js · MetaMask · Hardhat local hoặc Sepolia |

## Chức năng chính

| # | Chức năng | Nằm ở đâu |
|---|---|---|
| 1 | Xem tuyến, chuyến, chọn ghế | Dữ liệu chuyến từ **Firebase**; ghế đã bán đọc từ **blockchain** |
| 2 | Mua vé: kết nối MetaMask, trả ETH, hợp đồng mint NFT vào ví | `VeXeNFT.muaVe / muaNhieuVe` |
| 3 | Hợp đồng khóa ghế đã bán, không bán trùng, **chỉ bán ghế có thật** | `VeXeNFT._gheDaBan` + **sơ đồ ghế đăng ký trên hợp đồng** (`dangKySoDoGhe`): mua ghế lạ như `Z99` bị từ chối |
| 4 | Soát vé: quét QR, kiểm tra chủ sở hữu & trạng thái, đánh dấu đã dùng | QR = `{ maVe, chuKy }` (trên điện thoại hoặc **in giấy**, không có hạn). Hợp đồng `danhDauDaSuDung` kiểm tra người ký là **chủ vé hiện tại** (vé đã bán/tặng thì QR cũ vô hiệu) và vé **chưa lên xe** → mỗi vé chỉ lên xe một lần |
| 5 | Hủy vé, hoàn tiền theo thời gian ghi trong hợp đồng | `VeXeNFT.huyVe`: ≥24 giờ hoàn 90%, 2–24 giờ hoàn 50%, <2 giờ không hủy |
| 6 | Chuyển nhượng / bán lại có giới hạn giá | `chuyenNhuongVe`, `raoBanVe` (≤110% giá gốc), `muaLaiVe`; chặn `transferFrom` thông thường |

## Phân chia dữ liệu

- **On-chain** (hợp đồng `VeXeNFT`): ai sở hữu vé, ghế nào đã bán, trạng thái vé (Hiệu lực / Đã dùng / Đã hủy), giá & giờ chạy của chuyến đã mở bán, tiền vé.
- **Off-chain** (Firebase): tài khoản, thông tin chuyến/tuyến/xe/sơ đồ ghế, metadata vé (`/api/metadata/<mã vé>`), thông tin cá nhân hành khách.

Backend **không giữ khóa riêng nào** và không gửi giao dịch. Mọi thao tác ghi lên blockchain đều do người dùng tự ký bằng MetaMask.

## Cấu trúc thư mục

```
blockchain/
  contracts/QuanLyChuyenXe.sol   lớp cha: nhà xe mở bán chuyến, cấp quyền soát vé
  contracts/VeXeNFT.sol          vé NFT: mua, khóa ghế, soát vé, hủy-hoàn tiền, chuyển nhượng, bán lại
  scripts/bien-dich.js           biên dịch bằng solc-js
  scripts/trien-khai.js          triển khai + ghi địa chỉ vào dia-chi-hop-dong.json
  scripts/mang-ao-ganache.js     mạng ảo dự phòng (giống hệt Hardhat node)
  scripts/xac-minh-etherscan.js  xác minh mã nguồn trên Etherscan Sepolia
  test/VeXeNFT.test.js           34 test cho 6 chức năng
backend/src/
  may-chu.js                     lớp UngDungMayChu: tạo và nối mọi đối tượng
  api/                           router Express (tài khoản, chuyến xe, vé)
  dich-vu/                       DichVuXacThuc, DichVuChuyenXe, DichVuVe
  kho-du-lieu/                   KhoLuuTru (cha) → KhoLuuTruFirestore / KhoLuuTruTep; KhoDanhMuc, KhoNguoiDung, KhoThongTinVe
  ket-noi/ket-noi-blockchain.js  đọc hợp đồng bằng ethers (chỉ đọc)
  mo-hinh/                       NguoiDung, ChuyenXe, VeXe
frontend/js/
  ung-dung.js                    lớp UngDung: router, phiên đăng nhập, ví
  vi-metamask.js                 ViMetaMask (kết nối ví) + HopDongVeXe (gọi hợp đồng)
  trang/                         mỗi trang một lớp, kế thừa TrangCoSo
```

## Chạy trên máy (mạng ảo)

Cần Node.js 20 trở lên và tiện ích MetaMask trên trình duyệt.

```bash
# 1. Cài thư viện
cd blockchain && npm install
cd ../backend && npm install

# 2. Terminal 1 — mạng blockchain ảo (để nguyên cửa sổ này)
cd blockchain
npm run mang-ao              # = npx hardhat node
# Windows bật Smart App Control chặn Hardhat?  ->  npm run mang-ao:ganache

# 3. Terminal 2 — biên dịch, triển khai, mở bán chuyến, bật web
cd blockchain
npm run bien-dich
npm run trien-khai           # ghi địa chỉ vào blockchain/dia-chi-hop-dong.json
cd ../backend
npm run mo-ban-chuyen        # mở bán mọi chuyến của 4 ngày tới lên blockchain
npm start                    # mở http://localhost:5050
```

**Cài MetaMask cho mạng ảo:** web tự đề nghị thêm mạng (chainId 31337, RPC `http://127.0.0.1:8545`). Nhập các khóa riêng **công khai** mà `npm run mang-ao` in ra:

- Ví #0 là **nhà xe** (chủ hợp đồng), dùng cho trang "Nhà xe".
- Ví #1 là **nhân viên soát vé**.
- Ví #2 trở đi là **khách hàng**.

Mỗi lần khởi động lại mạng ảo, cần chạy lại `npm run trien-khai` và `npm run mo-ban-chuyen`. Trong MetaMask, vào *Cài đặt › Nâng cao › Xóa dữ liệu hoạt động* để tránh lỗi nonce.

## Chạy trên Sepolia

Sepolia là mạng thử nghiệm **công khai**: ai cũng tự kiểm tra hợp đồng, NFT và giao dịch trên [sepolia.etherscan.io](https://sepolia.etherscan.io).

1. Trong `blockchain/.env`, đặt các biến sau:
   - `SEPOLIA_RPC_URL`
   - `SEPOLIA_PRIVATE_KEY`: khóa của ví có Sepolia ETH. Ví này sẽ là **nhà xe**.
   - `ETHERSCAN_API_KEY`: để xác minh mã nguồn.
   - Tùy chọn: `NHAN_VIEN_SOAT_VE=0x...`.
2. Triển khai:
   ```bash
   cd blockchain
   npm run bien-dich
   npm run trien-khai:sepolia
   ```
   Lệnh này tự **xác minh mã nguồn trên Etherscan**. Nếu bước xác minh bị lỗi thì chạy lại `npm run xac-minh`.
3. Mở bán chuyến và bật web:
   ```bash
   cd ../backend
   npm run mo-ban-chuyen:sepolia
   npm run start:sepolia
   ```
   - Lệnh mở bán ký bằng `SEPOLIA_PRIVATE_KEY` ở trên.
   - Backend đọc chuỗi qua RPC công khai `publicnode`. Muốn đổi RPC thì đặt `RPC_URL_SEPOLIA` trong `backend/.env`.

Hai mạng có địa chỉ hợp đồng riêng trong `dia-chi-hop-dong.json`. `npm start` chạy mạng ảo, `npm run start:sepolia` chạy Sepolia, không cần sửa `.env`.

## Đăng nhập Google, quên mật khẩu, thông báo

- **Đăng nhập Google**: đặt `GOOGLE_CLIENT_ID` trong `backend/.env` (OAuth client loại *Web application*, origin `http://localhost:5050`). Backend hỏi lại Google để xác minh ID token. Email chưa có tài khoản thì hệ thống tự tạo tài khoản mới.
- **Quên mật khẩu**: gồm 3 bước (email → mã OTP 6 số → mật khẩu mới). Mã gửi qua Gmail (`GMAIL_USER`, `GMAIL_APP_PASSWORD`), hiệu lực 5 phút, chỉ lưu bản băm, sai 5 lần thì bị hủy, mỗi 60 giây mới gửi lại được. Khi chạy demo (`NODE_ENV=development`), nếu gửi mail lỗi thì mã được in ra cửa sổ backend.
- **Thông báo**: dựng từ **sự kiện của hợp đồng** liên quan tới ví của bạn (`DaMuaVe`, `DaBanLai`, `DaChuyenNhuong`, `DaHuyVe`, `DaSuDungVe`), kèm nhắc chuyến chạy trong 24 giờ tới. Không lưu từng thông báo vào Firebase, chỉ ghi 1 lần khi bấm "đã đọc" hoặc "xóa".
- **3 giao diện theo vai trò**, vai trò đọc **từ hợp đồng** theo ví đã liên kết (`GET /api/tai-khoan/vai-tro`), Firebase không lưu quyền:
  | Vai trò | Điều kiện trên blockchain | Giao diện |
  |---|---|---|
  | Khách hàng | (mặc định) | Tìm chuyến, mua vé, vé của tôi, chợ vé, thông báo |
  | Nhân viên soát vé | `laNhanVienSoatVe(ví) = true` (nhà xe cấp) | Chỉ màn hình Soát vé + Ví |
  | Nhà xe | ví = chủ hợp đồng (`owner`) | Trang quản trị + Soát vé |

  Mở trang không thuộc vai trò của mình thì tự chuyển về trang đầu của vai trò đó. Nhà xe cấp hoặc thu quyền xong, nhân viên chỉ cần tải lại trang (F5).

## Khách chưa đăng nhập (trang công khai)

| Làm được khi CHƯA đăng nhập | Cần đăng nhập |
|---|---|
| Trang chủ giới thiệu, tìm chuyến, xem sơ đồ ghế (ghế trống/đã bán đọc từ blockchain) | Thanh toán, vé của tôi, chợ vé, thông báo, ví |
| **Tra cứu vé** `#/tra-cuu/<mã vé>`: vé có thật không, còn hiệu lực / đã lên xe / đã hủy, ví đang giữ vé, link Etherscan. **Không** hiện họ tên, SĐT hành khách | Soát vé, trang Nhà xe |

Khách chọn ghế xong bấm **"Đăng nhập để đặt vé"**, đăng nhập (hoặc đăng ký) xong sẽ tự **quay lại đúng trang thanh toán** của chuyến và ghế đã chọn.

## Trang quản trị (Nhà xe)

Để vào trang quản trị, tài khoản phải **liên kết với ví chủ hợp đồng** (ví #0 trên mạng ảo). Backend kiểm tra vai trò này trực tiếp trên blockchain, không có tài khoản admin riêng. Trang gồm 5 tab:

| Tab | Nội dung | Nguồn dữ liệu |
|---|---|---|
| Tổng quan | Doanh thu thuần, vé bán/đi/hủy, tỷ lệ lấp ghế, biểu đồ theo ngày, tuyến bán chạy, tiền trong hợp đồng | Sự kiện blockchain (0 lượt Firebase) |
| Vé & hành khách | Danh sách lên xe theo ngày và chuyến, xuất Excel (CSV), in | Blockchain + thông tin hành khách |
| Tuyến · Chuyến · Xe | Thêm/sửa lộ trình, chuyến mẫu (giờ chạy, giá), xe | Firebase (1 lượt ghi mỗi lần lưu) |
| Tài khoản | Khóa/mở khóa khách, gửi thông báo cho mọi khách | Firebase |
| Blockchain | Mở bán chuyến (tự đăng ký sơ đồ ghế lần đầu), cấp quyền soát vé, **chốt vé khách không đi**, rút doanh thu | Giao dịch ký bằng MetaMask |

## Tiết kiệm lượt truy cập Firebase

| Trước | Bây giờ |
|---|---|
| Mỗi lượt tìm chuyến đọc `CHUYENXE`, `CHUYENXE_NGAY`, đếm `GHEXE` | Danh mục đọc Firebase **1 lần** (~360 lượt), lưu vào `backend/du-lieu/danh-muc.json`. Tìm chuyến và xem ghế tốn **0 lượt** |
| Cron sinh ~15.000 tài liệu `GHEXE` mỗi ngày | Không còn: trạng thái ghế nằm trên blockchain, chuyến theo ngày được tính ra từ chuyến mẫu |
| Mỗi request đọc tài khoản | JWT xác thực không cần đọc DB; tài khoản được cache 10 phút |
| Ví, giao dịch, hóa đơn trên Firestore | Tiền nằm trên blockchain |

Hệ thống chỉ còn ghi Firebase khi: đăng ký, sửa tài khoản, liên kết ví, và **một lần cho mỗi vé** (thông tin hành khách).

- Muốn **không dùng Firebase**: đặt `NOI_LUU_DU_LIEU=tep` trong `backend/.env`. Dữ liệu sẽ lưu vào file JSON trong `backend/du-lieu/`, dùng `danh-muc.json` có sẵn.
- Sửa chuyến trên Firebase Console xong thì chạy `npm run lam-moi-danh-muc`.
- Các collection cũ không còn dùng (`GHEXE`, `CHUYENXE_NGAY`, `VEXE`, `VI`, `GIAODICH_VI`, `DON_*`...) có thể xóa trên Firebase Console để gọn dữ liệu.

## Kiểm thử

```bash
cd blockchain && npm test    # 37 test hợp đồng (Ganache chạy trong tiến trình, không cần mở mạng ảo)
cd backend && npm test       # test tiện ích + test tích hợp: API thật + hợp đồng thật + kho file tạm
```
