// TRA CỨU VÉ — trang CÔNG KHAI (không cần đăng nhập).
// Ai cũng nhập được mã vé để kiểm tra trên blockchain: vé có thật không, còn hiệu lực / đã lên xe / đã hủy,
// đang thuộc ví nào. Hữu ích trước khi mua lại vé của người khác: không cần tin lời người bán hay tin nhà xe.
// Trang KHÔNG hiện họ tên, số điện thoại hành khách (thông tin cá nhân nằm off-chain, chỉ chủ vé và nhà xe xem được).
import { TrangCoSo } from './trang-co-so.js';
import { icon, h, ngayGio, thoiLuong, dinhDangEth, dinhDangVnd, weiSangVnd, rutGonDiaChi, htmlDangTai, htmlMaTraCuu } from '../giao-dien.js';

/** Mỗi trạng thái vé: lớp màu, biểu tượng, câu kết luận cho người tra cứu */
const KET_LUAN = {
  HIEU_LUC: ['ok-msg', 'check', 'Vé hợp lệ — còn hiệu lực, chưa lên xe.'],
  DA_SU_DUNG: ['warn-msg', 'info', 'Vé ĐÃ ĐƯỢC SỬ DỤNG — khách đã lên xe, không dùng lại được.'],
  DA_HUY: ['err-msg', 'x', 'Vé ĐÃ BỊ HỦY — chủ vé đã hủy và nhận tiền hoàn, vé không còn tồn tại.'],
};

export class TrangTraCuuVe extends TrangCoSo {
  static tieuDe = 'Tra cứu vé';
  static menu = '/tra-cuu';
  static canDangNhap = false; // công khai
  static doRong = 'mid';

  async hienThi(khung, { maVe = "" } = {}) {
    this.khung = khung;
    khung.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Tra cứu vé NFT</h1>
        <div class="sub">Kiểm tra một vé trực tiếp trên blockchain — không cần tài khoản. Thông tin cá nhân của hành khách không hiển thị.</div></div></div>
      <form class="card row wrap" id="f" style="gap:12px;align-items:end" novalidate>
        <div class="field grow" style="min-width:200px"><label for="ma-ve">Mã vé (số NFT, ghi trên vé)</label>
          <div class="ctrl">${icon('ticket')}<input class="in" id="ma-ve" inputmode="numeric" placeholder="Ví dụ: 12" value="${h(maVe)}"></div></div>
        <button class="btn primary lg" type="submit">${icon('search')} Tra cứu</button>
      </form>
      <div id="ket-qua" class="mt">${maVe ? htmlDangTai : this.htmlGioiThieu()}</div>`;

    khung.querySelector('#f').addEventListener('submit', (e) => {
      e.preventDefault();
      const ma = khung.querySelector('#ma-ve').value.trim().replace(/^#/, '');
      if (ma) this.ud.di(`/tra-cuu/${encodeURIComponent(ma)}`);
    });
    if (maVe) await this.traCuu(maVe);
  }

  /** Gọi API công khai rồi vẽ kết quả */
  async traCuu(maVe) {
    const o = this.khung.querySelector('#ket-qua');
    let ve;
    try {
      ve = (await this.api.lay(`/api/ve/tra-cuu/${encodeURIComponent(maVe)}`)).ve;
    } catch (loi) {
      o.innerHTML = `<div class="card"><div class="err-msg">${icon('x', 'sm')} ${h(loi.message)}</div>
        <p class="muted mt-s">Hãy kiểm tra lại mã vé. Vé chưa từng được phát hành thì không có trên blockchain — có thể là vé giả.</p></div>`;
      return;
    }
    if (!this.conHienThi) return;

    const c = ve.chuyen || {};
    const [lop, ic, cau] = KET_LUAN[ve.trangThai] || ['warn-msg', 'info', 'Không rõ trạng thái.'];
    const dangRao = BigInt(ve.giaDangRaoWei) > 0n;
    const tt = this.ud.thongTinHopDong;
    const tyGia = this.ud.tyGia;
    o.innerHTML = `
      <div class="card stack">
        <div class="${lop}" style="font-size:15px">${icon(ic, 'sm')} <b>${cau}</b></div>
        <div class="row between wrap"><h2 style="margin:0">Vé NFT #${ve.maVe}</h2>
          ${dangRao ? `<span class="badge warn">Đang rao bán ${dinhDangEth(ve.giaDangRaoWei)}</span>` : ''}</div>
        ${htmlMaTraCuu(ve)}
        <div>
          <div class="kv"><span>Tuyến</span><span>${h(c.diemKhoiHanh || ve.maChuyen)} → ${h(c.diemKetThuc || '')}</span></div>
          <div class="kv"><span>Khởi hành</span><span>${ngayGio(ve.gioKhoiHanh)}${c.gioDen ? ` · ${thoiLuong(c.gioKhoiHanh, c.gioDen)}` : ''}</span></div>
          ${c.bienSoXe ? `<div class="kv"><span>Xe</span><span>${h(c.loaiXe || '')} · ${h(c.bienSoXe)}</span></div>` : ''}
          <div class="kv"><span>Giá gốc</span><span>${dinhDangEth(ve.giaGocWei)}<div class="hint">≈ ${dinhDangVnd(weiSangVnd(ve.giaGocWei, tyGia))}</div></span></div>
          <div class="kv"><span>Chủ sở hữu (ví)</span><span class="mono" title="${h(ve.chuSoHuu || '')}">${ve.chuSoHuu ? h(rutGonDiaChi(ve.chuSoHuu)) : '— (vé đã bị đốt)'}</span></div>
          ${ve.trangThai === 'HIEU_LUC' ? `<div class="kv"><span>Bán lại / tặng được</span><span>${ve.coTheChuyenNhuong ? 'Có (tối đa 110% giá gốc)' : 'Không — còn dưới 2 giờ tới giờ chạy'}</span></div>` : ''}
        </div>
        ${tt.tenMang === 'sepolia' ? `<a class="btn ghost block" target="_blank" rel="noopener" href="https://sepolia.etherscan.io/nft/${h(tt.diaChi)}/${ve.maVe}">${icon('shield', 'sm')} Tự kiểm chứng trên Etherscan ${icon('ext', 'sm')}</a>` : ''}
      </div>
      ${ve.trangThai === 'HIEU_LUC' ? `<div class="card mt"><h3>${icon('info', 'sm')} Định mua lại vé này?</h3>
        <p class="muted" style="margin:0">Chỉ mua qua <a href="#/cho-ve">Chợ vé CARBOOK</a>: hợp đồng giữ đúng giá trần 110%, tiền và vé đổi chủ cùng lúc.
          Đừng chuyển tiền riêng cho người bán — nếu họ không chuyển vé, không ai lấy lại được tiền cho bạn.</p></div>` : ''}`;
  }

  htmlGioiThieu() {
    return `<div class="card"><h3>${icon('shield', 'sm')} Vì sao tra cứu được?</h3>
      <p class="muted" style="margin:0">Mỗi vé CARBOOK là một NFT trên blockchain. Trạng thái vé (còn hiệu lực, đã lên xe, đã hủy) và ví đang giữ vé
        do HỢP ĐỒNG THÔNG MINH ghi lại — nhà xe cũng không sửa được. Nhập mã vé ở trên để kiểm tra trước khi mua lại hay nhận vé từ người khác.</p></div>`;
  }
}
