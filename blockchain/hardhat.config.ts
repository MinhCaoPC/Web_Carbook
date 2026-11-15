// @ts-nocheck
// Cấu hình Hardhat 3: trình biên dịch Solidity và 2 mạng triển khai.
//   - localhost : blockchain giả lập trên máy (chạy `npx hardhat node`), có sẵn 20 ví mỗi ví 10.000 ETH
//   - sepolia   : mạng thử nghiệm thật của Ethereum (cần SEPOLIA_RPC_URL + SEPOLIA_PRIVATE_KEY trong blockchain/.env)
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import * as dotenv from "dotenv";
import { defineConfig } from "hardhat/config";

dotenv.config();

const mangSepolia = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_PRIVATE_KEY
  ? {
      sepolia: {
        type: "http",
        chainType: "l1",
        url: process.env.SEPOLIA_RPC_URL,
        accounts: [process.env.SEPOLIA_PRIVATE_KEY],
      },
    }
  : {};

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        // shanghai: chạy được trên Hardhat, Ganache và Sepolia
        settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "shanghai" },
      },
    },
  },
  networks: {
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    ...mangSepolia,
  },
});
