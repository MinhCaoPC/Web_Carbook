// Kiểm thử các hàm/lớp thuần (không cần mạng): miền Tây, thời gian, ChuyenXe, NguoiDung.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { laLoTrinhMienTay, chonChuyenMoiTuyen } = require('../src/tien-ich/mien-tay');
const { homNay, ghepNgayVaPhut, phutTrongNgayVN, danhSachNgayBanVe } = require('../src/tien-ich/thoi-gian');
const { ChuyenXe } = require('../src/mo-hinh/chuyen-xe');
const { NguoiDung } = require('../src/mo-hinh/nguoi-dung');

test('lọc tuyến miền Tây', () => {
  assert.equal(laLoTrinhMienTay({ diemKhoiHanh: 'TP.HCM', diemKetThuc: 'Cần Thơ' }), true);
  assert.equal(laLoTrinhMienTay({ diemKhoiHanh: 'Rạch Giá (An Giang)', diemKetThuc: 'Cà Mau' }), true);
  assert.equal(laLoTrinhMienTay({ diemKhoiHanh: 'TP.HCM', diemKetThuc: 'Vũng Tàu' }), false);
  assert.equal(laLoTrinhMienTay({ diemKhoiHanh: 'TP.HCM', diemKetThuc: 'Bình Dương' }), false);
});

test('mỗi tuyến giữ tối đa k chuyến, rải đều trong ngày', () => {
  const ds = [300, 480, 720, 1200].map((phut, i) => ({ ma: `C${i}`, maLoTrinh: 'LT1', phutKhoiHanh: phut }));
  assert.deepEqual(chonChuyenMoiTuyen(ds, 2).map((c) => c.ma), ['C0', 'C3']);
});

test('giờ Việt Nam không phụ thuộc múi giờ máy chủ', () => {
  const bayGio = Date.parse('2026-11-12T20:00:00Z'); // 03:00 sáng 13/11 ở VN
  assert.equal(homNay(bayGio), '2026-11-13');
  assert.deepEqual(danhSachNgayBanVe(2, bayGio), ['2026-11-13', '2026-11-14']);
  assert.equal(ghepNgayVaPhut('2026-11-12', 480).toISOString(), '2026-11-12T01:00:00.000Z'); // 08:00 VN
  assert.equal(phutTrongNgayVN(Date.parse('2026-11-12T01:00:00Z')), 480);
});

test('ChuyenXe: mã chuyến, giờ chạy unix, đổi giá sang wei', () => {
  const c = new ChuyenXe({
    mau: { ma: 'CX001', giaVe: 240000, phutKhoiHanh: 480, soPhutDiChuyen: 420 },
    loTrinh: { diemKhoiHanh: 'TP.HCM', diemKetThuc: 'Cần Thơ' },
    xe: null,
    ngayDi: '2026-11-12',
    soGhe: 34,
  });
  assert.equal(c.maChuyen, 'CX001_2026-11-12');
  assert.deepEqual(ChuyenXe.tachMa(c.maChuyen), { maChuyenXe: 'CX001', ngayDi: '2026-11-12' });
  assert.equal(c.toJSON().gioDi, '08:00');
  assert.equal(c.toJSON().gioToi, '15:00');
  assert.equal(c.giaVeWei(100_000_000), 2_400_000_000_000_000n); // 0,0024 ETH
});

test('NguoiDung: băm và kiểm tra mật khẩu, không lộ mật khẩu ra JSON', () => {
  const nd = new NguoiDung({ email: 'An@Gmail.com', matKhauBam: NguoiDung.bamMatKhau('matkhau123') });
  assert.equal(nd.email, 'an@gmail.com');
  assert.equal(nd.kiemTraMatKhau('matkhau123'), true);
  assert.equal(nd.kiemTraMatKhau('sai'), false);
  assert.equal(JSON.stringify(nd).includes('matKhau'), false);
});
