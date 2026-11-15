// TÀI KHOẢN — thông tin cá nhân (OFF-CHAIN, Firebase) + lối tắt tới các chức năng.
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, chuDau, rutGonDiaChi, hopThoai, hoiXacNhan, baoThanhCong, baoLoi, doiGiaoDien } from '../giao-dien.js';

const TEN_VAI_TRO = { khach: 'Khách hàng', soatVe: 'Nhân viên soát vé', nhaXe: 'Nhà xe (chủ hợp đồng)' };

/** Lối tắt theo vai trò: [đường dẫn, icon, màu, tên, mô tả] */
const LOI_TAT = {
  khach: [
    ['/ve-cua-toi', 'ticket', '', 'Vé của tôi', 'Vé NFT trong ví của bạn'],
    ['/vi', 'wallet', 'green', 'Ví MetaMask', 'Liên kết ví, số dư, hợp đồng'],
    ['/cho-ve', 'swap', 'warn', 'Chợ vé NFT', 'Mua bán lại vé an toàn'],
    ['/thong-bao', 'bell', '', 'Thông báo', 'Vé đã mua, bán, được tặng, nhắc chuyến'],
  ],
  soatVe: [
    ['/soat-ve', 'scan', '', 'Soát vé', 'Quét QR, xác nhận khách lên xe'],
    ['/vi', 'wallet', 'green', 'Ví MetaMask', 'Ví nhân viên dùng để ký xác nhận lên xe'],
  ],
  nhaXe: [
    ['/quan-tri', 'trend', '', 'Tổng quan', 'Doanh thu, vé bán, tuyến bán chạy'],
    ['/quan-tri/ve', 'ticket', 'green', 'Vé & hành khách', 'Danh sách lên xe theo chuyến'],
    ['/quan-tri/blockchain', 'shield', 'warn', 'Blockchain', 'Mở bán chuyến, cấp quyền soát vé, rút tiền'],
    ['/soat-ve', 'scan', '', 'Soát vé', 'Nhà xe cũng soát vé được'],
  ],
};

export class TrangTaiKhoan extends TrangCoSo {
  static tieuDe = 'Tài khoản';
  static menu = '/tai-khoan';
  static doRong = 'mid';

  async hienThi(khung) {
    const nd = this.ud.nguoiDung;
    const muc = (href, ic, mau, nhan, phu = '') =>
      `<a class="item" href="#${href}"><span class="ico ${mau}">${icon(ic)}</span><div class="grow"><b>${nhan}</b>${phu ? `<div class="hint">${phu}</div>` : ''}</div>${icon('next', 'sm')}</a>`;

    khung.innerHTML = `
      <div class="card row" style="gap:18px;flex-wrap:wrap">
        <div class="avatar lg">${h(chuDau(nd.hoTen))}</div>
        <div class="grow"><h2>${h(nd.hoTen)}</h2><div class="muted">${h(nd.email)}</div><div class="muted">${h(nd.sdt || '')}</div>
          <div class="muted">${icon('pin', 'sm')} ${nd.diaChiLienHe ? h(nd.diaChiLienHe) : '<i>Chưa có địa chỉ</i>'}</div>
          <div class="hint mt-s">${icon('wallet', 'sm')} ${nd.diaChiVi ? `Ví liên kết: <span class="mono">${h(rutGonDiaChi(nd.diaChiVi))}</span>` : 'Chưa liên kết ví MetaMask'}</div></div>
        <button class="btn" id="sua">${icon('edit', 'sm')} Chỉnh sửa</button>
      </div>
      <div class="grid cols-2 mt">
        <div class="card pad-0 list">
          ${(LOI_TAT[this.ud.loaiGiaoDien] || LOI_TAT.khach).map((m) => muc(...m)).join('')}
        </div>
        <div class="card pad-0 list">
          <div class="item"><span class="ico gray">${icon('shield')}</span><div class="grow"><b>Vai trò: ${h(TEN_VAI_TRO[this.ud.loaiGiaoDien])}</b>
            <div class="hint">Đọc từ hợp đồng trên blockchain theo ví đã liên kết</div></div></div>
          <button class="item" id="giao-dien"><span class="ico gray">${icon('moon')}</span><div class="grow"><b>Giao diện sáng / tối</b></div></button>
          <button class="item" id="dang-xuat"><span class="ico red">${icon('logout')}</span><div class="grow"><b style="color:var(--danger)">Đăng xuất</b></div></button>
        </div>
      </div>
      <div class="footer">CARBOOK Web · Đồ án Blockchain — vé xe NFT (ERC-721)</div>`;

    khung.querySelector('#sua').addEventListener('click', () => this.suaThongTin());
    khung.querySelector('#giao-dien').addEventListener('click', () => { doiGiaoDien(); this.ud.veKhungGiaoDien(TrangTaiKhoan.menu); });
    khung.querySelector('#dang-xuat').addEventListener('click', async () => {
      if (await hoiXacNhan({ tieuDe: 'Đăng xuất', noiDungHtml: 'Bạn có chắc muốn đăng xuất khỏi tài khoản?', dongY: 'Đăng xuất' })) this.ud.dangXuat();
    });
  }

  async suaThongTin() {
    const nd = this.ud.nguoiDung;
    const kq = await hopThoai(`<h2>Thông tin cá nhân</h2>
      <p class="hint">Lưu off-chain (Firebase), không đưa lên blockchain.</p>
      <form id="f" class="stack mt" novalidate>
        <div class="field"><label for="ten">Họ và tên</label><input class="in" id="ten" value="${h(nd.hoTen)}"></div>
        <div class="field"><label for="sdt">Số điện thoại</label><input class="in" id="sdt" type="tel" value="${h(nd.sdt)}"></div>
        <div class="field"><label for="dia-chi">Địa chỉ</label><input class="in" id="dia-chi" maxlength="200" autocomplete="street-address"
          placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" value="${h(nd.diaChiLienHe || '')}"></div>
        <div class="field"><label>Email</label><input class="in" value="${h(nd.email)}" disabled></div>
        <div class="actions"><button type="button" class="btn ghost" data-close="false">Hủy</button><button class="btn primary" type="submit">Lưu thay đổi</button></div>
      </form>`, {
      khiMo: (khung, dong) => khung.querySelector('#f').addEventListener('submit', (e) => {
        e.preventDefault();
        dong({ hoTen: khung.querySelector('#ten').value.trim(), sdt: khung.querySelector('#sdt').value.trim(), diaChiLienHe: khung.querySelector('#dia-chi').value.trim() });
      }),
    }).ketQua;
    if (!kq) return;
    if (!kq.hoTen) return baoLoi(new Error('Họ tên không được để trống.'));
    try {
      this.ud.nguoiDung = (await this.api.sua('/api/tai-khoan/toi', kq)).nguoiDung;
      baoThanhCong('Đã lưu thông tin.');
      this.ud.chuyenTrang();
    } catch (loi) { baoLoi(loi); }
  }
}
