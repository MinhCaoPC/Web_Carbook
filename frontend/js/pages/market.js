import { api, icon, esc, money, num, fmtDateTime, shortAddr, toastErr, toastOk, setBusy, modal, pinBox, confirmBox, emptyHTML, errorHTML, loadingHTML } from '../core.js';
import { go } from '../app.js';

const backBtn = (href) => `<a class="back" href="#${href}" aria-label="Quay lại">${icon('back')}</a>`;
const MAX_MARKUP = 1.1; // khớp MAX_MARKUP_BPS = 11000 của backend (giá tối đa 110% giá gốc)

// =====================================================================
//  Hộp thoại rao bán vé (dùng ở "Vé của tôi")
// =====================================================================
export async function sellDialog(t) {
  const tran = Math.floor((t.giaGoc || 0) * MAX_MARKUP);
  const m = modal(`<h2>Rao bán vé trên chợ</h2>
    <p class="muted mt-s">${esc(t.from)} → ${esc(t.to)} · ${esc(t.date)} ${esc(t.time)} · Ghế <b>${esc(t.seat)}</b></p>
    <div class="info-msg mt-s">Giá gốc <b>${money(t.giaGoc)}</b>. Giá rao tối đa <b>${money(tran)}</b> (110%) — chống phe vé. Người mua trả tiền vào ví, bạn nhận tiền sau khi trừ 5% hoa hồng cho nhà xe.</div>
    <form id="sf" class="stack mt" novalidate>
      <div class="field"><label for="gia">Giá rao bán (VNĐ)</label>
        <input class="in" id="gia" inputmode="numeric" value="${num(t.giaGoc)}" style="font-size:22px;font-weight:700;height:56px" autocomplete="off"></div>
      <div class="err-msg hidden" id="err"></div>
      <div class="actions"><button type="button" class="btn ghost" data-close="false">Hủy</button><button class="btn primary" type="submit">Rao bán</button></div>
    </form>`);
  const f = m.box.querySelector('#sf'), gia = f.querySelector('#gia'), err = f.querySelector('#err');
  gia.addEventListener('input', () => { const v = Number(gia.value.replace(/\D/g, '')) || 0; gia.value = v ? num(v) : ''; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Number(gia.value.replace(/\D/g, '')) || 0, bad = (msg) => { err.textContent = msg; err.classList.remove('hidden'); };
    if (v <= 0) return bad('Vui lòng nhập giá rao bán.');
    if (v > tran) return bad(`Giá rao tối đa ${num(tran)}đ (110% giá gốc).`);
    const btn = f.querySelector('[type=submit]'); setBusy(btn, true, 'Đang ghi lên blockchain…');
    try {
      await api('/api/nft/market/list', { method: 'POST', body: { maDatVe: t.id, gia: v } });
      m.close(true);
      toastOk('Đã rao bán vé trên chợ.');
    } catch (e2) { bad(e2.message); setBusy(btn, false); }
  });
  return m.result;
}

export async function cancelListing(maDatVe) {
  const ok = await confirmBox({ title: 'Huỷ rao bán?', message: 'Vé sẽ được gỡ khỏi chợ và quay về trạng thái bình thường.', ok: 'Huỷ rao bán', cancel: 'Giữ lại' });
  if (!ok) return false;
  await api('/api/nft/market/cancel', { method: 'POST', body: { maDatVe } });
  toastOk('Đã huỷ rao bán.');
  return true;
}

// =====================================================================
//  Chợ vé NFT
// =====================================================================
export async function market(ctx) {
  ctx.title('Chợ vé NFT');
  ctx.wide('mid');
  ctx.el.innerHTML = `
    <div class="page-head"><div class="grow"><h1>Chợ vé NFT</h1><div class="sub">Mua lại vé của người không đi được — giá tối đa 110% giá gốc.</div></div>
      <a class="btn sm" href="#/blockchain">${icon('shield', 'sm')} Vé NFT của tôi</a></div>
    <div class="info-msg">Vé đã mua sẽ được chuyển quyền sở hữu NFT sang bạn và cấp <b>mã QR mới</b>; mã QR cũ của người bán không còn hiệu lực. Vé sát giờ xe chạy (dưới 2 giờ) không được mua bán.</div>
    <div id="list" class="mt">${loadingHTML}</div>`;
  const list = ctx.el.querySelector('#list');

  const load = async () => {
    list.innerHTML = loadingHTML;
    try {
      const rows = (await api('/api/nft/market')).data || [];
      if (!ctx.isCurrent()) return;
      if (!rows.length) { list.innerHTML = emptyHTML('ticket', 'Chưa có vé nào được rao bán', 'Khi có người rao bán lại vé, vé sẽ xuất hiện ở đây.'); return; }
      list.innerHTML = `<div class="grid cols-2">${rows.map((r) => `
        <div class="card">
          <div class="row between"><div class="row"><span class="ico">${icon('ticket')}</span><div><b>${esc(r.diemKhoiHanh)} → ${esc(r.diemKetThuc)}</b>
            <div class="hint">${fmtDateTime(r.gioXuatPhatUnix * 1000)} · Ghế ${esc(r.maGhe)}</div></div></div><span class="badge gray">NFT #${r.tokenId}</span></div>
          <div class="trip-foot"><div><div class="hint">Giá gốc <s>${money(r.giaGoc)}</s></div><span class="price">${money(r.gia)}</span></div>
            ${r.laCuaToi ? `<button class="btn sm danger-o" data-cancel="${esc(r.maDatVe)}">Huỷ rao bán</button>`
              : `<button class="btn sm primary" data-buy="${esc(r.maDatVe)}" data-gia="${r.gia}">Mua vé</button>`}</div>
        </div>`).join('')}</div>`;
      list.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', async () => {
        const maPin = await pinBox({ title: 'Nhập mã PIN ví', desc: `Xác nhận mua vé ${money(b.dataset.gia)}` });
        if (!maPin) return;
        setBusy(b, true, 'Đang chuyển NFT…');
        try {
          await api('/api/nft/market/buy', { method: 'POST', body: { maDatVe: b.dataset.buy, maPin } });
          toastOk('Mua vé thành công! Vé đã nằm trong "Vé của tôi".');
          go('/history');
        } catch (e) { toastErr(e); setBusy(b, false); load(); }
      }));
      list.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
        setBusy(b, true);
        try { if (await cancelListing(b.dataset.cancel)) await load(); else setBusy(b, false); } catch (e) { toastErr(e); setBusy(b, false); }
      }));
    } catch (e) { list.innerHTML = errorHTML(e.message); list.querySelector('[data-retry]')?.addEventListener('click', load); }
  };
  load();
}

// =====================================================================
//  Vé NFT của tôi & hợp đồng (trang minh bạch on-chain)
// =====================================================================
export async function nftInfo(ctx) {
  ctx.title('Vé NFT & hợp đồng');
  ctx.wide('mid');
  let cfg = null; try { cfg = await api('/api/nft/config', { auth: false }); } catch (e) { cfg = { error: e.message }; }
  if (!ctx.isCurrent()) return;
  const ex = cfg?.network?.explorer || 'https://sepolia.etherscan.io';
  const nftAddr = cfg?.contracts?.[0]?.address || '';
  ctx.el.innerHTML = `
    <div class="page-head">${backBtn('/market')}<div class="grow"><h1>Vé NFT &amp; hợp đồng</h1><div class="sub">Mỗi vé đã thanh toán là một NFT — kiểm chứng công khai trên blockchain.</div></div></div>
    <div class="split">
      <section class="stack">
        <div class="card"><h3>Vé NFT của tôi</h3><div class="list" id="mine">${loadingHTML}</div></div>
        <div class="card"><h3>Mạng &amp; hợp đồng thông minh</h3>
          ${cfg.error ? `<div class="warn-msg">${esc(cfg.error)}</div>` : `
          ${cfg.daCauHinh ? '' : '<div class="warn-msg">Máy chủ chưa cấu hình blockchain nên vé chưa được phát hành NFT.</div>'}
          <div class="kv"><span>Mạng</span><span>${esc(cfg.network.name)}</span></div>
          <div class="kv"><span>Chain ID</span><span>${cfg.network.chainId}</span></div>
          <div class="mt">${cfg.contracts.map((c) => `<div class="contract"><div class="row between"><b>${esc(c.label)}</b><span class="badge gray">${esc(c.name)}.sol</span></div>
            ${c.address ? `<a class="mono" target="_blank" rel="noopener" href="${ex}/address/${esc(c.address)}">${esc(c.address)} ${icon('ext', 'sm')}</a>` : '<span class="hint">Chưa triển khai</span>'}</div>`).join('')}</div>`}
        </div>
      </section>
      <aside class="sticky-side"><div class="card"><h3>Cách hoạt động</h3>
        <div class="stack">
          ${[['ticket', '', 'Phát hành vé', 'Thanh toán xong, hệ thống mint một NFT (TicketNFT.mintTicket) mang mã chuyến, ngày, ghế và giá gốc.'],
            ['swap', 'green', 'Bán lại có giá trần', `TicketMarket chỉ cho rao tối đa ${cfg?.luat?.giaTranPhanTram ?? 110}% giá gốc; khoá chuyển nhượng ${cfg?.luat?.khoaChuyenNhuongGio ?? 2} giờ trước giờ xe chạy; ${cfg?.luat?.hoaHongPhanTram ?? 5}% hoa hồng về nhà xe (ERC-2981).`],
            ['check', 'warn', 'Soát vé', 'Nhà xe quét QR: kiểm tra chủ NFT khớp chủ vé rồi đánh dấu đã dùng (markUsed) — vé không bán lại được nữa.'],
            ['refresh', 'gray', 'Hoàn vé', 'Hủy vé trước giờ chạy 4 giờ: NFT bị đốt, 70% giá vé hoàn về ví CarbookPay.']].map(([ic, col, t, d]) => `
            <div class="feature"><span class="ico ${col}">${icon(ic)}</span><div><h4>${t}</h4><p>${d}</p></div></div>`).join('')}
        </div></div></aside>
    </div>`;
  api('/api/nft/my').then((d) => {
    const el = ctx.el.querySelector('#mine'); if (!el) return;
    const a = d.data || [];
    el.innerHTML = a.length ? a.map((v) => `
      <div class="item"><span class="ico">${icon('ticket')}</span>
        <div class="grow"><b>NFT #${v.tokenId} · Ghế ${esc(v.maGhe)}</b>
          <div class="hint">Chuyến ${esc(v.maChuyenXe)} · ${esc(v.ngayDi)}${v.dangRaoBan ? ' · <span style="color:var(--warn)">Đang rao ' + money(v.giaRaoBan) + '</span>' : ''}${v.trangThaiVe === 'DA_SU_DUNG' ? ' · Đã dùng' : ''}${v.soLanChuyenNhuong ? ' · đổi chủ ' + v.soLanChuyenNhuong + ' lần' : ''}</div>
          ${nftAddr ? `<a class="hint mono" target="_blank" rel="noopener" href="${ex}/token/${esc(nftAddr)}?a=${v.tokenId}">Xem token trên Etherscan ${icon('ext', 'sm')}</a>` : ''}</div>
        <span class="badge ${v.trangThaiVe === 'DA_TT' ? 'blue' : 'gray'}">${esc(v.nftStatus === 'DA_DOT' ? 'Đã đốt' : v.trangThaiVe === 'DA_SU_DUNG' ? 'Đã dùng' : 'Hợp lệ')}</span></div>`).join('')
      : emptyHTML('ticket', 'Chưa có vé NFT', 'Đặt và thanh toán một chuyến để nhận vé NFT đầu tiên.');
  }).catch((e) => { const el = ctx.el.querySelector('#mine'); if (el) el.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; });
}
