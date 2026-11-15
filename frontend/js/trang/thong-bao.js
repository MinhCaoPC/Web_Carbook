// THÔNG BÁO — dựng từ SỰ KIỆN BLOCKCHAIN của ví bạn (mua vé, bán lại, được tặng, hủy vé, đã soát vé)
// + nhắc chuyến sắp khởi hành. Giữ giao diện cũ: danh sách, nhãn "Mới", đọc tất cả / xóa tất cả.
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, ngayGio, hoiXacNhan, baoLoi, htmlDangTai, htmlTrong, htmlLoi } from '../giao-dien.js';

/** Icon + màu cho từng loại thông báo */
const KIEU = {
  MUA_VE: ['ticket', ''],
  MUA_LAI: ['swap', ''],
  BAN_VE: ['trend', 'green'],
  NHAN_VE: ['gift', 'green'],
  TANG_VE: ['gift', 'gray'],
  HUY_VE: ['refresh', 'red'],
  SOAT_VE: ['check', 'green'],
  NHAC_CHUYEN: ['bus', 'warn'],
};

export class TrangThongBao extends TrangCoSo {
  static tieuDe = 'Thông báo';
  static menu = '/thong-bao';
  static doRong = 'mid';

  async hienThi(khung) {
    this.khung = khung;
    khung.innerHTML = `<div class="page-head"><div class="grow"><h1>Thông báo</h1><div class="sub">Cập nhật từ các giao dịch blockchain của ví bạn.</div></div>
      <button class="btn sm" id="doc-het">${icon('check', 'sm')} Đọc tất cả</button><button class="btn sm danger-o" id="xoa-het">${icon('trash', 'sm')} Xóa tất cả</button></div>
      <div id="ds">${htmlDangTai}</div>`;

    khung.querySelector('#doc-het').addEventListener('click', async () => {
      try { await this.api.gui('/api/thong-bao/da-doc', {}); this.danhSach.forEach((n) => { n.daDoc = true; }); this.ve(); } catch (loi) { baoLoi(loi); }
    });
    khung.querySelector('#xoa-het').addEventListener('click', async () => {
      if (!this.danhSach?.length) return;
      if (!(await hoiXacNhan({ tieuDe: 'Xóa tất cả thông báo?', noiDungHtml: 'Hành động này không thể hoàn tác.', dongY: 'Xóa', nguyHiem: true }))) return;
      try { await this.api.gui('/api/thong-bao/xoa', {}); this.danhSach = []; this.ve(); } catch (loi) { baoLoi(loi); }
    });

    if (!this.ud.nguoiDung.diaChiVi) {
      khung.querySelector('#ds').innerHTML = htmlTrong('bell', 'Chưa liên kết ví MetaMask', 'Thông báo được lấy từ giao dịch blockchain của ví bạn.', '<a class="btn primary" href="#/vi">Liên kết ví</a>');
      return;
    }
    try {
      this.danhSach = (await this.api.lay('/api/thong-bao')).danhSach;
    } catch (loi) {
      khung.querySelector('#ds').innerHTML = htmlLoi(loi.message);
      return;
    }
    if (this.conHienThi) this.ve();
  }

  ve() {
    const ds = this.khung.querySelector('#ds');
    this.ud.datSoChuaDoc(this.danhSach.filter((n) => !n.daDoc).length);
    if (!this.danhSach.length) {
      ds.innerHTML = htmlTrong('bell', 'Chưa có thông báo', 'Mua vé, bán lại, được tặng vé hay nhắc chuyến sắp chạy sẽ hiện ở đây.');
      return;
    }
    ds.innerHTML = `<div class="card pad-0 list">${this.danhSach.map((n, i) => {
      const [ic, mau] = KIEU[n.loai] || ['bell', ''];
      return `<div class="item" data-i="${i}" style="cursor:pointer;${n.daDoc ? '' : 'background:var(--primary-50)'}">
        <span class="ico ${mau}">${icon(ic)}</span>
        <div class="grow"><div class="row between"><b>${h(n.tieuDe)}</b>${n.daDoc ? '' : '<span class="badge blue">Mới</span>'}</div>
          <div class="muted" style="font-size:14px">${h(n.noiDung)}</div><div class="hint">${ngayGio(n.thoiGian)}</div></div>
        <button class="back" data-xoa="${i}" aria-label="Xóa" style="width:34px;height:34px">${icon('x', 'sm')}</button>
      </div>`;
    }).join('')}</div>`;

    ds.querySelectorAll('[data-i]').forEach((dong) => dong.addEventListener('click', (e) => {
      if (e.target.closest('[data-xoa]')) return;
      const n = this.danhSach[dong.dataset.i];
      if (!n.daDoc) { n.daDoc = true; this.api.gui('/api/thong-bao/da-doc', { ma: n.ma }).catch(() => {}); }
      // Vé đã hủy / đã tặng / đã bán không còn trong ví -> về danh sách vé
      this.ud.di(['HUY_VE', 'TANG_VE', 'BAN_VE'].includes(n.loai) ? '/ve-cua-toi' : `/ve/${n.maVe}`);
    }));
    ds.querySelectorAll('[data-xoa]').forEach((nut) => nut.addEventListener('click', async () => {
      const n = this.danhSach[nut.dataset.xoa];
      try { await this.api.gui('/api/thong-bao/xoa', { ma: n.ma }); this.danhSach.splice(Number(nut.dataset.xoa), 1); this.ve(); } catch (loi) { baoLoi(loi); }
    }));
  }
}
