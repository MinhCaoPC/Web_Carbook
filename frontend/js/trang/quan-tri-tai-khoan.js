// QUẢN TRỊ — TÀI KHOẢN: mọi tài khoản kèm VAI TRÒ (đọc từ blockchain), khóa / mở khóa nhân viên soát vé, gửi thông báo cho mọi khách.
import { TrangQuanTriCoSo } from './quan-tri-co-so.js';
import { icon, h, ngay, ngayGio, rutGonDiaChi, hoiXacNhan, dangXuLy, baoThanhCong, htmlDangTai, htmlLoi } from '../giao-dien.js';

const NHAN_VAI_TRO = {
  nhaXe: '<span class="badge blue">Nhà xe</span>',
  soatVe: '<span class="badge warn">Soát vé</span>',
  khach: '<span class="badge gray">Khách</span>',
};

export class TrangQuanTriTaiKhoan extends TrangQuanTriCoSo {
  static tieuDe = 'Nhà xe · Tài khoản';
  static tab = '/quan-tri/tai-khoan';

  async veNoiDung(vung) {
    this.vung = vung;
    this.tuKhoa = '';
    vung.innerHTML = `
      <div class="split">
        <section class="stack">
          <div class="row between wrap"><div class="sec-title" style="margin:0">Tất cả tài khoản</div>
            <input class="in" id="tim" placeholder="Tìm email, tên, SĐT, ví…" style="height:36px;width:240px"></div>
          <div id="ds">${htmlDangTai}</div>
        </section>
        <aside class="stack sticky-side">
          <form class="card stack" id="f-gui" novalidate>
            <h3 style="margin:0">${icon('bell', 'sm')} Gửi thông báo cho mọi khách</h3>
            <div class="field"><label for="td">Tiêu đề</label><input class="in" id="td" maxlength="120" placeholder="vd: Lịch chạy dịp Tết"></div>
            <div class="field"><label for="nd">Nội dung</label><textarea class="in" id="nd" maxlength="1000" placeholder="Nội dung thông báo…"></textarea></div>
            <div class="err-msg hidden" id="loi-gui"></div>
            <button class="btn primary block" type="submit">Gửi thông báo</button>
            <p class="hint">Khách thấy ngay trong mục Thông báo (chuông). Mỗi lần gửi chỉ tốn 1 lượt ghi Firebase.</p>
          </form>
          <div class="card"><h3>Đã gửi gần đây</h3><div id="lich-su" class="list">${htmlDangTai}</div></div>
        </aside>
      </div>`;
    vung.querySelector('#tim').addEventListener('input', (e) => { this.tuKhoa = e.target.value.trim().toLowerCase(); this.ve(); });
    vung.querySelector('#f-gui').addEventListener('submit', (e) => { e.preventDefault(); dangXuLy(e.submitter, () => this.guiThongBao()); });
    await Promise.all([this.taiTaiKhoan(), this.taiLichSu()]);
  }

  async taiTaiKhoan() {
    try { this.danhSach = (await this.api.lay('/api/quan-tri/tai-khoan')).danhSach; } catch (loi) { this.vung.querySelector('#ds').innerHTML = htmlLoi(loi.message); return; }
    if (this.conHienThi) this.ve();
  }

  ve() {
    const loc = this.danhSach.filter((n) => !this.tuKhoa || [n.email, n.hoTen, n.sdt, n.diaChiLienHe, n.diaChiVi].join(' ').toLowerCase().includes(this.tuKhoa));
    const toi = this.ud.nguoiDung.email;
    const ds = this.vung.querySelector('#ds');
    // 4 cột gọn (gộp vai trò + ví, đăng nhập + ngày tạo, trạng thái + nút khóa) để thấy hết bảng, không phải kéo ngang
    ds.innerHTML = `<div class="card pad-0"><div class="bang-cuon"><table class="bang bang-tai-khoan">
      <thead><tr><th>Tài khoản</th><th>Vai trò · Ví</th><th>Đăng nhập</th><th>Trạng thái</th></tr></thead>
      <tbody>${loc.map((n) => `<tr class="${n.biKhoa ? 'mo-nhat' : ''}">
        <td><b>${h(n.hoTen || '—')}</b><div class="hint ngat-chu">${h(n.email)}</div>${n.sdt ? `<div class="hint">${h(n.sdt)}</div>` : ''}${n.diaChiLienHe ? `<div class="hint">${h(n.diaChiLienHe)}</div>` : ''}</td>
        <td>${NHAN_VAI_TRO[n.vaiTro] || NHAN_VAI_TRO.khach}
          <div class="hint mono">${n.diaChiVi ? h(rutGonDiaChi(n.diaChiVi)) : 'chưa liên kết ví'}</div></td>
        <td>${[n.coMatKhau ? 'Mật khẩu' : '', n.lienKetGoogle ? 'Google' : ''].filter(Boolean).join(' + ') || '—'}
          <div class="hint">Tạo ${ngay(n.ngayTao)}</div></td>
        <td><div class="o-trang-thai">${n.biKhoa ? '<span class="badge red">Đã khóa</span>' : '<span class="badge green">Hoạt động</span>'}${this.nutKhoa(n, toi)}</div></td>
      </tr>`).join('') || '<tr><td colspan="4" class="center muted">Không có tài khoản phù hợp.</td></tr>'}</tbody></table></div></div>
      <p class="hint mt-s">${loc.length}/${this.danhSach.length} tài khoản · Vai trò đọc từ hợp đồng trên blockchain.
        Chỉ khóa được <b>nhân viên soát vé</b>; tài khoản khách hàng không bị nhà xe khóa.</p>`;

    ds.querySelectorAll('[data-khoa]').forEach((nut) => nut.addEventListener('click', async () => {
      const khoa = nut.dataset.giaTri === '1';
      if (khoa && !(await hoiXacNhan({ tieuDe: 'Khóa tài khoản?', nguyHiem: true, dongY: 'Khóa',
        noiDungHtml: `Tài khoản nhân viên <b>${h(nut.dataset.khoa)}</b> sẽ bị đăng xuất và không đăng nhập được nữa.<br>
          Lưu ý: khóa chỉ chặn đăng nhập web. Muốn ví này hết quyền soát vé trên blockchain, hãy vào tab <b>Blockchain → Thu quyền</b>.` }))) return;
      await dangXuLy(nut, async () => {
        await this.api.gui('/api/quan-tri/tai-khoan/khoa', { email: nut.dataset.khoa, khoa });
        baoThanhCong(khoa ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
        await this.taiTaiKhoan();
      });
    }));
  }

  /** Cột thao tác: chỉ nhân viên soát vé có nút Khóa; tài khoản đã lỡ bị khóa (bất kỳ vai trò) có nút Mở khóa. */
  nutKhoa(n, emailToi) {
    if (n.email === emailToi) return '<span class="hint">(bạn)</span>';
    if (n.biKhoa) return `<button class="btn sm" data-khoa="${h(n.email)}" data-gia-tri="0">Mở khóa</button>`;
    if (n.vaiTro === 'soatVe') return `<button class="btn sm danger-o" data-khoa="${h(n.email)}" data-gia-tri="1">Khóa</button>`;
    return '';
  }

  async taiLichSu() {
    const o = this.vung.querySelector('#lich-su');
    try {
      const ds = (await this.api.lay('/api/quan-tri/thong-bao-chung')).danhSach;
      o.innerHTML = ds.length ? ds.slice(0, 10).map((n) => `<div class="item" style="padding:10px 0"><div class="grow">
        <b>${h(n.tieuDe)}</b><div class="muted" style="font-size:13px">${h(n.noiDung)}</div><div class="hint">${ngayGio(n.thoiGian)}</div></div></div>`).join('')
        : '<p class="muted">Chưa gửi thông báo nào.</p>';
    } catch (loi) { o.innerHTML = htmlLoi(loi.message); }
  }

  async guiThongBao() {
    const td = this.vung.querySelector('#td');
    const nd = this.vung.querySelector('#nd');
    const loi = this.vung.querySelector('#loi-gui');
    loi.classList.add('hidden');
    if (!td.value.trim() || !nd.value.trim()) { loi.textContent = 'Vui lòng nhập tiêu đề và nội dung.'; loi.classList.remove('hidden'); return; }
    if (!(await hoiXacNhan({ tieuDe: 'Gửi cho mọi khách?', noiDungHtml: `<b>${h(td.value)}</b><br>${h(nd.value)}`, dongY: 'Gửi' }))) return;
    await this.api.gui('/api/quan-tri/thong-bao-chung', { tieuDe: td.value, noiDung: nd.value });
    td.value = '';
    nd.value = '';
    baoThanhCong('Đã gửi thông báo.');
    await this.taiLichSu();
  }
}
