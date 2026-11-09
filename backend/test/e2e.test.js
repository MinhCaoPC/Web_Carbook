// E2E: TicketNftRepository (ethers thật) <-> hợp đồng TicketNFT/TicketMarket trên node Hardhat cục bộ.
// Cần node đang chạy:  cd ../blockchain && npx hardhat node   (cổng 8545)
// Chạy: npm run test:e2e
const path = require('path');
const root = path.resolve(__dirname, '..');
const K0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // deployer (khóa công khai của Hardhat)
const K1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // relayer (khóa công khai của Hardhat)
process.env.SEPOLIA_RPC_URL = 'http://127.0.0.1:8545';
process.env.RELAYER_PRIVATE_KEY = K1;
const { ethers } = require('ethers');
// Chỉ cho node Hardhat cục bộ (automine nhanh hơn thời gian cache 250ms của ethers): đọc nonce thẳng từ node.
ethers.JsonRpcProvider.prototype.getTransactionCount = async function (addr) {
  return parseInt(await this.send('eth_getTransactionCount', [String(addr), 'latest']), 16);
};
const art = (n) => require(path.resolve(root, `../blockchain/artifacts/contracts/${n}.sol/${n}.json`));
const { createChecker } = require('./fakeFirestore');
const { check, rejects, failed } = createChecker();

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  try { await provider.getBlockNumber(); } catch { console.error('Chưa có node Hardhat ở 127.0.0.1:8545 — chạy: cd ../blockchain && npx hardhat node'); process.exit(2); }
  const deployer = new ethers.NonceManager(new ethers.Wallet(K0, provider));
  const relayerAddr = new ethers.Wallet(K1).address;
  const dep = async (n, args) => { const a = art(n); const c = await new ethers.ContractFactory(a.abi, a.bytecode, deployer).deploy(...args); await c.waitForDeployment(); return c; };
  const nft = await dep('TicketNFT', [relayerAddr, 500]);
  const market = await dep('TicketMarket', [await nft.getAddress()]);
  await (await nft.setOperator(relayerAddr, true)).wait();
  await (await nft.setOperator(await market.getAddress(), true)).wait();
  await (await market.setOperator(relayerAddr, true)).wait();
  process.env.TICKET_NFT_ADDRESS = await nft.getAddress();
  process.env.TICKET_MARKET_ADDRESS = await market.getAddress();

  const { TicketNftRepository } = require(root + '/src/repositories/blockchain/TicketNftRepository.ts');
  const repo = new TicketNftRepository();
  const alice = '0x' + 'a1'.repeat(20), bob = '0x' + 'b2'.repeat(20);
  const departure = Math.floor(Date.now() / 1000) + 86400;

  const m = await repo.mintTicket({ ownerAddress: alice, maDatVe: 'DV1', maChuyenXe: 'CX1', ngayDi: '2026-11-10', maGhe: 'A01', departureUnix: departure, facePrice: 200000 });
  check('mint trả tokenId từ event', m.tokenId === 1 && /^0x/.test(m.txHash), JSON.stringify(m));
  const t = await repo.getTicket(m.tokenId);
  check('đọc lại chủ + giá gốc + trạng thái trên chain', t.owner.toLowerCase() === alice && t.facePrice === 200000 && t.used === false);
  check('mint trùng maDatVe bị chặn', /already minted/.test((await rejects(repo.mintTicket({ ownerAddress: alice, maDatVe: 'DV1', maChuyenXe: 'CX1', ngayDi: 'd', maGhe: 'A01', departureUnix: departure, facePrice: 1 }))) || ''));
  check('rao bán vượt trần 110% bị chặn', /above cap/.test((await rejects(repo.list(m.tokenId, alice, 220001))) || ''));
  await repo.list(m.tokenId, alice, 220000);
  await repo.buy(m.tokenId, bob);
  check('mua xong NFT thuộc người mua', (await repo.getTicket(m.tokenId)).owner.toLowerCase() === bob);
  await repo.markUsed(m.tokenId);
  check('check-in => used = true', (await repo.getTicket(m.tokenId)).used === true);
  const m2 = await repo.mintTicket({ ownerAddress: alice, maDatVe: 'DV2', maChuyenXe: 'CX1', ngayDi: '2026-11-10', maGhe: 'A02', departureUnix: departure, facePrice: 100000 });
  await repo.burnTicket(m2.tokenId);
  check('hoàn vé => đốt NFT, không còn tồn tại', !!(await rejects(repo.getTicket(m2.tokenId))));

  console.log(failed() ? `\n${failed()} test FAIL` : '\nTất cả test e2e blockchain đều PASS');
  process.exit(failed() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
