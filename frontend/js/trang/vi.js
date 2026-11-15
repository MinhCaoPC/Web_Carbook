// VÍ METAMASK & HỢP ĐỒNG — thay cho trang "Ví CarbookPay" cũ.
// Ví của khách giờ là ví MetaMask thật; tài khoản web chỉ LIÊN KẾT với ví bằng một chữ ký (không tốn gas).
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, dinhDangEth, dinhDangVnd, weiSangVnd, rutGonDiaChi, dangXuLy, saoChep, baoThanhCong } from '../giao-dien.js';

export class TrangVi extends TrangCoSo {
  static tieuDe = 'Ví MetaMask';
  static menu = '/vi';
  static doRong = 'mid';

  async hienThi(khung) {
    const nd = this.ud.nguoiDung;
    const tt = this.ud.thongTinHopDong;
    const viMo = this.vi.diaChi;
    const viLienKet = nd.diaChiVi;
    const lech = viLienKet && viMo && viLienKet !== viMo;

    let soDu = null;
    if (viLienKet) { try { soDu = await this.vi.laySoDu(viLienKet); } catch { /* blockchain chưa chạy */ } }
    if (!this.conHienThi) return;

    khung.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Ví MetaMask</h1><div class="sub">Vé NFT và tiền ETH nằm trong ví này — chỉ bạn giữ khóa.</div></div></div>

      <div class="wallet-card">
        <div class="lab">${viLienKet ? 'Số dư ví đã liên kết' : 'Chưa liên kết ví'}</div>
        <div class="amt">${soDu !== null ? h(dinhDangEth(soDu)) : '— ETH'}</div>
        ${soDu !== null ? `<div class="lab" style="margin:-10px 0 14px">≈ ${dinhDangVnd(weiSangVnd(soDu, this.ud.tyGia))} (tỷ giá demo)</div>` : ''}
        <span class="addr">${icon('link', 'sm')}${viLienKet ? h(rutGonDiaChi(viLienKet)) : 'Hãy liên kết ví MetaMask'}</span>
      </div>

      ${!this.vi.coMetaMask ? `<div class="warn-msg mt">Trình duyệt này chưa có MetaMask. Hãy cài tiện ích tại <a href="https://metamask.io" target="_blank" rel="noopener">metamask.io</a> rồi tải lại trang.</div>` : ''}
      ${lech ? `<div class="warn-msg mt">MetaMask đang mở ví <span class="mono">${h(rutGonDiaChi(viMo))}</span>, khác ví đã liên kết. Hãy đổi tài khoản trong MetaMask, hoặc bấm "Liên kết ví đang mở".</div>` : ''}

      <div class="action-grid mt">
        <button class="action" id="ket-noi">${icon('fox', 'lg')}${viMo ? 'Đã kết nối' : 'Kết nối ví'}</button>
        <button class="action" id="lien-ket">${icon('link', 'lg')}${viLienKet ? 'Liên kết ví đang mở' : 'Liên kết ví'}</button>
        <button class="action" id="sao-chep" ${viLienKet ? '' : 'disabled'}>${icon('copy', 'lg')}Sao chép địa chỉ</button>
        ${this.ud.loaiGiaoDien === 'khach' ? `<a class="action" href="#/ve-cua-toi">${icon('ticket', 'lg')}Vé của tôi</a>` : ''}
      </div>

      <div class="split mt-l">
        <section class="stack">
          <div class="card"><h3>Mạng &amp; hợp đồng thông minh</h3>
            ${tt.diaChi ? '' : '<div class="warn-msg">Hợp đồng chưa được triển khai (npm run trien-khai).</div>'}
            <div class="kv"><span>Mạng</span><span>${tt.tenMang === 'sepolia' ? 'Ethereum Sepolia' : 'Mạng ảo trên máy (Hardhat/Ganache)'}</span></div>
            <div class="kv"><span>Chain ID</span><span>${tt.chainId}</span></div>
            ${tt.rpcUrl ? `<div class="kv"><span>RPC</span><span class="mono">${h(tt.rpcUrl)}</span></div>` : ''}
            <div class="kv"><span>Tỷ giá demo</span><span>1 ETH = ${dinhDangVnd(this.ud.tyGia)}</span></div>
            <div class="contract mt-s"><div class="row between"><b>Vé xe NFT (ERC-721)</b><span class="badge gray">VeXeNFT.sol</span></div>
              ${tt.diaChi ? `${tt.tenMang === 'sepolia'
                ? `<a class="mono" target="_blank" rel="noopener" href="https://sepolia.etherscan.io/address/${h(tt.diaChi)}">${h(tt.diaChi)} ${icon('ext', 'sm')}</a>`
                : `<span class="mono">${h(tt.diaChi)}</span>`}` : '<span class="hint">Chưa triển khai</span>'}</div>
          </div>
          <div class="card"><h3>Cài MetaMask cho mạng ảo</h3>
            <div class="stack" style="font-size:14px">
              <div>1. Cài tiện ích MetaMask, tạo ví bất kỳ.</div>
              <div>2. Bấm <b>Kết nối ví</b> ở trên — web tự đề nghị thêm mạng (chainId ${tt.chainId}).</div>
              <div>3. Trong MetaMask chọn <b>Add wallet → Import an account</b>, dán khóa riêng của ví thử nghiệm (in ra ở cửa sổ chạy mạng ảo).</div>
              <div>4. Bấm <b>Liên kết ví</b> và ký xác nhận (không tốn phí).</div>
            </div>
          </div>
        </section>
        <aside class="sticky-side"><div class="card"><h3>Cách hoạt động</h3>
          <div class="stack">
            ${[
              ['ticket', '', 'Mua vé = mint NFT', 'Bạn trả ETH vào hợp đồng; hợp đồng kiểm tra giá, khóa ghế rồi phát hành NFT vào ví bạn.'],
              ['lock', 'gray', 'Khóa ghế', 'Mỗi ghế của mỗi chuyến chỉ gắn với đúng một vé — hợp đồng từ chối bán trùng.'],
              ['scan', 'warn', 'Soát vé bằng chữ ký', 'QR chứa chữ ký của ví bạn. Nhân viên quét, hợp đồng so chữ ký với chủ NFT rồi đánh dấu đã dùng.'],
              ['refresh', 'green', 'Hủy vé, hoàn tiền tự động', 'Trước 24 giờ hoàn 90%, trước 2–24 giờ hoàn 50%. NFT bị đốt, ghế mở lại.'],
              ['swap', '', 'Bán lại có giá trần', 'Rao tối đa 110% giá gốc; khóa chuyển nhượng 2 giờ trước giờ chạy.'],
            ].map(([ic, mau, tieuDe, moTa]) => `<div class="feature"><span class="ico ${mau}">${icon(ic)}</span><div><h4>${tieuDe}</h4><p>${moTa}</p></div></div>`).join('')}
          </div></div></aside>
      </div>`;

    khung.querySelector('#ket-noi').addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => { await this.vi.ketNoi(); this.ud.chuyenTrang(); }));
    khung.querySelector('#lien-ket').addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => {
      await this.ud.lienKetVi();
      baoThanhCong('Đã liên kết ví với tài khoản.');
      this.ud.chuyenTrang();
    }, 'Chờ ký…'));
    khung.querySelector('#sao-chep').addEventListener('click', () => saoChep(viLienKet, 'Đã sao chép địa chỉ ví'));
  }
}
