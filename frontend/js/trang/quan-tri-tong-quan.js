// QUẢN TRỊ — TỔNG QUAN (dashboard). Mọi số liệu tính từ SỰ KIỆN BLOCKCHAIN của hợp đồng nên không sửa được.
import { TrangQuanTriCoSo } from './quan-tri-co-so.js';
import { BieuDoCot, BieuDoThanhNgang } from '../bieu-do.js';
import { icon, h, dinhDangVnd, dinhDangEth, weiSangVnd, htmlDangTai, htmlLoi } from '../giao-dien.js';

const KY = [[7, '7 ngày'], [14, '14 ngày'], [30, '30 ngày'], [0, 'Toàn bộ']];
const rutGonVnd = (so) => `${new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(so)}đ`;
const nhanNgay = (ngay) => ngay.split('-').reverse().slice(0, 2).join('/');

export class TrangQuanTriTongQuan extends TrangQuanTriCoSo {
  static tieuDe = 'Nhà xe · Tổng quan';
  static tab = '/quan-tri';

  async veNoiDung(vung, truyVan) {
    this.vung = vung;
    this.soNgay = KY.some(([k]) => String(k) === truyVan.soNgay) ? Number(truyVan.soNgay) : 14;
    vung.innerHTML = `
      <div class="chips" id="ky">${KY.map(([k, ten]) => `<button class="chip ${k === this.soNgay ? 'on' : ''}" data-ky="${k}">${ten}</button>`).join('')}</div>
      <div id="bang-tin" class="mt-s">${htmlDangTai}</div>`;
    vung.querySelector('#ky').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ky]');
      if (b) this.ud.di(`/quan-tri?soNgay=${b.dataset.ky}`);
    });
    await this.taiVaVe();
  }

  async taiVaVe() {
    const o = this.vung.querySelector('#bang-tin');
    let d;
    try { d = await this.api.lay(`/api/quan-tri/tong-quan?soNgay=${this.soNgay}`); } catch (loi) { o.innerHTML = htmlLoi(loi.message); return; }
    if (!this.conHienThi) return;
    const tg = this.ud.tyGia;
    const vnd = (wei) => weiSangVnd(wei, tg);
    const tq = d.tongQuan;
    const tenKy = this.soNgay ? `${this.soNgay} ngày gần nhất` : 'toàn bộ thời gian';
    const tienGiuHo = BigInt(tq.soDuHopDongWei) - BigInt(tq.doanhThuChoRutWei);

    o.innerHTML = `
      <div class="card">
        <div class="nhan-so muted" style="font-size:13px;font-weight:600">Doanh thu thuần · ${tenKy}</div>
        <div class="so-chinh"><span class="gia-tri-lon">${dinhDangVnd(vnd(tq.doanhThuThuanWei))}</span>
          <span class="muted" style="padding-bottom:8px">${dinhDangEth(tq.doanhThuThuanWei)}</span></div>
        <div class="hint mt-s">Tiền bán vé ${dinhDangVnd(vnd(tq.doanhThuGopWei))} − tiền hoàn khi hủy ${dinhDangVnd(vnd(tq.tienHoanWei))}</div>
      </div>

      <div class="o-so-lieu mt">
        ${this.oSo('Vé đã bán', tq.soVeBan, 'trong kỳ')}
        ${this.oSo('Khách đã lên xe', tq.soVeDaDi, 'vé đã soát')}
        ${this.oSo('Vé đã hủy', tq.soVeHuy, 'đã hoàn tiền')}
        ${this.oSo('Còn hiệu lực', tq.soVeConHieuLuc, 'chưa đi')}
        ${this.oSo('Tỷ lệ lấp ghế', `${Math.round(tq.tyLeLapGhe * 100)}%`, `${tq.soChuyenCoKhach} chuyến có khách`)}
        ${this.oSo('Bán lại trên chợ', tq.soLanBanLai, dinhDangVnd(vnd(tq.giaTriBanLaiWei)))}
      </div>

      <div class="grid cols-2 mt">
        <div class="card"><h3>Doanh thu thuần theo ngày</h3><div id="bd-doanh-thu"></div></div>
        <div class="card"><h3>Số vé bán theo ngày</h3><div id="bd-so-ve"></div></div>
      </div>

      <div class="grid cols-2 mt">
        <div class="card"><h3>Tuyến bán chạy (số vé còn hiệu lực + đã đi)</h3>
          ${d.theoTuyen.length ? '<div id="bd-tuyen"></div>' : '<p class="muted">Chưa có vé nào trong kỳ.</p>'}</div>
        <div class="card"><h3>${icon('shield', 'sm')} Tiền trong hợp đồng</h3>
          <div class="kv"><span>Số dư hợp đồng</span><span>${dinhDangEth(tq.soDuHopDongWei)}</span></div>
          <div class="kv"><span>Nhà xe được rút</span><span>${dinhDangEth(tq.doanhThuChoRutWei)}</span></div>
          <div class="kv"><span>Đang giữ hộ cho vé chưa đi</span><span>${dinhDangEth(tienGiuHo)}</span></div>
          <p class="hint mt-s">Tiền vé chưa đi vẫn nằm trong hợp đồng để hoàn cho khách nếu họ hủy; chỉ khi khách đã lên xe (hoặc phí hủy) nhà xe mới rút được.</p>
          <a class="btn sm mt-s" href="#/quan-tri/blockchain">Rút doanh thu ${icon('next', 'sm')}</a>
        </div>
      </div>

      <details class="bang-du-lieu card mt"><summary>Xem số liệu theo ngày dạng bảng</summary>
        <div class="bang-cuon mt"><table class="bang">
          <thead><tr><th>Ngày</th><th class="so">Vé bán</th><th class="so">Vé hủy</th><th class="so">Tiền bán</th><th class="so">Tiền hoàn</th><th class="so">Doanh thu thuần</th></tr></thead>
          <tbody>${[...d.theoNgay].reverse().map((n) => `<tr>
            <td>${h(n.ngay.split('-').reverse().join('/'))}</td><td class="so">${n.soVeBan}</td><td class="so">${n.soVeHuy}</td>
            <td class="so">${dinhDangVnd(vnd(n.tienBan))}</td><td class="so">${dinhDangVnd(vnd(n.tienHoan))}</td><td class="so">${dinhDangVnd(vnd(n.doanhThuThuanWei))}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>`;

    // Hai thước đo khác đơn vị -> HAI biểu đồ riêng (không gộp 2 trục)
    new BieuDoCot(o.querySelector('#bd-doanh-thu'), {
      tenBieuDo: 'Doanh thu thuần theo ngày',
      duLieu: d.theoNgay.map((n) => ({ nhan: nhanNgay(n.ngay), giaTri: vnd(n.doanhThuThuanWei), chiTiet: [`${n.soVeBan} vé bán · ${n.soVeHuy} vé hủy`] })),
      dinhDang: dinhDangVnd,
      dinhDangTruc: rutGonVnd,
    });
    new BieuDoCot(o.querySelector('#bd-so-ve'), {
      tenBieuDo: 'Số vé bán theo ngày',
      soNguyen: true,
      duLieu: d.theoNgay.map((n) => ({ nhan: nhanNgay(n.ngay), giaTri: n.soVeBan, chiTiet: [dinhDangVnd(vnd(n.tienBan))] })),
      dinhDang: (so) => `${Math.round(so).toLocaleString('vi-VN')} vé`,
      dinhDangTruc: (so) => Math.round(so).toLocaleString('vi-VN'),
    });
    if (d.theoTuyen.length) {
      new BieuDoThanhNgang(o.querySelector('#bd-tuyen'), {
        tenBieuDo: 'Tuyến bán chạy',
        duLieu: d.theoTuyen.map((t) => ({ nhan: t.tuyen, giaTri: t.soVe, chiTiet: [dinhDangVnd(vnd(t.doanhThu))] })),
        dinhDang: (so) => `${so} vé`,
      });
    }
  }

  oSo(nhan, giaTri, phu) {
    return `<div class="o-so"><div class="nhan-so">${h(nhan)}</div><div class="gia-tri">${h(giaTri)}</div><div class="phu">${h(phu)}</div></div>`;
  }
}
