// CHI TIẾT VÉ (vé lên xe) — chức năng 4 phía khách hàng:
// khách KÝ một câu xác nhận bằng MetaMask (không tốn gas); chữ ký được đưa vào mã QR.
// Khi soát vé, hợp đồng khôi phục ví đã ký và so với chủ NFT hiện tại -> ảnh QR cũ của người đã bán vé vô hiệu.
import { TrangCoSo } from './trang-co-so.js';
import { ThaoTacVe } from './thao-tac-ve.js';
import { icon, h, ngayGio, thoiLuong, dinhDangEth, dinhDangVnd, weiSangVnd, rutGonDiaChi, nhanTrangThaiVe, nutQuayLai, dangXuLy, veQR, saoChep, htmlMaTraCuu } from '../giao-dien.js';

export class TrangChiTietVe extends TrangCoSo {
  static tieuDe = 'Vé lên xe';
  static menu = '/ve-cua-toi';
  static doRong = 'mid';

  async hienThi(khung, { maVe }) {
    this.khung = khung;
    this.thaoTac = new ThaoTacVe(this.ud);
    const { danhSach } = await this.api.lay('/api/ve/cua-toi');
    const ve = danhSach.find((v) => v.maVe === Number(maVe));
    if (!ve) throw new Error(`Vé #${maVe} không có trong ví đã liên kết của bạn (có thể đã bán, tặng hoặc hủy).`);
    this.ve = ve;

    const c = ve.chuyen || {};
    const conDung = ve.trangThai === 'HIEU_LUC';
    const dangRao = BigInt(ve.giaDangRaoWei) > 0n;
    const diaChiHopDong = this.ud.thongTinHopDong.diaChi;

    khung.innerHTML = `
      <div class="page-head no-print">${nutQuayLai('/ve-cua-toi')}<div class="grow"><h1>Vé lên xe</h1></div>
        <button class="btn sm" id="in">${icon('print', 'sm')} In vé</button></div>
      <div class="split">
        <section class="stack">
          <div class="pass">
            <div class="pass-top">
              <div class="row between"><b style="letter-spacing:.1em">CARBOOK</b><span class="badge" style="background:rgba(255,255,255,.18);color:#fff">${h(c.loaiXe || '')}${c.bienSoXe ? ' · ' + h(c.bienSoXe) : ''}</span></div>
              <div class="pass-route"><div class="big">${h(c.diemKhoiHanh || ve.maChuyen)}</div>${icon('arrow')}<div class="big" style="text-align:right">${h(c.diemKetThuc || '')}</div></div>
              <div class="row between mt" style="font-size:14px;opacity:.85"><span>${ngayGio(ve.gioKhoiHanh)}</span><span>${c.gioDen ? thoiLuong(c.gioKhoiHanh, c.gioDen) : ''}</span></div>
            </div>
            <div class="pass-cut"></div>
            <div class="pass-body center" id="vung-qr">
              ${conDung ? `
                <p class="muted">Mã QR chứa <b>chữ ký của ví bạn</b> để chứng minh bạn là chủ vé. Ký không tốn phí.</p>
                <button class="btn primary lg mt" id="nut-qr">${icon('qr')} Hiện mã QR lên xe</button>`
                : `<div class="warn-msg">Vé ${ve.trangThai === 'DA_SU_DUNG' ? 'đã được sử dụng' : 'không còn hiệu lực'}.</div>`}
            </div>
          </div>
        </section>
        <aside class="stack">
          <div class="card"><h3>Hành khách</h3>
            ${ve.hanhKhach ? `
              <div class="kv"><span>Họ tên</span><span>${h(ve.hanhKhach.hoTen)}</span></div>
              <div class="kv"><span>Điện thoại</span><span>${h(ve.hanhKhach.sdt || '—')}</span></div>`
              : '<div class="warn-msg">Chưa có thông tin hành khách.</div>'}
            <div class="kv"><span>Ghế</span><span>${h(ve.maGhe)}</span></div>
            ${conDung ? `<button class="btn sm ghost block mt-s" data-viec="capNhatHanhKhach">${icon('edit', 'sm')} Sửa thông tin hành khách</button>` : ''}
          </div>
          <div class="card"><h3>Vé NFT</h3>
            ${htmlMaTraCuu(ve)}
            <div class="goi-y-etherscan">Tra trên Etherscan (Read Contract):<br>
              <code>layVe</code> → <code>${ve.maVe}</code><br>
              <code>layTrangThaiGhe</code> → <code>${h(ve.maChuyen)}</code> và <code>${h(JSON.stringify([ve.maGhe]))}</code>
              <button type="button" class="nut-chep" data-chep="${h(JSON.stringify([ve.maGhe]))}" title="Sao chép danh sách ghế" aria-label="Sao chép danh sách ghế">${icon('copy', 'sm')}</button></div>
            <div class="kv mt-s"><span>Trạng thái</span><span>${nhanTrangThaiVe(ve.trangThai, dangRao)}</span></div>
            <div class="kv"><span>Giá gốc</span><span>${dinhDangEth(ve.giaGocWei)}<div class="hint">≈ ${dinhDangVnd(weiSangVnd(ve.giaGocWei, this.ud.tyGia))}</div></span></div>
            ${dangRao ? `<div class="kv"><span>Đang rao</span><span>${dinhDangEth(ve.giaDangRaoWei)}</span></div>` : ''}
            <div class="kv"><span>Chủ sở hữu</span><span class="mono" title="${h(ve.chuSoHuu)}">${h(rutGonDiaChi(ve.chuSoHuu))}</span></div>
            <div class="kv"><span>Hợp đồng</span><span class="mono" title="${h(diaChiHopDong)}">${h(rutGonDiaChi(diaChiHopDong))}</span></div>
            ${this.ud.thongTinHopDong.tenMang === 'sepolia'
              // Sepolia là mạng công khai: ai cũng tự mở Etherscan xem NFT này thuộc ví nào, lịch sử chuyển ra sao
              ? `<a class="btn ghost block mt-s" target="_blank" rel="noopener" href="https://sepolia.etherscan.io/nft/${h(diaChiHopDong)}/${h(ve.maVe)}">${icon('shield', 'sm')} Xem NFT này trên Etherscan ${icon('ext', 'sm')}</a>`
              : `<a class="btn ghost block mt-s" href="#/vi">${icon('shield', 'sm')} Kiểm chứng trên blockchain</a>`}
          </div>
          ${conDung ? `<div class="card"><h3>Thao tác</h3><div class="row wrap">
            ${dangRao ? '<button class="btn sm" data-viec="goRao">Huỷ rao bán</button>'
              : `<button class="btn sm" data-viec="raoBan">${icon('swap', 'sm')} Rao bán</button>
                 <button class="btn sm" data-viec="tangVe">${icon('gift', 'sm')} Tặng vé</button>
                 <button class="btn sm danger-o" data-viec="huyVe">Hủy vé</button>`}
          </div></div>` : ''}
          <div class="info-msg">Vui lòng có mặt tại điểm đón ít nhất 30 phút trước giờ khởi hành.</div>
        </aside>
      </div>`;

    khung.querySelector('#in').addEventListener('click', (e) => dangXuLy(e.currentTarget, () => this.inVe(), 'Chờ ký trên MetaMask…'));
    khung.querySelector('#nut-qr')?.addEventListener('click', (e) => dangXuLy(e.currentTarget, () => this.hienQR(), 'Chờ ký trên MetaMask…'));
    khung.querySelectorAll('[data-viec]').forEach((nut) => nut.addEventListener('click', () =>
      dangXuLy(nut, async () => {
        if (!(await this.thaoTac[nut.dataset.viec](this.ve))) return;
        if (nut.dataset.viec === 'huyVe' || nut.dataset.viec === 'tangVe') this.ud.di('/ve-cua-toi');
        else this.ud.chuyenTrang();
      })));
  }

  /**
   * Tạo mã QR lên xe: khách ký câu xác nhận của hợp đồng bằng MetaMask (không tốn phí) -> QR = { maVe, chuKy }.
   * QR không có hạn, dùng được cả trên điện thoại lẫn in ra giấy. Vé chỉ lên xe được MỘT lần;
   * nếu bán / tặng vé thì QR này tự mất hiệu lực (chữ ký không còn là của chủ vé).
   */
  async hienQR() {
    await this.ud.damBaoSanSangGiaoDich();
    const chuKy = await this.vi.kyThongDiep(await this.hopDong.noiDungCanKy(this.ve.maVe));
    const noiDungQR = JSON.stringify({ maVe: this.ve.maVe, chuKy });

    const vung = this.khung.querySelector('#vung-qr');
    vung.innerHTML = `
      <div class="qr-box" id="qr"></div>
      <div class="mt-s"><b>Ghế ${h(this.ve.maGhe)} · NFT #${this.ve.maVe} · ${h(this.ve.maChuyen)}</b></div>
      <p class="center muted mt-s">Quét mã QR để lên xe · <i>Scan to board</i><br>Mỗi vé chỉ lên xe được một lần — giữ mã này như vé giấy.</p>
      <textarea class="in qr-text mono mt-s no-print" readonly>${h(noiDungQR)}</textarea>
      <button class="btn sm mt-s no-print" id="chep">${icon('copy', 'sm')} Sao chép mã (dán vào trang Soát vé)</button>`;
    vung.querySelector('#chep').addEventListener('click', () => saoChep(noiDungQR, 'Đã sao chép mã QR'));
    this.daCoQR = true;
    await veQR(vung.querySelector('#qr'), noiDungQR, 220);
  }

  /** In vé giấy: chưa có QR thì ký tạo QR trước, rồi mở hộp thoại in của trình duyệt. */
  async inVe() {
    if (!this.daCoQR) await this.hienQR();
    await new Promise((r) => setTimeout(r, 300)); // chờ ảnh QR vẽ xong
    window.print();
  }
}
