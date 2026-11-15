// Kiểm thử hợp đồng VeXeNFT theo đúng 6 chức năng của đề bài.
// Chạy trên blockchain giả lập Ganache NGAY TRONG TIẾN TRÌNH (không cần mở terminal khác):
//   npm test
import { expect } from "chai";
import ganache from "ganache";
import { ethers } from "ethers";
import fs from "node:fs";

const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/VeXeNFT.sol/VeXeNFT.json", import.meta.url)));

const GIO = 3600;
const GIA_VE = ethers.parseEther("0.0024"); // ~240.000đ theo tỷ giá demo
const MA_CHUYEN = "CX001_2026-12-01";

// ---------- Hàm hỗ trợ ----------
let provider;
const giaoDienHopDong = new ethers.Interface(artifact.abi); // dùng để đọc lỗi dạng "custom error"

async function thoiGianHienTai() {
  return (await provider.getBlock("latest")).timestamp;
}
async function tuaThoiGian(giay) {
  await provider.send("evm_increaseTime", [giay]);
  await provider.send("evm_mine", []);
}
/** Chờ giao dịch bị từ chối (revert) với đúng thông báo lỗi. */
async function phaiBiTuChoi(loiHua, thongBao) {
  try {
    await (await loiHua).wait?.();
  } catch (e) {
    // Ganache trả dữ liệu lỗi ở info.error.data: `reason` (lỗi require) hoặc `result` (custom error như của Ownable)
    const duLieu = e?.info?.error?.data || {};
    let tenLoiTuyBien = "";
    try { tenLoiTuyBien = giaoDienHopDong.parseError(duLieu.result)?.name || ""; } catch { /* không phải custom error */ }
    const noiDung = [e.reason, duLieu.reason, tenLoiTuyBien, e.shortMessage, e.message].join(" | ");
    expect(noiDung).to.contain(thongBao);
    return;
  }
  expect.fail(`Mong đợi lỗi "${thongBao}" nhưng giao dịch lại thành công`);
}
/** Khách ký câu xác nhận chủ vé (giống lúc mở mã QR / in vé trên web). Trả về mã QR { chuKy }. */
async function kyXacNhan(hopDong, nguoiKy, maVe) {
  return { chuKy: await nguoiKy.signMessage(await hopDong.noiDungCanKy(maVe)) };
}

/** Nhân viên quét mã QR -> gọi hợp đồng đánh dấu đã lên xe. */
function soatVe(hopDong, nhanVien, maVe, qr) {
  return hopDong.connect(nhanVien).danhDauDaSuDung(maVe, qr.chuKy);
}

/** Sơ đồ ghế dùng trong test: 34 chỗ = A01..A17 + B01..B17; số khác = A01..A<n>. */
const MA_SO_DO = "XE_TEST";
function taoSoDo(soGhe) {
  const ghe = (kyHieu, n) => Array.from({ length: n }, (_, i) => `${kyHieu}${String(i + 1).padStart(2, "0")}`);
  return soGhe === 34 ? [...ghe("A", 17), ...ghe("B", 17)] : ghe("A", soGhe);
}

/** Số dư mới nhất của một địa chỉ (gọi thẳng RPC, không qua bộ nhớ đệm của ethers). */
async function soDu(diaChi) {
  return BigInt(await provider.send("eth_getBalance", [diaChi, "latest"]));
}

// Cụm từ khôi phục MẶC ĐỊNH, công khai của Hardhat -> 6 ví giống hệt khi chạy `npx hardhat node`
const CUM_TU_HARDHAT = "test test test test test test test test test test test junk";

/** Mỗi test bắt đầu với một blockchain MỚI TINH và một hợp đồng mới. */
async function chuanBi({ soGhe = 34, gioChaySau = 48 * GIO } = {}) {
  provider = new ethers.BrowserProvider(
    ganache.provider({
      logging: { quiet: true },
      chain: { chainId: 31337, hardfork: "shanghai" },
      wallet: { mnemonic: CUM_TU_HARDHAT, totalAccounts: 6 },
    }),
    undefined,
    { cacheTimeout: -1 } // tắt bộ nhớ đệm để luôn đọc dữ liệu mới nhất
  );
  // Ví tự ký giao dịch & chữ ký (giống MetaMask), không nhờ node ký hộ
  const [nhaXe, nhanVien, an, binh, cuong, keLa] = [0, 1, 2, 3, 4, 5].map((i) =>
    ethers.HDNodeWallet.fromPhrase(CUM_TU_HARDHAT, undefined, `m/44'/60'/0'/0/${i}`).connect(provider)
  );

  const nhaMay = new ethers.ContractFactory(artifact.abi, artifact.bytecode, nhaXe);
  const hopDong = await nhaMay.deploy("http://localhost:5050/api/metadata/");
  await hopDong.waitForDeployment();

  const gioKhoiHanh = (await thoiGianHienTai()) + gioChaySau;
  await (await hopDong.dangKySoDoGhe(MA_SO_DO, taoSoDo(soGhe))).wait();
  await (await hopDong.moBanChuyen(MA_CHUYEN, GIA_VE, gioKhoiHanh, MA_SO_DO)).wait();
  await (await hopDong.datNhanVienSoatVe(nhanVien.address, true)).wait();

  /** `ai` mua ghế `maGhe`, trả về mã vé (tokenId) */
  const muaVe = async (ai, maGhe = "A01") => {
    const tx = await hopDong.connect(ai).muaVe(MA_CHUYEN, maGhe, { value: GIA_VE });
    const bienNhan = await tx.wait();
    const suKien = bienNhan.logs.map((l) => hopDong.interface.parseLog(l)).find((l) => l && l.name === "DaMuaVe");
    return suKien.args.maVe;
  };

  return { hopDong, nhaXe, nhanVien, an, binh, cuong, keLa, gioKhoiHanh, muaVe };
}

// ===================================================================

describe("VeXeNFT — vé xe NFT CARBOOK", function () {
  this.timeout(60000);

  describe("Nhà xe mở bán chuyến", () => {
    it("chỉ chủ hợp đồng được mở bán", async () => {
      const { hopDong, keLa, gioKhoiHanh } = await chuanBi();
      await phaiBiTuChoi(hopDong.connect(keLa).moBanChuyen("CX999_2026-12-01", GIA_VE, gioKhoiHanh, MA_SO_DO), "OwnableUnauthorizedAccount");
      await phaiBiTuChoi(hopDong.connect(keLa).dangKySoDoGhe("XE_LA", ["A01"]), "OwnableUnauthorizedAccount");
    });

    it("mở bán nhiều chuyến trong một giao dịch; số ghế lấy theo sơ đồ", async () => {
      const { hopDong, gioKhoiHanh } = await chuanBi();
      await (await hopDong.moBanNhieuChuyen(["CX002_2026-12-01", "CX003_2026-12-01"], [GIA_VE, GIA_VE], [gioKhoiHanh, gioKhoiHanh], [MA_SO_DO, MA_SO_DO])).wait();
      expect((await hopDong.layChuyen("CX003_2026-12-01")).soGhe).to.equal(34n);
    });

    it("sơ đồ ghế: chưa đăng ký thì không mở bán được; không đăng ký trùng mã, trùng ghế", async () => {
      const { hopDong, gioKhoiHanh } = await chuanBi();
      await phaiBiTuChoi(hopDong.moBanChuyen("CX004_2026-12-01", GIA_VE, gioKhoiHanh, "XE_CHUA_CO"), "So do ghe chua dang ky");
      await phaiBiTuChoi(hopDong.dangKySoDoGhe(MA_SO_DO, ["A01"]), "So do ghe da dang ky");
      await phaiBiTuChoi(hopDong.dangKySoDoGhe("XE_MOI", ["A01", "A01"]), "Trung ma ghe trong so do");
      expect(await hopDong.soGheCuaSoDo(await hopDong.layIdChuoi(MA_SO_DO))).to.equal(34n);
    });
  });

  describe("Chức năng 2 — mua vé bằng MetaMask, NFT vào ví khách", () => {
    it("mua thành công: NFT thuộc về khách, tiền nằm trong hợp đồng", async () => {
      const { hopDong, an, muaVe } = await chuanBi();
      const maVe = await muaVe(an, "A01");
      expect(maVe).to.equal(1n);
      expect(await hopDong.ownerOf(maVe)).to.equal(an.address);
      const [ve] = await hopDong.layVe(maVe);
      expect(ve.maGhe).to.equal("A01");
      expect(ve.trangThai).to.equal(0n); // HieuLuc
      expect(await soDu(await hopDong.getAddress())).to.equal(GIA_VE);
      expect(await hopDong.tokenURI(maVe)).to.equal("http://localhost:5050/api/metadata/1");
    });

    it("gửi sai số tiền bị từ chối", async () => {
      const { hopDong, an } = await chuanBi();
      await phaiBiTuChoi(hopDong.connect(an).muaVe(MA_CHUYEN, "A01", { value: GIA_VE - 1n }), "So tien gui khong dung gia ve");
    });

    it("chuyến chưa mở bán bị từ chối", async () => {
      const { hopDong, an } = await chuanBi();
      // chuyến chưa mở bán có giá 0 -> gửi 0 ETH để vượt qua bước kiểm tra tiền, chạm tới bước kiểm tra mở bán
      await phaiBiTuChoi(hopDong.connect(an).muaVe("CX404_2026-12-01", "A01", { value: 0n }), "Chuyen chua mo ban");
    });

    it("mua nhiều ghế trong một giao dịch", async () => {
      const { hopDong, an } = await chuanBi();
      await (await hopDong.connect(an).muaNhieuVe(MA_CHUYEN, ["A01", "A02", "A03"], { value: GIA_VE * 3n })).wait();
      const [danhSachMa] = await hopDong.layVeCuaChu(an.address);
      expect(danhSachMa.length).to.equal(3);
    });
  });

  describe("Chức năng 3 — hợp đồng khóa ghế, không bán trùng", () => {
    it("ghế đã bán thì người khác không mua được", async () => {
      const { hopDong, binh, an, muaVe } = await chuanBi();
      await muaVe(an, "A01");
      await phaiBiTuChoi(hopDong.connect(binh).muaVe(MA_CHUYEN, "A01", { value: GIA_VE }), "Ghe da co nguoi mua");
    });

    it("chỉ bán ghế CÓ THẬT trên xe (gọi thẳng hợp đồng mua ghế lạ bị từ chối)", async () => {
      const { hopDong, an, binh, muaVe } = await chuanBi({ soGhe: 2 }); // xe 2 ghế: A01, A02
      await muaVe(an, "A01");
      await muaVe(an, "A02");
      await phaiBiTuChoi(hopDong.connect(binh).muaVe(MA_CHUYEN, "A03", { value: GIA_VE }), "Ghe khong co tren xe nay");
      await phaiBiTuChoi(hopDong.connect(binh).muaVe(MA_CHUYEN, "Z99", { value: GIA_VE }), "Ghe khong co tren xe nay");
      await phaiBiTuChoi(hopDong.connect(binh).muaVe(MA_CHUYEN, "", { value: GIA_VE }), "Ghe khong co tren xe nay");
      expect(await hopDong.gheCoTrenXe(MA_CHUYEN, "A02")).to.equal(true);
    });

    it("tra cứu trạng thái nhiều ghế trong một lần gọi", async () => {
      const { hopDong, an, muaVe } = await chuanBi();
      await muaVe(an, "B05");
      const trangThai = await hopDong.layTrangThaiGhe(MA_CHUYEN, ["A01", "B05"]);
      expect(trangThai.map(Number)).to.deep.equal([0, 1]);
    });
  });

  describe("Chức năng 4 — soát vé bằng QR", () => {
    it("chữ ký đúng của chủ vé -> đánh dấu đã sử dụng", async () => {
      const { hopDong, nhanVien, an, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      const qr = await kyXacNhan(hopDong, an, maVe);
      await (await soatVe(hopDong, nhanVien, maVe, qr)).wait();
      expect((await hopDong.layVe(maVe))[0].trangThai).to.equal(1n); // DaSuDung
      await phaiBiTuChoi(soatVe(hopDong, nhanVien, maVe, qr), "Ve khong con hieu luc");
    });

    it("QR do người KHÁC ký (không phải chủ vé) bị từ chối", async () => {
      const { hopDong, nhanVien, an, keLa, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      const qrGia = await kyXacNhan(hopDong, keLa, maVe);
      await phaiBiTuChoi(soatVe(hopDong, nhanVien, maVe, qrGia), "Chu ky khong phai cua chu ve");
    });

    it("người không phải nhân viên không soát vé được", async () => {
      const { hopDong, an, keLa, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await phaiBiTuChoi(soatVe(hopDong, keLa, maVe, await kyXacNhan(hopDong, an, maVe)), "Khong co quyen soat ve");
    });

    it("VÉ IN / QR KHÔNG HẾT HẠN: in từ 2 ngày trước vẫn lên xe được, nhưng chỉ MỘT lần", async () => {
      const { hopDong, nhanVien, an, muaVe } = await chuanBi({ gioChaySau: 48 * GIO });
      const maVe = await muaVe(an);
      const veIn = await kyXacNhan(hopDong, an, maVe);
      await tuaThoiGian(47 * GIO);
      await (await soatVe(hopDong, nhanVien, maVe, veIn)).wait();
      await phaiBiTuChoi(soatVe(hopDong, nhanVien, maVe, veIn), "Ve khong con hieu luc"); // bản photo không dùng lần 2 được
    });

    it("vé in của người đã BÁN vé thì mất hiệu lực, người mua lên xe bằng QR của mình", async () => {
      const { hopDong, nhanVien, an, binh, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      const veInCuaAn = await kyXacNhan(hopDong, an, maVe);
      await (await hopDong.connect(an).raoBanVe(maVe, GIA_VE)).wait();
      await (await hopDong.connect(binh).muaLaiVe(maVe, { value: GIA_VE })).wait();
      await phaiBiTuChoi(soatVe(hopDong, nhanVien, maVe, veInCuaAn), "Chu ky khong phai cua chu ve");
      await (await soatVe(hopDong, nhanVien, maVe, await kyXacNhan(hopDong, binh, maVe))).wait();
    });
  });

  describe("Chức năng 5 — hủy vé, hoàn tiền theo thời gian", () => {
    it("hủy trước >= 24 giờ: hoàn 90%, NFT bị đốt, ghế mở lại", async () => {
      const { hopDong, an, binh, muaVe } = await chuanBi({ gioChaySau: 48 * GIO });
      const maVe = await muaVe(an, "A01");
      const [phanTram, tienHoan] = await hopDong.tinhTienHoan(maVe);
      expect(phanTram).to.equal(90n);
      expect(tienHoan).to.equal((GIA_VE * 90n) / 100n);

      await (await hopDong.connect(an).huyVe(maVe)).wait();
      expect((await hopDong.layVe(maVe))[0].trangThai).to.equal(2n); // DaHuy
      await phaiBiTuChoi(hopDong.ownerOf(maVe), "ERC721NonexistentToken");
      expect(await hopDong.doanhThuChoRut()).to.equal(GIA_VE - tienHoan); // 10% phí hủy cho nhà xe
      await muaVe(binh, "A01"); // ghế đã được mở lại
    });

    it("hủy trong khoảng 2–24 giờ: hoàn 50%", async () => {
      const { hopDong, an, muaVe } = await chuanBi({ gioChaySau: 10 * GIO });
      const maVe = await muaVe(an);
      expect((await hopDong.tinhTienHoan(maVe))[0]).to.equal(50n);
    });

    it("dưới 2 giờ trước giờ chạy: không được hủy", async () => {
      const { hopDong, an, muaVe } = await chuanBi({ gioChaySau: 3 * GIO });
      const maVe = await muaVe(an);
      await tuaThoiGian(1.5 * GIO);
      await phaiBiTuChoi(hopDong.connect(an).huyVe(maVe), "Qua sat gio chay, khong the huy ve");
    });

    it("người khác không hủy được vé của mình", async () => {
      const { hopDong, an, keLa, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await phaiBiTuChoi(hopDong.connect(keLa).huyVe(maVe), "Ban khong phai chu ve");
    });
  });

  describe("Chức năng 6 — chuyển nhượng, bán lại có giá trần", () => {
    it("chuyển NFT kiểu thông thường (transferFrom) bị chặn", async () => {
      const { hopDong, an, binh, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await phaiBiTuChoi(hopDong.connect(an).transferFrom(an.address, binh.address, maVe), "Chi chuyen nhuong qua");
    });

    it("tặng vé qua chuyenNhuongVe; QR cũ của người tặng mất hiệu lực", async () => {
      const { hopDong, nhanVien, an, binh, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      const qrCuCuaAn = await kyXacNhan(hopDong, an, maVe);
      await (await hopDong.connect(an).chuyenNhuongVe(maVe, binh.address)).wait();
      expect(await hopDong.ownerOf(maVe)).to.equal(binh.address);
      await phaiBiTuChoi(soatVe(hopDong, nhanVien, maVe, qrCuCuaAn), "Chu ky khong phai cua chu ve");
    });

    it("rao bán vượt 110% giá gốc bị từ chối", async () => {
      const { hopDong, an, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await phaiBiTuChoi(hopDong.connect(an).raoBanVe(maVe, (GIA_VE * 111n) / 100n), "Gia vuot gia tran 110%");
    });

    it("bán lại: người mua trả tiền, người bán nhận tiền, NFT đổi chủ", async () => {
      const { hopDong, an, binh, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      const giaRao = (GIA_VE * 110n) / 100n;
      await (await hopDong.connect(an).raoBanVe(maVe, giaRao)).wait();
      expect((await hopDong.layDanhSachRaoBan()).map(Number)).to.deep.equal([1]);

      const soDuTruoc = await soDu(an.address);
      await (await hopDong.connect(binh).muaLaiVe(maVe, { value: giaRao })).wait();
      expect(await hopDong.ownerOf(maVe)).to.equal(binh.address);
      expect((await soDu(an.address)) - soDuTruoc).to.equal(giaRao);
      expect((await hopDong.layDanhSachRaoBan()).length).to.equal(0);
    });

    it("còn dưới 2 giờ trước giờ chạy thì không chuyển nhượng được", async () => {
      const { hopDong, an, binh, muaVe } = await chuanBi({ gioChaySau: 3 * GIO });
      const maVe = await muaVe(an);
      await tuaThoiGian(1.5 * GIO);
      await phaiBiTuChoi(hopDong.connect(an).chuyenNhuongVe(maVe, binh.address), "Ve khong the chuyen nhuong");
    });
  });

  describe("Doanh thu nhà xe", () => {
    it("vé đã soát -> nhà xe rút được tiền; người khác không rút được", async () => {
      const { hopDong, nhaXe, nhanVien, an, keLa, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await (await soatVe(hopDong, nhanVien, maVe, await kyXacNhan(hopDong, an, maVe))).wait();
      expect(await hopDong.doanhThuChoRut()).to.equal(GIA_VE);
      await phaiBiTuChoi(hopDong.connect(keLa).rutDoanhThu(keLa.address), "OwnableUnauthorizedAccount");
      await (await hopDong.connect(nhaXe).rutDoanhThu(nhaXe.address)).wait();
      expect(await hopDong.doanhThuChoRut()).to.equal(0n);
    });

    it("vé khách không đi: sau giờ chạy nhà xe chốt NHIỀU vé một lần; không chốt lại được", async () => {
      const { hopDong, an, binh, keLa, muaVe } = await chuanBi({ gioChaySau: 3 * GIO });
      const ve1 = await muaVe(an, "A01");
      const ve2 = await muaVe(binh, "A02");
      await phaiBiTuChoi(hopDong.chotVeKhongDi([ve1]), "Chuyen chua chay");
      await tuaThoiGian(4 * GIO);
      await phaiBiTuChoi(hopDong.connect(keLa).chotVeKhongDi([ve1]), "OwnableUnauthorizedAccount");
      await (await hopDong.chotVeKhongDi([ve1, ve2])).wait();
      expect(await hopDong.doanhThuChoRut()).to.equal(GIA_VE * 2n);
      expect(await hopDong.daTinhDoanhThu(ve1)).to.equal(true);
      await phaiBiTuChoi(hopDong.chotVeKhongDi([ve1]), "Ve da duoc chot roi"); // không cộng tiền hai lần
    });
  });

  // ================= TÌNH HUỐNG KHÓ: kiểm tra tính hợp lý của luật =================
  describe("Tình huống khó", () => {
    it("CÂN ĐỐI TIỀN: nhà xe rút hết doanh thu xong, hợp đồng vẫn đủ tiền hoàn vé còn lại", async () => {
      const { hopDong, nhaXe, nhanVien, an, binh, cuong, muaVe } = await chuanBi({ gioChaySau: 48 * GIO });
      const ve1 = await muaVe(an, "A01");
      const ve2 = await muaVe(binh, "A02");
      const ve3 = await muaVe(cuong, "A03");
      await (await soatVe(hopDong, nhanVien, ve1, await kyXacNhan(hopDong, an, ve1))).wait(); // vé 1 đi xe
      await (await hopDong.connect(binh).huyVe(ve2)).wait();                                                 // vé 2 hủy (90%)
      await (await hopDong.rutDoanhThu(nhaXe.address)).wait();                                                // nhà xe rút sạch

      const diaChiHopDong = await hopDong.getAddress();
      expect(await soDu(diaChiHopDong)).to.equal(GIA_VE); // chỉ còn đúng tiền của vé 3
      await (await hopDong.connect(cuong).huyVe(ve3)).wait(); // vẫn hoàn được
      expect(await soDu(diaChiHopDong)).to.equal(await hopDong.doanhThuChoRut()); // còn lại = phí hủy vé 3
    });

    it("mua 2 lần cùng một ghế trong MỘT giao dịch -> cả giao dịch bị hủy, không vé nào được phát hành", async () => {
      const { hopDong, an } = await chuanBi();
      await phaiBiTuChoi(hopDong.connect(an).muaNhieuVe(MA_CHUYEN, ["A01", "A01"], { value: GIA_VE * 2n }), "Ghe da co nguoi mua");
      expect(await hopDong.tongSoVeDaPhatHanh()).to.equal(0n);
      expect(await soDu(await hopDong.getAddress())).to.equal(0n); // tiền được trả lại nguyên vẹn
    });

    it("chuyến đã khởi hành thì không mua được nữa", async () => {
      const { hopDong, an } = await chuanBi({ gioChaySau: 1 * GIO });
      await tuaThoiGian(2 * GIO);
      await phaiBiTuChoi(hopDong.connect(an).muaVe(MA_CHUYEN, "A01", { value: GIA_VE }), "Chuyen da khoi hanh");
    });

    it("sau khi BÁN LẠI: QR của người bán bị từ chối, QR của người mua được chấp nhận", async () => {
      const { hopDong, nhanVien, an, binh, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      const qrNguoiBan = await kyXacNhan(hopDong, an, maVe); // người bán chụp sẵn QR trước khi bán
      await (await hopDong.connect(an).raoBanVe(maVe, GIA_VE)).wait();
      await (await hopDong.connect(binh).muaLaiVe(maVe, { value: GIA_VE })).wait();

      await phaiBiTuChoi(soatVe(hopDong, nhanVien, maVe, qrNguoiBan), "Chu ky khong phai cua chu ve");
      await (await soatVe(hopDong, nhanVien, maVe, await kyXacNhan(hopDong, binh, maVe))).wait();
    });

    it("mua lại: trả thiếu tiền, mua vé không rao, tự mua vé của mình đều bị từ chối", async () => {
      const { hopDong, an, binh, muaVe } = await chuanBi();
      const ve1 = await muaVe(an, "A01");
      const ve2 = await muaVe(an, "A02");
      await (await hopDong.connect(an).raoBanVe(ve1, GIA_VE)).wait();
      await phaiBiTuChoi(hopDong.connect(binh).muaLaiVe(ve1, { value: GIA_VE - 1n }), "So tien gui khong dung gia rao");
      await phaiBiTuChoi(hopDong.connect(binh).muaLaiVe(ve2, { value: GIA_VE }), "Ve khong dang rao ban");
      await phaiBiTuChoi(hopDong.connect(an).muaLaiVe(ve1, { value: GIA_VE }), "Khong the tu mua ve cua minh");
    });

    it("vé đang rao bán: không tặng được; hủy vé thì tin rao tự biến mất khỏi chợ", async () => {
      const { hopDong, an, binh, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await (await hopDong.connect(an).raoBanVe(maVe, GIA_VE)).wait();
      await phaiBiTuChoi(hopDong.connect(an).chuyenNhuongVe(maVe, binh.address), "Hay huy rao ban truoc");
      await (await hopDong.connect(an).huyVe(maVe)).wait();
      expect((await hopDong.layDanhSachRaoBan()).length).to.equal(0);
      await phaiBiTuChoi(hopDong.connect(binh).muaLaiVe(maVe, { value: GIA_VE }), "Ve khong dang rao ban");
    });

    it("vé đã soát: không hủy, không rao bán, không chuyển nhượng được nữa", async () => {
      const { hopDong, nhanVien, an, binh, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await (await soatVe(hopDong, nhanVien, maVe, await kyXacNhan(hopDong, an, maVe))).wait();
      await phaiBiTuChoi(hopDong.connect(an).huyVe(maVe), "Qua sat gio chay, khong the huy ve");
      await phaiBiTuChoi(hopDong.connect(an).raoBanVe(maVe, GIA_VE), "Ve khong the chuyen nhuong");
      await phaiBiTuChoi(hopDong.connect(an).chuyenNhuongVe(maVe, binh.address), "Ve khong the chuyen nhuong");
    });

    it("vé đã hủy: không soát được, không hủy lần hai để lấy tiền", async () => {
      const { hopDong, nhanVien, an, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      const qr = await kyXacNhan(hopDong, an, maVe);
      await (await hopDong.connect(an).huyVe(maVe)).wait();
      await phaiBiTuChoi(hopDong.connect(an).huyVe(maVe), "Ban khong phai chu ve");
      await phaiBiTuChoi(soatVe(hopDong, nhanVien, maVe, qr), "Ve khong ton tai");
    });

    it("nhân viên bị thu quyền thì không soát vé được nữa", async () => {
      const { hopDong, nhanVien, an, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await (await hopDong.datNhanVienSoatVe(nhanVien.address, false)).wait();
      await phaiBiTuChoi(soatVe(hopDong, nhanVien, maVe, await kyXacNhan(hopDong, an, maVe)), "Khong co quyen soat ve");
    });

    it("nhà xe đổi giá chuyến: vé đã bán giữ nguyên giá cũ, hoàn tiền theo giá cũ", async () => {
      const { hopDong, an, gioKhoiHanh, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await (await hopDong.moBanChuyen(MA_CHUYEN, GIA_VE * 2n, gioKhoiHanh, MA_SO_DO)).wait();
      expect((await hopDong.layVe(maVe))[0].giaGoc).to.equal(GIA_VE);
      expect((await hopDong.tinhTienHoan(maVe))[1]).to.equal((GIA_VE * 90n) / 100n);
    });

    it("tắt bán chuyến: không mua mới được nhưng vé đã bán vẫn hiệu lực", async () => {
      const { hopDong, an, binh, muaVe } = await chuanBi();
      const maVe = await muaVe(an);
      await (await hopDong.dongBanChuyen(MA_CHUYEN)).wait();
      await phaiBiTuChoi(hopDong.connect(binh).muaVe(MA_CHUYEN, "A02", { value: GIA_VE }), "Chuyen chua mo ban");
      expect((await hopDong.layVe(maVe))[0].trangThai).to.equal(0n);
    });
  });
});
