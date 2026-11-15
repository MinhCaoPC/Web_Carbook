// Mở bán LÊN BLOCKCHAIN các chuyến trong những ngày đang bán vé (mặc định hôm nay + 3 ngày).
// Chuyến nào đã mở rồi thì bỏ qua -> chạy lại nhiều lần cũng được.
//
//   npm run mo-ban-chuyen            -> mạng ảo
//   npm run mo-ban-chuyen:sepolia    -> Sepolia
//
// Ví ký giao dịch phải là CHỦ HỢP ĐỒNG (nhà xe):
//   - Mạng ảo: tự dùng ví #0 công khai của Hardhat/Ganache.
//   - Sepolia: dùng KHOA_CHU_HOP_DONG trong backend/.env; bỏ trống thì lấy SEPOLIA_PRIVATE_KEY trong blockchain/.env
//     (chính ví đã triển khai hợp đồng). Hoặc mở bán bằng trang Nhà xe trên web + MetaMask.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { ethers } = require('ethers');
const { CAU_HINH } = require('../src/cau-hinh');
const { UngDungMayChu } = require('../src/may-chu');

const KHOA_VI_0_MANG_AO = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const SO_CHUYEN_MOI_GIAO_DICH = 20; // chia nhỏ để không vượt giới hạn gas của một khối

/** Khóa ví đã dùng để triển khai hợp đồng lên Sepolia (đọc từ blockchain/.env, không in ra). */
function khoaTrienKhaiSepolia() {
  const file = path.join(CAU_HINH.thuMucBlockchain, '.env');
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)).SEPOLIA_PRIVATE_KEY : null;
}

/** Hỏi lại mỗi 2 giây cho tới khi `dieuKien()` đúng (tối đa 1 phút). */
async function choDenKhi(dieuKien, moTa) {
  for (let lan = 0; lan < 30; lan++) {
    if (await dieuKien()) return;
    if (lan === 0) console.log(`   ⏳ chờ mạng cập nhật ${moTa}...`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Chờ 1 phút vẫn chưa thấy ${moTa} trên chuỗi. Hãy chạy lại lệnh (phần đã xong sẽ được bỏ qua).`);
}

/**
 * Ước tính gas cho một giao dịch rồi cộng dư 20%. Mức gas mỗi mạng mỗi khác (Sepolia đắt hơn mạng ảo nhiều lần)
 * nên KHÔNG đặt cứng. Nếu máy RPC đang chậm làm ước tính lỗi thì thử lại sau 3 giây (tối đa 5 lần).
 */
async function uocTinhGas(hamHopDong, thamSo) {
  for (let lan = 1; ; lan++) {
    try {
      return ((await hamHopDong.estimateGas(...thamSo)) * 12n) / 10n;
    } catch (loi) {
      if (lan >= 5) throw loi;
      console.log(`   ⏳ ước tính gas chưa được (${loi.shortMessage || loi.message}), thử lại sau 3 giây...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

/** Mở bán mọi chuyến còn thiếu của các ngày đang bán vé. Chạy lại bao nhiêu lần cũng được (phần đã xong tự bỏ qua). */
async function moBanTatCa() {
  const ungDung = UngDungMayChu.taoTuCauHinh(CAU_HINH);
  await ungDung.khoDanhMuc.taiDuLieu();

  const khoa = CAU_HINH.mangBlockchain === 'localhost' ? KHOA_VI_0_MANG_AO : process.env.KHOA_CHU_HOP_DONG || khoaTrienKhaiSepolia();
  if (!khoa) throw new Error('Thiếu khóa ví nhà xe: đặt SEPOLIA_PRIVATE_KEY trong blockchain/.env (hoặc KHOA_CHU_HOP_DONG trong backend/.env).');
  console.log(`⛓️  Mạng: ${CAU_HINH.mangBlockchain}`);
  const vi = new ethers.Wallet(khoa, ungDung.blockchain.provider);
  // NonceManager tự đếm số thứ tự giao dịch (nonce) -> gửi liên tiếp nhiều giao dịch không bị trùng nonce
  const hopDong = ungDung.blockchain.hopDong.connect(new ethers.NonceManager(vi));
  const soDoDaDangKy = (maSoDo) => ungDung.blockchain.soDoDaDangKy(maSoDo);

  if ((await ungDung.blockchain.chuHopDong()) !== vi.address.toLowerCase()) {
    throw new Error(`Ví ${vi.address} không phải chủ hợp đồng nên không mở bán được.`);
  }

  for (const ngay of ungDung.dichVuChuyenXe.danhSachNgay()) {
    const { tongSoChuyen, daMoBan, soDoCanDangKy, thamSoHopDong: t } = await ungDung.dichVuChuyenXe.chuyenCanMoBan(ngay);
    console.log(`📅 ${ngay}: ${tongSoChuyen} chuyến, đã mở ${daMoBan}, cần mở ${t.maChuyen.length}`);

    // Bước 1 (chỉ lần đầu): đăng ký sơ đồ ghế lên hợp đồng để hợp đồng biết xe có những ghế nào
    for (const { maSoDo, danhSachGhe } of soDoCanDangKy) {
      if (await soDoDaDangKy(maSoDo)) continue; // lần chạy trước đã đăng ký rồi
      const tx = await hopDong.dangKySoDoGhe(maSoDo, danhSachGhe);
      await tx.wait();
      console.log(`   🪑 đăng ký sơ đồ ghế ${maSoDo} (${danhSachGhe.length} ghế) — giao dịch ${tx.hash}`);
    }
    // Chờ tới khi đọc lại THẤY sơ đồ ghế trên chuỗi rồi mới mở bán
    // (RPC công khai gồm nhiều máy chủ, có máy chậm vài giây so với giao dịch vừa xong)
    for (const maSoDo of new Set(t.maSoDo)) {
      await choDenKhi(() => soDoDaDangKy(maSoDo), `sơ đồ ghế ${maSoDo}`);
    }

    // Bước 2: mở bán chuyến, mỗi giao dịch tối đa 20 chuyến
    for (let i = 0; i < t.maChuyen.length; i += SO_CHUYEN_MOI_GIAO_DICH) {
      const het = i + SO_CHUYEN_MOI_GIAO_DICH;
      const thamSo = [t.maChuyen.slice(i, het), t.giaVe.slice(i, het), t.gioKhoiHanh.slice(i, het), t.maSoDo.slice(i, het)];
      const gasLimit = await uocTinhGas(hopDong.moBanNhieuChuyen, thamSo);
      const tx = await hopDong.moBanNhieuChuyen(...thamSo, { gasLimit });
      await tx.wait();
      console.log(`   ✅ mở ${Math.min(het, t.maChuyen.length) - i} chuyến — giao dịch ${tx.hash}`);
    }
  }
}

// RPC công khai đôi khi báo lỗi nonce tạm thời (giao dịch đã gửi tới 2 máy chủ). Gặp lỗi đó thì tự chạy lại (tối đa 3 lần).
(async () => {
  for (let lan = 1; ; lan++) {
    try {
      await moBanTatCa();
      console.log('🎉 Xong.');
      process.exit(0);
    } catch (loi) {
      const thongBao = loi.shortMessage || loi.message;
      if (lan < 3 && /nonce/i.test(thongBao)) {
        console.log(`   ⚠️  ${thongBao} — chờ 10 giây rồi chạy lại phần còn thiếu (lần ${lan + 1}/3)...`);
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      console.error('❌', thongBao);
      process.exit(1);
    }
  }
})();
