import { api, session, icon, esc, toastOk, toastErr, setBusy, bindEyes } from '../core.js';
import { go } from '../app.js';

function shell({ title, sub, body, foot }) {
  return `
  <div class="auth">
    <aside class="auth-hero">
      <a class="brand" href="#/login"><span class="logo">${icon('bus')}</span>CARBOOK</a>
      <h2>Đặt vé xe liên tỉnh, thanh toán minh bạch trên blockchain.</h2>
      <p class="lead">Chọn chuyến, chọn ghế và thanh toán bằng token CAR. Mọi giao dịch được ghi nhận bởi smart contract trên Ethereum Sepolia.</p>
      <div class="feat"><span class="ico">${icon('wallet')}</span><div><b>Ví CarBook Pay</b><small>Nạp tiền qua VNPay, thanh toán bằng token CAR</small></div></div>
      <div class="feat"><span class="ico">${icon('shield')}</span><div><b>Smart contract</b><small>Thanh toán &amp; hoàn tiền tự động, tra cứu được trên Etherscan</small></div></div>
      <div class="feat"><span class="ico">${icon('bolt')}</span><div><b>Không tốn phí gas</b><small>Relayer trả phí giao dịch thay người dùng</small></div></div>
    </aside>
    <div class="auth-main">
      <div class="auth-head">
        <a class="brand" href="#/login"><span class="logo">${icon('bus')}</span>CARBOOK</a>
        <h1>${title}</h1><p>${sub}</p>
      </div>
      <div class="auth-card">${body}</div>
      <div class="auth-foot">${foot || ''}</div>
    </div>
  </div>`;
}

const field = (id, label, ic, attrs = '', eye = false) => `
  <div class="field"><label for="${id}">${label}</label>
    <div class="ctrl">${icon(ic)}<input class="in ${eye ? 'has-eye' : ''}" id="${id}" ${attrs}>${eye ? `<button type="button" class="eye" aria-label="Hiện/ẩn mật khẩu">${icon('eye')}</button>` : ''}</div>
  </div>`;

const showErr = (el, msg) => { el.textContent = msg; el.classList.toggle('hidden', !msg); };


// ---------------- Đăng nhập Google (Google Identity Services) ----------------
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((ok, fail) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = ok; sc.onerror = () => fail(new Error('Không tải được Google Sign-In.'));
    document.head.appendChild(sc);
  });
}

async function mountGoogle(ctx, box, next) {
  try {
    const cfg = await api('/api/auth/google-config', { auth: false });
    if (!cfg.enabled) { box.remove(); return; }
    await loadGsi();
    google.accounts.id.initialize({
      client_id: cfg.clientId,
      callback: async (resp) => {
        try {
          const d = await api('/api/auth/google', { method: 'POST', body: { idToken: resp.credential }, auth: false });
          session.save(d.user);
          await session.ensureMaKH();
          go(next && next.startsWith('/') && !next.startsWith('/login') ? next : '/', { replace: true });
        } catch (e) { toastErr(e.message); }
      },
    });
    const holder = box.querySelector('.g-btn');
    google.accounts.id.renderButton(holder, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: Math.min(holder.clientWidth || 320, 400) });
  } catch { box.remove(); }
}

// ---------------- Đăng nhập ----------------
export async function login(ctx) {
  ctx.title('Đăng nhập');
  ctx.el.className = 'page';
  ctx.el.innerHTML = shell({
    title: 'Đăng nhập', sub: 'Chào mừng bạn trở lại!',
    body: `<form id="f" class="stack" novalidate>
      ${field('id', 'Số điện thoại hoặc email', 'user', 'type="text" placeholder="Nhập số điện thoại hoặc email" autocomplete="username" required')}
      ${field('pw', 'Mật khẩu', 'lock', 'type="password" placeholder="Nhập mật khẩu của bạn" autocomplete="current-password" required', true)}
      <div class="err-msg hidden" id="err"></div>
      <div style="text-align:right"><a href="#/forgot">Quên mật khẩu?</a></div>
      <button class="btn primary lg block" type="submit">Đăng nhập</button>
    </form>
    <div id="gbox"><div class="divider">hoặc</div><div class="g-btn" style="display:flex;justify-content:center;min-height:44px"></div></div>`,
    foot: 'Chưa có tài khoản? <a href="#/register"><b>Đăng ký</b></a>',
  });
  bindEyes(ctx.el);
  mountGoogle(ctx, ctx.el.querySelector('#gbox'), ctx.query.next);
  const f = ctx.el.querySelector('#f'), err = ctx.el.querySelector('#err'), btn = f.querySelector('button[type=submit]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = f.id.value.trim(), password = f.pw.value;
    if (!identifier || !password) return showErr(err, 'Vui lòng nhập đầy đủ thông tin.');
    showErr(err, ''); setBusy(btn, true);
    try {
      const d = await api('/api/auth/login', { method: 'POST', body: { identifier, password }, auth: false });
      session.save(d.user);
      await session.ensureMaKH();
      const next = ctx.query.next;
      go(next && next.startsWith('/') && !next.startsWith('/login') ? next : '/', { replace: true });
    } catch (e2) { showErr(err, e2.message); setBusy(btn, false); }
  });
}

// ---------------- Đăng ký ----------------
export async function register(ctx) {
  ctx.title('Đăng ký');
  ctx.el.className = 'page';
  ctx.el.innerHTML = shell({
    title: 'Tạo tài khoản', sub: 'Chỉ mất một phút để bắt đầu.',
    body: `<form id="f" class="form-grid two" novalidate>
      ${field('ln', 'Họ', 'user', 'placeholder="Nguyễn" autocomplete="family-name"')}
      ${field('fn', 'Tên', 'user', 'placeholder="Văn A" autocomplete="given-name"')}
      <div class="full">${field('em', 'Email', 'mail', 'type="email" placeholder="email@vidu.com" autocomplete="email"')}</div>
      <div class="full">${field('ph', 'Số điện thoại', 'phone', 'type="tel" inputmode="tel" placeholder="0901234567" autocomplete="tel"')}</div>
      <div class="full">${field('pw', 'Mật khẩu', 'lock', 'type="password" placeholder="Tối thiểu 6 ký tự" autocomplete="new-password"', true)}</div>
      <div class="full">${field('pw2', 'Nhập lại mật khẩu', 'lock', 'type="password" placeholder="Nhập lại mật khẩu" autocomplete="new-password"', true)}</div>
      <div class="full err-msg hidden" id="err"></div>
      <div class="full"><button class="btn primary lg block" type="submit">Đăng ký</button></div>
    </form>`,
    foot: 'Đã có tài khoản? <a href="#/login"><b>Đăng nhập</b></a>',
  });
  bindEyes(ctx.el);
  const f = ctx.el.querySelector('#f'), err = ctx.el.querySelector('#err'), btn = f.querySelector('button[type=submit]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = { firstName: f.fn.value.trim(), lastName: f.ln.value.trim(), email: f.em.value.trim(), phone: f.ph.value.trim(), password: f.pw.value, confirmPassword: f.pw2.value };
    if (!v.firstName || !v.lastName || !v.email || !v.phone || !v.password) return showErr(err, 'Vui lòng nhập đầy đủ thông tin.');
    if (!/^\S+@\S+\.\S+$/.test(v.email)) return showErr(err, 'Email không hợp lệ.');
    if (!/^(0|\+84)\d{9}$/.test(v.phone.replace(/\s/g, ''))) return showErr(err, 'Số điện thoại không hợp lệ.');
    if (v.password.length < 6) return showErr(err, 'Mật khẩu tối thiểu 6 ký tự.');
    if (v.password !== v.confirmPassword) return showErr(err, 'Mật khẩu nhập lại không khớp.');
    showErr(err, ''); setBusy(btn, true);
    try {
      await api('/api/auth/register', { method: 'POST', body: v, auth: false });
      toastOk('Đăng ký thành công! Hãy đăng nhập.');
      go('/login', { replace: true });
    } catch (e2) { showErr(err, e2.message); setBusy(btn, false); }
  });
}

// ---------------- Quên mật khẩu (3 bước: email → OTP → mật khẩu mới) ----------------
export async function forgot(ctx) {
  ctx.title('Quên mật khẩu');
  ctx.el.className = 'page';
  let step = 1, email = '', otp = '';

  const draw = () => {
    const bars = `<div class="steps">${[1, 2, 3].map((n) => `<span class="${n <= step ? 'on' : ''}"></span>`).join('')}</div>`;
    const heads = {
      1: ['Quên mật khẩu', 'Nhập email đã đăng ký, chúng tôi sẽ gửi mã OTP.'],
      2: ['Xác thực OTP', `Mã gồm 6 số đã gửi tới ${esc(email)}.`],
      3: ['Mật khẩu mới', 'Đặt mật khẩu mới cho tài khoản của bạn.'],
    };
    const bodies = {
      1: `${field('em', 'Email', 'mail', 'type="email" placeholder="email@vidu.com" autocomplete="email"')}`,
      2: `${field('otp', 'Mã OTP', 'key', 'inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code"')}
          <button type="button" class="link-btn" id="resend">Gửi lại mã</button>`,
      3: `${field('pw', 'Mật khẩu mới', 'lock', 'type="password" placeholder="Tối thiểu 6 ký tự" autocomplete="new-password"', true)}
          ${field('pw2', 'Nhập lại mật khẩu', 'lock', 'type="password" placeholder="Nhập lại mật khẩu" autocomplete="new-password"', true)}`,
    };
    ctx.el.innerHTML = shell({
      title: heads[step][0], sub: heads[step][1],
      body: `${bars}<form id="f" class="stack" novalidate>${bodies[step]}<div class="err-msg hidden" id="err"></div>
        <button class="btn primary lg block" type="submit">${step === 3 ? 'Đổi mật khẩu' : 'Tiếp tục'}</button></form>`,
      foot: '<a href="#/login">← Quay lại đăng nhập</a>',
    });
    bindEyes(ctx.el);
    const f = ctx.el.querySelector('#f'), err = ctx.el.querySelector('#err'), btn = f.querySelector('button[type=submit]');
    f.querySelector('input')?.focus();
    ctx.el.querySelector('#resend')?.addEventListener('click', async () => {
      try { await api('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false }); toastOk('Đã gửi lại mã OTP.'); } catch (e) { toastErr(e); }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); showErr(err, '');
      try {
        if (step === 1) {
          email = f.em.value.trim();
          if (!/^\S+@\S+\.\S+$/.test(email)) return showErr(err, 'Email không hợp lệ.');
          setBusy(btn, true);
          await api('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
          step = 2;
        } else if (step === 2) {
          otp = f.otp.value.trim();
          if (otp.length !== 6) return showErr(err, 'Mã OTP gồm 6 chữ số.');
          setBusy(btn, true);
          await api('/api/auth/verify-otp', { method: 'POST', body: { email, otp }, auth: false });
          step = 3;
        } else {
          if (f.pw.value.length < 6) return showErr(err, 'Mật khẩu tối thiểu 6 ký tự.');
          if (f.pw.value !== f.pw2.value) return showErr(err, 'Mật khẩu nhập lại không khớp.');
          setBusy(btn, true);
          await api('/api/auth/reset-password', { method: 'POST', body: { email, otp, newPassword: f.pw.value }, auth: false });
          toastOk('Đã đổi mật khẩu. Hãy đăng nhập lại.');
          return go('/login', { replace: true });
        }
        draw();
      } catch (e2) { showErr(err, e2.message); setBusy(btn, false); }
    });
  };
  draw();
}
