// QUẢN TRỊ — DANH MỤC: lộ trình, chuyến mẫu (giờ chạy + giá), xe. Lưu trên Firebase (off-chain).
// Giá/giờ mới áp dụng cho chuyến MỞ BÁN SAU ĐÓ; chuyến đã mở bán trên blockchain giữ giá cũ.
import { TrangQuanTriCoSo } from './quan-tri-co-so.js';
import { icon, h, dinhDangVnd, hopThoai, baoThanhCong, htmlDangTai, htmlLoi } from '../giao-dien.js';

const LOAI = {
  loTrinh: { ten: 'Lộ trình', api: 'lo-trinh' },
  chuyenXe: { ten: 'Chuyến mẫu', api: 'chuyen-mau' },
  xe: { ten: 'Xe', api: 'xe' },
};

export class TrangQuanTriDanhMuc extends TrangQuanTriCoSo {
  static tieuDe = 'Nhà xe · Tuyến, chuyến, xe';
  static tab = '/quan-tri/danh-muc';

  async veNoiDung(vung, truyVan) {
    this.vung = vung;
    this.loai = LOAI[truyVan.loai] ? truyVan.loai : 'loTrinh';
    this.tuKhoa = '';
    vung.innerHTML = `
      <div class="row wrap between">
        <div class="chips">${Object.entries(LOAI).map(([k, l]) => `<a class="chip ${k === this.loai ? 'on' : ''}" href="#/quan-tri/danh-muc?loai=${k}">${l.ten}</a>`).join('')}</div>
        <div class="row"><input class="in" id="tim" placeholder="Tìm kiếm…" style="height:36px;width:200px">
          <button class="btn primary sm" id="them">${icon('plus', 'sm')} Thêm ${LOAI[this.loai].ten.toLowerCase()}</button></div>
      </div>
      <div class="info-msg mt-s" style="font-size:13px">Sửa giá / giờ chạy chỉ áp dụng cho chuyến <b>mở bán sau đó</b>. Chuyến đã mở bán trên blockchain giữ giá cũ; vé đã bán luôn giữ đúng giá khách đã trả. Chỉ tuyến <b>miền Tây</b> đang hoạt động mới hiện cho khách.</div>
      <div id="ds" class="mt">${htmlDangTai}</div>`;
    vung.querySelector('#tim').addEventListener('input', (e) => { this.tuKhoa = e.target.value.trim().toLowerCase(); this.ve(); });
    vung.querySelector('#them').addEventListener('click', () => this.moForm(null));
    await this.taiLai();
  }

  async taiLai() {
    try { this.dm = await this.api.lay('/api/quan-tri/danh-muc'); } catch (loi) { this.vung.querySelector('#ds').innerHTML = htmlLoi(loi.message); return; }
    if (this.conHienThi) this.ve();
  }

  /** Bảng của loại đang chọn */
  ve() {
    const dm = this.dm;
    const loTrinh = (ma) => dm.loTrinh.find((l) => l.ma === ma);
    const xe = (ma) => dm.xe.find((x) => x.ma === ma);
    const khop = (...chu) => !this.tuKhoa || chu.join(' ').toLowerCase().includes(this.tuKhoa);
    const nutSua = (ma) => `<button class="btn sm ghost" data-sua="${h(ma)}">${icon('edit', 'sm')} Sửa</button>`;
    let dau = '';
    let dong = [];

    if (this.loai === 'loTrinh') {
      dau = '<th>Mã</th><th>Tuyến</th><th class="so">Quãng đường</th><th>Trạng thái</th><th></th>';
      dong = dm.loTrinh.filter((l) => khop(l.ma, l.tenLoTrinh, l.diemKhoiHanh, l.diemKetThuc)).map((l) => `<tr>
        <td class="mono">${h(l.ma)}</td><td><b>${h(l.diemKhoiHanh)} → ${h(l.diemKetThuc)}</b><div class="hint">${h(l.tenLoTrinh)}</div></td>
        <td class="so">${l.quangDuongKm ? `${l.quangDuongKm} km` : '—'}</td>
        <td>${l.trangThai === 'HoatDong' ? '<span class="badge green">Hoạt động</span>' : '<span class="badge gray">Ngừng</span>'} ${l.mienTay ? '' : '<span class="badge warn">Ngoài miền Tây</span>'}</td>
        <td>${nutSua(l.ma)}</td></tr>`);
    } else if (this.loai === 'chuyenXe') {
      dau = '<th>Mã</th><th>Giờ đi</th><th>Tuyến</th><th>Xe</th><th class="so">Giá vé</th><th>Trạng thái</th><th></th>';
      dong = [...dm.chuyenXe].sort((a, b) => a.maLoTrinh.localeCompare(b.maLoTrinh) || a.phutKhoiHanh - b.phutKhoiHanh)
        .filter((c) => { const l = loTrinh(c.maLoTrinh); return khop(c.ma, c.maLoTrinh, l?.diemKhoiHanh, l?.diemKetThuc, xe(c.maXe)?.bienSoXe); })
        .map((c) => { const l = loTrinh(c.maLoTrinh); const x = xe(c.maXe); return `<tr>
          <td class="mono">${h(c.ma)}</td><td><b>${h(c.gioKhoiHanh)}</b><div class="hint">${Math.floor(c.soPhutDiChuyen / 60)}h${String(c.soPhutDiChuyen % 60).padStart(2, '0')} di chuyển</div></td>
          <td>${h(l ? `${l.diemKhoiHanh} → ${l.diemKetThuc}` : c.maLoTrinh)}</td><td>${h(x ? x.bienSoXe : c.maXe)}</td>
          <td class="so">${dinhDangVnd(c.giaVe)}</td>
          <td>${c.trangThai === 'Huy' ? '<span class="badge gray">Ngừng chạy</span>' : c.dangBan ? '<span class="badge green">Đang bán</span>' : '<span class="badge warn" title="Mỗi tuyến chỉ bán tối đa 2 chuyến/ngày, hoặc tuyến ngoài miền Tây">Dự phòng</span>'}</td>
          <td>${nutSua(c.ma)}</td></tr>`; });
    } else {
      dau = '<th>Mã</th><th>Biển số</th><th>Loại xe</th><th>Sơ đồ ghế</th><th class="so">Số ghế</th><th></th>';
      dong = dm.xe.filter((x) => khop(x.ma, x.bienSoXe, x.tenLoaiXe)).map((x) => `<tr>
        <td class="mono">${h(x.ma)}</td><td><b>${h(x.bienSoXe)}</b></td><td>${h(x.tenLoaiXe)}</td><td class="mono">${h(x.maMauSoDo || 'mặc định')}</td>
        <td class="so">${x.soGhe}</td><td>${nutSua(x.ma)}</td></tr>`);
    }

    const ds = this.vung.querySelector('#ds');
    ds.innerHTML = `<div class="card pad-0"><div class="bang-cuon"><table class="bang"><thead><tr>${dau}</tr></thead>
      <tbody>${dong.join('') || '<tr><td colspan="7" class="center muted">Không có kết quả.</td></tr>'}</tbody></table></div></div>
      <p class="hint mt-s">${dong.length} mục</p>`;
    ds.querySelectorAll('[data-sua]').forEach((b) => b.addEventListener('click', () => this.moForm(b.dataset.sua)));
  }

  /** Hộp thoại thêm (ma = null) hoặc sửa */
  async moForm(ma) {
    const dm = this.dm;
    const cu = ma ? dm[this.loai].find((x) => x.ma === ma) : {};
    const chon = (ten, ds, giaTri) => `<select class="in" name="${ten}">${ds.map(([v, n]) => `<option value="${h(v)}" ${v === giaTri ? 'selected' : ''}>${h(n)}</option>`).join('')}</select>`;
    const o = (ten, nhan, giaTri = '', thuocTinh = '') => `<div class="field"><label>${nhan}</label><input class="in" name="${ten}" value="${h(giaTri ?? '')}" ${thuocTinh}></div>`;

    let truong = '';
    if (this.loai === 'loTrinh') {
      truong = `${o('diemKhoiHanh', 'Điểm đi', cu.diemKhoiHanh, 'required')}${o('diemKetThuc', 'Điểm đến', cu.diemKetThuc, 'required')}
        ${o('tenLoTrinh', 'Tên lộ trình (để trống = tự đặt)', cu.tenLoTrinh)}${o('quangDuongKm', 'Quãng đường (km)', cu.quangDuongKm, 'type="number" min="1"')}
        <div class="field"><label>Trạng thái</label>${chon('trangThai', [['HoatDong', 'Hoạt động'], ['Ngung', 'Ngừng']], cu.trangThai || 'HoatDong')}</div>`;
    } else if (this.loai === 'chuyenXe') {
      truong = `<div class="field"><label>Lộ trình</label>${chon('maLoTrinh', dm.loTrinh.map((l) => [l.ma, `${l.ma} · ${l.diemKhoiHanh} → ${l.diemKetThuc}`]), cu.maLoTrinh)}</div>
        <div class="field"><label>Xe</label>${chon('maXe', dm.xe.map((x) => [x.ma, `${x.bienSoXe} · ${x.tenLoaiXe}`]), cu.maXe)}</div>
        <div class="form-grid two">${o('gioKhoiHanh', 'Giờ khởi hành', cu.gioKhoiHanh || '08:00', 'type="time" required')}
          ${o('soPhutDiChuyen', 'Thời gian đi (phút)', cu.soPhutDiChuyen || 240, 'type="number" min="30" max="1440"')}</div>
        ${o('giaVe', 'Giá vé (VNĐ)', cu.giaVe || 200000, 'type="number" min="10000" step="1000"')}
        <div class="field"><label>Trạng thái</label>${chon('trangThai', [['SapChay', 'Đang chạy'], ['Huy', 'Ngừng chạy']], cu.trangThai === 'Huy' ? 'Huy' : 'SapChay')}</div>`;
    } else {
      truong = `${o('bienSoXe', 'Biển số', cu.bienSoXe, 'placeholder="65B-12345" required')}${o('tenLoaiXe', 'Loại xe', cu.tenLoaiXe || 'Giường nằm 34 chỗ')}
        <div class="field"><label>Mẫu sơ đồ ghế</label>${chon('maMauSoDo', [['', 'Mặc định (giường nằm 34)'], ...dm.mauSoDo.map((m) => [m.ma, `${m.ma} · ${m.soGhe} ghế`])], cu.maMauSoDo || '')}</div>`;
    }

    const xong = await hopThoai(`<h2>${ma ? 'Sửa' : 'Thêm'} ${LOAI[this.loai].ten.toLowerCase()} ${ma ? `<span class="mono muted">${h(ma)}</span>` : ''}</h2>
      <form id="f" class="stack mt" novalidate>${truong}<div class="err-msg hidden" id="loi"></div>
        <div class="actions"><button type="button" class="btn ghost" data-close="false">Hủy</button><button class="btn primary" type="submit">Lưu</button></div></form>`, {
      khiMo: (khung, dong) => khung.querySelector('#f').addEventListener('submit', async (e) => {
        e.preventDefault();
        const duLieu = Object.fromEntries(new FormData(e.target));
        const nut = e.submitter;
        nut.disabled = true;
        try {
          await this.api.goi(`/api/quan-tri/${LOAI[this.loai].api}${ma ? `/${encodeURIComponent(ma)}` : ''}`, { method: ma ? 'PUT' : 'POST', body: duLieu });
          dong(true);
        } catch (loi) {
          const l = khung.querySelector('#loi');
          l.textContent = loi.message;
          l.classList.remove('hidden');
          nut.disabled = false;
        }
      }),
    }).ketQua;
    if (xong) { baoThanhCong('Đã lưu.'); await this.taiLai(); }
  }
}
