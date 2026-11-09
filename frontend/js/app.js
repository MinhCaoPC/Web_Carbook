// ============================================================
// app.js — router (hash), khung giao diện (topbar / tabbar), bảo vệ trang cần đăng nhập
// ============================================================
import { session, api, icon, esc, initials, errorHTML, loadingHTML, toastErr } from './core.js';

export const state = { unread: 0, unreadAt: 0 };

// layout: 'app' (có thanh điều hướng) | 'plain' (đăng nhập/đăng ký, không thanh điều hướng)
// guest: chỉ cho người CHƯA đăng nhập   auth: cần đăng nhập
const ROUTES = [
  { path: '/login', page: () => import('./pages/auth.js').then((m) => m.login), layout: 'plain', guest: true },
  { path: '/register', page: () => import('./pages/auth.js').then((m) => m.register), layout: 'plain', guest: true },
  { path: '/forgot', page: () => import('./pages/auth.js').then((m) => m.forgot), layout: 'plain', guest: true },
  { path: '/', page: () => import('./pages/home.js').then((m) => m.home), nav: '/', auth: true },
  { path: '/search', page: () => import('./pages/booking.js').then((m) => m.search), nav: '/', auth: true },
  { path: '/seats/:ma', page: () => import('./pages/booking.js').then((m) => m.seats), nav: '/', auth: true },
  { path: '/passenger', page: () => import('./pages/booking.js').then((m) => m.passenger), nav: '/', auth: true },
  { path: '/payment', page: () => import('./pages/payment.js').then((m) => m.payment), nav: '/', auth: true },
  { path: '/payment-result', page: () => import('./pages/payment.js').then((m) => m.result), nav: '/history', auth: true },
  { path: '/vnpay-done', page: () => import('./pages/payment.js').then((m) => m.vnpayDone), nav: '/', auth: true },
  { path: '/ticket', page: () => import('./pages/tickets.js').then((m) => m.ticket), nav: '/history', auth: true },
  { path: '/history', page: () => import('./pages/tickets.js').then((m) => m.history), nav: '/history', auth: true },
  { path: '/notifications', page: () => import('./pages/tickets.js').then((m) => m.notifications), nav: '/notifications', auth: true },
  { path: '/wallet', page: () => import('./pages/wallet.js').then((m) => m.wallet), nav: '/wallet', auth: true },
  { path: '/wallet/deposit', page: () => import('./pages/wallet.js').then((m) => m.deposit), nav: '/wallet', auth: true },
  { path: '/wallet/withdraw', page: () => import('./pages/wallet.js').then((m) => m.withdraw), nav: '/wallet', auth: true },
  { path: '/wallet/history', page: () => import('./pages/wallet.js').then((m) => m.txHistory), nav: '/wallet', auth: true },
  { path: '/wallet/pin', page: () => import('./pages/wallet.js').then((m) => m.pin), nav: '/wallet', auth: true },
  { path: '/blockchain', page: () => import('./pages/market.js').then((m) => m.nftInfo), nav: '/market', auth: true },
  { path: '/market', page: () => import('./pages/market.js').then((m) => m.market), nav: '/market', auth: true },
  { path: '/account', page: () => import('./pages/account.js').then((m) => m.account), nav: '/account', auth: true },
  { path: '/profile', page: () => import('./pages/account.js').then((m) => m.profile), nav: '/account', auth: true },
  { path: '/support', page: () => import('./pages/account.js').then((m) => m.support), nav: '/support', auth: true },
  { path: '/support/history', page: () => import('./pages/account.js').then((m) => m.supportHistory), nav: '/support', auth: true },
  { path: '/settings', page: () => import('./pages/account.js').then((m) => m.settings), nav: '/account', auth: true },
];

const NAV = [
  { href: '/', label: 'Trang chủ', ic: 'home', tab: true },
  { href: '/history', label: 'Lịch sử', ic: 'history', tab: true, desk: 'Vé của tôi' },
  { href: '/market', label: 'Chợ vé', ic: 'swap', tab: false },
  { href: '/notifications', label: 'Thông báo', ic: 'bell', tab: true, badge: true },
  { href: '/wallet', label: 'Ví CarbookPay', ic: 'wallet', tab: true, tabLabel: 'Ví' },
  { href: '/account', label: 'Tài khoản', ic: 'user', tab: true, deskHide: true },
  { href: '/support', label: 'Hỗ trợ', ic: 'headset', tab: false },
];

// ---------- Điều hướng ----------
export function go(path, { replace = false } = {}) {
  const h = '#' + path;
  if (replace) location.replace(h); else location.hash = h;
}
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { path: path || '/', query };
}
function match(path) {
  for (const r of ROUTES) {
    const names = [];
    const rx = new RegExp('^' + r.path.replace(/:[^/]+/g, () => { names.push('p'); return '([^/]+)'; }) + '/?$');
    const m = path.match(rx);
    if (m) {
      const keys = [...r.path.matchAll(/:([^/]+)/g)].map((x) => x[1]);
      const params = {};
      keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

let leaveFns = [];
let navToken = 0;
const appEl = () => document.getElementById('app');

async function render() {
  leaveFns.forEach((f) => { try { f(); } catch { /* ignore */ } });
  leaveFns = [];
  const token = ++navToken;
  const { path, query } = parseHash();
  let hit = match(path);
  if (!hit) { go('/', { replace: true }); return; }
  const { route, params } = hit;
  const user = session.user;

  if (route.auth && !user) { go('/login?next=' + encodeURIComponent(location.hash.slice(1)), { replace: true }); return; }
  if (route.guest && user) { go('/', { replace: true }); return; }

  document.body.classList.toggle('plain', route.layout === 'plain');
  if (user) await session.ensureMaKH();
  if (token !== navToken) return;
  paintChrome(route);
  window.scrollTo(0, 0);

  const el = appEl();
  el.className = 'page';
  el.innerHTML = loadingHTML;
  const ctx = {
    el, params, query, path,
    onLeave: (fn) => leaveFns.push(fn),
    go,
    title: (t) => { document.title = t ? `${t} · CARBOOK` : 'CARBOOK – Vé xe miền Tây, vé NFT'; },
    wide: (cls) => { el.className = 'page ' + (cls || ''); },
    isCurrent: () => token === navToken,
    reload: () => render(),
  };
  try {
    const page = await route.page();
    if (token !== navToken) return;
    await page(ctx);
  } catch (e) {
    if (token !== navToken) return;
    console.error(e);
    el.innerHTML = errorHTML(e.message || 'Không thể tải trang.');
    el.querySelector('[data-retry]')?.addEventListener('click', () => render());
  }
}

// ---------- Khung giao diện ----------
export async function refreshUnread(force = false) {
  if (!session.user) return;
  if (!force && Date.now() - state.unreadAt < 20000) return;
  state.unreadAt = Date.now();
  try {
    const d = await api('/api/notifications');
    state.unread = (d.danhSach || []).filter((n) => !n.daDoc).length;
    paintBadges();
  } catch { /* im lặng */ }
}
export function setUnread(n) { state.unread = n; paintBadges(); }

function paintBadges() {
  document.querySelectorAll('[data-badge]').forEach((b) => {
    b.textContent = state.unread > 9 ? '9+' : state.unread;
    b.classList.toggle('hidden', !state.unread);
  });
}

function paintChrome(route) {
  const user = session.user;
  const cur = route.nav || route.path;
  const nav = document.getElementById('nav');
  const tabbar = document.getElementById('tabbar');
  const right = document.getElementById('top-right');
  if (!user) { nav.innerHTML = ''; tabbar.innerHTML = ''; right.innerHTML = ''; return; }

  const badge = '<span class="dot hidden" data-badge></span>';
  nav.innerHTML = NAV.filter((n) => !n.deskHide).map((n) =>
    `<a href="#${n.href}" title="${esc(n.desk || n.label)}" class="${cur === n.href ? 'active' : ''}">${icon(n.ic, 'sm')}<span class="nav-lbl">${esc(n.desk || n.label)}</span>${n.badge ? badge.replace('class="dot', 'style="position:static;border:0" class="dot') : ''}</a>`).join('');
  tabbar.innerHTML = NAV.filter((n) => n.tab).map((n) =>
    `<a href="#${n.href}" class="${cur === n.href ? 'active' : ''}">${icon(n.ic)}<span>${esc(n.tabLabel || n.label)}</span>${n.badge ? badge : ''}</a>`).join('');

  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  right.innerHTML = `
    <button class="top-btn" id="theme-btn" title="Chế độ tối" aria-label="Đổi giao diện sáng/tối">${icon(dark ? 'sun' : 'moon')}</button>
    <a class="avatar" href="#/account" title="${esc(user.fullName || '')}" aria-label="Tài khoản">${user.photoUrl ? `<img src="${esc(photoSrc(user.photoUrl))}" alt="">` : esc(initials(user.fullName || user.firstName))}</a>`;
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  paintBadges();
  refreshUnread();
}

export const photoSrc = (p) => (!p ? '' : /^(https?:|data:)/.test(p) ? p : `data:image/jpeg;base64,${p}`);

export function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
  if (dark) document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('carbook_theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  const b = document.getElementById('theme-btn');
  if (b) b.innerHTML = icon(dark ? 'sun' : 'moon');
}

export function logout() {
  session.clear();
  state.unread = 0;
  go('/login', { replace: true });
}

window.addEventListener('hashchange', render);
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });
render();
