// Đồng bộ số token CAR (ERC-20) của từng ví user cho KHỚP với sổ cái Wallet.sol.
// Dùng để sửa dữ liệu lệch lịch sử (trước đây thanh toán không burn token, hoàn tiền
// không mint lại) — từ nay các luồng đã tự đồng bộ nên script chỉ cần chạy khi nghi lệch.
//
// Cách chạy (từ thư mục backend):
//   npx tsx scripts/syncTokenBalances.js 0xVi1 0xVi2 ...   # đồng bộ các ví chỉ định (thuần on-chain)
//   npx tsx scripts/syncTokenBalances.js                   # quét mọi ví trong TAIKHOAN (cần Firestore)
//
// Quy tắc: sổ cái Wallet.sol là NGUỒN SỰ THẬT.
//   token > sổ cái -> burn phần dư | token < sổ cái -> mint phần thiếu

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const { RepositoryFactory } = await import('../src/repositories/index.ts');
  const walletRepo = RepositoryFactory.getWalletRepository();
  const tokenRepo = RepositoryFactory.getTokenRepository();

  let danhSachVi = process.argv.slice(2).filter((a) => a.startsWith('0x'));

  if (danhSachVi.length === 0) {
    const { db } = require('../src/config/firebase');
    const snap = await db.collection('TAIKHOAN').where('walletAddress', '!=', null).get();
    danhSachVi = snap.docs.map((d) => d.data().walletAddress).filter(Boolean);
    console.log(`Tìm thấy ${danhSachVi.length} ví trong TAIKHOAN.`);
  }

  for (const vi of danhSachVi) {
    const [soCai, token] = await Promise.all([
      walletRepo.getBalance(vi),
      tokenRepo.getTokenBalance(vi),
    ]);

    if (token === soCai) {
      console.log(`= ${vi}: token ${token} == sổ cái ${soCai} (khớp, bỏ qua)`);
      continue;
    }
    if (token > soCai) {
      console.log(`- ${vi}: token ${token} > sổ cái ${soCai} -> burn ${token - soCai}`);
      await tokenRepo.burn(vi, token - soCai);
    } else {
      console.log(`+ ${vi}: token ${token} < sổ cái ${soCai} -> mint ${soCai - token}`);
      await tokenRepo.mint(vi, soCai - token);
    }
  }

  console.log('Hoàn tất đồng bộ.');
}

main().then(() => process.exit(0)).catch((err) => { console.error('Lỗi:', err); process.exit(1); });
