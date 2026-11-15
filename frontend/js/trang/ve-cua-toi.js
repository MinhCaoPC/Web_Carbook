// VÉ CỦA TÔI — các vé NFT đang nằm trong ví đã liên kết (đọc từ blockchain) + thông tin hành khách (off-chain).
import { TrangCoSo } from './trang-co-so.js';
import { ThaoTacVe } from './thao-tac-ve.js';
import { icon, h, gio, ngay, dinhDangEth, nhanTrangThaiVe, dangXuLy, htmlDangTai, htmlTrong, htmlLoi, htmlMaTraCuu } from '../giao-dien.js';

const TAB = [
  ['', 'Tất cả'],
  ['sap-di', 'Sắp đi'],
  ['dang-rao', 'Đang rao bán'],
  ['da-dung', 'Đã sử dụng'],
  ['da-huy', 'Đã hủy'],
];

/** Nút "Đặt lại" cho vé đã hủy, theo gợi ý backend tính từ blockchain (chuyến còn bán? ghế cũ còn trống?) */
function nutDatLai(v) {
  const c = v.chuyen || {};
  if (v.datLai === 'GHE_CU') {
    return `<a class="btn primary sm" href="#/chuyen/${encodeURIComponent(v.maChuyen)}?ghe=${encodeURIComponent(v.maGhe)}">${icon('refresh', 'sm')} Đặt lại ghế ${h(v.maGhe)}</a>`;
  }
  if (v.datLai === 'GHE_KHAC') {
    return `<a class="btn primary sm" href="#/chuyen/${encodeURIComponent(v.maChuyen)}">${icon('refresh', 'sm')} Đặt lại (chọn ghế khác)</a>`;
  }
  const tim = new URLSearchParams({ diemDi: c.diemKhoiHanh || '', diemDen: c.diemKetThuc || '' });
  return `<a class="btn sm" href="#/tim?${tim}">${icon('search', 'sm')} Tìm chuyến khác cùng tuyến</a>`;
}

const GIAI_THICH_DAT_LAI = {
  GHE_CU: 'Ghế cũ vẫn còn trống — có thể đặt lại đúng ghế này.',
  GHE_KHAC: 'Ghế cũ đã có người mua — bạn có thể chọn ghế khác cùng chuyến.',
  TUYEN_KHAC: 'Chuyến này đã chạy hoặc ngừng bán — hãy chọn chuyến khác cùng tuyến.',
};

export class TrangVeCuaToi extends TrangCoSo {
  static tieuDe = 'Vé của tôi';
  static menu = '/ve-cua-toi';

  async hienThi(khung) {
    this.khung = khung;
    this.thaoTac = new ThaoTacVe(this.ud);
    this.tab = '';
    khung.innerHTML = `<div class="page-head"><div class="grow"><h1>Vé của tôi</h1><div class="sub">Vé NFT trong ví ${this.ud.nguoiDung.diaChiVi ? `<span class="mono">${h(this.ud.nguoiDung.diaChiVi)}</span>` : 'của bạn'}.</div></div>
        <a class="btn sm" href="#/vi">${icon('shield', 'sm')} Vé NFT &amp; hợp đồng</a></div>
      <div class="tabs" id="tabs">${TAB.map(([k, n], i) => `<button data-t="${k}" class="${i === 0 ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="ds" class="mt">${htmlDangTai}</div>`;
    khung.querySelector('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      this.tab = b.dataset.t;
      khung.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
      this.ve();
    });

    if (!this.ud.nguoiDung.diaChiVi) {
      khung.querySelector('#ds').innerHTML = htmlTrong('wallet', 'Chưa liên kết ví MetaMask', 'Vé NFT nằm trong ví MetaMask — hãy liên kết ví với tài khoản trước.',
        '<a class="btn primary" href="#/vi">Liên kết ví</a>');
      return;
    }
    await this.taiLai();
  }

  async taiLai() {
    const ds = this.khung.querySelector('#ds');
    this.danhSachDaHuy = null; // vừa hủy / mua xong -> đọc lại vé đã hủy khi mở tab
    try {
      this.danhSach = (await this.api.lay('/api/ve/cua-toi')).danhSach;
    } catch (loi) {
      ds.innerHTML = htmlLoi(loi.message);
      return;
    }
    if (this.conHienThi) this.ve();
  }

  /** Tab "Đã hủy": vé đã bị đốt nên lấy riêng từ /api/ve/da-huy (sự kiện DaHuyVe trên blockchain). */
  async veDaHuy() {
    const ds = this.khung.querySelector('#ds');
    if (!this.danhSachDaHuy) {
      ds.innerHTML = htmlDangTai;
      try { this.danhSachDaHuy = (await this.api.lay('/api/ve/da-huy')).danhSach; } catch (loi) { ds.innerHTML = htmlLoi(loi.message); return; }
      if (!this.conHienThi || this.tab !== 'da-huy') return;
    }
    if (!this.danhSachDaHuy.length) {
      ds.innerHTML = htmlTrong('ticket', 'Chưa hủy vé nào', 'Vé bạn hủy (và số tiền được hoàn) sẽ hiện ở đây để tiện đặt lại.');
      return;
    }
    const tt = this.ud.thongTinHopDong;
    ds.innerHTML = `<div class="grid cols-2">${this.danhSachDaHuy.map((v) => {
      const c = v.chuyen || {};
      const giaGoc = BigInt(v.giaGocWei);
      const phanTram = giaGoc > 0n ? Number((BigInt(v.tienHoanWei) * 100n) / giaGoc) : 0;
      return `<div class="card">
        <div class="row between"><div class="row"><span class="ico">${icon('bus')}</span><div><b>${h(c.loaiXe || 'CARBOOK')}</b>
          <div class="hint">${ngay(v.gioKhoiHanh)} · ${gio(v.gioKhoiHanh)}${c.bienSoXe ? ` · ${h(c.bienSoXe)}` : ''}</div></div></div>
          <div class="row"><span class="badge gray">NFT #${v.maVe}</span>${nhanTrangThaiVe('DA_HUY')}</div></div>
        <div class="mt row"><div class="grow">
            <div class="row"><span class="muted">${icon('pin', 'sm')}</span><b>${h(c.diemKhoiHanh || v.maChuyen)}</b></div>
            <div class="row mt-s"><span style="color:var(--accent)">${icon('pin', 'sm')}</span><b>${h(c.diemKetThuc || '')}</b></div></div>
          <div style="text-align:right"><div class="hint">Ghế</div><b>${h(v.maGhe)}</b></div></div>
        ${htmlMaTraCuu(v)}
        <div class="mt-s">
          <div class="kv"><span>Giá vé</span><span>${dinhDangEth(v.giaGocWei)}</span></div>
          <div class="kv"><span>Đã hoàn về ví (${phanTram}%)</span><span style="color:var(--success);font-weight:700">${dinhDangEth(v.tienHoanWei)}</span></div>
          ${v.thoiGianHuy ? `<div class="kv"><span>Hủy lúc</span><span>${ngay(v.thoiGianHuy)} · ${gio(v.thoiGianHuy)}</span></div>` : ''}
          ${tt.tenMang === 'sepolia' ? `<div class="kv"><span>Giao dịch hủy</span><a class="mono" target="_blank" rel="noopener" href="https://sepolia.etherscan.io/tx/${h(v.maGiaoDich)}">${h(v.maGiaoDich.slice(0, 10))}… ${icon('ext', 'sm')}</a></div>` : ''}
        </div>
        <p class="hint mt-s">${GIAI_THICH_DAT_LAI[v.datLai] || ''}</p>
        <div class="trip-foot"><div></div><div class="row wrap">${nutDatLai(v)}</div></div>
      </div>`;
    }).join('')}</div>`;
  }

  ve() {
    if (this.tab === 'da-huy') return this.veDaHuy();
    const ds = this.khung.querySelector('#ds');
    const dangRao = (v) => BigInt(v.giaDangRaoWei) > 0n;
    const loc = this.danhSach.filter((v) =>
      !this.tab
      || (this.tab === 'sap-di' && v.trangThai === 'HIEU_LUC')
      || (this.tab === 'dang-rao' && dangRao(v))
      || (this.tab === 'da-dung' && v.trangThai === 'DA_SU_DUNG'));

    if (!loc.length) {
      ds.innerHTML = htmlTrong('ticket', 'Chưa có vé nào', 'Các vé bạn mua sẽ xuất hiện ở đây.', '<a class="btn primary" href="#/">Đặt vé ngay</a>');
      return;
    }
    ds.innerHTML = `<div class="grid cols-2">${loc.map((v) => {
      const c = v.chuyen || {};
      const conDung = v.trangThai === 'HIEU_LUC';
      return `<div class="card">
        <div class="row between"><div class="row"><span class="ico">${icon('bus')}</span><div><b>${h(c.loaiXe || 'CARBOOK')}</b>
          <div class="hint">${ngay(v.gioKhoiHanh)} · ${gio(v.gioKhoiHanh)}${c.bienSoXe ? ` · ${h(c.bienSoXe)}` : ''}</div></div></div>
          <div class="row"><span class="badge gray" title="Vé NFT trên blockchain">NFT #${v.maVe}</span>${nhanTrangThaiVe(v.trangThai, dangRao(v))}</div></div>
        <div class="mt row"><div class="grow">
            <div class="row"><span class="muted">${icon('pin', 'sm')}</span><b>${h(c.diemKhoiHanh || v.maChuyen)}</b></div>
            <div class="row mt-s"><span style="color:var(--accent)">${icon('pin', 'sm')}</span><b>${h(c.diemKetThuc || '')}</b></div></div>
          <div style="text-align:right"><div class="hint">Ghế</div><b>${h(v.maGhe)}</b></div></div>
        ${htmlMaTraCuu(v)}
        ${v.hanhKhach ? `<div class="hint mt-s">${icon('user', 'sm')} ${h(v.hanhKhach.hoTen)}${v.hanhKhach.sdt ? ` · ${h(v.hanhKhach.sdt)}` : ''}</div>` : ''}
        <div class="trip-foot"><div><span class="price" style="font-size:17px">${dinhDangEth(v.giaGocWei)}</span>
            ${dangRao(v) ? `<div class="hint">Đang rao ${dinhDangEth(v.giaDangRaoWei)}</div>` : ''}</div>
          <div class="row wrap">
            <a class="btn sm" href="#/ve/${v.maVe}">${icon('qr', 'sm')} Xem vé</a>
            ${!conDung ? ''
              : dangRao(v) ? `<button class="btn sm" data-viec="goRao" data-ve="${v.maVe}">Huỷ rao bán</button>`
                : `<button class="btn sm" data-viec="raoBan" data-ve="${v.maVe}">${icon('swap', 'sm')} Rao bán</button>
                   <button class="btn sm" data-viec="tangVe" data-ve="${v.maVe}">${icon('gift', 'sm')} Tặng</button>
                   <button class="btn sm danger-o" data-viec="huyVe" data-ve="${v.maVe}">Hủy vé</button>`}
            ${conDung && !v.hanhKhach ? `<button class="btn sm ghost" data-viec="capNhatHanhKhach" data-ve="${v.maVe}">${icon('edit', 'sm')} Hành khách</button>` : ''}
          </div></div></div>`;
    }).join('')}</div>`;

    // Nút thao tác -> gọi đúng hàm của lớp ThaoTacVe theo tên trong data-viec
    ds.querySelectorAll('[data-viec]').forEach((nut) => nut.addEventListener('click', () => {
      const ve = this.danhSach.find((x) => x.maVe === Number(nut.dataset.ve));
      dangXuLy(nut, async () => { if (await this.thaoTac[nut.dataset.viec](ve)) await this.taiLai(); });
    }));
  }
}
