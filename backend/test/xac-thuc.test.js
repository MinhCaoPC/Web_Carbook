// Kiểm thử đăng nhập Google và quên mật khẩu — dùng BẢN GIẢ của Google và Gmail (không gọi mạng thật),
// kho dữ liệu là file tạm (không đụng Firebase).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KhoLuuTruTep } = require('../src/kho-du-lieu/kho-luu-tru-tep');
const { KhoNguoiDung } = require('../src/kho-du-lieu/kho-nguoi-dung');
const { DichVuXacThuc } = require('../src/dich-vu/dich-vu-xac-thuc');

/** Gmail giả: ghi lại mã OTP thay vì gửi thư */
class GuiThuGia {
  constructor() { this.thuDaGui = []; }
  async guiMaKhoiPhuc(email, ma) { this.thuDaGui.push({ email, ma }); }
  get maGanNhat() { return this.thuDaGui.at(-1)?.ma; }
}

/** Google giả: token "tot:<email>" là hợp lệ */
class XacMinhGoogleGia {
  get daCauHinh() { return true; }
  get danhSachClientId() { return ['client-gia.apps.googleusercontent.com']; }
  async xacMinh(idToken) {
    const [loai, email] = String(idToken).split(':');
    if (loai !== 'tot') throw Object.assign(new Error('Token Google không hợp lệ'), { name: 'LoiNghiepVu', maHttp: 401 });
    return { googleId: `g-${email}`, email, hoTen: 'Người Dùng Google' };
  }
}

let dichVu, guiThu;
beforeEach(() => {
  const kho = new KhoNguoiDung(new KhoLuuTruTep(fs.mkdtempSync(path.join(os.tmpdir(), 'carbook-xt-'))));
  guiThu = new GuiThuGia();
  dichVu = new DichVuXacThuc(kho, { khoaJwt: 'khoa-thu', hanJwt: '1h' }, { xacMinhGoogle: new XacMinhGoogleGia(), guiThu });
});

test('quên mật khẩu: gửi mã -> xác thực -> đặt mật khẩu mới -> đăng nhập bằng mật khẩu mới', async () => {
  await dichVu.dangKy({ email: 'an@vidu.com', matKhau: 'cu123456', hoTen: 'An' });
  await dichVu.guiMaQuenMatKhau('An@Vidu.com');
  const ma = guiThu.maGanNhat;
  assert.match(ma, /^\d{6}$/);

  await dichVu.xacThucMaKhoiPhuc('an@vidu.com', ma);
  await dichVu.datLaiMatKhau('an@vidu.com', ma, 'moi123456');

  await assert.rejects(dichVu.dangNhap({ email: 'an@vidu.com', matKhau: 'cu123456' }), /không đúng/);
  const { nguoiDung } = await dichVu.dangNhap({ email: 'an@vidu.com', matKhau: 'moi123456' });
  assert.equal(nguoiDung.email, 'an@vidu.com');
  // mã đã dùng thì không dùng lại được
  await assert.rejects(dichVu.datLaiMatKhau('an@vidu.com', ma, 'khac123456'), /hết hạn|gửi lại/);
});

test('quên mật khẩu: email không tồn tại vẫn trả lời bình thường (không lộ email nào đã đăng ký)', async () => {
  await dichVu.guiMaQuenMatKhau('khongco@vidu.com');
  assert.equal(guiThu.thuDaGui.length, 0);
});

test('quên mật khẩu: sai mã 5 lần thì mã bị hủy; gửi lại quá nhanh bị chặn', async () => {
  await dichVu.dangKy({ email: 'binh@vidu.com', matKhau: '123456', hoTen: 'Bình' });
  await dichVu.guiMaQuenMatKhau('binh@vidu.com');
  const maDung = guiThu.maGanNhat;
  const maSai = maDung === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) await assert.rejects(dichVu.xacThucMaKhoiPhuc('binh@vidu.com', maSai), /còn \d lần/);
  await assert.rejects(dichVu.xacThucMaKhoiPhuc('binh@vidu.com', maSai), /quá nhiều lần/);
  await assert.rejects(dichVu.xacThucMaKhoiPhuc('binh@vidu.com', maDung), /gửi lại/); // mã đúng cũng hết hiệu lực
  await assert.rejects(dichVu.guiMaQuenMatKhau('binh@vidu.com'), /đợi \d+ giây/);
});

test('đăng nhập Google: tự tạo tài khoản, lần sau vào đúng tài khoản đó', async () => {
  const lan1 = await dichVu.dangNhapGoogle('tot:cuong@gmail.com');
  assert.equal(lan1.nguoiDung.email, 'cuong@gmail.com');
  assert.equal(lan1.nguoiDung.toJSON().lienKetGoogle, true);
  assert.equal(lan1.nguoiDung.toJSON().coMatKhau, false);

  const lan2 = await dichVu.dangNhapGoogle('tot:cuong@gmail.com');
  assert.equal(lan2.nguoiDung.email, 'cuong@gmail.com');
  assert.equal(dichVu.xacMinhToken(lan2.token), 'cuong@gmail.com');

  // tài khoản Google chưa có mật khẩu -> đăng nhập bằng mật khẩu báo hướng dẫn rõ ràng
  await assert.rejects(dichVu.dangNhap({ email: 'cuong@gmail.com', matKhau: 'gi-cung-duoc' }), /Google/);
});

test('đăng nhập Google vào email đã đăng ký bằng mật khẩu: gắn thêm Google, mật khẩu cũ vẫn dùng được', async () => {
  await dichVu.dangKy({ email: 'dung@gmail.com', matKhau: '123456', hoTen: 'Dũng' });
  const { nguoiDung } = await dichVu.dangNhapGoogle('tot:dung@gmail.com');
  assert.equal(nguoiDung.hoTen, 'Dũng');
  await dichVu.dangNhap({ email: 'dung@gmail.com', matKhau: '123456' });
});

test('đăng nhập Google: token giả bị từ chối', async () => {
  await assert.rejects(dichVu.dangNhapGoogle('xau:ai@gmail.com'), /không hợp lệ/);
});

test('địa chỉ liên hệ: lưu khi đăng ký, sửa được, gọn khoảng trắng, tối đa 200 ký tự', async () => {
  const { nguoiDung } = await dichVu.dangKy({ email: 'dc@vidu.com', matKhau: 'matkhau1', hoTen: 'Địa Chỉ', diaChiLienHe: '  12 Nguyễn Trãi,   Ninh Kiều,  Cần Thơ ' });
  assert.equal(nguoiDung.toJSON().diaChiLienHe, '12 Nguyễn Trãi, Ninh Kiều, Cần Thơ');
  const sau = await dichVu.capNhatThongTin('dc@vidu.com', { diaChiLienHe: 'Phường 1, TP. Cà Mau' });
  assert.equal(sau.diaChiLienHe, 'Phường 1, TP. Cà Mau');
  assert.equal(sau.hoTen, 'Địa Chỉ'); // không gửi họ tên thì giữ nguyên
  await assert.rejects(dichVu.capNhatThongTin('dc@vidu.com', { diaChiLienHe: 'x'.repeat(201) }), /tối đa 200/);
});
