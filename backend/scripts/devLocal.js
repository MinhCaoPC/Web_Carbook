// Chạy TOÀN BỘ hệ thống với blockchain giả lập (không cần Sepolia, không tốn gas):
//   Terminal 1:  cd ../blockchain && npx hardhat node
//   Terminal 2:  npm run dev:local        (deploy TicketNFT + TicketMarket lên node cục bộ rồi bật server cổng PORT)
// Firestore, email, VNPay vẫn dùng cấu hình thật trong backend/.env.
// Khóa dưới đây là tài khoản #0 và #1 CÔNG KHAI của Hardhat — chỉ có giá trị trên mạng giả lập.
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('./localChainPatch');
const { ethers } = require('ethers');

const RPC = 'http://127.0.0.1:8545';
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RELAYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const art = (n) => require(path.join(__dirname, '..', '..', 'blockchain', 'artifacts', 'contracts', `${n}.sol`, `${n}.json`));

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  try { await provider.getBlockNumber(); } catch {
    console.error('❌ Chưa thấy blockchain giả lập ở ' + RPC + '.\n   Mở Terminal khác và chạy:  cd ../blockchain && npx hardhat node');
    process.exit(1);
  }
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
  const relayer = new ethers.Wallet(RELAYER_KEY).address;
  const nonce = () => provider.getTransactionCount(deployer.address, 'latest');
  const dep = async (n, args = []) => {
    const a = art(n);
    const c = await new ethers.ContractFactory(a.abi, a.bytecode, deployer).deploy(...args, { nonce: await nonce() });
    await c.waitForDeployment();
    return c;
  };
  const send = async (p) => (await p).wait();

  console.log('🚀 Deploy hợp đồng vé NFT lên blockchain giả lập...');
  const nft = await dep('TicketNFT', [relayer, 500]); const N = await nft.getAddress(); // royalty 5% về relayer (nhà xe demo)
  const market = await dep('TicketMarket', [N]); const M = await market.getAddress();
  await send(nft.setOperator(relayer, true, { nonce: await nonce() }));
  await send(nft.setOperator(M, true, { nonce: await nonce() }));
  await send(market.setOperator(relayer, true, { nonce: await nonce() }));
  console.log(`✅ TicketNFT ${N}\n✅ TicketMarket ${M}\n`);

  const env = {
    ...process.env,
    SEPOLIA_RPC_URL: RPC, RELAYER_PRIVATE_KEY: RELAYER_KEY, CHAIN_ID: '31337', CHAIN_NAME: 'Hardhat Local',
    TICKET_NFT_ADDRESS: N, TICKET_MARKET_ADDRESS: M,
  };
  const tsxCli = require.resolve('tsx/cli');
  const server = spawn(process.execPath, [tsxCli, '--require', path.join(__dirname, 'localChainPatch.js'), path.join(__dirname, '..', 'src', 'server.js')],
    { env, stdio: 'inherit', cwd: path.join(__dirname, '..') });
  server.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => server.kill('SIGINT'));
})().catch((e) => { console.error(String(e.message || e).slice(0, 400)); process.exit(1); });
