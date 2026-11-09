# CARBOOK – Smart contract vé NFT (Hardhat 3)

Hai hợp đồng, chỉ phục vụ **vé xe**. Tiền/ví nằm ở Firestore (xem README gốc).

| Hợp đồng | Vai trò |
|---|---|
| `TicketNFT.sol` | ERC-721 + ERC-2981. Mỗi vé = 1 NFT (chuyến, ngày, ghế, giờ chạy, giá gốc, `used`). `mintTicket` / `markUsed` (check-in) / `burnTicket` (hoàn vé). **Chỉ operator được chuyển vé** (chặn bán chui), khoá chuyển nhượng khi vé đã dùng hoặc còn dưới 2 giờ trước giờ chạy. Royalty 5% về nhà xe. |
| `TicketMarket.sol` | Chợ bán lại: `list` (giá ≤ 110% giá gốc, chỉ chủ vé), `cancel`, `buy` (chuyển NFT qua operator, phát `Sold` kèm royalty). Chủ sàn chỉnh trần 100%–200%. |

Quyền: `TicketNFT.operators` = relayer backend + `TicketMarket`; `TicketMarket.operators` = relayer backend.

```bash
npm install
npx hardhat compile
npx hardhat test                                      # 20 test (vòng đời vé, chống bán chui, giá trần, khoá giờ…)
npx hardhat node                                      # blockchain giả lập cho `npm run dev:local` / `npm run test:e2e` ở backend
npx hardhat run scripts/deploy.ts --network sepolia   # cần SEPOLIA_RPC_URL, SEPOLIA_PRIVATE_KEY (và RELAYER_PRIVATE_KEY) trong blockchain/.env
```

`deploy.ts` in ra `TICKET_NFT_ADDRESS` và `TICKET_MARKET_ADDRESS` để dán vào `backend/.env`; tuỳ chọn `ROYALTY_RECEIVER`, `ROYALTY_BPS`, `NFT_BASE_URI`.
