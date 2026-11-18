// SOÁT VÉ — chức năng 4 (dành cho nhân viên nhà xe):
//   1. Quét mã QR của khách (trên điện thoại hoặc vé in giấy) bằng camera, hoặc dán nội dung mã. QR = { maVe, chuKy }.
//   2. Backend kiểm tra: chữ ký có đúng là của CHỦ NFT hiện tại không, vé còn hiệu lực không (chưa lên xe, chưa hủy),
//      và trả về họ tên hành khách để đối chiếu giấy tờ.
//   3. Nhân viên bấm xác nhận -> MetaMask gửi giao dịch danhDauDaSuDung -> HỢP ĐỒNG kiểm tra lại lần nữa
//      và đánh dấu vé "đã sử dụng" vĩnh viễn trên blockchain.
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, ngayGio, rutGonDiaChi, nhanTrangThaiVe, dangXuLy, baoLoi, baoThanhCong, htmlDangTai, htmlMaTraCuu } from '../giao-dien.js';

export class TrangSoatVe extends TrangCoSo {
  static tieuDe = 'Soát vé';
  static menu = '/soat-ve';
  static doRong = 'mid';

  async hienThi(khung) {
    this.khung = khung;
    const vi = this.ud.nguoiDung.diaChiVi;
    khung.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Soát vé lên xe</h1>
        <div class="sub">Quyền soát vé do nhà xe cấp cho ví trên blockchain. Ví của bạn: <span class="mono">${h(vi ? rutGonDiaChi(vi) : 'chưa liên kết')}</span></div></div></div>
      <div class="split">
        <section class="stack">
          <div class="card stack">
            <div id="vung-quet" style="max-width:360px;width:100%;margin:0 auto"></div>
            <button class="btn primary" id="nut-camera">${icon('scan')} Bật camera quét QR</button>
            <div class="divider">hoặc</div>
            <div class="field"><label for="qr">Dán nội dung mã QR</label>
              <textarea class="in mono" id="qr" rows="3" placeholder='{"maVe":1,"chuKy":"0x..."}'></textarea></div>
            <button class="btn" id="nut-kiem-tra">${icon('search', 'sm')} Kiểm tra vé</button>
          </div>
        </section>
        <aside class="sticky-side" id="ket-qua">
          <div class="card"><div class="empty" style="padding:28px 8px">${icon('qr')}<h3>Chưa quét vé nào</h3><p>Kết quả kiểm tra sẽ hiện ở đây.</p></div></div>
        </aside>
      </div>
      <!-- Lịch sử soát vé: trải rộng hết trang (dưới cả 2 cột) để thấy đủ các cột, không phải kéo ngang -->
      <div class="card stack mt">
        <div class="row between wrap"><h3 style="margin:0">${icon('check', 'sm')} Lịch sử soát vé</h3>
          <button class="btn sm ghost" id="nut-lam-moi">Làm mới</button></div>
        <div id="lich-su-soat">${htmlDangTai}</div>
      </div>`;

    khung.querySelector('#nut-camera').addEventListener('click', (e) => this.batTatCamera(e.currentTarget));
    khung.querySelector('#nut-kiem-tra').addEventListener('click', (e) =>
      dangXuLy(e.currentTarget, () => this.kiemTra(khung.querySelector('#qr').value)));
    khung.querySelector('#nut-lam-moi').addEventListener('click', (e) => dangXuLy(e.currentTarget, () => this.taiLichSu()));
    this.taiLichSu();
  }

  /**
   * Lịch sử soát vé — đọc từ sự kiện DaSuDungVe trên blockchain (không sửa được).
   * Nhân viên thấy vé mình đã soát; nhà xe thấy tất cả kèm ví nhân viên.
   */
  async taiLichSu() {
    const o = this.khung.querySelector('#lich-su-soat');
    if (!o) return;
    let kq;
    try {
      kq = await this.api.lay('/api/ve/soat-ve/lich-su?soLuong=50');
    } catch (loi) {
      o.innerHTML = `<div class="err-msg">${h(loi.message)}</div>`;
      return;
    }
    const laSepolia = this.ud.thongTinHopDong?.tenMang === 'sepolia';
    const tom = `<p class="hint" style="margin:0">Hôm nay: <b>${kq.homNay}</b> vé · Tổng: <b>${kq.tongSo}</b> vé
      ${kq.laNhaXe ? '(tất cả nhân viên)' : '(do bạn soát)'}${kq.tongSo > kq.danhSach.length ? ` · hiện ${kq.danhSach.length} lượt mới nhất` : ''}</p>`;
    if (!kq.danhSach.length) {
      o.innerHTML = `${tom}<p class="muted" style="margin:8px 0 0">Chưa soát vé nào.</p>`;
      return;
    }
    o.innerHTML = `${tom}<div class="bang-cuon"><table class="bang bang-lich-su-soat">
      <thead><tr><th>Lúc soát</th><th>Vé · Ghế</th><th>Hành khách · Tuyến</th>${kq.laNhaXe ? '<th>Nhân viên</th>' : ''}<th></th></tr></thead>
      <tbody>${kq.danhSach.map((v) => {
        const c = v.chuyen || {};
        return `<tr>
          <td>${v.thoiGianSoat ? ngayGio(v.thoiGianSoat) : '—'}</td>
          <td><b>#${v.maVe}</b><div class="hint">Ghế ${h(v.maGhe)}</div></td>
          <td>${h(v.hanhKhach?.hoTen || '(chưa có tên)')}
            <div class="hint">${h(c.diemKhoiHanh || v.maChuyen)}${c.diemKetThuc ? ` → ${h(c.diemKetThuc)}` : ''} · ${ngayGio(v.gioKhoiHanh)}</div></td>
          ${kq.laNhaXe ? `<td class="mono">${h(rutGonDiaChi(v.nhanVien))}</td>` : ''}
          <td>${laSepolia && v.maGiaoDich ? `<a target="_blank" rel="noopener" title="Xem giao dịch trên Etherscan" href="https://sepolia.etherscan.io/tx/${h(v.maGiaoDich)}">${icon('ext', 'sm')}</a>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  async batTatCamera(nut) {
    if (this.mayQuet) { await this.tatCamera(); nut.innerHTML = `${icon('scan')} Bật camera quét QR`; return; }
    if (!window.Html5Qrcode) return baoLoi(new Error('Không tải được thư viện quét QR, hãy dán nội dung mã.'));
    this.mayQuet = new window.Html5Qrcode('vung-quet');
    try {
      await this.mayQuet.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, async (noiDung) => {
        await this.tatCamera();
        nut.innerHTML = `${icon('scan')} Bật camera quét QR`;
        this.khung.querySelector('#qr').value = noiDung;
        dangXuLy(null, () => this.kiemTra(noiDung));
      });
      nut.innerHTML = `${icon('x')} Tắt camera`;
    } catch (loi) {
      this.mayQuet = null;
      baoLoi(new Error(`Không mở được camera: ${loi?.message || loi}`));
    }
  }

  async tatCamera() {
    const may = this.mayQuet;
    this.mayQuet = null;
    if (may) { try { await may.stop(); may.clear(); } catch { /* đã tắt */ } }
  }

  roiTrang() {
    this.tatCamera();
  }

  async kiemTra(noiDungQR) {
    let duLieu;
    try { duLieu = JSON.parse(String(noiDungQR).trim()); } catch { throw new Error('Mã QR không đúng định dạng vé CARBOOK.'); }
    const o = this.khung.querySelector('#ket-qua');
    o.innerHTML = `<div class="card">${htmlDangTai}</div>`;
    let kq;
    try {
      kq = await this.api.gui('/api/ve/soat-ve/kiem-tra', { maVe: duLieu.maVe, chuKy: duLieu.chuKy });
    } catch (loi) {
      o.innerHTML = `<div class="card"><div class="err-msg">${h(loi.message)}</div></div>`;
      return;
    }
    const ve = kq.ve;
    const c = ve.chuyen || {};
    o.innerHTML = `<div class="card stack">
      ${kq.hopLe ? `<div class="ok-msg">${icon('check', 'sm')} Vé hợp lệ — chữ ký đúng là của chủ vé.</div>` : kq.loi.map((l) => `<div class="err-msg">${h(l)}</div>`).join('')}
      ${kq.luuY.map((l) => `<div class="warn-msg">${h(l)}</div>`).join('')}
      <div class="row between"><h3 style="margin:0">Vé NFT #${ve.maVe}</h3>${nhanTrangThaiVe(ve.trangThai)}</div>
      ${htmlMaTraCuu(ve)}
      <div>
        <div class="kv"><span>Hành khách</span><span>${h(kq.hanhKhach?.hoTen || '(chưa có tên)')}</span></div>
        <div class="kv"><span>Điện thoại</span><span>${h(kq.hanhKhach?.sdt || '—')}</span></div>
        <div class="kv"><span>Tuyến</span><span>${h(c.diemKhoiHanh || ve.maChuyen)} → ${h(c.diemKetThuc || '')}</span></div>
        <div class="kv"><span>Khởi hành</span><span>${ngayGio(ve.gioKhoiHanh)}</span></div>
        <div class="kv"><span>Ghế</span><span><b>${h(ve.maGhe)}</b></span></div>
        ${c.bienSoXe ? `<div class="kv"><span>Xe</span><span>${h(c.bienSoXe)}</span></div>` : ''}
        <div class="kv"><span>Chủ vé</span><span class="mono">${h(rutGonDiaChi(ve.chuSoHuu || '—'))}</span></div>
        <div class="kv"><span>Ví đã ký QR</span><span class="mono">${h(rutGonDiaChi(kq.nguoiKy))}</span></div>
      </div>
      ${kq.hopLe ? `<button class="btn primary lg block" id="xac-nhan">${icon('fox')} Xác nhận lên xe (ghi lên blockchain)</button>` : ''}
    </div>`;

    o.querySelector('#xac-nhan')?.addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => {
      await this.vi.ketNoi();
      await this.hopDong.danhDauDaSuDung(duLieu.maVe, duLieu.chuKy);
      baoThanhCong(`Vé #${duLieu.maVe} đã được đánh dấu ĐÃ SỬ DỤNG.`);
      await this.kiemTra(noiDungQR);
      await this.taiLichSu(); // lượt vừa soát hiện ngay trong lịch sử
    }, 'Chờ MetaMask…'));
  }
}
