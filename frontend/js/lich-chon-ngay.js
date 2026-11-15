// ============================================================
// lich-chon-ngay.js — ô "Ngày đi" dạng KHUNG LỊCH THÁNG (thay cho danh sách thả xuống).
//
// Chỉ những ngày ĐANG BÁN VÉ (backend trả về: hôm nay + vài ngày tới, chuyến đã mở bán trên blockchain)
// mới bấm được; các ngày khác hiện mờ. Dùng được bằng chuột lẫn bàn phím:
//   Enter/Space mở lịch · mũi tên trái/phải/lên/xuống di chuyển giữa các ngày · Esc đóng.
// ============================================================
import { icon, h, ngay, thuDayDu, chuoiSangNgay } from './giao-dien.js';

const TEN_THU = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']; // tuần bắt đầu từ thứ hai (kiểu Việt Nam)

/** Date -> 'YYYY-MM-DD' theo giờ máy (khớp định dạng ngày của backend) */
const sangChuoi = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export class LichChonNgay {
  /**
   * @param {HTMLElement} o        thẻ chứa (sẽ vẽ nút + khung lịch vào đây)
   * @param {{ ngayChoPhep: string[], giaTri?: string, khiDoi?: (ngay: string) => void }} tuyChon
   *        ngayChoPhep: các ngày bán vé dạng 'YYYY-MM-DD' (phần tử đầu = hôm nay)
   */
  constructor(o, { ngayChoPhep, giaTri, khiDoi = () => {} }) {
    this.o = o;
    this.ngayChoPhep = ngayChoPhep;
    this.khiDoi = khiDoi;
    this.giaTri = ngayChoPhep.includes(giaTri) ? giaTri : ngayChoPhep[0];
    const d = chuoiSangNgay(this.giaTri);
    this.thangDangXem = new Date(d.getFullYear(), d.getMonth(), 1);

    o.classList.add('lich-chon-ngay');
    o.innerHTML = `${icon('calendar')}
      <button type="button" class="in nut-lich" aria-haspopup="dialog" aria-expanded="false"></button>
      <div class="hop-lich" role="dialog" aria-label="Chọn ngày đi" hidden></div>`;
    this.nut = o.querySelector('.nut-lich');
    this.hop = o.querySelector('.hop-lich');

    this.nut.addEventListener('click', () => (this.hop.hidden ? this.mo() : this.dong()));
    this.hop.addEventListener('click', (e) => this._bamTrongLich(e));
    this.hop.addEventListener('keydown', (e) => this._phim(e));
    // Bấm ra ngoài thì đóng (gỡ khi thẻ không còn trên trang)
    this._bamNgoai = (e) => {
      if (!document.body.contains(o)) return document.removeEventListener('pointerdown', this._bamNgoai);
      if (!o.contains(e.target)) this.dong();
    };
    document.addEventListener('pointerdown', this._bamNgoai);
    this._veNut();
  }

  /** Chữ trên nút: "Hôm nay · 14/11", "Ngày mai · 15/11", "Thứ hai · 16/11" */
  nhanNgay(chuoi) {
    const i = this.ngayChoPhep.indexOf(chuoi);
    const d = chuoiSangNgay(chuoi);
    return `${i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : thuDayDu(d)} · ${ngay(d).slice(0, 5)}`;
  }

  _veNut() {
    this.nut.innerHTML = `<span>${h(this.nhanNgay(this.giaTri))}</span>`;
    this.nut.setAttribute('aria-label', `Ngày đi: ${this.nhanNgay(this.giaTri)}. Bấm để mở lịch`);
  }

  mo() {
    const d = chuoiSangNgay(this.giaTri);
    this.thangDangXem = new Date(d.getFullYear(), d.getMonth(), 1);
    this.hop.hidden = false;
    this.nut.setAttribute('aria-expanded', 'true');
    this._veLich();
    this.hop.querySelector('.ngay-lich.on')?.focus();
  }

  dong({ traFocus = false } = {}) {
    if (this.hop.hidden) return;
    this.hop.hidden = true;
    this.nut.setAttribute('aria-expanded', 'false');
    if (traFocus) this.nut.focus();
  }

  chon(chuoi) {
    this.giaTri = chuoi;
    this._veNut();
    this.dong({ traFocus: true });
    this.khiDoi(chuoi);
  }

  _veLich() {
    const nam = this.thangDangXem.getFullYear();
    const thang = this.thangDangXem.getMonth();
    const homNay = this.ngayChoPhep[0];
    const dau = this.ngayChoPhep[0];
    const cuoi = this.ngayChoPhep[this.ngayChoPhep.length - 1];
    // Chỉ cho lật sang tháng còn ngày bán vé
    const coThangTruoc = sangChuoi(new Date(nam, thang, 0)) >= dau;
    const coThangSau = sangChuoi(new Date(nam, thang + 1, 1)) <= cuoi;

    const soNgay = new Date(nam, thang + 1, 0).getDate();
    const oTrong = (new Date(nam, thang, 1).getDay() + 6) % 7; // số ô trống trước ngày 1 (tuần bắt đầu thứ hai)
    let o = '<span></span>'.repeat(oTrong);
    for (let ngayTrongThang = 1; ngayTrongThang <= soNgay; ngayTrongThang++) {
      const chuoi = sangChuoi(new Date(nam, thang, ngayTrongThang));
      const duocChon = this.ngayChoPhep.includes(chuoi);
      const lop = ['ngay-lich', chuoi === this.giaTri ? 'on' : '', chuoi === homNay ? 'hom-nay' : ''].join(' ');
      o += `<button type="button" class="${lop}" data-ngay="${chuoi}" ${duocChon ? '' : 'disabled'}
        aria-label="${h(duocChon ? this.nhanNgay(chuoi) : `${ngay(chuoiSangNgay(chuoi))} — chưa mở bán`)}"
        ${chuoi === this.giaTri ? 'aria-pressed="true"' : ''}>${ngayTrongThang}</button>`;
    }

    this.hop.innerHTML = `
      <div class="lich-dau">
        <button type="button" class="nut-thang" data-lat="-1" aria-label="Tháng trước" ${coThangTruoc ? '' : 'disabled'}>${icon('back', 'sm')}</button>
        <b>Tháng ${thang + 1}, ${nam}</b>
        <button type="button" class="nut-thang" data-lat="1" aria-label="Tháng sau" ${coThangSau ? '' : 'disabled'}>${icon('next', 'sm')}</button>
      </div>
      <div class="luoi-lich">${TEN_THU.map((t) => `<span class="ten-thu">${t}</span>`).join('')}${o}</div>
      <p class="chu-thich-lich"><i></i> Ngày đang bán vé (${this.ngayChoPhep.length} ngày tới). Ngày khác nhà xe chưa mở bán trên blockchain.</p>`;
  }

  _bamTrongLich(e) {
    const lat = e.target.closest('[data-lat]');
    if (lat) {
      this.thangDangXem = new Date(this.thangDangXem.getFullYear(), this.thangDangXem.getMonth() + Number(lat.dataset.lat), 1);
      this._veLich();
      return;
    }
    const n = e.target.closest('[data-ngay]');
    if (n && !n.disabled) this.chon(n.dataset.ngay);
  }

  /** Bàn phím: mũi tên đi qua các ngày được chọn, Esc đóng */
  _phim(e) {
    if (e.key === 'Escape') { e.preventDefault(); this.dong({ traFocus: true }); return; }
    const buoc = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const dangO = e.target.closest?.('[data-ngay]');
    if (!buoc || !dangO) return;
    e.preventDefault();
    const d = chuoiSangNgay(dangO.dataset.ngay);
    d.setDate(d.getDate() + buoc);
    const den = sangChuoi(d);
    // Nhảy tới ngày bán vé gần nhất theo hướng bấm
    const ds = this.ngayChoPhep;
    const dich = buoc > 0 ? ds.find((x) => x >= den) : [...ds].reverse().find((x) => x <= den);
    if (!dich) return;
    const dt = chuoiSangNgay(dich);
    if (dt.getMonth() !== this.thangDangXem.getMonth() || dt.getFullYear() !== this.thangDangXem.getFullYear()) {
      this.thangDangXem = new Date(dt.getFullYear(), dt.getMonth(), 1);
      this._veLich();
    }
    this.hop.querySelector(`[data-ngay="${dich}"]`)?.focus();
  }
}
