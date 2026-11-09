// @ts-nocheck
import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

const HOUR = 3600;

async function nowTs() {
  return (await ethers.provider.getBlock("latest")).timestamp;
}
async function advance(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}
async function revertsWith(p: Promise<any>, msg: string) {
  try {
    await p;
  } catch (e: any) {
    expect(String(e.message)).to.contain(msg);
    return;
  }
  expect.fail(`Mong đợi revert "${msg}" nhưng giao dịch thành công`);
}

async function deployAll() {
  const [owner, relayer, alice, bob, carrier, attacker] = await ethers.getSigners();
  const nft = await ethers.deployContract("TicketNFT", [carrier.address, 500]); // royalty 5%
  const market = await ethers.deployContract("TicketMarket", [await nft.getAddress()]);
  await nft.setOperator(relayer.address, true);
  await nft.setOperator(await market.getAddress(), true);
  await market.setOperator(relayer.address, true);

  const departure = (await nowTs()) + 24 * HOUR;
  const mint = (to: string, booking = "DV001", price = 200000n) =>
    nft.connect(relayer).mintTicket(to, booking, "CX001", "2026-11-10", "A01", departure, price);

  return { owner, relayer, alice, bob, carrier, attacker, nft, market, departure, mint };
}

describe("Vé NFT CARBOOK", () => {
  describe("TicketNFT — vòng đời vé", () => {
    it("operator mint được, token mang đúng dữ liệu chuyến", async () => {
      const { nft, alice, mint } = await deployAll();
      await mint(alice.address);
      expect(await nft.ownerOf(1n)).to.equal(alice.address);
      const t = await nft.getTicket(1n);
      expect(t.maDatVe).to.equal("DV001");
      expect(t.maGhe).to.equal("A01");
      expect(t.facePrice).to.equal(200000n);
      expect(t.used).to.equal(false);
    });

    it("người lạ không mint được", async () => {
      const { nft, attacker, alice, departure } = await deployAll();
      await revertsWith(
        nft.connect(attacker).mintTicket(alice.address, "DV9", "CX1", "2026-11-10", "A1", departure, 1000n),
        "Only operator"
      );
    });

    it("một maDatVe chỉ mint một lần (chống vé trùng)", async () => {
      const { alice, mint } = await deployAll();
      await mint(alice.address, "DV001");
      await revertsWith(mint(alice.address, "DV001"), "Booking already minted");
    });

    it("không mint cho chuyến đã khởi hành", async () => {
      const { nft, relayer, alice } = await deployAll();
      const past = (await nowTs()) - 10;
      await revertsWith(
        nft.connect(relayer).mintTicket(alice.address, "DV2", "CX1", "2026-11-10", "A1", past, 1000n),
        "Trip already departed"
      );
    });

    it("burnTicket (hoàn vé) đốt NFT và cho phép mint lại cùng maDatVe", async () => {
      const { nft, relayer, alice, mint } = await deployAll();
      await mint(alice.address, "DV001");
      await nft.connect(relayer).burnTicket(1n);
      await revertsWith(nft.ownerOf(1n), "ERC721NonexistentToken");
      await mint(alice.address, "DV001");
      expect(await nft.ownerOf(2n)).to.equal(alice.address);
    });

    it("markUsed (check-in) chỉ một lần và vé đã dùng không đốt được", async () => {
      const { nft, relayer, alice, mint } = await deployAll();
      await mint(alice.address);
      await nft.connect(relayer).markUsed(1n);
      await revertsWith(nft.connect(relayer).markUsed(1n), "Ticket already used");
      await revertsWith(nft.connect(relayer).burnTicket(1n), "Ticket already used");
      expect((await nft.getTicket(1n)).used).to.equal(true);
    });
  });

  describe("TicketNFT — chống bán chui", () => {
    it("chủ vé không tự chuyển được ngoài sàn", async () => {
      const { nft, alice, bob, mint } = await deployAll();
      await mint(alice.address);
      await revertsWith(nft.connect(alice).transferFrom(alice.address, bob.address, 1n), "Transfers only via market");
    });

    it("người lạ không tự chuyển vé của người khác", async () => {
      const { nft, alice, attacker, mint } = await deployAll();
      await mint(alice.address);
      await revertsWith(nft.connect(attacker).transferFrom(alice.address, attacker.address, 1n), "Transfers only via market");
    });

    it("hỗ trợ ERC-2981 (royalty 5% về nhà xe)", async () => {
      const { nft, carrier, mint, alice } = await deployAll();
      await mint(alice.address);
      const [receiver, amount] = await nft.royaltyInfo(1n, 200000n);
      expect(receiver).to.equal(carrier.address);
      expect(amount).to.equal(10000n);
    });
  });

  describe("TicketMarket — bán lại có giá trần", () => {
    it("rao bán trong giá trần và mua thành công, NFT chuyển chủ + phát Sold", async () => {
      const { nft, market, relayer, alice, bob, mint } = await deployAll();
      await mint(alice.address);
      await market.connect(relayer).list(1n, alice.address, 220000n); // đúng 110%
      await market.connect(relayer).buy(1n, bob.address);
      expect(await nft.ownerOf(1n)).to.equal(bob.address);
      expect((await market.listings(1n)).seller).to.equal(ethers.ZeroAddress);
    });

    it("giá vượt 110% giá gốc bị từ chối (chống phe vé)", async () => {
      const { market, relayer, alice, mint } = await deployAll();
      await mint(alice.address);
      await revertsWith(market.connect(relayer).list(1n, alice.address, 220001n), "Price above cap");
    });

    it("chỉ chủ vé mới rao bán được", async () => {
      const { market, relayer, alice, bob, mint } = await deployAll();
      await mint(alice.address);
      await revertsWith(market.connect(relayer).list(1n, bob.address, 100000n), "Not ticket owner");
    });

    it("không rao bán hai lần, huỷ tin thì rao lại được", async () => {
      const { market, relayer, alice, mint } = await deployAll();
      await mint(alice.address);
      await market.connect(relayer).list(1n, alice.address, 150000n);
      await revertsWith(market.connect(relayer).list(1n, alice.address, 150000n), "Already listed");
      await market.connect(relayer).cancel(1n, alice.address);
      await market.connect(relayer).list(1n, alice.address, 160000n);
    });

    it("chỉ người rao mới huỷ được tin", async () => {
      const { market, relayer, alice, bob, mint } = await deployAll();
      await mint(alice.address);
      await market.connect(relayer).list(1n, alice.address, 150000n);
      await revertsWith(market.connect(relayer).cancel(1n, bob.address), "Not your listing");
    });

    it("người lạ không gọi trực tiếp list/buy được", async () => {
      const { market, attacker, alice, mint } = await deployAll();
      await mint(alice.address);
      await revertsWith(market.connect(attacker).list(1n, alice.address, 1000n), "Only operator");
      await revertsWith(market.connect(attacker).buy(1n, attacker.address), "Only operator");
    });

    it("không tự mua vé của chính mình", async () => {
      const { market, relayer, alice, mint } = await deployAll();
      await mint(alice.address);
      await market.connect(relayer).list(1n, alice.address, 100000n);
      await revertsWith(market.connect(relayer).buy(1n, alice.address), "Invalid buyer");
    });

    it("vé đã check-in không rao bán / không bán được", async () => {
      const { nft, market, relayer, alice, mint } = await deployAll();
      await mint(alice.address);
      await nft.connect(relayer).markUsed(1n);
      await revertsWith(market.connect(relayer).list(1n, alice.address, 100000n), "Ticket not transferable");
    });

    it("sát giờ xe chạy (dưới 2 giờ) thì khoá chuyển nhượng, tin đang rao cũng không mua được", async () => {
      const { market, relayer, alice, bob, mint } = await deployAll();
      await mint(alice.address);
      await market.connect(relayer).list(1n, alice.address, 100000n);
      await advance(23 * HOUR); // còn ~1 giờ
      await revertsWith(market.connect(relayer).buy(1n, bob.address), "Ticket not transferable");
    });

    it("owner chỉnh được trần giá trong khoảng 100%–200%, ngoài khoảng bị chặn", async () => {
      const { market, relayer, alice, mint } = await deployAll();
      await mint(alice.address);
      await revertsWith(market.setMaxMarkup(9999), "Markup 100%-200%");
      await revertsWith(market.setMaxMarkup(20001), "Markup 100%-200%");
      await market.setMaxMarkup(10000); // không cho tăng giá
      await revertsWith(market.connect(relayer).list(1n, alice.address, 200001n), "Price above cap");
      await market.connect(relayer).list(1n, alice.address, 200000n);
    });

    it("vé đã hoàn (burn) không còn rao bán", async () => {
      const { nft, market, relayer, alice, mint } = await deployAll();
      await mint(alice.address);
      await nft.connect(relayer).burnTicket(1n);
      await revertsWith(market.connect(relayer).list(1n, alice.address, 100000n), "ERC721NonexistentToken");
    });
  });
});
