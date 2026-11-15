// QUẢN TRỊ — VÉ & HÀNH KHÁCH theo ngày đi, nhóm theo chuyến (danh sách lên xe cho tài xế).
// Trạng thái + chủ vé đọc từ blockchain; họ tên/SĐT từ dữ liệu off-chain.
import { TrangQuanTriCoSo } from './quan-tri-co-so.js';
import { icon, h, gio, dinhDangEth, rutGonDiaChi, nhanTrangThaiVe, htmlDangTai, htmlTrong, htmlLoi } from '../giao-dien.js';

const homNayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const congNgay = (ngay, n) => new Date(Date.parse(`${ngay}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

export class TrangQuanTriVe extends TrangQuanTriCoSo {
  static tieuDe = 'Nhà xe · Vé & hành khách';
  static tab = '/quan-tri/ve';

  async veNoiDung(vung, truyVan) {
    this.vung = vung;
    const homNay = homNayVN();
    this.ngay = /^\d{4}-\d{2}-\d{2}$/.test(truyVan.ngay || '') ? truyVan.ngay : homNay;
    const goiY = [-1, 0, 1, 2, 3].map((n) => congNgay(homNay, n));
    vung.innerHTML = `
      <div class="row wrap between no-print">
        <div class="chips">${goiY.map((n, i) => `<a class="chip ${n === this.ngay ? 'on' : ''}" href="#/quan-tri/ve?ngay=${n}">${['Hôm qua', 'Hôm nay', 'Ngày mai', '', ''][i] || n.split('-').reverse().slice(0, 2).join('/')}</a>`).join('')}</div>
        <div class="row">
          <input class="in" type="date" id="chon-ngay" value="${this.ngay}" style="height:36px;width:auto">
          <button class="btn sm" id="xuat">${icon('down', 'sm')} Xuất Excel</button>
          <button class="btn sm" id="in">${icon('print', 'sm')} In</button>
        </div>
      </div>
      <div id="ds" class="mt">${htmlDangTai}</div>`;
    vung.querySelector('#chon-ngay').addEventListener('change', (e) => this.ud.di(`/quan-tri/ve?ngay=${e.target.value}`));
    vung.querySelector('#in').addEventListener('click', () => window.print());
    vung.querySelector('#xuat').addEventListener('click', () => this.xuatCsv());

    const ds = vung.querySelector('#ds');
    try {
      this.danhSach = (await this.api.lay(`/api/quan-tri/ve?ngay=${this.ngay}`)).danhSach;
    } catch (loi) { ds.innerHTML = htmlLoi(loi.message); return; }
    if (!this.conHienThi) return;
    if (!this.danhSach.length) { ds.innerHTML = htmlTrong('ticket', 'Không có vé nào cho ngày này', 'Chọn ngày khác ở trên.'); return; }

    const tong = this.danhSach.reduce((s, n) => s + n.ve.length, 0);
    ds.innerHTML = `<p class="muted" style="margin:0 2px 10px">${this.danhSach.length} chuyến · ${tong} vé ngày ${this.ngay.split('-').reverse().join('/')}</p>
      <div class="stack">${this.danhSach.map((n) => this.htmlChuyen(n)).join('')}</div>`;
  }

  htmlChuyen(n) {
    const c = n.chuyen || {};
    const conGiu = n.ve.filter((v) => v.trangThai !== 'DA_HUY').length;
    return `<div class="card">
      <div class="row between wrap"><div class="row"><span class="ico">${icon('bus')}</span><div>
        <b>${c.gioKhoiHanh ? gio(c.gioKhoiHanh) : ''} · ${h(c.diemKhoiHanh || n.maChuyen)} → ${h(c.diemKetThuc || '')}</b>
        <div class="hint">${h(c.loaiXe || '')} ${h(c.bienSoXe || '')} · mã chuyến <span class="mono">${h(n.maChuyen)}</span></div></div></div>
        <span class="badge blue">${conGiu}/${c.soGhe || '?'} ghế đã bán</span></div>
      <div class="bang-cuon mt"><table class="bang">
        <thead><tr><th>Ghế</th><th>Vé NFT</th><th>Hành khách</th><th>Điện thoại</th><th>Trạng thái</th><th>Ví chủ vé</th><th class="so">Giá</th></tr></thead>
        <tbody>${n.ve.map((v) => `<tr class="${v.trangThai === 'DA_HUY' ? 'mo-nhat' : ''}">
          <td><b>${h(v.maGhe)}</b></td><td>#${v.maVe}</td><td>${h(v.hoTen || '—')}</td><td>${h(v.sdt || '—')}</td>
          <td>${nhanTrangThaiVe(v.trangThai, v.dangRao)}</td><td class="mono">${h(v.chuSoHuu ? rutGonDiaChi(v.chuSoHuu) : '—')}</td>
          <td class="so">${dinhDangEth(v.giaWei)}</td></tr>`).join('')}</tbody>
      </table></div></div>`;
  }

  /** Xuất CSV mở được bằng Excel (thêm BOM để Excel đọc đúng tiếng Việt) */
  xuatCsv() {
    if (!this.danhSach?.length) return;
    const tenTrangThai = { HIEU_LUC: 'Còn hiệu lực', DA_SU_DUNG: 'Đã lên xe', DA_HUY: 'Đã hủy' };
    const o = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const dong = [['Mã chuyến', 'Giờ đi', 'Tuyến', 'Biển số', 'Ghế', 'Vé NFT', 'Hành khách', 'Điện thoại', 'Trạng thái', 'Ví chủ vé', 'Giá (ETH)']];
    for (const n of this.danhSach) {
      const c = n.chuyen || {};
      for (const v of n.ve) {
        dong.push([n.maChuyen, c.gioKhoiHanh ? gio(c.gioKhoiHanh) : '', `${c.diemKhoiHanh || ''} - ${c.diemKetThuc || ''}`, c.bienSoXe || '',
          v.maGhe, v.maVe, v.hoTen, v.sdt, tenTrangThai[v.trangThai] || v.trangThai, v.chuSoHuu || '', Number(BigInt(v.giaWei)) / 1e18]);
      }
    }
    const tep = new Blob(['﻿' + dong.map((d) => d.map(o).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(tep);
    a.download = `danh-sach-ve-${this.ngay}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
