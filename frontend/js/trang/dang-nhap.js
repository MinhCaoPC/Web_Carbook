// Đăng nhập / Đăng ký — tài khoản lưu OFF-CHAIN (Firebase). Giữ nguyên khung giao diện cũ.
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, baoLoi, baoThanhCong } from '../giao-dien.js';

/** Khung trang đăng nhập/đăng ký: bên trái là banner giới thiệu (màn hình rộng), bên phải là form */
function khungAuth({ tieuDe, phu, than, chan }) {
  return `
  <div class="auth">
    <aside class="auth-hero">
      <a class="brand" href="#/"><span class="logo">${icon('bus')}</span>CARBOOK</a>
      <h2>Vé xe khách miền Tây, mỗi vé là một NFT của bạn.</h2>
      <p class="lead">Chọn chuyến, chọn ghế và thanh toán bằng ví MetaMask. Vé là NFT chuẩn ERC-721 nằm ngay trong ví của bạn, có thể bán lại an toàn.</p>
      <div class="feat"><span class="ico">${icon('wallet')}</span><div><b>Thanh toán bằng MetaMask</b><small>Trả ETH trực tiếp vào hợp đồng thông minh</small></div></div>
      <div class="feat"><span class="ico">${icon('shield')}</span><div><b>Vé NFT</b><small>Chống vé giả, ghế đã bán bị khóa trên blockchain</small></div></div>
      <div class="feat"><span class="ico">${icon('bolt')}</span><div><b>Chợ vé chống phe</b><small>Bán lại tối đa 110% giá gốc, luật ghi trong hợp đồng</small></div></div>
    </aside>
    <div class="auth-main">
      <div class="auth-head">
        <a class="brand" href="#/"><span class="logo">${icon('bus')}</span>CARBOOK</a>
        <h1>${tieuDe}</h1><p>${phu}</p>
      </div>
      <div class="auth-card">${than}</div>
      <div class="auth-foot">${chan}</div>
    </div>
  </div>`;
}

/** Trang cần quay lại sau khi đăng nhập/đăng ký ("?tiep=/thanh-toan?..."). Chỉ nhận đường dẫn nội bộ an toàn. */
function trangTiepTheo(truyVan) {
  const tiep = truyVan.tiep;
  return tiep && tiep.startsWith('/') && !tiep.startsWith('/dang-') && !tiep.startsWith('/quen-') ? tiep : null;
}
/** Giữ "?tiep=..." khi chuyển qua lại giữa trang Đăng nhập và Đăng ký */
const kemTiep = (truyVan) => (trangTiepTheo(truyVan) ? `?tiep=${encodeURIComponent(trangTiepTheo(truyVan))}` : '');
/** Dòng phụ đề: nói rõ vì sao phải đăng nhập (vd đang đặt vé dở) */
const loiNhacDatVe = (truyVan) => (trangTiepTheo(truyVan)?.startsWith('/thanh-toan')
  ? '<span style="color:var(--primary);font-weight:600">Đăng nhập để tiếp tục đặt vé — xong sẽ quay lại đúng chuyến và ghế bạn đã chọn.</span>' : '');

/** Ô nhập có icon (và nút con mắt cho mật khẩu) */
const oNhap = (id, nhan, ic, thuocTinh = '', matKhau = false) => `
  <div class="field"><label for="${id}">${nhan}</label>
    <div class="ctrl">${icon(ic)}<input class="in ${matKhau ? 'has-eye' : ''}" id="${id}" ${thuocTinh}>${matKhau ? `<button type="button" class="eye" aria-label="Hiện/ẩn mật khẩu">${icon('eye')}</button>` : ''}</div>
  </div>`;

/** Gắn nút hiện/ẩn mật khẩu */
function ganConMat(khung) {
  khung.querySelectorAll('.eye').forEach((b) => b.addEventListener('click', () => {
    const o = b.parentElement.querySelector('input');
    const hien = o.type === 'password';
    o.type = hien ? 'text' : 'password';
    b.innerHTML = icon(hien ? 'eyeoff' : 'eye');
  }));
}

function baoLoiForm(o, thongDiep) {
  o.textContent = thongDiep;
  o.classList.toggle('hidden', !thongDiep);
}

/** Khóa nút submit trong lúc gửi */
function nutBan(nut, ban) {
  if (ban) { nut.dataset.cu = nut.innerHTML; nut.disabled = true; nut.innerHTML = '<span class="spinner"></span>'; }
  else { nut.disabled = false; nut.innerHTML = nut.dataset.cu || nut.innerHTML; }
}

// ---------------- Đăng nhập Google (thư viện Google Identity Services) ----------------

function taiThuVienGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((xong, loi) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = xong;
    s.onerror = () => loi(new Error('Không tải được Google Sign-In.'));
    document.head.appendChild(s);
  });
}

/**
 * Vẽ nút "Đăng nhập với Google". Google trả về ID token -> gửi lên backend để backend tự hỏi lại Google.
 * Máy chủ chưa cấu hình GOOGLE_CLIENT_ID hoặc không tải được thư viện -> ẩn nút.
 */
async function ganNutGoogle(trang, hop, khiXong) {
  try {
    const { batDat, clientId } = await trang.api.lay('/api/tai-khoan/cau-hinh-google');
    if (!batDat) { hop.remove(); return; }
    await taiThuVienGoogle();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (phanHoi) => {
        try {
          const { token, nguoiDung } = await trang.api.gui('/api/tai-khoan/dang-nhap-google', { idToken: phanHoi.credential });
          await trang.ud.datPhien(token, nguoiDung);
          khiXong();
        } catch (loi) { baoLoi(loi); }
      },
    });
    const cho = hop.querySelector('.g-btn');
    window.google.accounts.id.renderButton(cho, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: Math.min(cho.clientWidth || 320, 400) });
  } catch {
    hop.remove();
  }
}

// ===================================================================

export class TrangDangNhap extends TrangCoSo {
  static tieuDe = 'Đăng nhập';
  static boCuc = 'tron';
  static canDangNhap = false;
  static chiKhachLa = true;

  async hienThi(khung, thamSo, truyVan) {
    khung.innerHTML = khungAuth({
      tieuDe: 'Đăng nhập',
      phu: loiNhacDatVe(truyVan) || 'Chào mừng bạn trở lại!',
      than: `<form id="f" class="stack" novalidate>
        ${oNhap('email', 'Email', 'mail', 'type="email" placeholder="Nhập email của bạn" autocomplete="email" required')}
        ${oNhap('mk', 'Mật khẩu', 'lock', 'type="password" placeholder="Nhập mật khẩu của bạn" autocomplete="current-password" required', true)}
        <div class="err-msg hidden" id="loi"></div>
        <div style="text-align:right"><a href="#/quen-mat-khau">Quên mật khẩu?</a></div>
        <button class="btn primary lg block" type="submit">Đăng nhập</button>
      </form>
      <div id="hop-google"><div class="divider">hoặc</div><div class="g-btn" style="display:flex;justify-content:center;min-height:44px"></div></div>`,
      chan: `Chưa có tài khoản? <a href="#/dang-ky${kemTiep(truyVan)}"><b>Đăng ký</b></a> · <a href="#/">Về trang chủ</a>`,
    });
    ganConMat(khung);
    const diSauDangNhap = () => this.ud.di(trangTiepTheo(truyVan) || '/', { thayThe: true });
    ganNutGoogle(this, khung.querySelector('#hop-google'), diSauDangNhap);

    const f = khung.querySelector('#f');
    const loi = khung.querySelector('#loi');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = f.email.value.trim();
      const matKhau = f.mk.value;
      if (!email || !matKhau) return baoLoiForm(loi, 'Vui lòng nhập đầy đủ thông tin.');
      baoLoiForm(loi, '');
      const nut = f.querySelector('[type=submit]');
      nutBan(nut, true);
      try {
        const { token, nguoiDung } = await this.api.gui('/api/tai-khoan/dang-nhap', { email, matKhau });
        await this.ud.datPhien(token, nguoiDung);
        diSauDangNhap();
      } catch (loi2) {
        baoLoiForm(loi, loi2.message);
        nutBan(nut, false);
      }
    });
  }
}

export class TrangDangKy extends TrangCoSo {
  static tieuDe = 'Đăng ký';
  static boCuc = 'tron';
  static canDangNhap = false;
  static chiKhachLa = true;

  async hienThi(khung, thamSo, truyVan) {
    khung.innerHTML = khungAuth({
      tieuDe: 'Tạo tài khoản',
      phu: loiNhacDatVe(truyVan) || 'Chỉ mất một phút để bắt đầu.',
      than: `<form id="f" class="form-grid two" novalidate>
        ${oNhap('ho', 'Họ', 'user', 'placeholder="Nguyễn" autocomplete="family-name"')}
        ${oNhap('ten', 'Tên', 'user', 'placeholder="Văn A" autocomplete="given-name"')}
        <div class="full">${oNhap('email', 'Email', 'mail', 'type="email" placeholder="email@vidu.com" autocomplete="email"')}</div>
        <div class="full">${oNhap('sdt', 'Số điện thoại', 'phone', 'type="tel" inputmode="tel" placeholder="0901234567" autocomplete="tel"')}</div>
        <div class="full">${oNhap('dia-chi', 'Địa chỉ (không bắt buộc)', 'pin', 'maxlength="200" placeholder="Số nhà, đường, phường/xã, tỉnh/thành" autocomplete="street-address"')}</div>
        <div class="full">${oNhap('mk', 'Mật khẩu', 'lock', 'type="password" placeholder="Tối thiểu 6 ký tự" autocomplete="new-password"', true)}</div>
        <div class="full">${oNhap('mk2', 'Nhập lại mật khẩu', 'lock', 'type="password" placeholder="Nhập lại mật khẩu" autocomplete="new-password"', true)}</div>
        <div class="full err-msg hidden" id="loi"></div>
        <div class="full"><button class="btn primary lg block" type="submit">Đăng ký</button></div>
      </form>`,
      chan: `Đã có tài khoản? <a href="#/dang-nhap${kemTiep(truyVan)}"><b>Đăng nhập</b></a> · <a href="#/">Về trang chủ</a>`,
    });
    ganConMat(khung);

    const f = khung.querySelector('#f');
    const loi = khung.querySelector('#loi');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ho = f.ho.value.trim();
      const ten = f.ten.value.trim();
      const email = f.email.value.trim();
      const sdt = f.sdt.value.trim();
      if (!ho || !ten || !email || !f.mk.value) return baoLoiForm(loi, 'Vui lòng nhập đầy đủ thông tin.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return baoLoiForm(loi, 'Email không hợp lệ.');
      if (sdt && !/^(0|\+84)\d{9}$/.test(sdt.replace(/\s/g, ''))) return baoLoiForm(loi, 'Số điện thoại không hợp lệ.');
      if (f.mk.value.length < 6) return baoLoiForm(loi, 'Mật khẩu tối thiểu 6 ký tự.');
      if (f.mk.value !== f.mk2.value) return baoLoiForm(loi, 'Mật khẩu nhập lại không khớp.');
      baoLoiForm(loi, '');
      const nut = f.querySelector('[type=submit]');
      nutBan(nut, true);
      try {
        const { token, nguoiDung } = await this.api.gui('/api/tai-khoan/dang-ky', { email, matKhau: f.mk.value, hoTen: `${ho} ${ten}`, sdt, diaChiLienHe: f['dia-chi'].value.trim() });
        await this.ud.datPhien(token, nguoiDung);
        // Đang đặt vé dở -> quay lại thanh toán (trang thanh toán tự nhờ ký liên kết ví); không thì sang trang Ví để liên kết
        this.ud.di(trangTiepTheo(truyVan) || '/vi', { thayThe: true });
      } catch (loi2) {
        baoLoiForm(loi, loi2.message);
        nutBan(nut, false);
      }
    });
  }
}

// ===================================================================
// QUÊN MẬT KHẨU — 3 bước: email -> mã OTP 6 số (gửi qua Gmail) -> mật khẩu mới
// ===================================================================
export class TrangQuenMatKhau extends TrangCoSo {
  static tieuDe = 'Quên mật khẩu';
  static boCuc = 'tron';
  static canDangNhap = false;
  static chiKhachLa = true;

  async hienThi(khung) {
    this.khung = khung;
    this.buoc = 1;
    this.email = '';
    this.ma = '';
    this.ve();
  }

  ve() {
    const buoc = this.buoc;
    const thanhBuoc = `<div class="steps">${[1, 2, 3].map((n) => `<span class="${n <= buoc ? 'on' : ''}"></span>`).join('')}</div>`;
    const tieuDe = {
      1: ['Quên mật khẩu', 'Nhập email đã đăng ký, chúng tôi sẽ gửi mã OTP.'],
      2: ['Xác thực OTP', `Mã gồm 6 số đã gửi tới ${h(this.email)} (hiệu lực 5 phút).`],
      3: ['Mật khẩu mới', 'Đặt mật khẩu mới cho tài khoản của bạn.'],
    }[buoc];
    const than = {
      1: oNhap('email', 'Email', 'mail', `type="email" placeholder="email@vidu.com" autocomplete="email" value="${h(this.email)}"`),
      2: `${oNhap('ma', 'Mã OTP', 'key', 'inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code"')}
          <button type="button" class="link-btn" id="gui-lai" style="align-self:flex-start">Gửi lại mã</button>`,
      3: `${oNhap('mk', 'Mật khẩu mới', 'lock', 'type="password" placeholder="Tối thiểu 6 ký tự" autocomplete="new-password"', true)}
          ${oNhap('mk2', 'Nhập lại mật khẩu', 'lock', 'type="password" placeholder="Nhập lại mật khẩu" autocomplete="new-password"', true)}`,
    }[buoc];

    this.khung.innerHTML = khungAuth({
      tieuDe: tieuDe[0],
      phu: tieuDe[1],
      than: `${thanhBuoc}<form id="f" class="stack" novalidate>${than}<div class="err-msg hidden" id="loi"></div>
        <button class="btn primary lg block" type="submit">${buoc === 3 ? 'Đổi mật khẩu' : 'Tiếp tục'}</button></form>`,
      chan: '<a href="#/dang-nhap">← Quay lại đăng nhập</a>',
    });
    ganConMat(this.khung);

    const f = this.khung.querySelector('#f');
    const loi = this.khung.querySelector('#loi');
    f.querySelector('input')?.focus();
    this.khung.querySelector('#gui-lai')?.addEventListener('click', async () => {
      try {
        await this.api.gui('/api/tai-khoan/quen-mat-khau', { email: this.email });
        baoThanhCong('Đã gửi lại mã OTP.');
      } catch (loi2) { baoLoi(loi2); }
    });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      baoLoiForm(loi, '');
      const nut = f.querySelector('[type=submit]');
      try {
        if (buoc === 1) {
          this.email = f.email.value.trim();
          if (!/^\S+@\S+\.\S+$/.test(this.email)) return baoLoiForm(loi, 'Email không hợp lệ.');
          nutBan(nut, true);
          await this.api.gui('/api/tai-khoan/quen-mat-khau', { email: this.email });
          this.buoc = 2;
        } else if (buoc === 2) {
          this.ma = f.ma.value.trim();
          if (!/^\d{6}$/.test(this.ma)) return baoLoiForm(loi, 'Mã OTP gồm 6 chữ số.');
          nutBan(nut, true);
          await this.api.gui('/api/tai-khoan/xac-thuc-ma', { email: this.email, ma: this.ma });
          this.buoc = 3;
        } else {
          if (f.mk.value.length < 6) return baoLoiForm(loi, 'Mật khẩu tối thiểu 6 ký tự.');
          if (f.mk.value !== f.mk2.value) return baoLoiForm(loi, 'Mật khẩu nhập lại không khớp.');
          nutBan(nut, true);
          await this.api.gui('/api/tai-khoan/dat-lai-mat-khau', { email: this.email, ma: this.ma, matKhauMoi: f.mk.value });
          baoThanhCong('Đã đổi mật khẩu. Hãy đăng nhập lại.');
          return this.ud.di('/dang-nhap', { thayThe: true });
        }
        this.ve();
      } catch (loi2) {
        baoLoiForm(loi, loi2.message);
        nutBan(nut, false);
      }
    });
  }
}
