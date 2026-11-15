// QUẢN TRỊ — tab BLOCKCHAIN: các thao tác ghi lên hợp đồng, ký bằng ví nhà xe (chủ hợp đồng).
//   - Mở bán chuyến lên blockchain (giá, giờ chạy, số ghế) để khách mua được.
//   - Cấp / thu quyền soát vé cho ví nhân viên.
//   - Rút doanh thu (tiền vé đã đi + phí hủy vé) về ví nhà xe.
import { TrangQuanTriCoSo } from './quan-tri-co-so.js';
import { ethers } from '../vi-metamask.js';
import { icon, h, dinhDangEth, dinhDangVnd, weiSangVnd, rutGonDiaChi, thuDayDu, ngay, gio, chuoiSangNgay, dangXuLy, baoThanhCong, thongBao, htmlDangTai } from '../giao-dien.js';

const SO_CHUYEN_MOI_GIAO_DICH = 20;

export class TrangQuanTriBlockchain extends TrangQuanTriCoSo {
  static tieuDe = 'Nhà xe · Blockchain';
  static tab = '/quan-tri/blockchain';

  async veNoiDung(khung) {
    this.khung = khung;
    const tt = this.ud.thongTinHopDong;
    if (!tt.diaChi) { khung.innerHTML = '<div class="warn-msg">Hợp đồng chưa được triển khai. Chạy: npm run trien-khai.</div>'; return; }

    const [chu, doanhThu, { danhSachNgay }] = await Promise.all([
      this.hopDong.chuHopDong(),
      this.hopDong.doanhThuChoRut(),
      this.api.lay('/api/chuyen-xe/ngay'),
    ]);
    if (!this.conHienThi) return;
    const viMo = this.vi.diaChi;
    const laChu = viMo && viMo === chu;

    khung.innerHTML = `
      ${laChu ? `<div class="ok-msg">${icon('check', 'sm')} MetaMask đang mở ví nhà xe (chủ hợp đồng).</div>`
        : `<div class="warn-msg">${viMo ? `MetaMask đang mở ví ${h(rutGonDiaChi(viMo))}, không phải ví nhà xe ${h(rutGonDiaChi(chu))}` : 'Chưa kết nối MetaMask'} — hợp đồng sẽ từ chối các thao tác bên dưới.</div>`}

      <div class="grid cols-2 mt">
        <div class="card"><h3>${icon('trend', 'sm')} Doanh thu</h3>
          <div class="price" style="font-size:26px">${dinhDangEth(doanhThu)}</div>
          <div class="hint">≈ ${dinhDangVnd(weiSangVnd(doanhThu, this.ud.tyGia))} · gồm tiền vé đã soát, phí hủy vé, vé khách không đi đã chốt</div>
          <button class="btn primary block mt" id="rut" ${doanhThu > 0n ? '' : 'disabled'}>Rút về ví nhà xe</button>
        </div>
        <div class="card"><h3>${icon('shield', 'sm')} Hợp đồng</h3>
          <div class="kv"><span>Địa chỉ</span><span class="mono">${h(rutGonDiaChi(tt.diaChi))}</span></div>
          <div class="kv"><span>Chủ hợp đồng</span><span class="mono">${h(rutGonDiaChi(chu))}</span></div>
          <div class="kv"><span>Tỷ giá demo</span><span>1 ETH = ${dinhDangVnd(this.ud.tyGia)}</span></div>
        </div>
      </div>

      <div class="card mt"><h3>${icon('calendar', 'sm')} Mở bán chuyến lên blockchain</h3>
        <p class="muted" style="font-size:14px">Khách chỉ mua được chuyến đã mở bán. Chọn ngày để xem các chuyến chưa mở.</p>
        <div class="date-strip mt-s">${danhSachNgay.map((n, i) => {
          const d = chuoiSangNgay(n);
          return `<button class="dchip" data-ngay="${n}"><small>${i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : thuDayDu(d)}</small><b>${ngay(d).slice(0, 5)}</b></button>`;
        }).join('')}</div>
        <div id="mo-ban" class="mt-s hint">Chưa chọn ngày.</div>
      </div>

      <div class="card mt"><h3>${icon('ticket', 'sm')} Vé khách không đi</h3>
        <p class="muted" style="font-size:14px">Chuyến đã chạy mà vé chưa được soát. Tiền vé vẫn nằm trong hợp đồng —
          bấm <b>Chốt</b> để cộng vào doanh thu (chỉ chốt được sau giờ chạy, mỗi vé chốt một lần).</p>
        <div id="khong-di" class="mt-s">${htmlDangTai}</div>
      </div>

      <div class="card mt"><h3>${icon('users', 'sm')} Nhân viên soát vé</h3>
        <div class="field"><label for="nv">Địa chỉ ví nhân viên</label><input class="in mono" id="nv" placeholder="0x..."></div>
        <div class="row wrap mt">
          <button class="btn primary sm" id="cap">Cấp quyền</button>
          <button class="btn sm danger-o" id="thu">Thu quyền</button>
          <button class="btn sm ghost" id="xem">Kiểm tra quyền</button>
        </div>
      </div>`;

    this.taiVeKhongDi();
    khung.querySelectorAll('[data-ngay]').forEach((nut) => nut.addEventListener('click', () => {
      khung.querySelectorAll('[data-ngay]').forEach((n) => n.classList.toggle('on', n === nut));
      dangXuLy(null, () => this.xemNgay(nut.dataset.ngay));
    }));

    const viNhanVien = () => {
      const diaChi = khung.querySelector('#nv').value.trim();
      if (!ethers.isAddress(diaChi)) throw new Error('Địa chỉ ví không hợp lệ.');
      return diaChi;
    };
    khung.querySelector('#cap').addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => {
      const nhanVien = viNhanVien();
      await this.damBaoViNhaXe();
      await this.hopDong.datNhanVienSoatVe(nhanVien, true);
      baoThanhCong(`Đã cấp quyền soát vé cho ${rutGonDiaChi(nhanVien)}. Nhân viên tải lại trang (F5) là thấy giao diện Soát vé.`);
    }, 'Chờ MetaMask…'));
    khung.querySelector('#thu').addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => {
      const nhanVien = viNhanVien();
      await this.damBaoViNhaXe();
      await this.hopDong.datNhanVienSoatVe(nhanVien, false);
      baoThanhCong(`Đã thu quyền soát vé của ${rutGonDiaChi(nhanVien)}.`);
    }, 'Chờ MetaMask…'));
    khung.querySelector('#xem').addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => {
      thongBao((await this.hopDong.laNhanVienSoatVe(viNhanVien())) ? 'Ví này ĐANG có quyền soát vé.' : 'Ví này KHÔNG có quyền soát vé.');
    }));
    khung.querySelector('#rut').addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => {
      const vi = await this.damBaoViNhaXe();
      await this.hopDong.rutDoanhThu(vi);
      baoThanhCong('Đã rút doanh thu về ví.');
      this.ud.chuyenTrang();
    }));
  }

  /**
   * Mở bán / cấp quyền / rút tiền chỉ CHỦ HỢP ĐỒNG làm được. Kiểm tra ví MetaMask đang mở TRƯỚC khi gửi,
   * để báo lỗi dễ hiểu thay vì để hợp đồng từ chối (OwnableUnauthorizedAccount).
   * @returns {Promise<string>} địa chỉ ví nhà xe
   */
  async damBaoViNhaXe() {
    const vi = await this.vi.ketNoi();
    const chu = await this.hopDong.chuHopDong();
    if (vi !== chu) {
      throw new Error(`MetaMask đang mở ví ${rutGonDiaChi(vi)}, không phải ví nhà xe ${rutGonDiaChi(chu)}. Hãy chuyển MetaMask sang ví nhà xe (ví đã triển khai hợp đồng) rồi bấm lại.`);
    }
    return vi;
  }

  /** Danh sách vé khách không đi (backend lọc từ sự kiện blockchain) + nút chốt tất cả trong MỘT giao dịch. */
  async taiVeKhongDi() {
    const o = this.khung.querySelector('#khong-di');
    let ds;
    try { ds = (await this.api.lay('/api/quan-tri/ve-khong-di')).danhSach; } catch (loi) { o.innerHTML = `<div class="err-msg">${h(loi.message)}</div>`; return; }
    if (!this.conHienThi) return;
    if (!ds.length) { o.innerHTML = '<div class="ok-msg">Không có vé nào cần chốt.</div>'; return; }

    const tong = ds.reduce((s, v) => s + BigInt(v.giaWei), 0n);
    o.innerHTML = `<div class="bang-cuon"><table class="bang">
        <thead><tr><th>Vé NFT</th><th>Tuyến</th><th>Mã chuyến</th><th>Ghế</th><th>Giờ chạy</th><th class="so">Giá</th></tr></thead>
        <tbody>${ds.map((v) => `<tr><td>#${v.maVe}</td><td>${h(v.tuyen)}</td><td class="mono">${h(v.maChuyen)}</td><td><b>${h(v.maGhe)}</b></td>
          <td>${ngay(v.gioKhoiHanh)} ${gio(v.gioKhoiHanh)}</td><td class="so">${dinhDangEth(v.giaWei)}</td></tr>`).join('')}</tbody>
      </table></div>
      <button class="btn primary block mt" id="nut-chot">${icon('fox', 'sm')} Chốt ${ds.length} vé · cộng ${dinhDangEth(tong)} vào doanh thu</button>`;
    o.querySelector('#nut-chot').addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => {
      await this.damBaoViNhaXe();
      await this.hopDong.chotVeKhongDi(ds.map((v) => v.maVe));
      baoThanhCong(`Đã chốt ${ds.length} vé khách không đi.`);
      this.ud.chuyenTrang(); // vẽ lại: doanh thu tăng, danh sách trống
    }, 'Chờ MetaMask…'));
  }

  async xemNgay(ngayChon) {
    const o = this.khung.querySelector('#mo-ban');
    o.innerHTML = htmlDangTai;
    const kq = await this.api.lay(`/api/chuyen-xe/can-mo-ban?ngay=${ngayChon}`);
    const t = kq.thamSoHopDong;
    // Số lần xác nhận MetaMask = số sơ đồ ghế cần đăng ký (chỉ lần đầu) + số giao dịch mở bán (20 chuyến/lần)
    const soLan = kq.soDoCanDangKy.length + Math.ceil(t.maChuyen.length / SO_CHUYEN_MOI_GIAO_DICH);
    o.innerHTML = `
      <div class="kv"><span>Tổng số chuyến</span><span>${kq.tongSoChuyen}</span></div>
      <div class="kv"><span>Đã mở bán</span><span>${kq.daMoBan}</span></div>
      <div class="kv"><span>Chưa mở bán</span><span>${t.maChuyen.length}</span></div>
      ${t.maChuyen.length
        ? `<button class="btn primary block mt" id="nut-mo">${icon('fox', 'sm')} Mở bán ${t.maChuyen.length} chuyến (${soLan} lần xác nhận MetaMask)</button>`
        : '<div class="ok-msg mt-s">Đã mở bán hết các chuyến của ngày này.</div>'}`;
    o.querySelector('#nut-mo')?.addEventListener('click', (e) => dangXuLy(e.currentTarget, async () => {
      await this.damBaoViNhaXe();
      // Bước 1 (chỉ lần đầu): đăng ký sơ đồ ghế để hợp đồng biết xe có những ghế nào
      for (const { maSoDo, danhSachGhe } of kq.soDoCanDangKy) {
        if (!(await this.hopDong.soDoDaDangKy(maSoDo))) await this.hopDong.dangKySoDoGhe(maSoDo, danhSachGhe);
        // Chờ mạng cập nhật (RPC có máy chậm vài giây) rồi mới mở bán, tránh lỗi "chưa đăng ký sơ đồ ghế"
        for (let lan = 0; lan < 30 && !(await this.hopDong.soDoDaDangKy(maSoDo)); lan++) await new Promise((r) => setTimeout(r, 2000));
      }
      // Bước 2: mở bán chuyến, mỗi giao dịch tối đa 20 chuyến
      for (let i = 0; i < t.maChuyen.length; i += SO_CHUYEN_MOI_GIAO_DICH) {
        const het = i + SO_CHUYEN_MOI_GIAO_DICH;
        await this.hopDong.moBanNhieuChuyen(t.maChuyen.slice(i, het), t.giaVe.slice(i, het), t.gioKhoiHanh.slice(i, het), t.maSoDo.slice(i, het));
      }
      baoThanhCong(`Đã mở bán ${t.maChuyen.length} chuyến.`);
      await this.xemNgay(ngayChon);
    }, 'Chờ MetaMask…'));
  }
}
