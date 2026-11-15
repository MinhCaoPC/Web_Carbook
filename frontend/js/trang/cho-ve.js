// CHỢ VÉ NFT — chức năng 6: mua lại vé người khác rao bán (giá đã bị hợp đồng giới hạn ≤ 110% giá gốc).
// Người mua gửi ETH -> hợp đồng chuyển tiền cho người bán VÀ chuyển NFT sang ví người mua trong CÙNG một giao dịch.
import { TrangCoSo } from './trang-co-so.js';
import { ThaoTacVe } from './thao-tac-ve.js';
import { icon, h, ngayGio, dinhDangEth, dinhDangVnd, weiSangVnd, hoiXacNhan, baoThanhCong, dangXuLy, htmlDangTai, htmlTrong, htmlLoi } from '../giao-dien.js';

export class TrangChoVe extends TrangCoSo {
  static tieuDe = 'Chợ vé NFT';
  static menu = '/cho-ve';
  static doRong = 'mid';

  async hienThi(khung) {
    this.khung = khung;
    khung.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Chợ vé NFT</h1><div class="sub">Mua lại vé của người không đi được — giá tối đa 110% giá gốc.</div></div>
        <a class="btn sm" href="#/tra-cuu">${icon('shield', 'sm')} Tra cứu vé</a>
        <a class="btn sm" href="#/ve-cua-toi">${icon('ticket', 'sm')} Vé của tôi</a></div>
      <div class="info-msg">Khi mua, NFT chuyển sang ví của bạn ngay trong giao dịch. Mã QR của người bán tự mất hiệu lực vì không còn là chủ vé. Vé còn dưới 2 giờ trước giờ chạy không được mua bán.</div>
      <div id="ds" class="mt">${htmlDangTai}</div>`;
    await this.taiLai();
  }

  async taiLai() {
    const ds = this.khung.querySelector('#ds');
    let tin;
    try { tin = (await this.api.lay('/api/ve/cho')).danhSach; } catch (loi) { ds.innerHTML = htmlLoi(loi.message); return; }
    if (!this.conHienThi) return;
    if (!tin.length) { ds.innerHTML = htmlTrong('ticket', 'Chưa có vé nào được rao bán', 'Khi có người rao bán lại vé, vé sẽ xuất hiện ở đây.'); return; }

    const viCuaToi = this.ud.nguoiDung.diaChiVi;
    ds.innerHTML = `<div class="grid cols-2">${tin.map((v) => {
      const c = v.chuyen || {};
      const cuaToi = viCuaToi && v.chuSoHuu === viCuaToi;
      return `<div class="card">
        <div class="row between"><div class="row"><span class="ico">${icon('ticket')}</span><div><b>${h(c.diemKhoiHanh || v.maChuyen)} → ${h(c.diemKetThuc || '')}</b>
          <div class="hint">${ngayGio(v.gioKhoiHanh)} · Ghế ${h(v.maGhe)}</div></div></div><span class="badge gray">NFT #${v.maVe}</span></div>
        <div class="trip-foot"><div><div class="hint">Giá gốc <s>${dinhDangEth(v.giaGocWei)}</s></div>
            <span class="price">${dinhDangEth(v.giaDangRaoWei)}</span><div class="hint">≈ ${dinhDangVnd(weiSangVnd(v.giaDangRaoWei, this.ud.tyGia))}</div></div>
          ${cuaToi ? `<button class="btn sm danger-o" data-go="${v.maVe}">Huỷ rao bán</button>`
            : `<button class="btn sm primary" data-mua="${v.maVe}">${icon('fox', 'sm')} Mua vé</button>`}</div>
      </div>`;
    }).join('')}</div>`;

    ds.querySelectorAll('[data-mua]').forEach((nut) => nut.addEventListener('click', () =>
      dangXuLy(nut, () => this.muaLai(tin.find((v) => v.maVe === Number(nut.dataset.mua))), 'Chờ MetaMask…')));
    ds.querySelectorAll('[data-go]').forEach((nut) => nut.addEventListener('click', () =>
      dangXuLy(nut, async () => { if (await new ThaoTacVe(this.ud).goRao(tin.find((v) => v.maVe === Number(nut.dataset.go)))) await this.taiLai(); })));
  }

  async muaLai(ve) {
    await this.ud.damBaoSanSangGiaoDich();
    const c = ve.chuyen || {};
    const dongY = await hoiXacNhan({
      tieuDe: 'Xác nhận mua vé', dongY: 'Mua vé',
      noiDungHtml: `<p>${h(c.diemKhoiHanh || ve.maChuyen)} → ${h(c.diemKetThuc || '')} · ${ngayGio(ve.gioKhoiHanh)} · Ghế <b>${h(ve.maGhe)}</b></p>
        <div class="info-msg mt-s">Bạn sẽ trả <b>${dinhDangEth(ve.giaDangRaoWei)}</b> qua MetaMask. Vé NFT #${ve.maVe} chuyển ngay sang ví của bạn.</div>`,
    });
    if (!dongY) return;
    await this.hopDong.muaLaiVe(ve.maVe, ve.giaDangRaoWei);
    baoThanhCong('Mua vé thành công! Hãy nhập thông tin hành khách.');
    // Chủ mới cần nhập họ tên hành khách (off-chain)
    await new ThaoTacVe(this.ud).capNhatHanhKhach({ ...ve, hanhKhach: null }).catch(() => false);
    this.ud.di(`/ve/${ve.maVe}`);
  }
}
