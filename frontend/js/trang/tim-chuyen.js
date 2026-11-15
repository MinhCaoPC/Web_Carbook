// KẾT QUẢ TÌM CHUYẾN — chức năng 1. Thông tin chuyến từ Firebase; số ghế trống + giá ETH đọc từ blockchain.
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, gio, ngay, thuDayDu, THU_NGAN, thoiLuong, chuoiSangNgay, dinhDangVnd, dinhDangEth, nutQuayLai, htmlDangTai, htmlTrong, htmlLoi } from '../giao-dien.js';

export class TrangTimChuyen extends TrangCoSo {
  static tieuDe = 'Tìm chuyến';
  static menu = '/';
  static canDangNhap = false; // công khai: khách chưa đăng nhập cũng tìm chuyến, xem ghế được

  async hienThi(khung, thamSo, truyVan) {
    const { diemDi, diemDen, sl = '1' } = truyVan;
    if (!diemDi || !diemDen) return this.ud.di('/', { thayThe: true });
    const { danhSachNgay } = await this.api.lay('/api/chuyen-xe/ngay');
    const ngayDi = danhSachNgay.includes(truyVan.ngay) ? truyVan.ngay : danhSachNgay[0];
    const tv = (n) => new URLSearchParams({ diemDi, diemDen, ngay: n, sl }).toString();

    const dai = danhSachNgay.map((n, i) => {
      const d = chuoiSangNgay(n);
      return `<a class="dchip ${n === ngayDi ? 'on' : ''}" href="#/tim?${tv(n)}">
        <small>${i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : THU_NGAN[d.getDay()]}</small><b>${ngay(d).slice(0, 5)}</b></a>`;
    }).join('');

    khung.innerHTML = `
      <div class="page-head">${nutQuayLai(`/?${new URLSearchParams({ diemDi, diemDen, ngay: ngayDi })}`)}
        <div class="grow"><h1>${h(diemDi)} → ${h(diemDen)}</h1><div class="sub">${thuDayDu(chuoiSangNgay(ngayDi))}, ${ngay(chuoiSangNgay(ngayDi))} · ${h(sl)} vé</div></div>
      </div>
      <div class="date-strip">${dai}</div>
      <div class="split left-side mt-s">
        <aside class="sticky-side"><div class="card filters">
          <div class="field"><label>Sắp xếp</label><select class="in" id="l-sap"><option value="som">Giờ đi sớm nhất</option><option value="gia">Giá thấp nhất</option><option value="muon">Giờ đi muộn nhất</option><option value="ghe">Nhiều chỗ trống nhất</option></select></div>
          <div class="field"><label>Giờ khởi hành</label><select class="in" id="l-gio"><option value="">Tất cả</option><option value="sang">Sáng (00:00 – 12:00)</option><option value="chieu">Chiều (12:00 – 18:00)</option><option value="toi">Tối (18:00 – 24:00)</option></select></div>
          <div class="field"><label>Loại xe</label><select class="in" id="l-xe"><option value="">Tất cả</option></select></div>
        </div></aside>
        <section><div id="ds">${htmlDangTai}</div></section>
      </div>`;

    const ds = khung.querySelector('#ds');
    let chuyen;
    try {
      chuyen = (await this.api.lay(`/api/chuyen-xe/tim?${tv(ngayDi)}`)).danhSach;
    } catch (loi) {
      ds.innerHTML = htmlLoi(loi.message);
      return;
    }
    if (!this.conHienThi) return;

    const loaiXe = [...new Set(chuyen.map((c) => c.loaiXe).filter(Boolean))];
    khung.querySelector('#l-xe').insertAdjacentHTML('beforeend', loaiXe.map((x) => `<option>${h(x)}</option>`).join(''));

    const ve = () => {
      const sap = khung.querySelector('#l-sap').value;
      const khung_gio = khung.querySelector('#l-gio').value;
      const xe = khung.querySelector('#l-xe').value;
      const soGheTrong = (c) => c.trenChuoi?.soGheTrong ?? -1;
      const loc = chuyen.filter((c) => {
        const gioDi = new Date(c.gioKhoiHanh).getHours();
        const hopGio = !khung_gio || (khung_gio === 'sang' ? gioDi < 12 : khung_gio === 'chieu' ? gioDi >= 12 && gioDi < 18 : gioDi >= 18);
        return hopGio && (!xe || c.loaiXe === xe);
      });
      loc.sort((a, b) => sap === 'gia' ? a.giaVe - b.giaVe
        : sap === 'muon' ? new Date(b.gioKhoiHanh) - new Date(a.gioKhoiHanh)
          : sap === 'ghe' ? soGheTrong(b) - soGheTrong(a)
            : new Date(a.gioKhoiHanh) - new Date(b.gioKhoiHanh));
      if (!loc.length) {
        ds.innerHTML = htmlTrong('bus', chuyen.length ? 'Không có chuyến phù hợp bộ lọc' : 'Chưa có chuyến xe cho ngày này',
          chuyen.length ? 'Hãy thử bỏ bớt bộ lọc.' : 'Hãy thử chọn ngày khác hoặc đổi tuyến.');
        return;
      }
      ds.innerHTML = `<div class="muted" style="margin:0 2px 10px">Tìm thấy <b>${loc.length}</b> chuyến</div><div class="stack">${loc.map((c) => this.htmlChuyen(c, Number(sl))).join('')}</div>`;
    };
    ['#l-sap', '#l-gio', '#l-xe'].forEach((s) => khung.querySelector(s).addEventListener('change', ve));
    ve();
  }

  /** Thẻ một chuyến (giống thẻ cũ: giờ đi — vạch thời lượng — giờ đến, chân thẻ là số chỗ + giá) */
  htmlChuyen(c, soVeCan) {
    const tren = c.trenChuoi;
    const chuaMo = !tren || !tren.dangMoBan;
    const hetCho = !chuaMo && tren.soGheTrong < soVeCan;
    const khongChon = chuaMo || hetCho;
    const nhan = !tren ? '<span class="badge red">Chưa kết nối blockchain</span>'
      : chuaMo ? '<span class="badge warn">Nhà xe chưa mở bán</span>'
        : `<span class="badge ${hetCho ? 'red' : tren.soGheTrong <= 5 ? 'warn' : 'green'}">${hetCho ? 'Hết chỗ' : `Còn ${tren.soGheTrong}/${c.soGhe} chỗ`}</span>`;
    const the = khongChon ? 'div' : `a href="#/chuyen/${encodeURIComponent(c.maChuyen)}"`;
    return `<${the} class="card trip" ${khongChon ? 'style="opacity:.6"' : ''}>
      <div class="trip-main">
        <div class="t-time">${gio(c.gioKhoiHanh)}<small>${h(c.diemKhoiHanh)}</small></div>
        <div class="t-line">${thoiLuong(c.gioKhoiHanh, c.gioDen)}<div class="bar"></div>${h(c.loaiXe)}</div>
        <div class="t-time" style="text-align:right">${gio(c.gioDen)}<small style="margin-left:auto">${h(c.diemKetThuc)}</small></div>
      </div>
      <div class="trip-foot">
        <div class="row wrap">${nhan}<span class="hint">${icon('bus', 'sm')} ${h(c.bienSoXe)}</span></div>
        <div class="row"><div style="text-align:right"><span class="price">${dinhDangVnd(c.giaVe)}</span>${tren?.dangMoBan ? `<div class="hint">≈ ${dinhDangEth(tren.giaVeWei)}</div>` : ''}</div>
          ${khongChon ? '' : '<span class="btn primary sm">Chọn chuyến</span>'}</div>
      </div></${khongChon ? 'div' : 'a'}>`;
  }
}
