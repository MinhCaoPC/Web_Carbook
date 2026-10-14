// @ts-nocheck
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";
import { configVariable, defineConfig } from "hardhat/config";

dotenv.config();

export default defineConfig({
  plugins: [hardhatVerify, hardhatEthers, hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
    },
  },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL || configVariable("SEPOLIA_RPC_URL"),
      accounts: [process.env.SEPOLIA_PRIVATE_KEY || process.env.PRIVATE_KEY || configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
   verify: {
    etherscan: {
      apiKey: "PN8WPPXQ6T2IPV32NX1NRP4XBUCQMF3GY2",
    },
     blockscout: {
      enabled: false,
    },
  },
});