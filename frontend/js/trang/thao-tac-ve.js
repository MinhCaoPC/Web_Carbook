// LỚP ThaoTacVe — các thao tác trên một vé NFT, dùng chung cho trang "Vé của tôi" và "Chi tiết vé".
//   Chức năng 5: hủy vé, hoàn tiền theo mốc thời gian ghi trong hợp đồng
//   Chức năng 6: rao bán (giá trần 110%), gỡ rao, tặng vé
// Mỗi hàm trả về true nếu vé đã thay đổi (để trang vẽ lại).
import { ethers } from '../vi-metamask.js';
import { h, dinhDangEth, dinhDangVnd, weiSangVnd, hopThoai, hoiXacNhan, baoThanhCong } from '../giao-dien.js';

export class ThaoTacVe {
  /** @param {import('../ung-dung.js').UngDung} ungDung */
  constructor(ungDung) {
    this.ud = ungDung;
    this.hopDong = ungDung.hopDong;
    this.api = ungDung.api;
  }

  /** Dòng mô tả vé trong hộp thoại */
  static moTa(ve) {
    const c = ve.chuyen || {};
    return `${h(c.diemKhoiHanh || ve.maChuyen)} → ${h(c.diemKetThuc || '')} · Ghế <b>${h(ve.maGhe)}</b> · NFT #${ve.maVe}`;
  }

  /** Chức năng 5 — xem trước tiền hoàn rồi hủy */
  async huyVe(ve) {
    await this.ud.damBaoSanSangGiaoDich();
    const { phanTram, tienHoanWei } = await this.hopDong.tinhTienHoan(ve.maVe);
    if (phanTram === 0) throw new Error('Còn dưới 2 giờ trước giờ chạy nên không thể hủy vé (luật trong hợp đồng).');
    const dongY = await hoiXacNhan({
      tieuDe: 'Xác nhận hủy vé', nguyHiem: true, dongY: 'Hủy vé', huy: 'Không',
      noiDungHtml: `<p>${ThaoTacVe.moTa(ve)}</p>
        <div class="info-msg mt-s">Hoàn lại <b>${phanTram}%</b> = <b>${dinhDangEth(tienHoanWei)}</b> (≈ ${dinhDangVnd(weiSangVnd(tienHoanWei, this.ud.tyGia))}) thẳng về ví của bạn.</div>
        <p class="mt-s">• Trước giờ chạy ≥ 24 giờ: hoàn 90% · từ 2–24 giờ: hoàn 50%.<br>• Vé NFT sẽ bị đốt, ghế được mở lại cho người khác.</p>`,
    });
    if (!dongY) return false;
    await this.hopDong.huyVe(ve.maVe);
    baoThanhCong('Đã hủy vé, tiền hoàn đã về ví.');
    return true;
  }

  /** Chức năng 6 — rao bán, giá không vượt 110% giá gốc */
  async raoBan(ve) {
    await this.ud.damBaoSanSangGiaoDich();
    const tran = await this.hopDong.giaBanLaiToiDa(ve.maVe);
    const hop = hopThoai(`<h2>Rao bán vé trên chợ</h2>
      <p class="muted mt-s">${ThaoTacVe.moTa(ve)}</p>
      <div class="info-msg mt-s">Giá gốc <b>${dinhDangEth(ve.giaGocWei)}</b>. Giá rao tối đa <b>${dinhDangEth(tran)}</b> (110%) — chống phe vé. Người mua trả ETH thẳng vào ví bạn.</div>
      <form id="f" class="stack mt" novalidate>
        <div class="field"><label for="gia">Giá rao bán (ETH)</label>
          <input class="in" id="gia" type="number" step="0.000001" min="0" value="${ethers.formatEther(ve.giaGocWei)}" style="font-size:22px;font-weight:700;height:56px">
          <div class="hint" id="quy-doi"></div></div>
        <div class="err-msg hidden" id="loi"></div>
        <div class="actions"><button type="button" class="btn ghost" data-close="false">Hủy</button><button class="btn primary" type="submit">Rao bán</button></div>
      </form>`, {
      khiMo: (khung, dong) => {
        const o = khung.querySelector('#gia');
        const quyDoi = () => { try { khung.querySelector('#quy-doi').textContent = `≈ ${dinhDangVnd(weiSangVnd(ethers.parseEther(o.value || '0'), this.ud.tyGia))}`; } catch { /* đang gõ dở */ } };
        o.addEventListener('input', quyDoi);
        quyDoi();
        khung.querySelector('#f').addEventListener('submit', (e) => {
          e.preventDefault();
          const loi = khung.querySelector('#loi');
          let giaWei;
          try { giaWei = ethers.parseEther(o.value || '0'); } catch { giaWei = 0n; }
          if (giaWei <= 0n || giaWei > tran) { loi.textContent = `Giá phải lớn hơn 0 và không vượt ${dinhDangEth(tran)}.`; loi.classList.remove('hidden'); return; }
          dong(giaWei);
        });
      },
    });
    const giaWei = await hop.ketQua;
    if (!giaWei) return false;
    await this.hopDong.raoBanVe(ve.maVe, giaWei);
    baoThanhCong('Đã rao bán vé trên chợ.');
    return true;
  }

  async goRao(ve) {
    const dongY = await hoiXacNhan({ tieuDe: 'Huỷ rao bán?', noiDungHtml: 'Vé sẽ được gỡ khỏi chợ và quay về trạng thái bình thường.', dongY: 'Huỷ rao bán', huy: 'Giữ lại' });
    if (!dongY) return false;
    await this.ud.damBaoSanSangGiaoDich();
    await this.hopDong.huyRaoBan(ve.maVe);
    baoThanhCong('Đã huỷ rao bán.');
    return true;
  }

  /** Chức năng 6 — tặng (chuyển nhượng miễn phí) cho một ví khác */
  async tangVe(ve) {
    await this.ud.damBaoSanSangGiaoDich();
    const hop = hopThoai(`<h2>Tặng vé</h2>
      <p class="muted mt-s">${ThaoTacVe.moTa(ve)}</p>
      <form id="f" class="stack mt" novalidate>
        <div class="field"><label for="den">Địa chỉ ví người nhận</label><input class="in mono" id="den" placeholder="0x..."></div>
        <div class="warn-msg">Sau khi chuyển, vé thuộc về người nhận; mã QR của bạn sẽ hết hiệu lực.</div>
        <div class="err-msg hidden" id="loi"></div>
        <div class="actions"><button type="button" class="btn ghost" data-close="false">Hủy</button><button class="btn primary" type="submit">Chuyển vé</button></div>
      </form>`, {
      khiMo: (khung, dong) => khung.querySelector('#f').addEventListener('submit', (e) => {
        e.preventDefault();
        const diaChi = khung.querySelector('#den').value.trim();
        if (!ethers.isAddress(diaChi)) { const l = khung.querySelector('#loi'); l.textContent = 'Địa chỉ ví không hợp lệ.'; l.classList.remove('hidden'); return; }
        dong(diaChi);
      }),
    });
    const nguoiNhan = await hop.ketQua;
    if (!nguoiNhan) return false;
    await this.hopDong.chuyenNhuongVe(ve.maVe, nguoiNhan);
    baoThanhCong('Đã chuyển vé.');
    return true;
  }

  /** Nhập họ tên/SĐT hành khách (off-chain) — dùng khi vừa nhận vé từ người khác */
  async capNhatHanhKhach(ve) {
    const nd = this.ud.nguoiDung;
    const hop = hopThoai(`<h2>Thông tin hành khách</h2>
      <p class="muted mt-s">${ThaoTacVe.moTa(ve)}</p>
      <form id="f" class="stack mt" novalidate>
        <div class="field"><label for="ten">Họ và tên</label><input class="in" id="ten" value="${h(ve.hanhKhach?.hoTen || nd.hoTen)}"></div>
        <div class="field"><label for="sdt">Số điện thoại</label><input class="in" id="sdt" value="${h(ve.hanhKhach?.sdt || nd.sdt)}"></div>
        <div class="actions"><button type="button" class="btn ghost" data-close="false">Hủy</button><button class="btn primary" type="submit">Lưu</button></div>
      </form>`, {
      khiMo: (khung, dong) => khung.querySelector('#f').addEventListener('submit', (e) => {
        e.preventDefault();
        dong({ hoTen: khung.querySelector('#ten').value.trim(), sdt: khung.querySelector('#sdt').value.trim() });
      }),
    });
    const kq = await hop.ketQua;
    if (!kq || !kq.hoTen) return false;
    await this.api.gui('/api/ve/hanh-khach', { danhSach: [{ maVe: ve.maVe, ...kq }] });
    baoThanhCong('Đã lưu thông tin hành khách.');
    return true;
  }
}
