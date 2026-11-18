// KIỂM THỬ TÍCH HỢP toàn hệ thống: API backend thật + hợp đồng thật trên blockchain ảo Ganache (trong tiến trình)
// + kho dữ liệu dạng file tạm (không đụng tới Firebase).
// Mô phỏng đúng luồng trên web: đăng ký -> liên kết ví -> nhà xe mở bán -> khách mua bằng ví -> lưu hành khách
// -> xem vé -> ký QR -> nhân viên kiểm tra QR -> soát vé on-chain.
//
// Cần đã biên dịch hợp đồng: cd ../blockchain && npm run bien-dich
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ethers } = require('ethers');
const { UngDungMayChu } = require('../src/may-chu');
const { KhoLuuTruTep } = require('../src/kho-du-lieu/kho-luu-tru-tep');
const { KhoDanhMuc } = require('../src/kho-du-lieu/kho-danh-muc');
const { KetNoiBlockchain } = require('../src/ket-noi/ket-noi-blockchain');
const { danhSachNgayBanVe } = require('../src/tien-ich/thoi-gian');

const THU_MUC_BLOCKCHAIN = path.join(__dirname, '..', '..', 'blockchain');
const FILE_ABI = path.join(THU_MUC_BLOCKCHAIN, 'artifacts', 'contracts', 'VeXeNFT.sol', 'VeXeNFT.json');
const CUM_TU = 'test test test test test test test test test test test junk';
const TY_GIA = 100_000_000;

let mayChu, goc, provider, viNhaXe, viNhanVien, viKhach, hopDong, thuMucTam;

/** Gọi API của máy chủ thử nghiệm */
async function api(duongDan, { method = 'GET', body, token } = {}) {
  const res = await fetch(goc + duongDan, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const duLieu = await res.json();
  return { ma: res.status, ...duLieu };
}

/** Đăng ký tài khoản + ký liên kết ví, trả token */
async function taoTaiKhoanCoVi(email, vi) {
  const { token } = await api('/api/tai-khoan/dang-ky', { method: 'POST', body: { email, matKhau: '123456', hoTen: email } });
  const { noiDung } = await api(`/api/tai-khoan/noi-dung-lien-ket-vi?diaChi=${vi.address}`, { token });
  const kq = await api('/api/tai-khoan/lien-ket-vi', { method: 'POST', token, body: { diaChi: vi.address, chuKy: await vi.signMessage(noiDung) } });
  assert.equal(kq.thanhCong, true, kq.thongBao);
  return token;
}

before(async () => {
  if (!fs.existsSync(FILE_ABI)) throw new Error('Chưa biên dịch hợp đồng: cd ../blockchain && npm run bien-dich');
  const ganache = require(path.join(THU_MUC_BLOCKCHAIN, 'node_modules', 'ganache'));
  const artifact = JSON.parse(fs.readFileSync(FILE_ABI, 'utf8'));

  // 1) Blockchain ảo + triển khai hợp đồng
  provider = new ethers.BrowserProvider(
    ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { mnemonic: CUM_TU, totalAccounts: 4 } }),
    undefined,
    { cacheTimeout: -1 }
  );
  [viNhaXe, viNhanVien, viKhach] = [0, 1, 2].map((i) => ethers.HDNodeWallet.fromPhrase(CUM_TU, undefined, `m/44'/60'/0'/0/${i}`).connect(provider));
  hopDong = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, viNhaXe).deploy('http://localhost/api/metadata/');
  await hopDong.waitForDeployment();
  await (await hopDong.datNhanVienSoatVe(viNhanVien.address, true)).wait();

  // 2) Danh mục giả: 1 tuyến TP.HCM -> Cần Thơ, 1 chuyến 23:00 mỗi ngày
  thuMucTam = fs.mkdtempSync(path.join(os.tmpdir(), 'carbook-'));
  fs.writeFileSync(path.join(thuMucTam, 'danh-muc.json'), JSON.stringify({
    thoiGianTai: Date.now(),
    loTrinh: [{ ma: 'LT1', tenLoTrinh: 'Sài Gòn - Cần Thơ', diemKhoiHanh: 'TP.HCM', diemKetThuc: 'Cần Thơ', trangThai: 'HoatDong' }],
    chuyenXe: [{ ma: 'CX1', maLoTrinh: 'LT1', maXe: 'XE1', giaVe: 240000, trangThai: 'SapChay', phutKhoiHanh: 23 * 60, soPhutDiChuyen: 240 }],
    xe: [{ ma: 'XE1', bienSoXe: '65B-12345', tenLoaiXe: 'Giường nằm 34', maMauSoDo: null }],
    mauSoDo: [],
  }));

  // 3) Máy chủ thật, nhưng kho = file tạm, blockchain = Ganache
  const khoLuuTru = new KhoLuuTruTep(thuMucTam);
  const cauHinh = { khoaJwt: 'khoa-thu-nghiem', hanJwt: '1h', soNgayBanVe: 4, tyGiaVndMoiEth: TY_GIA, mangBlockchain: 'localhost', cong: 0, noiLuuDuLieu: 'tep' };
  const ungDung = new UngDungMayChu({
    khoLuuTru,
    khoDanhMuc: new KhoDanhMuc(khoLuuTru, { fileDanhMuc: path.join(thuMucTam, 'danh-muc.json'), soGioLamMoi: 24, soChuyenMoiTuyen: 2, chiDocFile: true }),
    blockchain: new KetNoiBlockchain({ provider, diaChi: await hopDong.getAddress(), abi: artifact.abi }),
    cauHinh,
  });
  await ungDung.khoDanhMuc.taiDuLieu();
  mayChu = ungDung.app.listen(0);
  goc = `http://127.0.0.1:${mayChu.address().port}`;
});

after(() => {
  mayChu?.close();
  if (thuMucTam) fs.rmSync(thuMucTam, { recursive: true, force: true });
});

test('luồng đầy đủ: mở bán -> mua -> vé của tôi -> QR -> soát vé', async () => {
  const ngayMai = danhSachNgayBanVe(2)[1];
  const maChuyen = `CX1_${ngayMai}`;

  // Chức năng 1: tìm chuyến (chưa mở bán on-chain)
  const tim = await api(`/api/chuyen-xe/tim?diemDi=TP.HCM&diemDen=Cần Thơ&ngay=${ngayMai}`);
  assert.equal(tim.danhSach.length, 1);
  assert.equal(tim.danhSach[0].trenChuoi.dangMoBan, false);

  // Nhà xe mở bán: backend chuẩn bị tham số, ví nhà xe ký giao dịch (trên web là MetaMask)
  // Lần đầu phải đăng ký sơ đồ ghế lên hợp đồng, rồi mới mở bán (chuyến gắn với mã sơ đồ)
  const { soDoCanDangKy, thamSoHopDong: t } = await api(`/api/chuyen-xe/can-mo-ban?ngay=${ngayMai}`);
  assert.deepEqual(soDoCanDangKy.map((s) => [s.maSoDo, s.danhSachGhe.length]), [['MAC_DINH_34', 34]]);
  for (const sd of soDoCanDangKy) await (await hopDong.dangKySoDoGhe(sd.maSoDo, sd.danhSachGhe)).wait();
  await (await hopDong.moBanNhieuChuyen(t.maChuyen, t.giaVe, t.gioKhoiHanh, t.maSoDo)).wait();
  assert.equal((await api(`/api/chuyen-xe/can-mo-ban?ngay=${ngayMai}`)).soDoCanDangKy.length, 0); // đã đăng ký rồi

  const chiTiet = await api(`/api/chuyen-xe/${maChuyen}`);
  assert.equal(chiTiet.trenChuoi.dangMoBan, true);
  assert.equal(chiTiet.soDoGhe.length, 34);
  assert.equal(chiTiet.trenChuoi.giaVeWei, ethers.parseEther('0.0024').toString());

  // Chức năng 2 + 3: khách mua 2 ghế bằng ví -> NFT vào ví, ghế bị khóa
  const tokenKhach = await taoTaiKhoanCoVi('khach@carbook.vn', viKhach);
  await (await hopDong.connect(viKhach).muaNhieuVe(maChuyen, ['A01', 'A02'], { value: BigInt(chiTiet.trenChuoi.giaVeWei) * 2n })).wait();
  const sauKhiMua = await api(`/api/chuyen-xe/${maChuyen}`);
  assert.deepEqual(sauKhiMua.soDoGhe.filter((g) => g.maVe > 0).map((g) => g.maGhe), ['A01', 'A02']);

  // Lưu thông tin hành khách (off-chain)
  const luu = await api('/api/ve/hanh-khach', { method: 'POST', token: tokenKhach, body: { danhSach: [{ maVe: 1, hoTen: 'Nguyễn Văn An', sdt: '0901' }, { maVe: 2, hoTen: 'Trần Thị Bình' }] } });
  assert.equal(luu.thanhCong, true, luu.thongBao);

  // Vé của tôi = đọc từ blockchain + ghép thông tin off-chain
  const veCuaToi = await api('/api/ve/cua-toi', { token: tokenKhach });
  assert.equal(veCuaToi.danhSach.length, 2);
  assert.equal(veCuaToi.danhSach[0].hanhKhach.hoTen, 'Nguyễn Văn An');
  assert.equal(veCuaToi.danhSach[0].chuyen.diemKetThuc, 'Cần Thơ');

  // Metadata NFT công khai, không có thông tin cá nhân
  const metadata = await api('/api/metadata/1');
  assert.match(metadata.name, /#1/);
  assert.equal(JSON.stringify(metadata).includes('Nguyễn'), false);

  // Chức năng 4: khách ký QR, nhân viên kiểm tra rồi soát vé on-chain
  // Mã QR (trên điện thoại hoặc in giấy) = { maVe, chuKy }, không có hạn — chỉ dùng được một lần
  const qr = { maVe: 1, chuKy: await viKhach.signMessage(await hopDong.noiDungCanKy(1)) };
  const tokenNhanVien = await taoTaiKhoanCoVi('nhanvien@carbook.vn', viNhanVien);
  const kiemTra = await api('/api/ve/soat-ve/kiem-tra', { method: 'POST', token: tokenNhanVien, body: qr });
  assert.equal(kiemTra.hopLe, true, JSON.stringify(kiemTra));
  assert.equal(kiemTra.hanhKhach.hoTen, 'Nguyễn Văn An');

  // Khách KHÔNG có quyền soát vé
  const khongQuyen = await api('/api/ve/soat-ve/kiem-tra', { method: 'POST', token: tokenKhach, body: qr });
  assert.equal(khongQuyen.ma, 403);

  await (await hopDong.connect(viNhanVien).danhDauDaSuDung(1, qr.chuKy)).wait();
  const sauSoat = await api('/api/ve/soat-ve/kiem-tra', { method: 'POST', token: tokenNhanVien, body: qr });
  assert.equal(sauSoat.hopLe, false);
  assert.ok(sauSoat.loi.includes('Vé đã được sử dụng.'));

  // LỊCH SỬ SOÁT VÉ (sự kiện DaSuDungVe): nhân viên thấy lượt mình vừa soát kèm tên hành khách; khách không xem được
  const lichSu = await api('/api/ve/soat-ve/lich-su', { token: tokenNhanVien });
  assert.equal(lichSu.ma, 200);
  assert.equal(lichSu.tongSo, 1);
  assert.equal(lichSu.homNay, 1);
  assert.equal(lichSu.danhSach[0].maVe, 1);
  assert.equal(lichSu.danhSach[0].hanhKhach.hoTen, 'Nguyễn Văn An');
  assert.equal(lichSu.danhSach[0].nhanVien, viNhanVien.address.toLowerCase());
  assert.ok(lichSu.danhSach[0].maGiaoDich);
  assert.equal((await api('/api/ve/soat-ve/lich-su', { token: tokenKhach })).ma, 403);

  // THÔNG BÁO dựng từ sự kiện blockchain: 2 lần "đặt vé thành công" + 1 lần "đã lên xe"
  const tb = await api('/api/thong-bao', { token: tokenKhach });
  const loai = tb.danhSach.map((n) => n.loai);
  assert.equal(loai.filter((l) => l === 'MUA_VE').length, 2, JSON.stringify(loai));
  assert.ok(loai.includes('SOAT_VE'));
  assert.ok(tb.soChuaDoc >= 3);
  assert.match(tb.danhSach.find((n) => n.loai === 'SOAT_VE').noiDung, /TP\.HCM → Cần Thơ/);

  // nhân viên không có vé nên không nhận thông báo của khách
  assert.equal((await api('/api/thong-bao', { token: tokenNhanVien })).danhSach.length, 0);

  // đọc 1 cái, rồi đọc hết, rồi xóa 1 cái
  const motCai = tb.danhSach[0].ma;
  await api('/api/thong-bao/da-doc', { method: 'POST', token: tokenKhach, body: { ma: motCai } });
  assert.equal((await api('/api/thong-bao/so-chua-doc', { token: tokenKhach })).soChuaDoc, tb.soChuaDoc - 1);
  await api('/api/thong-bao/da-doc', { method: 'POST', token: tokenKhach, body: {} });
  assert.equal((await api('/api/thong-bao/so-chua-doc', { token: tokenKhach })).soChuaDoc, 0);
  await api('/api/thong-bao/xoa', { method: 'POST', token: tokenKhach, body: { ma: motCai } });
  assert.equal((await api('/api/thong-bao', { token: tokenKhach })).danhSach.some((n) => n.ma === motCai), false);
});

test('đăng nhập sai mật khẩu và ví đã gắn tài khoản khác bị từ chối', async () => {
  const sai = await api('/api/tai-khoan/dang-nhap', { method: 'POST', body: { email: 'khach@carbook.vn', matKhau: 'sai' } });
  assert.equal(sai.ma, 401);

  const { token } = await api('/api/tai-khoan/dang-ky', { method: 'POST', body: { email: 'khac@carbook.vn', matKhau: '123456', hoTen: 'Khác' } });
  const { noiDung } = await api(`/api/tai-khoan/noi-dung-lien-ket-vi?diaChi=${viKhach.address}`, { token });
  const trung = await api('/api/tai-khoan/lien-ket-vi', { method: 'POST', token, body: { diaChi: viKhach.address, chuKy: await viKhach.signMessage(noiDung) } });
  assert.equal(trung.ma, 409);
});

test('chỉ chủ vé mới ghi được thông tin hành khách', async () => {
  const { token } = await api('/api/tai-khoan/dang-nhap', { method: 'POST', body: { email: 'nhanvien@carbook.vn', matKhau: '123456' } });
  const kq = await api('/api/ve/hanh-khach', { method: 'POST', token, body: { danhSach: [{ maVe: 2, hoTen: 'Kẻ mạo danh' }] } });
  assert.equal(kq.ma, 403);
});

test('TRA CỨU VÉ công khai: không cần đăng nhập, đúng trạng thái, KHÔNG lộ họ tên / SĐT hành khách', async () => {
  // Vé #1 đã soát ở test luồng đầy đủ phía trên, vé #2 còn hiệu lực
  const ve1 = await api('/api/ve/tra-cuu/1'); // không gửi token
  assert.equal(ve1.thanhCong, true, ve1.thongBao);
  assert.equal(ve1.ve.trangThai, 'DA_SU_DUNG');
  const ve2 = await api('/api/ve/tra-cuu/2');
  assert.equal(ve2.ve.trangThai, 'HIEU_LUC');
  assert.equal(ve2.ve.chuyen.diemKetThuc, 'Cần Thơ');
  assert.equal(typeof ve2.ve.coTheChuyenNhuong, 'boolean');
  const json = JSON.stringify([ve1, ve2]);
  assert.equal(json.includes('Nguyễn Văn An') || json.includes('Trần Thị Bình') || json.includes('hanhKhach'), false);

  assert.equal((await api('/api/ve/tra-cuu/9999')).ma, 404); // vé chưa từng phát hành
  assert.equal((await api('/api/ve/tra-cuu/abc')).ma, 400);
});
