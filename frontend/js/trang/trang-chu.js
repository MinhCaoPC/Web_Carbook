// TRANG CHỦ — chức năng 1: chọn tuyến (điểm đi/đến lấy từ dữ liệu Firebase) và ngày đi.
// CÔNG KHAI: khách chưa đăng nhập cũng vào được (giới thiệu + tìm chuyến + xem ghế);
// chỉ khi bấm thanh toán mới phải đăng nhập.
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, dinhDangEth, rutGonDiaChi, dangXuLy } from '../giao-dien.js';
import { LichChonNgay } from '../lich-chon-ngay.js';

const loiChao = () => {
  const gioHienTai = new Date().getHours();
  return gioHienTai < 11 ? 'Chào buổi sáng' : gioHienTai < 14 ? 'Chào buổi trưa' : gioHienTai < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
};

export class TrangChu extends TrangCoSo {
  static menu = '/';
  static canDangNhap = false; // trang công khai

  async hienThi(khung, thamSo, truyVan) {
    const nd = this.ud.nguoiDung; // null = khách chưa đăng nhập

    khung.innerHTML = `
      ${nd ? this.htmlBannerThanhVien(nd) : this.htmlBannerKhachMoi()}

      <form class="card search-card" id="sf" novalidate>
        <div class="search-grid">
          <div class="field"><label for="tu">Điểm đi</label>
            <div class="ctrl">${icon('pin')}<input class="in" id="tu" list="ds-tu" placeholder="Chọn điểm đi" autocomplete="off" value="${h(truyVan.diemDi || '')}"></div></div>
          <button type="button" class="swap" id="doi-chieu" aria-label="Đổi chiều">${icon('swap')}</button>
          <div class="field"><label for="den">Điểm đến</label>
            <div class="ctrl">${icon('pin')}<input class="in" id="den" list="ds-den" placeholder="Chọn điểm đến" autocomplete="off" value="${h(truyVan.diemDen || '')}"></div></div>
          <div class="span-all search-row2" style="display:grid;gap:12px">
            <div class="field"><label>Ngày đi</label>
              <div class="ctrl" id="o-ngay">${icon('calendar')}<button type="button" class="in nut-lich" disabled>Đang tải…</button></div>
              <input type="hidden" id="ngay"></div>
            <div class="field"><label for="sl">Số vé</label>
              <div class="ctrl">${icon('users')}<select class="in" id="sl">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} vé</option>`).join('')}</select></div></div>
            <button class="btn primary lg" type="submit" style="align-self:end">${icon('search')} Tìm chuyến xe</button>
          </div>
        </div>
        <datalist id="ds-tu"></datalist><datalist id="ds-den"></datalist>
        <div class="err-msg hidden mt-s" id="loi"></div>
      </form>

      <div class="mt-l grid cols-4 qa-grid">${nd ? `
        <a class="qa" href="#/ve-cua-toi"><span class="ico">${icon('ticket')}</span>Vé của tôi</a>
        <a class="qa" href="#/vi"><span class="ico green">${icon('wallet')}</span>Ví MetaMask</a>
        <a class="qa" href="#/cho-ve"><span class="ico warn">${icon('swap')}</span>Chợ vé NFT</a>
        <a class="qa" href="#/tra-cuu"><span class="ico gray">${icon('shield')}</span>Tra cứu vé</a>` : `
        <a class="qa" href="#/tra-cuu"><span class="ico">${icon('shield')}</span>Tra cứu vé NFT</a>
        <a class="qa" href="#/dang-ky"><span class="ico green">${icon('user')}</span>Tạo tài khoản</a>
        <a class="qa" href="#/dang-nhap"><span class="ico warn">${icon('key')}</span>Đăng nhập</a>
        <a class="qa" href="https://metamask.io" target="_blank" rel="noopener"><span class="ico gray">${icon('fox')}</span>Cài MetaMask</a>`}
      </div>

      ${nd ? '' : `<div class="mt-l"><div class="sec-title">Đặt vé trong 4 bước</div>
        <div class="grid cols-4 buoc-dat-ve">${[
          ['search', 'Tìm chuyến', 'Chọn điểm đi, điểm đến và ngày đi. Chưa cần tài khoản.'],
          ['seat', 'Chọn ghế', 'Ghế trống / đã bán đọc thẳng từ blockchain — không bán trùng.'],
          ['fox', 'Thanh toán MetaMask', 'Đăng nhập, liên kết ví rồi trả ETH vào hợp đồng thông minh.'],
          ['ticket', 'Nhận vé NFT', 'Vé nằm trong ví của bạn: mở mã QR hoặc in ra để lên xe.'],
        ].map(([ic, tieuDe, moTa], i) => `<div class="card buoc"><span class="so-buoc">${i + 1}</span><span class="ico">${icon(ic)}</span>
            <h4>${tieuDe}</h4><p class="muted">${moTa}</p></div>`).join('')}
        </div></div>`}

      <div class="mt-l"><div class="sec-title">Vì sao chọn CARBOOK</div>
        <div class="grid cols-3">
          <div class="card feature"><span class="ico">${icon('ticket')}</span><div><h4>Vé là NFT, như vé concert</h4><p>Mỗi vé là một NFT chuẩn ERC-721 trong ví MetaMask của bạn. Ghế đã bán bị hợp đồng khóa — không bán trùng, không làm giả được.</p></div></div>
          <div class="card feature"><span class="ico green">${icon('swap')}</span><div><h4>Bán lại vé an toàn</h4><p>Không đi được? Rao bán trên chợ vé với giá tối đa 110% giá gốc. Người mua trả ETH, vé tự chuyển sang ví họ.</p></div></div>
          <div class="card feature"><span class="ico warn">${icon('refresh')}</span><div><h4>Hoàn tiền theo hợp đồng</h4><p>Hủy trước 24 giờ hoàn 90%, trước 2–24 giờ hoàn 50%. Tiền hoàn chuyển thẳng về ví, không cần ai duyệt.</p></div></div>
        </div>
      </div>`;

    this.ganTimKiem(khung, truyVan);
    if (nd) this.veOVi(khung.querySelector('#hero-vi'));
  }

  /** Banner cho thành viên đã đăng nhập: lời chào + số dư ví */
  htmlBannerThanhVien(nd) {
    const tenGoi = nd.hoTen.trim().split(/\s+/).slice(-1)[0];
    return `<section class="hero">
        <div class="hello">${loiChao()},</div>
        <h1>${h(tenGoi)} 👋<br> Hôm nay bạn đi đâu?</h1>
        <p>Đặt vé xe khách miền Tây, thanh toán bằng ví MetaMask — mỗi vé là một NFT nằm trong ví của riêng bạn.</p>
        <div class="hero-wallet" id="hero-vi"><div class="skel" style="width:160px;height:40px"></div></div>
      </section>`;
  }

  /** Banner cho khách CHƯA đăng nhập: giới thiệu + nút đăng nhập / đăng ký */
  htmlBannerKhachMoi() {
    return `<section class="hero">
        <div class="hello">${loiChao()} 👋</div>
        <h1>Vé xe khách miền Tây<br>— mỗi vé là một NFT</h1>
        <p>Tìm chuyến và xem ghế trống ngay, chưa cần tài khoản. Vé mua bằng ví MetaMask, nằm trong ví của bạn,
          bán lại tối đa 110% giá gốc và hoàn tiền tự động theo hợp đồng thông minh.</p>
        <div class="hero-wallet">
          <span class="ico" style="background:rgba(255,255,255,.18);color:#fff">${icon('user')}</span>
          <div class="grow"><small>Bạn chưa đăng nhập</small><div style="font-weight:700">Đăng nhập để mua vé</div></div>
          <div class="row nut-khach-moi">
            <a class="btn" style="background:#fff;color:var(--navy)" href="#/dang-nhap">Đăng nhập</a>
            <a class="btn primary" href="#/dang-ky">Đăng ký</a>
          </div>
        </div>
      </section>`;
  }

  /** Ô ví trong banner: số dư ETH của ví đã liên kết */
  async veOVi(o) {
    const vi = this.ud.nguoiDung.diaChiVi;
    const nenIcon = 'style="background:rgba(255,255,255,.18);color:#fff"';
    const nutTrang = 'class="btn sm" style="background:#fff;color:var(--navy)"';
    if (!vi) {
      o.innerHTML = `<span class="ico" ${nenIcon}>${icon('wallet')}</span>
        <div><small>Ví MetaMask</small><div style="font-weight:700">Chưa liên kết</div></div>
        <button ${nutTrang} id="lien-ket">${icon('link', 'sm')} Liên kết ví</button>`;
      o.querySelector('#lien-ket').addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => { await this.ud.lienKetVi(); this.veOVi(o); }));
      return;
    }
    let soDu = '…';
    try { soDu = dinhDangEth(await this.vi.laySoDu(vi)); } catch { soDu = 'Không đọc được'; }
    if (!this.conHienThi) return;
    o.innerHTML = `<span class="ico" ${nenIcon}>${icon('wallet')}</span>
      <div><small>Ví ${h(rutGonDiaChi(vi))}</small><div class="bal">${h(soDu)}</div></div>
      <a ${nutTrang} href="#/vi">${icon('next', 'sm')} Chi tiết</a>`;
  }

  async ganTimKiem(khung, truyVan) {
    const f = khung.querySelector('#sf');
    const loi = khung.querySelector('#loi');
    const baoLoi = (t) => { loi.textContent = t; loi.classList.remove('hidden'); };
    const [{ tuyen }, { danhSachNgay }] = await Promise.all([this.api.lay('/api/chuyen-xe/dia-diem'), this.api.lay('/api/chuyen-xe/ngay')]);
    if (!this.conHienThi) return;

    // Chỉ gợi ý tuyến CÓ THẬT: điểm đến phụ thuộc điểm đi
    const goiY = (ds) => [...new Set(ds)].map((x) => `<option value="${h(x)}">`).join('');
    const capNhatDiemDen = () => {
      const tu = f.tu.value.trim();
      khung.querySelector('#ds-den').innerHTML = goiY(tuyen.filter((t) => !tu || t.diemDi === tu).map((t) => t.diemDen));
    };
    khung.querySelector('#ds-tu').innerHTML = goiY(tuyen.map((t) => t.diemDi));
    capNhatDiemDen();
    f.tu.addEventListener('input', capNhatDiemDen);

    // Ô "Ngày đi" = khung lịch tháng; chỉ chọn được các ngày đang bán vé. Giá trị giữ trong input ẩn #ngay.
    f.ngay.value = danhSachNgay.includes(truyVan.ngay) ? truyVan.ngay : danhSachNgay[0];
    new LichChonNgay(khung.querySelector('#o-ngay'), { ngayChoPhep: danhSachNgay, giaTri: f.ngay.value, khiDoi: (n) => { f.ngay.value = n; } });

    f.querySelector('#doi-chieu').addEventListener('click', () => { const t = f.tu.value; f.tu.value = f.den.value; f.den.value = t; capNhatDiemDen(); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const diemDi = f.tu.value.trim();
      const diemDen = f.den.value.trim();
      if (!diemDi || !diemDen) return baoLoi('Vui lòng chọn điểm đi và điểm đến.');
      if (diemDi === diemDen) return baoLoi('Điểm đi và điểm đến không được trùng nhau.');
      if (!tuyen.some((t) => t.diemDi === diemDi && t.diemDen === diemDen)) {
        const coTuyen = tuyen.filter((t) => t.diemDi === diemDi).map((t) => t.diemDen);
        return baoLoi(coTuyen.length
          ? `Chưa có tuyến ${diemDi} → ${diemDen}. Từ ${diemDi} hiện có: ${coTuyen.slice(0, 4).join(', ')}${coTuyen.length > 4 ? '…' : ''}.`
          : `Chưa có chuyến khởi hành từ "${diemDi}". Hãy chọn điểm đi trong danh sách gợi ý.`);
      }
      loi.classList.add('hidden');
      this.ud.di(`/tim?${new URLSearchParams({ diemDi, diemDen, ngay: f.ngay.value, sl: f.sl.value })}`);
    });
  }
}
