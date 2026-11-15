// THANH TOÁN — chức năng 2: khách trả ETH qua MetaMask, hợp đồng kiểm tra ghế rồi mint NFT vé vào ví khách.
// Sau đó họ tên/SĐT hành khách được lưu OFF-CHAIN (Firebase), không công khai trên blockchain.
//
// Trang chia thành các khối dễ kiểm tra trước khi trả tiền:
//   1. Thông tin chuyến đi (giờ đi → giờ đến dự kiến) + MÃ CHUYẾN
//   2. Thông tin hành khách (bấm "Chỉnh sửa" để sửa ngay tại chỗ)
//   3. Điểm đón & trả
//   4. Ghế đã chọn (MÃ GHẾ) + loại vé
//   5. Lưu ý + phương thức thanh toán
//   6. Tổng tiền + nút thanh toán
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, gio, ngay, thuDayDu, thoiLuong, dinhDangVnd, dinhDangEth, rutGonDiaChi, nutQuayLai, dangXuLy, baoLoi, htmlMaTraCuu } from '../giao-dien.js';

/** "Thứ sáu, 15 Tháng 11, 2026" */
const ngayDayDu = (v) => { const d = new Date(v); return `${thuDayDu(d)}, ${d.getDate()} Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`; };
/** "0909123489" -> "090 •••• 89" (che bớt số điện thoại khi hiển thị) */
const cheSoDienThoai = (sdt) => (sdt && sdt.length >= 6 ? `${sdt.slice(0, 3)} •••• ${sdt.slice(-2)}` : sdt || '—');
/** Ô mã có nút sao chép (giống khối mã tra cứu của vé) */
const oMa = (nhan, giaTri) =>
  `<span class="ma-tra-cuu-o"><span>${nhan}</span><code>${h(giaTri)}</code><button type="button" class="nut-chep" data-chep="${h(giaTri)}" aria-label="Sao chép ${nhan.toLowerCase()}">${icon('copy', 'sm')}</button></span>`;

export class TrangThanhToan extends TrangCoSo {
  static tieuDe = 'Kiểm tra thông tin';
  static menu = '/';
  static doRong = 'mid';

  async hienThi(khung, thamSo, { ma, ghe = '' }) {
    const dsGhe = ghe.split(',').filter(Boolean);
    if (!ma || !dsGhe.length) return this.ud.di('/', { thayThe: true });
    this.khung = khung;
    this.ma = ma;
    this.dsGhe = dsGhe;

    const { chuyen, trenChuoi, soDoGhe } = await this.api.lay(`/api/chuyen-xe/${encodeURIComponent(ma)}`);
    this.chuyen = chuyen;
    this.giaWei = BigInt(trenChuoi.giaVeWei);
    const nd = this.ud.nguoiDung;
    this.hanhKhach = { hoTen: nd.hoTen || '', sdt: nd.sdt || '' }; // có thể sửa riêng cho chuyến này
    const daBan = dsGhe.filter((g) => (soDoGhe.find((x) => x.maGhe === g)?.maVe || 0) > 0);
    const tongWei = this.giaWei * BigInt(dsGhe.length);
    const tongVnd = chuyen.giaVe * dsGhe.length;
    const khongMuaDuoc = daBan.length > 0 || !trenChuoi.dangMoBan;
    const nutThanhToan = (lop) => `<button class="btn primary lg ${lop}" data-thanh-toan ${khongMuaDuoc ? 'disabled' : ''}>${icon('fox')} Thanh toán</button>`;

    khung.innerHTML = `
      <div class="page-head">${nutQuayLai(`/chuyen/${encodeURIComponent(ma)}`)}<div class="grow"><h1>Kiểm tra thông tin</h1>
        <div class="sub">Vui lòng kiểm tra lại các chi tiết cho chuyến hành trình của bạn.</div></div></div>
      ${daBan.length ? `<div class="err-msg">Ghế ${h(daBan.join(', '))} vừa có người mua. Hãy quay lại chọn ghế khác.</div>` : ''}
      ${trenChuoi.dangMoBan ? '' : '<div class="err-msg">Chuyến này chưa được nhà xe mở bán trên blockchain nên chưa mua được.</div>'}

      <div class="split mt-s">
        <section class="stack">
          ${this.htmlChuyenDi(chuyen)}
          <div class="card" id="o-hanh-khach">${this.htmlHanhKhach()}</div>
          ${this.htmlDiemDonTra(chuyen)}

          <div class="grid cols-2 o-nho-hang">
            <div class="card o-nho"><div class="nhan-nho">Số ghế đã chọn</div>
              <div class="row between"><b class="gia-tri-nho">${icon('seat', 'sm')} ${h(dsGhe.join(', '))}</b>
                <a class="nut-sua" href="#/chuyen/${encodeURIComponent(ma)}" title="Chọn lại ghế" aria-label="Chọn lại ghế">${icon('edit', 'sm')}</a></div></div>
            <div class="card o-nho"><div class="nhan-nho">Loại vé</div>
              <b class="gia-tri-nho">${icon('bus', 'sm')} ${h(chuyen.loaiXe || 'Vé xe')}</b></div>
          </div>

          <div class="card"><div class="nhan-nho">Mã đặt chỗ trên blockchain</div>
            <div class="ma-tra-cuu">${oMa('Mã chuyến', ma)}${dsGhe.map((g) => oMa('Mã ghế', g)).join('')}</div>
            <p class="hint mt-s" style="margin-bottom:0">Mỗi ghế sẽ nhận một <b>mã vé NFT</b> riêng ngay sau khi thanh toán.</p></div>

          <div class="luu-y">${icon('alert', 'sm')}<div><b>Lưu ý quan trọng</b>
            <p>Vui lòng có mặt tại điểm đón ít nhất <b>30 phút</b> trước giờ khởi hành để làm thủ tục lên xe.
              Hủy vé trước giờ chạy ≥ 24 giờ hoàn 90%, từ 2–24 giờ hoàn 50%, dưới 2 giờ không hủy được (ghi trong hợp đồng).</p></div></div>

          <div class="card stack">
            <div class="nhan-nho" style="margin:0">Phương thức thanh toán</div>
            <label class="method on"><input type="radio" checked>
              <span class="ico warn">${icon('fox')}</span>
              <div class="grow"><b>Ví MetaMask (ETH)</b>
                <div class="hint">${this.vi.diaChi ? `Đang kết nối ${h(rutGonDiaChi(this.vi.diaChi))}` : 'MetaMask sẽ hiện lên khi bấm thanh toán'}</div></div>
            </label>
            <p class="hint" style="margin:0">Tiền gửi thẳng vào hợp đồng <b>VeXeNFT</b>: hợp đồng khóa ghế rồi phát hành vé NFT vào ví bạn trong cùng một giao dịch.</p>
          </div>
        </section>

        <aside class="stack sticky-side only-lg">
          <div class="card"><h3>Tóm tắt</h3>
            <div class="kv"><span>Tuyến</span><span>${h(chuyen.diemKhoiHanh)} → ${h(chuyen.diemKetThuc)}</span></div>
            <div class="kv"><span>Khởi hành</span><span>${gio(chuyen.gioKhoiHanh)} · ${ngay(chuyen.gioKhoiHanh)}</span></div>
            <div class="kv"><span>Ghế</span><span>${h(dsGhe.join(', '))}</span></div>
            <div class="kv"><span>Đơn giá</span><span>${dinhDangVnd(chuyen.giaVe)}</span></div>
            <div class="tong-tien mt"><div class="nhan-nho">Tổng cộng tạm tính</div>
              <div class="so-tien">${dinhDangVnd(tongVnd)}</div><div class="hint">= ${dinhDangEth(tongWei)} trả qua MetaMask</div></div>
            ${nutThanhToan('block mt')}
          </div>
        </aside>
      </div>

      <div class="bar-fixed hide-lg"><div class="pay-bar">
        <div class="grow"><div class="nhan-nho" style="margin:0">Tổng cộng tạm tính</div>
          <div class="so-tien" style="font-size:22px">${dinhDangVnd(tongVnd)}</div><div class="hint">${dinhDangEth(tongWei)}</div></div>
        ${nutThanhToan('')}
      </div></div>`;

    khung.querySelectorAll('[data-thanh-toan]').forEach((nut) =>
      nut.addEventListener('click', () => dangXuLy(nut, () => this.thanhToan(), 'Chờ MetaMask…')));
    this.ganSuaHanhKhach();
    if (!this.hanhKhach.hoTen) this.moSuaHanhKhach(); // chưa có tên thì mở sẵn ô nhập
  }

  /** Khối 1: thông tin chuyến đi dạng dòng thời gian */
  htmlChuyenDi(c) {
    return `<div class="card pad-0">
      <div class="the-dau">${icon('bus', 'sm')} Thông tin chuyến đi
        <span class="the-dau-phu">${h(thoiLuong(c.gioKhoiHanh, c.gioDen))}${c.quangDuongKm ? ` · ${c.quangDuongKm} km` : ''}</span></div>
      <div class="the-than">
        <div class="lo-trinh">
          <div class="moc"><div class="nhan">KHỞI HÀNH</div><div class="gio-lon">${gio(c.gioKhoiHanh)}</div>
            <div class="ngay-dai">${h(ngayDayDu(c.gioKhoiHanh))}</div><div class="noi">${h(c.diemKhoiHanh)}</div></div>
          <div class="moc den"><div class="nhan">ĐẾN NƠI (DỰ KIẾN)</div><div class="gio-lon">${gio(c.gioDen)}</div>
            <div class="ngay-dai">${h(ngayDayDu(c.gioDen))}</div><div class="noi">${h(c.diemKetThuc)}</div></div>
        </div>
        <div class="ma-tra-cuu">${oMa('Mã chuyến', c.maChuyen)}
          ${c.bienSoXe ? `<span class="ma-tra-cuu-o" style="padding-right:10px"><span>Xe</span><code>${h(c.bienSoXe)}</code></span>` : ''}</div>
      </div></div>`;
  }

  /** Khối 2: thông tin hành khách — chế độ XEM (bấm "Chỉnh sửa" để sửa) */
  htmlHanhKhach() {
    const hk = this.hanhKhach;
    return `<div class="row between"><h3 style="margin:0">${icon('user', 'sm')} Thông tin hành khách</h3>
        <button type="button" class="nut-chu" id="sua-hk">${icon('edit', 'sm')} Chỉnh sửa</button></div>
      <div class="o-thong-tin mt-s">
        <div><div class="nhan-nho">Họ và tên</div><div class="gia-tri">${h(hk.hoTen || '— chưa có —')}</div></div>
        <div><div class="nhan-nho">Số điện thoại</div><div class="gia-tri">${h(cheSoDienThoai(hk.sdt))}</div></div>
        <div><div class="nhan-nho">Email</div><div class="gia-tri">${h(this.ud.nguoiDung.email)}</div></div>
      </div>
      <p class="hint" style="margin:8px 0 0">Lưu off-chain (không công khai trên blockchain), để nhân viên đối chiếu khi soát vé.</p>`;
  }

  ganSuaHanhKhach() {
    this.khung.querySelector('#sua-hk')?.addEventListener('click', () => this.moSuaHanhKhach());
  }

  /** Khối 2: chế độ SỬA ngay tại chỗ */
  moSuaHanhKhach() {
    const o = this.khung.querySelector('#o-hanh-khach');
    o.innerHTML = `<h3 style="margin:0">${icon('user', 'sm')} Thông tin hành khách</h3>
      <form class="form-grid two mt-s" id="f-hk" novalidate>
        <div class="field"><label for="ten">Họ và tên</label><input class="in" id="ten" value="${h(this.hanhKhach.hoTen)}" autocomplete="name"></div>
        <div class="field"><label for="sdt">Số điện thoại</label><input class="in" id="sdt" type="tel" value="${h(this.hanhKhach.sdt)}" autocomplete="tel"></div>
        <div class="full row" style="justify-content:flex-end;gap:8px"><button class="btn sm primary" type="submit">Xong</button></div>
      </form>`;
    o.querySelector('#f-hk').addEventListener('submit', (e) => {
      e.preventDefault();
      const hoTen = o.querySelector('#ten').value.trim();
      if (!hoTen) return baoLoi(new Error('Vui lòng nhập họ tên hành khách.'));
      this.hanhKhach = { hoTen, sdt: o.querySelector('#sdt').value.trim() };
      o.innerHTML = this.htmlHanhKhach();
      this.ganSuaHanhKhach();
    });
    o.querySelector('#ten').focus();
  }

  /** Khối 3: điểm đón & trả */
  htmlDiemDonTra(c) {
    return `<div class="card"><h3 style="margin:0 0 10px">${icon('pin', 'sm')} Điểm đón & trả</h3>
      <div class="diem don">${icon('pin', 'sm')}<div><b>Điểm đón: ${h(c.diemKhoiHanh)}</b>
        <div class="hint">Lên xe lúc ${gio(c.gioKhoiHanh)} · nhà xe sẽ gọi xác nhận vị trí đón cụ thể</div></div></div>
      <div class="diem tra mt-s">${icon('pin', 'sm')}<div><b>Điểm trả: ${h(c.diemKetThuc)}</b>
        <div class="hint">Dự kiến tới lúc ${gio(c.gioDen)}</div></div></div></div>`;
  }

  async thanhToan() {
    const { hoTen, sdt } = this.hanhKhach;
    if (!hoTen) { this.moSuaHanhKhach(); throw new Error('Vui lòng nhập họ tên hành khách.'); }

    await this.ud.damBaoSanSangGiaoDich();

    // 1) GIAO DỊCH BLOCKCHAIN: gửi ETH -> hợp đồng khóa ghế + mint NFT (mỗi ghế một vé, đúng thứ tự ghế đã chọn)
    const { danhSachMaVe, maGiaoDich } = await this.hopDong.muaVe(this.ma, this.dsGhe, this.giaWei);

    // 2) OFF-CHAIN: lưu thông tin hành khách theo mã vé
    try {
      await this.api.gui('/api/ve/hanh-khach', { danhSach: danhSachMaVe.map((maVe) => ({ maVe, hoTen, sdt })) });
    } catch (loi) {
      baoLoi(new Error(`Đã mua vé nhưng chưa lưu được thông tin hành khách: ${loi.message}`));
    }
    this.veKetQua(danhSachMaVe, maGiaoDich);
  }

  /** Màn hình đặt vé thành công: mỗi ghế kèm MÃ VÉ NFT, mã chuyến (có nút sao chép) */
  veKetQua(danhSachMaVe, maGiaoDich) {
    const tt = this.ud.thongTinHopDong;
    this.khung.className = 'page narrow';
    this.khung.innerHTML = `
      <div class="success-hero">
        <div class="tick">${icon('check')}</div>
        <h1>Đặt vé thành công!</h1>
        <p class="muted mt-s">${danhSachMaVe.length} vé NFT đã nằm trong ví MetaMask của bạn.</p>
      </div>
      <div class="card mt">
        <div class="kv"><span>Tuyến</span><span>${h(this.chuyen.diemKhoiHanh)} → ${h(this.chuyen.diemKetThuc)}</span></div>
        <div class="kv"><span>Khởi hành</span><span>${gio(this.chuyen.gioKhoiHanh)} · ${h(ngayDayDu(this.chuyen.gioKhoiHanh))}</span></div>
        <div class="kv"><span>Hành khách</span><span>${h(this.hanhKhach.hoTen)}</span></div>
        <div class="kv"><span>Mã giao dịch</span><span class="mono">${tt.tenMang === 'sepolia'
          ? `<a target="_blank" rel="noopener" href="https://sepolia.etherscan.io/tx/${h(maGiaoDich)}">${h(maGiaoDich.slice(0, 18))}… ${icon('ext', 'sm')}</a>`
          : h(maGiaoDich.slice(0, 18) + '…')}</span></div>
      </div>
      <div class="stack mt">${danhSachMaVe.map((maVe, i) => `
        <div class="card"><div class="row between"><b>${icon('ticket', 'sm')} Ghế ${h(this.dsGhe[i])}</b>
          <a class="btn sm" href="#/ve/${maVe}">${icon('qr', 'sm')} Xem vé</a></div>
          ${htmlMaTraCuu({ maVe, maChuyen: this.ma, maGhe: this.dsGhe[i] })}</div>`).join('')}
      </div>
      <div class="stack mt">
        <a class="btn primary lg block" href="#/ve/${danhSachMaVe[0]}">${icon('ticket')} Xem vé lên xe</a>
        <a class="btn ghost lg block" href="#/ve-cua-toi">Tất cả vé của tôi</a>
      </div>`;
  }
}
