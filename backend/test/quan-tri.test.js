// KIỂM THỬ TRANG QUẢN TRỊ (nhà xe): API thật + hợp đồng thật trên Ganache + kho file tạm (không đụng Firebase).
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

let mayChu, goc, hopDong, viNhaXe, viNhanVien, viKhach, thuMucTam, tokenNhaXe, tokenKhach, ngayMai;

async function api(duongDan, { method = 'GET', body, token } = {}) {
  const res = await fetch(goc + duongDan, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ma: res.status, ...(await res.json()) };
}

async function taoTaiKhoanCoVi(email, vi) {
  const { token } = await api('/api/tai-khoan/dang-ky', { method: 'POST', body: { email, matKhau: '123456', hoTen: email.split('@')[0] } });
  const { noiDung } = await api(`/api/tai-khoan/noi-dung-lien-ket-vi?diaChi=${vi.address}`, { token });
  await api('/api/tai-khoan/lien-ket-vi', { method: 'POST', token, body: { diaChi: vi.address, chuKy: await vi.signMessage(noiDung) } });
  return token;
}

before(async () => {
  const ganache = require(path.join(THU_MUC_BLOCKCHAIN, 'node_modules', 'ganache'));
  const artifact = JSON.parse(fs.readFileSync(FILE_ABI, 'utf8'));
  const provider = new ethers.BrowserProvider(
    ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { mnemonic: CUM_TU, totalAccounts: 4 } }),
    undefined, { cacheTimeout: -1 }
  );
  [viNhaXe, viNhanVien, viKhach] = [0, 1, 2].map((i) => ethers.HDNodeWallet.fromPhrase(CUM_TU, undefined, `m/44'/60'/0'/0/${i}`).connect(provider));
  hopDong = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, viNhaXe).deploy('http://localhost/api/metadata/');
  await hopDong.waitForDeployment();
  await (await hopDong.datNhanVienSoatVe(viNhanVien.address, true)).wait();

  thuMucTam = fs.mkdtempSync(path.join(os.tmpdir(), 'carbook-qt-'));
  fs.writeFileSync(path.join(thuMucTam, 'danh-muc.json'), JSON.stringify({
    thoiGianTai: Date.now(),
    loTrinh: [{ ma: 'LT001', tenLoTrinh: 'Sài Gòn - Cần Thơ', diemKhoiHanh: 'TP.HCM', diemKetThuc: 'Cần Thơ', trangThai: 'HoatDong' }],
    chuyenXe: [{ ma: 'CX001', maLoTrinh: 'LT001', maXe: 'XE001', giaVe: 200000, trangThai: 'SapChay', phutKhoiHanh: 23 * 60, soPhutDiChuyen: 240 }],
    xe: [{ ma: 'XE001', bienSoXe: '65B-12345', tenLoaiXe: 'Giường nằm 34', maMauSoDo: null }],
    mauSoDo: [],
  }));
  const kho = new KhoLuuTruTep(thuMucTam);
  const ud = new UngDungMayChu({
    khoLuuTru: kho,
    khoDanhMuc: new KhoDanhMuc(kho, { fileDanhMuc: path.join(thuMucTam, 'danh-muc.json'), soGioLamMoi: 24, soChuyenMoiTuyen: 2, chiDocFile: true }),
    blockchain: new KetNoiBlockchain({ provider, diaChi: await hopDong.getAddress(), abi: artifact.abi }),
    cauHinh: { khoaJwt: 'khoa-thu', hanJwt: '1h', soNgayBanVe: 4, tyGiaVndMoiEth: 100_000_000, mangBlockchain: 'localhost', noiLuuDuLieu: 'tep' },
  });
  await ud.khoDanhMuc.taiDuLieu();
  mayChu = ud.app.listen(0);
  goc = `http://127.0.0.1:${mayChu.address().port}`;

  // Dữ liệu mẫu: mở bán, khách mua 3 vé, hủy 1 vé, đi 1 vé
  ngayMai = danhSachNgayBanVe(2)[1];
  tokenNhaXe = await taoTaiKhoanCoVi('nhaxe@carbook.vn', viNhaXe);
  tokenKhach = await taoTaiKhoanCoVi('khach@carbook.vn', viKhach);
  const { soDoCanDangKy, thamSoHopDong: t } = await api(`/api/chuyen-xe/can-mo-ban?ngay=${ngayMai}`);
  for (const sd of soDoCanDangKy) await (await hopDong.dangKySoDoGhe(sd.maSoDo, sd.danhSachGhe)).wait();
  await (await hopDong.moBanNhieuChuyen(t.maChuyen, t.giaVe, t.gioKhoiHanh, t.maSoDo)).wait();
  const gia = BigInt(t.giaVe[0]);
  await (await hopDong.connect(viKhach).muaNhieuVe(`CX001_${ngayMai}`, ['A01', 'A02', 'A03'], { value: gia * 3n })).wait();
  await api('/api/ve/hanh-khach', { method: 'POST', token: tokenKhach, body: { danhSach: [{ maVe: 1, hoTen: 'Lê Văn Cường', sdt: '0909' }] } });
  await (await hopDong.connect(viKhach).huyVe(3)).wait();
  const chuKy = await viKhach.signMessage(await hopDong.noiDungCanKy(2));
  await (await hopDong.connect(viNhanVien).danhDauDaSuDung(2, chuKy)).wait();
});

after(() => {
  mayChu?.close();
  if (thuMucTam) fs.rmSync(thuMucTam, { recursive: true, force: true });
});

test('khách thường KHÔNG vào được API quản trị', async () => {
  assert.equal((await api('/api/quan-tri/tong-quan', { token: tokenKhach })).ma, 403);
  assert.equal((await api('/api/quan-tri/tong-quan')).ma, 401);
});

test('dashboard: số liệu khớp đúng các giao dịch trên blockchain', async () => {
  const d = await api('/api/quan-tri/tong-quan?soNgay=7', { token: tokenNhaXe });
  assert.equal(d.thanhCong, true, d.thongBao);
  const tq = d.tongQuan;
  const gia = 2_000_000_000_000_000n; // 200.000đ / 100tr đ mỗi ETH = 0,002 ETH
  assert.equal(tq.soVeBan, 3);
  assert.equal(tq.soVeHuy, 1);
  assert.equal(tq.soVeDaDi, 1);
  assert.equal(tq.soVeConHieuLuc, 1);
  assert.equal(tq.doanhThuGopWei, String(gia * 3n));
  assert.equal(tq.tienHoanWei, String((gia * 90n) / 100n)); // hủy trước > 24 giờ -> hoàn 90%
  assert.equal(BigInt(tq.doanhThuThuanWei), gia * 3n - (gia * 90n) / 100n);
  assert.equal(tq.doanhThuChoRutWei, String(gia + gia / 10n)); // vé đã đi + phí hủy 10%
  assert.equal(d.theoNgay.length, 7);
  assert.equal(d.theoNgay.at(-1).soVeBan, 3);
  assert.deepEqual(d.theoTuyen.map((x) => [x.tuyen, x.soVe]), [['TP.HCM → Cần Thơ', 2]]);
});

test('danh sách vé theo ngày: trạng thái từ blockchain + tên hành khách', async () => {
  const { danhSach } = await api(`/api/quan-tri/ve?ngay=${ngayMai}`, { token: tokenNhaXe });
  assert.equal(danhSach.length, 1);
  const ve = danhSach[0].ve;
  assert.deepEqual(ve.map((v) => [v.maGhe, v.trangThai]), [['A01', 'HIEU_LUC'], ['A02', 'DA_SU_DUNG'], ['A03', 'DA_HUY']]);
  assert.equal(ve[0].hoTen, 'Lê Văn Cường');
});

test('danh mục: thêm lộ trình + xe + chuyến mẫu -> khách tìm thấy ngay; sửa giá', async () => {
  const lt = await api('/api/quan-tri/lo-trinh', { method: 'POST', token: tokenNhaXe, body: { diemKhoiHanh: 'Cần Thơ', diemKetThuc: 'Cà Mau', quangDuongKm: 180 } });
  assert.equal(lt.muc.ma, 'LT002', lt.thongBao);
  const xe = await api('/api/quan-tri/xe', { method: 'POST', token: tokenNhaXe, body: { bienSoXe: '65b-99999', tenLoaiXe: 'Limousine 34' } });
  assert.equal(xe.muc.bienSoXe, '65B-99999', xe.thongBao);
  const trungBienSo = await api('/api/quan-tri/xe', { method: 'POST', token: tokenNhaXe, body: { bienSoXe: '65B-99999' } });
  assert.equal(trungBienSo.ma, 409);

  const cx = await api('/api/quan-tri/chuyen-mau', { method: 'POST', token: tokenNhaXe, body: { maLoTrinh: 'LT002', maXe: xe.muc.ma, gioKhoiHanh: '21:30', soPhutDiChuyen: 180, giaVe: 150000 } });
  assert.equal(cx.muc.phutKhoiHanh, 21 * 60 + 30, cx.thongBao);

  const tim = await api(`/api/chuyen-xe/tim?diemDi=Cần Thơ&diemDen=Cà Mau&ngay=${ngayMai}`);
  assert.equal(tim.danhSach.length, 1);
  assert.equal(tim.danhSach[0].gioDi, '21:30');

  const sua = await api(`/api/quan-tri/chuyen-mau/${cx.muc.ma}`, { method: 'PUT', token: tokenNhaXe, body: { maLoTrinh: 'LT002', maXe: xe.muc.ma, gioKhoiHanh: '21:30', soPhutDiChuyen: 180, giaVe: 170000 } });
  assert.equal(sua.muc.giaVe, 170000);
  const loi = await api('/api/quan-tri/chuyen-mau', { method: 'POST', token: tokenNhaXe, body: { maLoTrinh: 'LT002', maXe: xe.muc.ma, gioKhoiHanh: '25:00', soPhutDiChuyen: 180, giaVe: 150000 } });
  assert.equal(loi.ma, 400);
});

test('gửi thông báo chung -> khách nhận được', async () => {
  const gui = await api('/api/quan-tri/thong-bao-chung', { method: 'POST', token: tokenNhaXe, body: { tieuDe: 'Nghỉ Tết', noiDung: 'Tuyến Cần Thơ nghỉ 30 Tết.' } });
  assert.equal(gui.thanhCong, true, gui.thongBao);
  const tb = await api('/api/thong-bao', { token: tokenKhach });
  assert.ok(tb.danhSach.some((n) => n.loai === 'NHA_XE' && n.tieuDe === 'Nghỉ Tết'));
});

test('khóa tài khoản: có cột vai trò; KHÔNG khóa được khách; khóa nhân viên -> bị đăng xuất; mở khóa lại được', async () => {
  const khoa = (email, giaTri) => api('/api/quan-tri/tai-khoan/khoa', { method: 'POST', token: tokenNhaXe, body: { email, khoa: giaTri } });
  const tokenNV = await taoTaiKhoanCoVi('nhanvien@carbook.vn', viNhanVien);

  const ds = await api('/api/quan-tri/tai-khoan', { token: tokenNhaXe });
  const vaiTro = Object.fromEntries(ds.danhSach.map((n) => [n.email, n.vaiTro]));
  assert.deepEqual([vaiTro['nhaxe@carbook.vn'], vaiTro['nhanvien@carbook.vn'], vaiTro['khach@carbook.vn']], ['nhaXe', 'soatVe', 'khach']);

  assert.equal((await khoa('nhaxe@carbook.vn', true)).ma, 400); // không tự khóa
  assert.equal((await khoa('khach@carbook.vn', true)).ma, 403); // không khóa khách
  assert.equal((await api('/api/tai-khoan/toi', { token: tokenKhach })).ma, 200);

  await khoa('nhanvien@carbook.vn', true);
  assert.equal((await api('/api/tai-khoan/toi', { token: tokenNV })).ma, 401);
  assert.equal((await api('/api/tai-khoan/dang-nhap', { method: 'POST', body: { email: 'nhanvien@carbook.vn', matKhau: '123456' } })).ma, 403);
  await khoa('nhanvien@carbook.vn', false);
  assert.equal((await api('/api/tai-khoan/toi', { token: tokenNV })).ma, 200);
});

test('vai trò lấy từ blockchain: nhà xe / nhân viên soát vé / khách -> 3 giao diện', async () => {
  // tài khoản nhân viên (ví #1) đã tạo ở test khóa tài khoản phía trên
  const { token: tokenNhanVien } = await api('/api/tai-khoan/dang-nhap', { method: 'POST', body: { email: 'nhanvien@carbook.vn', matKhau: '123456' } });
  assert.deepEqual((await api('/api/tai-khoan/vai-tro', { token: tokenNhaXe })).vaiTro, { nhaXe: true, soatVe: true });
  assert.deepEqual((await api('/api/tai-khoan/vai-tro', { token: tokenNhanVien })).vaiTro, { nhaXe: false, soatVe: true });
  assert.deepEqual((await api('/api/tai-khoan/vai-tro', { token: tokenKhach })).vaiTro, { nhaXe: false, soatVe: false });
  // Nhà xe thu quyền trên hợp đồng -> nhân viên trở lại giao diện khách ngay
  await (await hopDong.datNhanVienSoatVe(viNhanVien.address, false)).wait();
  assert.deepEqual((await api('/api/tai-khoan/vai-tro', { token: tokenNhanVien })).vaiTro, { nhaXe: false, soatVe: false });
  await (await hopDong.datNhanVienSoatVe(viNhanVien.address, true)).wait();
  assert.equal((await api('/api/tai-khoan/vai-tro')).ma, 401); // chưa đăng nhập
});

test('vé đã hủy: liệt kê theo sự kiện DaHuyVe + gợi ý đặt lại (ghế cũ / ghế khác)', async () => {
  let kq = await api('/api/ve/da-huy', { token: tokenKhach });
  assert.equal(kq.thanhCong, true, kq.thongBao);
  assert.deepEqual(kq.danhSach.map((v) => [v.maVe, v.maGhe, v.trangThai, v.datLai]), [[3, 'A03', 'DA_HUY', 'GHE_CU']]);
  assert.ok(BigInt(kq.danhSach[0].tienHoanWei) > 0n);
  assert.ok(kq.danhSach[0].maGiaoDich.startsWith('0x'));
  assert.equal((await api('/api/ve/da-huy', { token: tokenNhaXe })).danhSach.length, 0); // ví khác không thấy

  // Người khác mua mất ghế A03 -> gợi ý chọn ghế khác
  const maChuyen = `CX001_${ngayMai}`;
  const gia = (await hopDong.layChuyen(maChuyen)).giaVe;
  await (await hopDong.connect(viNhanVien).muaVe(maChuyen, 'A03', { value: gia })).wait();
  kq = await api('/api/ve/da-huy', { token: tokenKhach });
  assert.equal(kq.danhSach[0].datLai, 'GHE_KHAC');
});

test('vé khách KHÔNG ĐI: chuyến chạy rồi mà vé chưa soát -> hiện trong danh sách, nhà xe chốt xong thì biến mất', async () => {
  const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
  // Chuyến thử chạy sau 15 giây (đủ dư để giao dịch mua vé vào khối TRƯỚC giờ chạy kể cả khi máy chậm), khách mua 1 vé rồi không đi
  const maChuyen = 'CXTEST_2030-01-01';
  const gioChay = Math.floor(Date.now() / 1000) + 15;
  await (await hopDong.moBanChuyen(maChuyen, 1000n, gioChay, 'MAC_DINH_34')).wait();
  await (await hopDong.connect(viKhach).muaVe(maChuyen, 'A10', { value: 1000n })).wait();
  const maVe = Number(await hopDong.tongSoVeDaPhatHanh());

  await ngu(Math.max(0, gioChay * 1000 - Date.now()) + 1500); // chờ qua giờ chạy
  await (await hopDong.connect(viNhaXe).datDuongDanMetadata('http://localhost/api/metadata/')).wait(); // tạo khối mới cho giờ chuỗi chạy tới
  let ds = await api('/api/quan-tri/ve-khong-di', { token: tokenNhaXe });
  assert.equal(ds.thanhCong, true, ds.thongBao);
  assert.ok(ds.danhSach.some((v) => v.maVe === maVe && v.maGhe === 'A10'), JSON.stringify(ds.danhSach));
  assert.ok(!ds.danhSach.some((v) => v.maVe === 2), 'vé đã soát không được nằm trong danh sách');
  assert.equal((await api('/api/quan-tri/ve-khong-di', { token: tokenKhach })).ma, 403); // khách không xem được

  const truoc = await hopDong.doanhThuChoRut();
  await (await hopDong.connect(viNhaXe).chotVeKhongDi([maVe])).wait();
  assert.equal(await hopDong.doanhThuChoRut(), truoc + 1000n);
  await ngu(3100); // nhật ký sự kiện nghỉ 3 giây giữa 2 lần đọc
  ds = await api('/api/quan-tri/ve-khong-di', { token: tokenNhaXe });
  assert.ok(!ds.danhSach.some((v) => v.maVe === maVe));
});
