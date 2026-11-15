// CHỌN GHẾ — chức năng 3: ghế đã bán đọc từ BLOCKCHAIN (hợp đồng khóa ghế, một ghế chỉ bán một lần).
// Sơ đồ ghế (tầng, hàng, cột) lấy từ Firebase.
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, ngayGio, dinhDangVnd, dinhDangEth, nutQuayLai, thongBao } from '../giao-dien.js';

const TOI_DA_GHE = 5;

export class TrangChonGhe extends TrangCoSo {
  static tieuDe = 'Chọn ghế';
  static menu = '/';
  static canDangNhap = false; // công khai: khách chưa đăng nhập cũng tìm chuyến, xem ghế được

  async hienThi(khung, { ma }, truyVan = {}) {
    const { chuyen, trenChuoi, soDoGhe } = await this.api.lay(`/api/chuyen-xe/${encodeURIComponent(ma)}`);
    const quayLai = `/tim?${new URLSearchParams({ diemDi: chuyen.diemKhoiHanh, diemDen: chuyen.diemKetThuc, ngay: chuyen.ngayDi })}`;
    const moBan = trenChuoi.dangMoBan && new Date(chuyen.gioKhoiHanh) > new Date();
    const giaWei = BigInt(trenChuoi.giaVeWei);

    // Chia ghế theo tầng (tầng 1 = "Tầng dưới", tầng 2 = "Tầng trên")
    const cacTang = [...new Set(soDoGhe.map((g) => g.tang))].sort();
    const tenTang = (t) => (cacTang.length === 1 ? 'Sơ đồ ghế' : t === 1 ? 'Tầng dưới' : t === 2 ? 'Tầng trên' : `Tầng ${t}`);
    let tangDangXem = cacTang[0];
    const dangChon = new Set();
    // Khách chưa đăng nhập vẫn chọn ghế được; bấm nút sẽ sang trang đăng nhập rồi quay lại thanh toán đúng ghế đã chọn
    const nhanNutTiep = this.ud.nguoiDung ? 'Tiếp tục' : 'Đăng nhập để đặt vé';

    // "Đặt lại" từ vé đã hủy: #/chuyen/<mã>?ghe=A01 -> chọn sẵn ghế cũ nếu còn trống
    const gheDatLai = soDoGhe.find((g) => g.maGhe === truyVan.ghe);
    let thongBaoDatLai = '';
    if (truyVan.ghe) {
      if (gheDatLai && !gheDatLai.maVe && moBan) {
        dangChon.add(gheDatLai.maGhe);
        tangDangXem = gheDatLai.tang;
        thongBaoDatLai = `<div class="ok-msg">${icon('refresh', 'sm')} Đặt lại vé đã hủy: đã chọn sẵn ghế <b>${h(gheDatLai.maGhe)}</b>. Bấm Tiếp tục để thanh toán.</div>`;
      } else {
        thongBaoDatLai = `<div class="warn-msg">Ghế <b>${h(truyVan.ghe)}</b> không còn trống — hãy chọn ghế khác.</div>`;
      }
    }

    khung.innerHTML = `
      <div class="page-head">${nutQuayLai(quayLai)}<div class="grow"><h1>Chọn ghế</h1>
        <div class="sub">${h(chuyen.diemKhoiHanh)} → ${h(chuyen.diemKetThuc)} · ${ngayGio(chuyen.gioKhoiHanh)} · ${h(chuyen.loaiXe)} ${h(chuyen.bienSoXe)}</div></div></div>
      ${moBan ? '' : '<div class="warn-msg">Chuyến này chưa được nhà xe mở bán trên blockchain nên chưa mua được.</div>'}
      ${thongBaoDatLai}
      <div class="split mt-s">
        <section class="stack">
          ${cacTang.length > 1 ? `<div class="tabs" id="tang">${cacTang.map((t) => `<button data-t="${t}" class="${t === tangDangXem ? 'on' : ''}">${tenTang(t)}</button>`).join('')}</div>` : ''}
          <div class="card"><div class="legend"><span><i></i>Trống</span><span><i class="s"></i>Đang chọn</span><span><i class="b"></i>Đã bán</span></div>
            <div class="mt"><div class="bus"><div class="front">PHÍA TRƯỚC</div><div class="seat-grid theo-so-do" id="luoi"></div></div></div>
            <p class="center muted mt" style="font-size:13px">Còn ${trenChuoi.soGhe ? trenChuoi.soGhe - trenChuoi.soVeDaBan : soDoGhe.filter((g) => !g.maVe).length}/${soDoGhe.length} ghế trống · trạng thái ghế đọc từ blockchain · tối đa ${TOI_DA_GHE} ghế mỗi lần</p></div>
        </section>
        <aside class="sticky-side only-lg"><div class="card" id="ben"></div></aside>
      </div>
      <div class="bar-fixed hide-lg"><div class="pay-bar" id="thanh"></div></div>`;

    const luoi = khung.querySelector('#luoi');
    const ve = () => {
      // Lưới ghế theo đúng hàng/cột của sơ đồ
      const gheTang = soDoGhe.filter((g) => g.tang === tangDangXem);
      const soCot = Math.max(...gheTang.map((g) => g.cot));
      luoi.style.gridTemplateColumns = `repeat(${soCot}, 1fr)`;
      luoi.innerHTML = gheTang.map((g) => {
        const daBan = g.maVe > 0;
        return `<button class="seat ${dangChon.has(g.maGhe) ? 'sel' : ''}" data-g="${h(g.maGhe)}" style="grid-row:${g.hang};grid-column:${g.cot}"
          ${daBan || !moBan ? 'disabled' : ''} title="${daBan ? `Đã bán — vé NFT #${g.maVe}` : `Ghế ${h(g.maGhe)}`}">${h(g.maGhe)}</button>`;
      }).join('');

      const ds = [...dangChon].sort();
      const tong = giaWei * BigInt(ds.length);
      const tongVnd = chuyen.giaVe * ds.length;
      khung.querySelector('#thanh').innerHTML = `<div class="grow">
          <div class="muted" style="font-size:12px">Ghế đã chọn (${ds.length}/${TOI_DA_GHE})</div>
          <div style="font-weight:700;min-height:22px">${ds.length ? h(ds.join(', ')) : '—'}</div>
          <div class="money" style="color:var(--primary);font-size:18px">${dinhDangEth(tong)}</div></div>
        <button class="btn primary lg" data-tiep ${ds.length ? '' : 'disabled'}>${nhanNutTiep} ${icon('arrow')}</button>`;
      khung.querySelector('#ben').innerHTML = `<h3>Thông tin chuyến</h3>
        <div class="kv"><span>Tuyến</span><span>${h(chuyen.diemKhoiHanh)} → ${h(chuyen.diemKetThuc)}</span></div>
        <div class="kv"><span>Khởi hành</span><span>${ngayGio(chuyen.gioKhoiHanh)}</span></div>
        <div class="kv"><span>Đơn giá</span><span>${dinhDangEth(giaWei)}<div class="hint">≈ ${dinhDangVnd(chuyen.giaVe)}</div></span></div>
        <div class="kv"><span>Ghế đã chọn</span><span>${ds.length ? h(ds.join(', ')) : '—'}</span></div>
        <div class="kv"><span>Tổng cộng</span><span class="money" style="color:var(--primary);font-size:20px">${dinhDangEth(tong)}<div class="hint">≈ ${dinhDangVnd(tongVnd)}</div></span></div>
        <button class="btn primary lg block mt" data-tiep ${ds.length ? '' : 'disabled'}>${nhanNutTiep} ${icon('arrow')}</button>`;
      khung.querySelectorAll('[data-tiep]').forEach((b) => b.addEventListener('click', () =>
        this.ud.di(`/thanh-toan?${new URLSearchParams({ ma, ghe: ds.join(',') })}`)));
    };

    luoi.addEventListener('click', (e) => {
      const nut = e.target.closest('[data-g]');
      if (!nut) return;
      const g = nut.dataset.g;
      if (dangChon.has(g)) dangChon.delete(g);
      else if (dangChon.size >= TOI_DA_GHE) return thongBao(`Chỉ được chọn tối đa ${TOI_DA_GHE} ghế cho mỗi lần đặt.`);
      else dangChon.add(g);
      ve();
    });
    khung.querySelector('#tang')?.addEventListener('click', (e) => {
      const nut = e.target.closest('[data-t]');
      if (!nut) return;
      tangDangXem = Number(nut.dataset.t);
      khung.querySelectorAll('#tang button').forEach((x) => x.classList.toggle('on', x === nut));
      ve();
    });
    ve();
  }
}
