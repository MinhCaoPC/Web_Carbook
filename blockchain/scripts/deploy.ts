import hre from "hardhat";

// Triển khai bộ hợp đồng vé NFT của CARBOOK:
//   TicketNFT    – mỗi vé xe là một NFT (ERC-721 + ERC-2981 royalty)
//   TicketMarket – chợ bán lại có giá trần (mặc định 110% giá gốc)
// Ví tiền KHÔNG còn nằm trên blockchain (ví nội Firestore) nên không có token/ví/thanh toán on-chain.
async function main() {
  console.log("🚀 Deploying CARBOOK ticket NFT contracts...\n");

  const { ethers } = await hre.network.getOrCreate();
  const [deployer] = await ethers.getSigners();
  const relayerAddress = process.env.RELAYER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY).address
    : deployer.address;
  // Nhà xe nhận royalty khi vé được bán lại (mặc định: deployer)
  const royaltyReceiver = process.env.ROYALTY_RECEIVER || deployer.address;
  const royaltyBps = Number(process.env.ROYALTY_BPS || 500); // 5%
  const baseUri = process.env.NFT_BASE_URI || "";

  console.log("Deployer:", deployer.address);
  console.log("Relayer :", relayerAddress);
  console.log("Royalty :", royaltyReceiver, `${royaltyBps / 100}%\n`);

  console.log("1️⃣  Deploying TicketNFT...");
  const nft = await ethers.deployContract("TicketNFT", [royaltyReceiver, royaltyBps]);
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("✅ TicketNFT   :", nftAddress);

  console.log("2️⃣  Deploying TicketMarket...");
  const market = await ethers.deployContract("TicketMarket", [nftAddress]);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log("✅ TicketMarket:", marketAddress);

  // BẮT BUỘC: thiếu bước cấp quyền thì backend không mint/bán lại được.
  console.log("\n3️⃣  Setting up permissions...");
  await (await nft.setOperator(relayerAddress, true)).wait();          // relayer mint / burn / check-in
  await (await nft.setOperator(marketAddress, true)).wait();           // market chuyển vé khi bán lại
  await (await market.setOperator(relayerAddress, true)).wait();       // relayer rao bán / mua hộ người dùng
  if (baseUri) await (await nft.setBaseURI(baseUri)).wait();
  console.log("✅ Permissions configured");

  console.log("\n" + "=".repeat(70));
  console.log("🎉 DEPLOYMENT COMPLETE! Thêm vào backend/.env:\n");
  console.log(`TICKET_NFT_ADDRESS=${nftAddress}`);
  console.log(`TICKET_MARKET_ADDRESS=${marketAddress}`);
  console.log(`EVENTS_FROM_BLOCK=<block deploy, xem trên Etherscan>`);
  console.log("=".repeat(70));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
