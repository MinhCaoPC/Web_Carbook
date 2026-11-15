// Test NhatKySuKien với RPC giả: RPC chỉ cho hỏi tối đa 10 khối/lần (giống Alchemy miễn phí)
// -> lớp phải tự giảm số khối mỗi lần hỏi và vẫn đọc đủ, không trùng, không sót.
const test = require('node:test');
const assert = require('node:assert');
const { NhatKySuKien } = require('../src/ket-noi/nhat-ky-su-kien');

function taoBlockchainGia({ gioiHanKhoi, khoiMoiNhat, khoiCoSuKien }) {
  let soLanHoi = 0;
  const provider = {
    getBlockNumber: async () => khoiMoiNhat,
    getBlock: async (k) => ({ timestamp: 1_700_000_000 + k }),
    getLogs: async ({ fromBlock, toBlock }) => {
      soLanHoi++;
      if (toBlock - fromBlock + 1 > gioiHanKhoi) throw new Error('400 Bad Request: block range too large');
      return khoiCoSuKien.filter((k) => k >= fromBlock && k <= toBlock).map((k) => ({ blockNumber: k, index: 0, transactionHash: `0x${k}` }));
    },
  };
  const hopDong = {
    target: '0xHopDong',
    interface: { parseLog: (log) => ({ name: 'DaMuaVe', fragment: { inputs: [{ name: 'maVe' }] }, args: [BigInt(log.blockNumber)] }) },
  };
  return { blockchain: { provider, hopDong, khoiTrienKhai: 100 }, soLanHoi: () => soLanHoi };
}

test('RPC giới hạn 10 khối: tự chia nhỏ, đọc đủ mọi sự kiện', async () => {
  const gia = taoBlockchainGia({ gioiHanKhoi: 10, khoiMoiNhat: 1234, khoiCoSuKien: [100, 105, 555, 999, 1234] });
  const nhatKy = new NhatKySuKien(gia.blockchain);
  await nhatKy.capNhat();
  assert.deepStrictEqual(nhatKy.danhSach.map((s) => s.khoi), [100, 105, 555, 999, 1234]);
  assert.strictEqual(nhatKy._soKhoiMoiLan, 10);
});

test('RPC rộng rãi: giữ 2000 khối mỗi lần (ít lần hỏi)', async () => {
  const gia = taoBlockchainGia({ gioiHanKhoi: 10_000, khoiMoiNhat: 5099, khoiCoSuKien: [200, 5099] });
  const nhatKy = new NhatKySuKien(gia.blockchain);
  await nhatKy.capNhat();
  assert.deepStrictEqual(nhatKy.danhSach.map((s) => s.khoi), [200, 5099]);
  assert.strictEqual(gia.soLanHoi(), 3); // 100-2099, 2100-4099, 4100-5099
});

test('RPC có máy chậm ("beyond current head"): KHÔNG thu nhỏ đoạn, lần sau đọc tiếp đủ', async () => {
  const gia = taoBlockchainGia({ gioiHanKhoi: 10_000, khoiMoiNhat: 500, khoiCoSuKien: [150, 500] });
  let lanDau = true;
  const getLogsGoc = gia.blockchain.provider.getLogs;
  gia.blockchain.provider.getLogs = async (q) => {
    if (lanDau) { lanDau = false; const e = new Error('could not coalesce error'); e.error = { code: -32602, message: 'block range extends beyond current head block' }; throw e; }
    return getLogsGoc(q);
  };
  const nhatKy = new NhatKySuKien(gia.blockchain);
  await nhatKy.capNhat();
  assert.strictEqual(nhatKy.danhSach.length, 0);
  assert.strictEqual(nhatKy._soKhoiMoiLan, NhatKySuKien.SO_KHOI_TOI_DA);
  nhatKy._lanCapNhatCuoi = 0; // bỏ thời gian nghỉ giữa 2 lần
  await nhatKy.capNhat();
  assert.deepStrictEqual(nhatKy.danhSach.map((s) => s.khoi), [150, 500]);
});
