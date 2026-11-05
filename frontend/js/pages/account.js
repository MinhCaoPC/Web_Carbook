import { api, session, icon, esc, fmtDateTime, initials, toastErr, toastOk, setBusy, confirmBox, emptyHTML, errorHTML, loadingHTML } from '../core.js';
import { go, logout, photoSrc, toggleTheme } from '../app.js';

const backBtn = (href) => `<a class="back" href="#${href}" aria-label="Quay lại">${icon('back')}</a>`;

// =====================================================================
//  Tài khoản
// =====================================================================
export async function account(ctx) {
  ctx.title('Tài khoản');
  ctx.wide('mid');
  const u = session.user || {};
  const item = (href, ic, cls, label, sub = '') => `<a class="item" href="#${href}"><span class="ico ${cls}">${icon(ic)}</span><div class="grow"><b>${label}</b>${sub ? `<div class="hint">${sub}</div>` : ''}</div>${icon('next', 'sm')}</a>`;
  ctx.el.innerHTML = `
    <div class="card row" style="gap:18px;flex-wrap:wrap">
      <div class="avatar lg">${u.photoUrl ? `<img src="${esc(photoSrc(u.photoUrl))}" alt="">` : esc(initials(u.fullName || u.firstName))}</div>
      <div class="grow"><h2>${esc(u.fullName || 'Người dùng')}</h2><div class="muted">${esc(u.email || '')}</div><div class="muted">${esc(u.phone || '')}</div></div>
      <a class="btn" href="#/profile">${icon('edit', 'sm')} Chỉnh sửa</a>
    </div>
    <div class="grid cols-2 mt">
      <div class="card pad-0 list">
        ${item('/profile', 'user', '', 'Thông tin cá nhân', 'Họ tên, liên hệ, ảnh đại diện')}
        ${item('/wallet', 'wallet', 'green', 'Ví CarbookPay', 'Số dư, nạp/rút, mã PIN')}
        ${item('/blockchain', 'hub', 'warn', 'Minh bạch on-chain', 'Smart contract &amp; giao dịch')}
        ${item('/history', 'ticket', '', 'Vé của tôi', 'Lịch sử đặt vé')}
      </div>
      <div class="card pad-0 list">
        ${item('/support', 'headset', '', 'Yêu cầu hỗ trợ', 'Gửi phản ánh, khiếu nại')}
        ${item('/support/history', 'history', 'gray', 'Lịch sử hỗ trợ', 'Theo dõi phản hồi')}
        ${item('/settings', 'settings', 'gray', 'Cài đặt', 'Giao diện, dữ liệu tìm kiếm')}
        <button class="item" id="logout"><span class="ico red">${icon('logout')}</span><div class="grow"><b style="color:var(--danger)">Đăng xuất</b></div></button>
      </div>
    </div>
    <div class="footer">CARBOOK Web · Đồ án Blockchain căn bản</div>`;
  ctx.el.querySelector('#logout').addEventListener('click', async () => {
    if (await confirmBox({ title: 'Đăng xuất', message: 'Bạn có chắc muốn đăng xuất khỏi tài khoản?', ok: 'Đăng xuất' })) logout();
  });
}

// =====================================================================
//  Hồ sơ cá nhân
// =====================================================================
function resizeToBase64(file, max = 320) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = () => reject(new Error('Không đọc được ảnh.'));
    img.src = url;
  });
}

export async function profile(ctx) {
  ctx.title('Thông tin cá nhân');
  ctx.wide('narrow');
  let u = session.user || {};
  try { const d = await api(`/api/auth/profile/${session.userId}`, { auth: false }); u = d.user; session.update(u); } catch { /* dùng cache */ }
  let photo = u.photoUrl || '', newPhoto = null;
  ctx.el.innerHTML = `
    <div class="page-head">${backBtn('/account')}<div class="grow"><h1>Thông tin cá nhân</h1></div></div>
    <form class="card stack" id="pf" novalidate>
      <div class="center"><div class="avatar lg" id="av" style="margin:0 auto">${photo ? `<img src="${esc(photoSrc(photo))}" alt="">` : esc(initials(u.fullName || u.firstName))}</div>
        <label class="btn sm mt-s" style="cursor:pointer">${icon('edit', 'sm')} Đổi ảnh<input type="file" id="file" accept="image/*" hidden></label></div>
      <div class="form-grid two">
        <div class="field"><label>Họ</label><input class="in" name="ln" value="${esc(u.lastName)}"></div>
        <div class="field"><label>Tên</label><input class="in" name="fn" value="${esc(u.firstName)}"></div>
        <div class="field full"><label>Số điện thoại</label><input class="in" name="ph" type="tel" value="${esc(u.phone)}"></div>
        <div class="field full"><label>Email</label><input class="in" name="em" type="email" value="${esc(u.email)}"></div>
        <div class="field"><label>Ngày sinh</label><input class="in" name="bd" type="date" value="${esc(u.birthDate)}"></div>
        <div class="field"><label>Giới tính</label><select class="in" name="gd">${['', 'Nam', 'Nữ', 'Khác'].map((g) => `<option value="${g}" ${u.gender === g ? 'selected' : ''}>${g || 'Chưa chọn'}</option>`).join('')}</select></div>
        <div class="field full"><label>Nghề nghiệp</label><input class="in" name="job" value="${esc(u.job)}"></div>
      </div>
      <div class="err-msg hidden" id="err"></div>
      <button class="btn primary lg block" type="submit">Lưu thay đổi</button>
    </form>`;
  const f = ctx.el.querySelector('#pf'), err = ctx.el.querySelector('#err');
  ctx.el.querySelector('#file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { newPhoto = await resizeToBase64(file); ctx.el.querySelector('#av').innerHTML = `<img src="data:image/jpeg;base64,${newPhoto}" alt="">`; } catch (er) { toastErr(er); }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = (m) => { err.textContent = m; err.classList.remove('hidden'); };
    if (!f.fn.value.trim() || !f.ln.value.trim()) return bad('Vui lòng nhập họ và tên.');
    if (!/^\S+@\S+\.\S+$/.test(f.em.value.trim())) return bad('Email không hợp lệ.');
    err.classList.add('hidden');
    const btn = f.querySelector('[type=submit]'); setBusy(btn, true);
    try {
      const d = await api(`/api/auth/profile/${session.userId}`, { method: 'PATCH', auth: false, body: {
        firstName: f.fn.value.trim(), lastName: f.ln.value.trim(), phone: f.ph.value.trim(), email: f.em.value.trim(),
        birthDate: f.bd.value, gender: f.gd.value, job: f.job.value.trim(), ...(newPhoto ? { photoUrl: newPhoto } : {}),
      } });
      if (d.user) session.update(d.user);
      toastOk('Cập nhật thông tin thành công.'); go('/account');
    } catch (e2) { bad(e2.message); setBusy(btn, false); }
  });
}

// =====================================================================
//  Hỗ trợ
// =====================================================================
const TOPICS = ['Vấn đề đặt vé', 'Thanh toán & Hoàn tiền', 'Phản ánh tài xế/nhà xe', 'Lỗi ứng dụng', 'Khác'];
export async function support(ctx) {
  ctx.title('Yêu cầu hỗ trợ');
  ctx.wide('narrow');
  const u = session.user || {};
  ctx.el.innerHTML = `
    <div class="page-head">${backBtn('/account')}<div class="grow"><h1>Yêu cầu hỗ trợ</h1><div class="sub">Chúng tôi sẽ phản hồi trong thời gian sớm nhất.</div></div>
      <a class="btn sm" href="#/support/history">${icon('history', 'sm')} Lịch sử</a></div>
    <form class="card stack" id="sf" novalidate>
      <div class="field"><label>Chủ đề</label><select class="in" name="topic">${TOPICS.map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Nội dung</label><textarea class="in" name="content" placeholder="Mô tả vấn đề bạn gặp phải…" maxlength="1000"></textarea></div>
      <div class="field"><label>Thông tin liên hệ</label><input class="in" name="contact" value="${esc(u.phone || u.email || '')}" placeholder="Số điện thoại hoặc email"></div>
      <div class="err-msg hidden" id="err"></div>
      <button class="btn primary lg block" type="submit">Gửi yêu cầu</button>
    </form>`;
  const f = ctx.el.querySelector('#sf'), err = ctx.el.querySelector('#err');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = (m) => { err.textContent = m; err.classList.remove('hidden'); };
    if (f.content.value.trim().length < 10) return bad('Vui lòng mô tả vấn đề (ít nhất 10 ký tự).');
    if (!f.contact.value.trim()) return bad('Vui lòng nhập thông tin liên hệ.');
    err.classList.add('hidden');
    const btn = f.querySelector('[type=submit]'); setBusy(btn, true);
    try {
      await api('/api/support', { method: 'POST', auth: false, body: { maKhachHang: session.userId || 'KH_GUEST', loaiYeuCau: f.topic.value, noiDungYeuCau: f.content.value.trim(), thongTinLienHe: f.contact.value.trim() } });
      toastOk('Đã gửi yêu cầu hỗ trợ thành công!'); go('/support/history');
    } catch (e2) { bad(e2.message); setBusy(btn, false); }
  });
}

const SUP = { CHO: ['Chờ xử lý', 'warn'], DANG_XU_LY: ['Đang xử lý', 'blue'], DA_XU_LY: ['Đã xử lý', 'green'], HOAN_THANH: ['Hoàn thành', 'green'], DONG: ['Đã đóng', 'gray'] };
export async function supportHistory(ctx) {
  ctx.title('Lịch sử hỗ trợ');
  ctx.wide('mid');
  ctx.el.innerHTML = `<div class="page-head">${backBtn('/support')}<div class="grow"><h1>Lịch sử hỗ trợ</h1></div><a class="btn sm primary" href="#/support">${icon('plus', 'sm')} Yêu cầu mới</a></div><div id="list">${loadingHTML}</div>`;
  const list = ctx.el.querySelector('#list');
  try {
    const arr = (await api(`/api/support/${session.userId}`, { auth: false })).data || [];
    list.innerHTML = arr.length ? `<div class="stack">${arr.map((r) => {
      const st = SUP[r.trangThai] || [r.trangThai, 'gray'];
      return `<div class="card"><div class="row between"><b>${esc(r.loaiYeuCau)}</b><span class="badge ${st[1]}">${esc(st[0])}</span></div>
        <p class="mt-s">${esc(r.noiDungYeuCau)}</p><div class="hint mt-s">${esc(r.maYeuCau)} · ${fmtDateTime(r.thoiGianTao)} · ${esc(r.thongTinLienHe)}</div>
        ${r.phanHoiAdmin ? `<div class="info-msg mt"><b>Phản hồi:</b> ${esc(r.phanHoiAdmin)}</div>` : ''}</div>`;
    }).join('')}</div>` : emptyHTML('headset', 'Chưa có yêu cầu hỗ trợ', 'Các yêu cầu bạn gửi sẽ hiển thị tại đây.', '<a class="btn primary" href="#/support">Gửi yêu cầu</a>');
  } catch (e) { list.innerHTML = errorHTML(e.message); list.querySelector('[data-retry]')?.addEventListener('click', () => ctx.reload()); }
}

// =====================================================================
//  Cài đặt
// =====================================================================
export async function settings(ctx) {
  ctx.title('Cài đặt');
  ctx.wide('narrow');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx.el.innerHTML = `
    <div class="page-head">${backBtn('/account')}<div class="grow"><h1>Cài đặt</h1></div></div>
    <div class="card pad-0 list">
      <div class="item"><span class="ico gray">${icon('moon')}</span><div class="grow"><b>Chế độ tối</b><div class="hint">Giao diện tối, dễ nhìn ban đêm</div></div>
        <label class="switch"><input type="checkbox" id="dark" ${dark ? 'checked' : ''}><span></span></label></div>
      <button class="item" id="clear"><span class="ico gray">${icon('trash')}</span><div class="grow"><b>Xóa lịch sử tìm kiếm</b><div class="hint">Xóa toàn bộ dữ liệu tìm kiếm đã lưu</div></div></button>
      <a class="item" href="#/wallet/pin"><span class="ico gray">${icon('key')}</span><div class="grow"><b>Mã PIN ví</b><div class="hint">Đặt hoặc đổi mã PIN thanh toán</div></div>${icon('next', 'sm')}</a>
    </div>
    <div class="footer">CARBOOK Web 1.0 · Đồ án Blockchain căn bản</div>`;
  ctx.el.querySelector('#dark').addEventListener('change', toggleTheme);
  ctx.el.querySelector('#clear').addEventListener('click', async () => {
    if (!(await confirmBox({ title: 'Xóa lịch sử tìm kiếm?', message: 'Toàn bộ tìm kiếm gần đây sẽ bị xóa.', danger: true, ok: 'Xóa' }))) return;
    try { await api('/api/tim-kiem/gan-day', { method: 'DELETE' }); toastOk('Đã xóa lịch sử tìm kiếm.'); } catch (e) { toastErr(e); }
  });
}
