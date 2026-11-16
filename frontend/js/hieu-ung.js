// ============================================================
// hieu-ung.js — hiệu ứng giao diện (không đụng tới logic của các trang)
// 1) vạch tiến độ cuộn + đổ bóng thanh trên   2) hiện dần phần tử khi cuộn tới
// 3) gợn sóng khi bấm nút                     4) vệt sáng theo con trỏ + nghiêng 3D
// Mọi thứ tự tắt khi người dùng bật "giảm chuyển động" của hệ điều hành.
// ============================================================
const giamChuyenDong = matchMedia('(prefers-reduced-motion: reduce)').matches;
const conTroMin = matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Vạch màu mảnh trên cùng báo mức đã cuộn + bóng đổ cho thanh trên */
function khoiTaoTienDoCuon() {
  const vach = document.createElement('div');
  vach.id = 'tien-do-cuon';
  document.body.prepend(vach);
  const topbar = document.getElementById('topbar');
  let cho = false;
  const capNhat = () => {
    cho = false;
    const cao = document.documentElement.scrollHeight - innerHeight;
    vach.style.transform = `scaleX(${cao > 0 ? Math.min(scrollY / cao, 1) : 0})`;
    topbar?.classList.toggle('cuon', scrollY > 8);
  };
  addEventListener('scroll', () => { if (!cho) { cho = true; requestAnimationFrame(capNhat); } }, { passive: true });
  capNhat();
}

/** Phần tử nào xuất hiện trong #app đều được gắn .rv rồi hiện dần (so le theo thứ tự) */
const MUC_HIEN_DAN = '.card:not(.search-card), .qa, .trip, .item, .o-so, .dchip, .action, .pass, .wallet-card, .bus, .kv, .empty';
function khoiTaoHienDan() {
  if (giamChuyenDong || !('IntersectionObserver' in window)) return;
  const quanSat = new IntersectionObserver((ds) => {
    for (const m of ds) if (m.isIntersecting) { m.target.classList.add('rv-in'); quanSat.unobserve(m.target); }
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

  const quet = (goc) => {
    let thuTu = 0;
    goc.querySelectorAll(MUC_HIEN_DAN).forEach((el) => {
      if (el.dataset.rv || el.closest('.modal, #modal-root, .hop-lich')) return;
      el.dataset.rv = '1';
      el.classList.add('rv');
      el.style.setProperty('--d', `${Math.min(thuTu++ % 8, 7) * 55}ms`); // trễ tối đa ~0,4s
      quanSat.observe(el);
    });
  };
  const app = document.getElementById('app');
  new MutationObserver(() => quet(app)).observe(app, { childList: true, subtree: true });
  quet(app);
}

/** Gợn sóng tại điểm bấm trên nút */
function khoiTaoGonSong() {
  if (giamChuyenDong) return;
  document.addEventListener('pointerdown', (e) => {
    const nut = e.target.closest?.('.btn:not([disabled])');
    if (!nut) return;
    const kt = nut.getBoundingClientRect();
    const d = Math.max(kt.width, kt.height);
    const song = document.createElement('span');
    song.className = 'gon-song';
    song.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - kt.left - d / 2}px;top:${e.clientY - kt.top - d / 2}px`;
    nut.appendChild(song);
    song.addEventListener('animationend', () => song.remove());
  });
}

/** Vệt sáng theo con trỏ trên thẻ; nghiêng 3D nhẹ cho thẻ ví và vé */
function khoiTaoConTro() {
  if (!conTroMin || giamChuyenDong) return;
  document.addEventListener('pointermove', (e) => {
    const the = e.target.closest?.('.qa, .feature, .buoc, .trip, .action');
    if (the) {
      const kt = the.getBoundingClientRect();
      the.style.setProperty('--mx', `${e.clientX - kt.left}px`);
      the.style.setProperty('--my', `${e.clientY - kt.top}px`);
    }
    const nghieng = e.target.closest?.('.wallet-card, .pass');
    if (nghieng) {
      const kt = nghieng.getBoundingClientRect();
      const x = (e.clientX - kt.left) / kt.width - 0.5;
      const y = (e.clientY - kt.top) / kt.height - 0.5;
      nghieng.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
    }
  }, { passive: true });
  // rời thẻ thì trả về phẳng
  document.addEventListener('pointerout', (e) => {
    const nghieng = e.target.closest?.('.wallet-card, .pass');
    if (nghieng && !nghieng.contains(e.relatedTarget)) nghieng.style.transform = '';
  });
}

khoiTaoTienDoCuon();
khoiTaoHienDan();
khoiTaoGonSong();
khoiTaoConTro();
