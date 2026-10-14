import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying Carbook Pay Smart Contracts...\n");

  // Get deployer and relayer accounts
  const { ethers } = await hre.network.getOrCreate();
  const [deployer] = await ethers.getSigners();
  const relayerAddress = process.env.RELAYER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY).address
    : deployer.address;

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Relayer address:", relayerAddress);
  console.log("");

  // 1. Deploy CARToken
  console.log("1️⃣  Deploying CARToken...");
  const CARToken = await ethers.getContractFactory("CARToken");
  const carToken = await CARToken.deploy();
  await carToken.waitForDeployment();
  const carTokenAddress = await carToken.getAddress();
  console.log("✅ CARToken deployed at:", carTokenAddress);

  // 2. Deploy Wallet
  console.log("\n2️⃣  Deploying Wallet...");
  const Wallet = await ethers.getContractFactory("Wallet");
  const wallet = await Wallet.deploy(carTokenAddress);
  await wallet.waitForDeployment();
  const walletAddress = await wallet.getAddress();
  console.log("✅ Wallet deployed at:", walletAddress);

  // 3. Deploy TicketPayment
  console.log("\n3️⃣  Deploying TicketPayment...");
  const TicketPayment = await ethers.getContractFactory("TicketPayment");
  const ticketPayment = await TicketPayment.deploy(carTokenAddress, walletAddress, relayerAddress);
  await ticketPayment.waitForDeployment();
  const ticketPaymentAddress = await ticketPayment.getAddress();
  console.log("✅ TicketPayment deployed at:", ticketPaymentAddress);

  // 4. Deploy Refund
  console.log("\n4️⃣  Deploying Refund...");
  const Refund = await ethers.getContractFactory("Refund");
  const refund = await Refund.deploy(carTokenAddress, walletAddress, ticketPaymentAddress, relayerAddress);
  await refund.waitForDeployment();
  const refundAddress = await refund.getAddress();
  console.log("✅ Refund deployed at:", refundAddress);

  // 5. Setup permissions (optional but recommended)
  console.log("\n5️⃣  Setting up permissions...");
  try {
    console.log("Authorizing TicketPayment contract on Wallet...");
    const tx1 = await wallet.setAuthorizedCaller(ticketPaymentAddress, true);
    await tx1.wait();

    console.log("Authorizing Refund contract on Wallet...");
    const tx2 = await wallet.setAuthorizedCaller(refundAddress, true);
    await tx2.wait();

    console.log("✅ Permissions configured");
  } catch (error) {
    console.log("⚠️  Permission setup failed:", error);
  }

  // Output all addresses
  console.log("\n" + "=".repeat(70));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(70));
  console.log("\n📋 Contract Addresses (UPDATE backend/src/config/blockchain.config.ts):\n");
  console.log(`export const CONTRACT_ADDRESSES = {`);
  console.log(`    CAR_TOKEN: "${carTokenAddress}",`);
  console.log(`    WALLET: "${walletAddress}",`);
  console.log(`    TICKET_PAYMENT: "${ticketPaymentAddress}",`);
  console.log(`    REFUND: "${refundAddress}",`);
  console.log(`};`);
  console.log("");

  // Also output as environment variables format
  console.log("📋 Or use as .env variables:\n");
  console.log(`CAR_TOKEN_ADDRESS=${carTokenAddress}`);
  console.log(`WALLET_ADDRESS=${walletAddress}`);
  console.log(`TICKET_PAYMENT_ADDRESS=${ticketPaymentAddress}`);
  console.log(`REFUND_ADDRESS=${refundAddress}`);
  console.log(`RELAYER_ADDRESS=${relayerAddress}`);
  console.log(`DEPLOYER_ADDRESS=${deployer.address}`);
  console.log("");
  console.log("=".repeat(70));
  console.log("\n✨ Next steps:");
  console.log("1. Copy the contract addresses above");
  console.log("2. Update backend/src/config/blockchain.config.ts");
  console.log("3. Update backend/.env");
  console.log("4. Start backend: npm run dev");
  console.log("5. Test API endpoints with curl or Postman");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
