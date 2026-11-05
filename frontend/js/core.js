// ============================================================
// core.js — tiện ích dùng chung: icon, định dạng, API, phiên đăng nhập, toast, modal
// ============================================================

// ---------- Icons (feather-style, stroke) ----------
const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1z"/><circle cx="16" cy="14" r="1.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  swap: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v3M16 18v3"/><circle cx="8" cy="14.5" r=".6"/><circle cx="16" cy="14.5" r=".6"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M7 17L17 7M9 7h8v8"/>',
  down: '<path d="M17 7L7 17M15 17H7V9"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20a4 4 0 0 1-4 2h-2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  ticket: '<path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/><path d="M14 5v14" stroke-dasharray="2 3"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chevd: '<path d="M6 9l6 6 6-6"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  hub: '<circle cx="12" cy="12" r="3"/><circle cx="4.5" cy="6" r="2"/><circle cx="19.5" cy="6" r="2"/><circle cx="4.5" cy="18" r="2"/><circle cx="19.5" cy="18" r="2"/><path d="M6 7l4 3M18 7l-4 3M6 17l4-3M18 17l-4-3"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2 0-4-1-4-3s3-2 4 3zM12 8c2 0 4-1 4-3s-3-2-4 3z"/>',
  token: '<circle cx="12" cy="12" r="9"/><path d="M9 9h5a2 2 0 0 1 0 4H9m0 0h5.5a2 2 0 0 1 0 4H9M9 7v10"/>',
  seat: '<path d="M7 4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8l3 5h2l-1-6V6a2 2 0 0 0-2-2z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
};
export function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ---------- Định dạng ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
export const num = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const pad = (n) => String(n).padStart(2, '0');
export const toDate = (v) => { if (v instanceof Date) return v; const d = new Date(v); return isNaN(d) ? null : d; };
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fmtTime = (v) => { const d = toDate(v); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '--:--'; };
export const fmtDate = (v) => { const d = toDate(v); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '---'; };
export const fmtDateTime = (v) => { const d = toDate(v); return d ? `${fmtTime(d)} ${fmtDate(d)}` : '---'; };
export const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const weekdayLong = (d) => ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][d.getDay()];
export function duration(a, b) {
  const x = toDate(a), y = toDate(b);
  if (!x || !y) return '';
  const m = Math.max(0, Math.round((y - x) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ''}` : `${m} phút`;
}
export const shortAddr = (a) => (a && a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a || '');
export const etherscan = (type, v) => `https://sepolia.etherscan.io/${type}/${v}`;
export const initials = (name) => (String(name || '?').trim().split(/\s+/).slice(-1)[0][0] || '?').toUpperCase();

// ---------- Phiên đăng nhập ----------
const K_USER = 'current_user', K_KH = 'ma_khach_hang';
const BASE = window.CARBOOK_API ?? (location.port === '5050' || location.protocol === 'https:' ? '' : 'http://localhost:5050');
export const session = {
  get user() { try { return JSON.parse(localStorage.getItem(K_USER) || 'null'); } catch { return null; } },
  get userId() { return this.user?.id?.toString() || ''; },
  save(u) { localStorage.setItem(K_USER, JSON.stringify(u)); localStorage.removeItem(K_KH); },
  update(patch) { this.save({ ...(this.user || {}), ...patch }); },
  clear() { localStorage.removeItem(K_USER); localStorage.removeItem(K_KH); },
  get maKH() { return localStorage.getItem(K_KH) || ''; },
  // Mã KHÁCH HÀNG (KHACHHANG) ≠ id tài khoản — mọi luồng đặt vé/thanh toán dùng mã này
  async ensureMaKH() {
    if (this.maKH) return this.maKH;
    if (!this.userId) return '';
    try {
      const d = await api(`/api/khach-hang/theo-tai-khoan/${this.userId}`, { auth: false });
      if (d.maKhachHang) localStorage.setItem(K_KH, d.maKhachHang);
      return d.maKhachHang || '';
    } catch { return ''; }
  },
};

// ---------- API ----------
export async function api(path, { method = 'GET', body, query, auth = true } = {}) {
  let url = BASE + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
    if (qs) url += `?${qs}`;
  }
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && session.maKH) headers['x-ma-khach-hang'] = session.maKH;
  let res, data;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Không thể kết nối máy chủ. Hãy kiểm tra backend (cổng 5050) đang chạy.');
  }
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok || data.success === false) {
    const err = new Error(data.message || `Yêu cầu thất bại (${res.status})`);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

// ---------- Toast ----------
export function toast(msg, type = '') {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.transition = '.3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}
export const toastErr = (e) => toast(e?.message || String(e), 'err');
export const toastOk = (m) => toast(m, 'ok');

// ---------- Modal ----------
export function modal(html, { dismissible = true, onMount } = {}) {
  const root = document.getElementById('modal-root');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(ov);
  const box = ov.firstElementChild;
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(); };
  const close = (val) => { document.removeEventListener('keydown', onKey); ov.remove(); done(val); };
  let done;
  const result = new Promise((r) => { done = r; });
  if (dismissible) ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(null); });
  document.addEventListener('keydown', onKey);
  box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(b.dataset.close === 'true' ? true : null)));
  onMount?.(box, close);
  return { box, close, result };
}

export function confirmBox({ title, message, ok = 'Đồng ý', cancel = 'Hủy', danger = false }) {
  const m = modal(`
    <h2>${esc(title)}</h2>
    <div class="muted" style="white-space:pre-line;margin-top:6px">${esc(message)}</div>
    <div class="actions">
      <button class="btn ghost" data-close="false">${esc(cancel)}</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-close="true">${esc(ok)}</button>
    </div>`);
  return m.result.then((v) => v === true);
}

export function alertBox({ title, html, ok = 'Đã hiểu' }) {
  return modal(`<h2>${esc(title)}</h2><div class="mt-s">${html}</div>
    <div class="actions"><button class="btn primary" data-close="true">${esc(ok)}</button></div>`).result;
}

// Nhập mã PIN 6 số (ô vuông). confirm=true: bắt nhập 2 lần khi đặt PIN mới.
export function pinBox({ title = 'Nhập mã PIN ví', desc = '', confirm = false, ok = 'Xác nhận' } = {}) {
  const boxes = (name) => `<div class="pin-boxes" data-pin="${name}">${Array.from({ length: 6 }, () => '<input type="password" inputmode="numeric" maxlength="1" autocomplete="off">').join('')}</div>`;
  const m = modal(`
    <h2>${esc(title)}</h2>
    ${desc ? `<p class="muted">${esc(desc)}</p>` : ''}
    ${boxes('a')}
    ${confirm ? `<p class="muted center mt-s" style="font-size:13px">Nhập lại mã PIN để xác nhận</p>${boxes('b')}` : ''}
    <div class="err-msg hidden mt-s" id="pin-err"></div>
    <div class="actions">
      <button class="btn ghost" data-close="false">Hủy</button>
      <button class="btn primary" id="pin-ok">${esc(ok)}</button>
    </div>`, {
    onMount(box, close) {
      const read = (n) => [...box.querySelectorAll(`[data-pin="${n}"] input`)].map((i) => i.value).join('');
      box.querySelectorAll('.pin-boxes').forEach((grp) => {
        const ins = [...grp.querySelectorAll('input')];
        ins.forEach((inp, i) => {
          inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && ins[i + 1]) ins[i + 1].focus(); });
          inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && ins[i - 1]) ins[i - 1].focus(); if (e.key === 'Enter') box.querySelector('#pin-ok').click(); });
          inp.addEventListener('paste', (e) => {
            const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
            if (!t) return; e.preventDefault();
            t.split('').forEach((c, k) => { if (ins[k]) ins[k].value = c; });
            ins[Math.min(t.length, 5)].focus();
          });
        });
      });
      box.querySelector('[data-pin="a"] input').focus();
      box.querySelector('#pin-ok').addEventListener('click', () => {
        const a = read('a'); const err = box.querySelector('#pin-err');
        const fail = (t) => { err.textContent = t; err.classList.remove('hidden'); };
        if (a.length !== 6) return fail('Mã PIN gồm đủ 6 chữ số.');
        if (confirm && read('b') !== a) return fail('Hai lần nhập mã PIN không khớp.');
        close(a);
      });
      box.querySelector('[data-close="false"]').addEventListener('click', () => close(null));
    },
  });
  return m.result.then((v) => (typeof v === 'string' ? v : null));
}

// Gắn mắt hiện/ẩn mật khẩu cho mọi nút .eye trong container
export function bindEyes(root) {
  root.querySelectorAll('.eye').forEach((b) => b.addEventListener('click', () => {
    const inp = b.parentElement.querySelector('input');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.innerHTML = icon(show ? 'eyeoff' : 'eye');
  }));
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' + (label ? `<span>${esc(label)}</span>` : ''); }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

export async function copyText(text, msg = 'Đã sao chép') {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toastOk(msg);
}

// QR code (thư viện tải lười từ CDN)
let qrLib;
export function renderQR(el, text, size = 180) {
  const draw = () => { el.innerHTML = ''; new window.QRCode(el, { text, width: size, height: size, correctLevel: window.QRCode.CorrectLevel.M }); };
  if (window.QRCode) return draw();
  qrLib ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  qrLib.then(draw).catch(() => { el.innerHTML = `<div class="mono center" style="width:${size}px">${esc(text)}</div>`; });
}

export const loadingHTML = '<div class="loading"><div class="spinner"></div></div>';
export const emptyHTML = (ic, title, sub = '', action = '') =>
  `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(sub)}</p>${action ? `<div class="mt">${action}</div>` : ''}</div>`;
export const errorHTML = (msg, retry = true) =>
  `<div class="empty">${icon('alert')}<h3>Có lỗi xảy ra</h3><p>${esc(msg)}</p>${retry ? '<div class="mt"><button class="btn primary" data-retry>Thử lại</button></div>' : ''}</div>`;
