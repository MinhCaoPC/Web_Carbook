// ============================================================
// bieu-do.js — biểu đồ cột vẽ bằng SVG thuần (không cần thư viện).
//   BieuDoCot       : cột đứng theo thời gian (vd doanh thu từng ngày)
//   BieuDoThanhNgang: thanh ngang xếp hạng (vd top tuyến)
// Quy ước: cột tối đa 24px, đầu cột bo 4px còn chân cột vuông; lưới mảnh 1px; chỉ ghi số trên cột cao nhất;
// rê chuột / dùng phím Tab vào cột để xem số liệu chi tiết.
// ============================================================

const SVG = 'http://www.w3.org/2000/svg';

function taoThe(ten, thuocTinh = {}, cha = null) {
  const the = document.createElementNS(SVG, ten);
  for (const [k, v] of Object.entries(thuocTinh)) the.setAttribute(k, v);
  if (cha) cha.appendChild(the);
  return the;
}

/** Bước chia trục "đẹp": 1, 2, 2.5, 5 × 10^n */
function buocDep(khoang, soVach = 4) {
  if (khoang <= 0) return 1;
  const tho = khoang / soVach;
  const muu = 10 ** Math.floor(Math.log10(tho));
  const ti = tho / muu;
  return (ti <= 1 ? 1 : ti <= 2 ? 2 : ti <= 2.5 ? 2.5 : ti <= 5 ? 5 : 10) * muu;
}

/** Đường viền cột: bo tròn ở đầu dữ liệu, vuông ở đường gốc */
function duongCotDung(x, yGoc, rong, cao) {
  const r = Math.min(4, rong / 2, Math.abs(cao));
  if (cao >= 0) {
    const y = yGoc - cao;
    return `M${x},${yGoc}V${y + r}Q${x},${y} ${x + r},${y}H${x + rong - r}Q${x + rong},${y} ${x + rong},${y + r}V${yGoc}Z`;
  }
  const y = yGoc - cao; // cột âm đi xuống
  return `M${x},${yGoc}V${y - r}Q${x},${y} ${x + r},${y}H${x + rong - r}Q${x + rong},${y} ${x + rong},${y - r}V${yGoc}Z`;
}

/** Hộp gợi ý dùng chung cho mọi biểu đồ */
class HopGoiY {
  static the = null;
  static hien(dong, x, y) {
    if (!HopGoiY.the) {
      HopGoiY.the = document.createElement('div');
      HopGoiY.the.className = 'goi-y-bd';
      document.body.appendChild(HopGoiY.the);
    }
    const t = HopGoiY.the;
    t.replaceChildren(...dong.map(([lop, chu]) => { const d = document.createElement('div'); d.className = lop; d.textContent = chu; return d; }));
    t.style.display = 'block';
    const rong = t.offsetWidth;
    t.style.left = `${Math.min(window.innerWidth - rong - 8, Math.max(8, x - rong / 2))}px`;
    t.style.top = `${Math.max(8, y - t.offsetHeight - 12)}px`;
  }
  static an() { if (HopGoiY.the) HopGoiY.the.style.display = 'none'; }
}

/** Lớp cha: tự vẽ lại khi khung đổi kích thước */
class BieuDoCoSo {
  constructor(khung, tuyChon) {
    this.khung = khung;
    this.tuyChon = tuyChon;
    this.khung.classList.add('bieu-do');
    this._quanSat = new ResizeObserver(() => this.ve());
    this._quanSat.observe(this.khung);
    this.ve();
  }

  /** Gắn tooltip + phím cho một vùng chạm */
  _ganGoiY(vung, dong) {
    const hien = (e) => {
      const hop = vung.getBoundingClientRect();
      HopGoiY.hien(dong, e?.clientX ?? hop.left + hop.width / 2, e?.clientY ?? hop.top);
    };
    vung.addEventListener('pointermove', hien);
    vung.addEventListener('focus', () => hien(null));
    vung.addEventListener('pointerleave', HopGoiY.an);
    vung.addEventListener('blur', HopGoiY.an);
  }
}

/**
 * Cột đứng.
 * tuyChon: { duLieu: [{ nhan, giaTri, chiTiet? }], dinhDang: (so) => chuỗi, dinhDangTruc?: (so) => chuỗi, cao?: số px, tenBieuDo, soNguyen?: true nếu là số đếm }
 */
export class BieuDoCot extends BieuDoCoSo {
  ve() {
    const { duLieu, dinhDang, dinhDangTruc = dinhDang, cao = 220, tenBieuDo = '', soNguyen = false } = this.tuyChon;
    const rong = Math.max(240, this.khung.clientWidth);
    const le = { trai: 52, phai: 8, tren: 22, duoi: 26 };
    const vungRong = rong - le.trai - le.phai;
    const vungCao = cao - le.tren - le.duoi;

    const giaTri = duLieu.map((d) => d.giaTri);
    if (giaTri.every((v) => v === 0)) { // toàn số 0: không vẽ trục rỗng, báo chưa có số liệu
      this.khung.innerHTML = `<p class="muted center" style="padding:48px 0">Chưa có số liệu trong kỳ này.</p>`;
      return;
    }
    let buoc = buocDep(Math.max(...giaTri, 0) - Math.min(...giaTri, 0) || 1);
    if (soNguyen) buoc = Math.max(1, Math.round(buoc)); // đếm số lượng: vạch trục là số nguyên, không lặp nhãn
    const max = Math.ceil(Math.max(...giaTri, 0) / buoc) * buoc || buoc;
    const min = Math.floor(Math.min(...giaTri, 0) / buoc) * buoc;
    const yTheo = (v) => le.tren + ((max - v) / (max - min)) * vungCao;
    const yGoc = yTheo(0);

    const svg = taoThe('svg', { viewBox: `0 0 ${rong} ${cao}`, height: cao, role: 'img', 'aria-label': tenBieuDo });
    // Lưới ngang + nhãn trục
    for (let v = min; v <= max + buoc / 2; v += buoc) {
      const y = yTheo(v);
      taoThe('line', { class: 'luoi', x1: le.trai, x2: rong - le.phai, y1: y, y2: y }, svg);
      taoThe('text', { class: 'truc', x: le.trai - 8, y: y + 4, 'text-anchor': 'end' }, svg).textContent = dinhDangTruc(v);
    }

    const bang = vungRong / duLieu.length;
    const rongCot = Math.min(24, Math.max(4, bang - 2)); // tối đa 24px, chừa khe 2px giữa các cột sát nhau
    const cachNhan = Math.ceil(duLieu.length / Math.max(1, Math.floor(vungRong / 56))); // nhãn trục X không chồng nhau
    const viTriMax = giaTri.indexOf(Math.max(...giaTri));

    duLieu.forEach((d, i) => {
      const x0 = le.trai + i * bang;
      const xCot = x0 + (bang - rongCot) / 2;
      const caoCot = yGoc - yTheo(d.giaTri);
      // vùng chạm cao hết vùng vẽ (to hơn cột) để dễ rê chuột
      const vung = taoThe('rect', { class: 'vung-cham', x: x0, y: le.tren, width: bang, height: vungCao, tabindex: 0, 'aria-label': `${d.nhan}: ${dinhDang(d.giaTri)}` }, svg);
      if (d.giaTri !== 0) taoThe('path', { class: 'cot', d: duongCotDung(xCot, yGoc, rongCot, caoCot) }, svg);
      this._ganGoiY(vung, [['gt', dinhDang(d.giaTri)], ['ph', d.nhan], ...(d.chiTiet || []).map((c) => ['ph', c])]);
      if (i % cachNhan === 0) taoThe('text', { class: 'truc', x: x0 + bang / 2, y: cao - 8, 'text-anchor': 'middle' }, svg).textContent = d.nhan;
      if (i === viTriMax && d.giaTri > 0) {
        taoThe('text', { class: 'nhan-gia-tri', x: x0 + bang / 2, y: yTheo(d.giaTri) - 6, 'text-anchor': 'middle' }, svg).textContent = dinhDang(d.giaTri);
      }
    });
    this.khung.replaceChildren(svg);
  }
}

/**
 * Thanh ngang xếp hạng. tuyChon: { duLieu: [{ nhan, giaTri, chiTiet? }], dinhDang, tenBieuDo }
 */
export class BieuDoThanhNgang extends BieuDoCoSo {
  ve() {
    const { duLieu, dinhDang, tenBieuDo = '' } = this.tuyChon;
    const rong = Math.max(240, this.khung.clientWidth);
    const caoHang = 40;
    const cao = duLieu.length * caoHang + 4;
    const rongNhan = Math.min(200, rong * 0.42);
    const rongVe = rong - rongNhan - 56;
    const max = Math.max(...duLieu.map((d) => d.giaTri), 1);

    const svg = taoThe('svg', { viewBox: `0 0 ${rong} ${cao}`, height: cao, role: 'img', 'aria-label': tenBieuDo });
    taoThe('line', { class: 'luoi', x1: rongNhan, x2: rongNhan, y1: 0, y2: cao }, svg);
    duLieu.forEach((d, i) => {
      const y = i * caoHang + 8;
      const dai = (d.giaTri / max) * rongVe;
      const ten = taoThe('text', { class: 'truc', x: rongNhan - 10, y: y + 16, 'text-anchor': 'end', style: 'font-size:12px' }, svg);
      ten.textContent = d.nhan.length > 28 ? `${d.nhan.slice(0, 27)}…` : d.nhan;
      const vung = taoThe('rect', { class: 'vung-cham', x: 0, y: y - 4, width: rong, height: caoHang, tabindex: 0, 'aria-label': `${d.nhan}: ${dinhDang(d.giaTri)}` }, svg);
      // thanh ngang: bo 4px ở đầu bên phải, vuông ở gốc
      const r = Math.min(4, dai / 2, 12);
      const day = 24;
      taoThe('path', { class: 'cot', d: `M${rongNhan},${y}H${rongNhan + dai - r}Q${rongNhan + dai},${y} ${rongNhan + dai},${y + r}V${y + day - r}Q${rongNhan + dai},${y + day} ${rongNhan + dai - r},${y + day}H${rongNhan}Z` }, svg);
      taoThe('text', { class: 'nhan-gia-tri', x: rongNhan + dai + 8, y: y + 16 }, svg).textContent = dinhDang(d.giaTri);
      this._ganGoiY(vung, [['gt', dinhDang(d.giaTri)], ['ph', d.nhan], ...(d.chiTiet || []).map((c) => ['ph', c])]);
    });
    this.khung.replaceChildren(svg);
  }
}
