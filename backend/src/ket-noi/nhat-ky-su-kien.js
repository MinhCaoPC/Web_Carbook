/**
 * NHẬT KÝ SỰ KIỆN của hợp đồng VeXeNFT (DaMuaVe, DaBanLai, DaChuyenNhuong, DaHuyVe, DaSuDungVe...).
 *
 * Mỗi khi hợp đồng làm gì đó, nó "phát" một sự kiện ghi vĩnh viễn trên blockchain. Lớp này đọc các sự kiện đó
 * và giữ trong RAM để dựng THÔNG BÁO cho người dùng — nên không cần lưu từng thông báo vào Firebase.
 *
 * Quét TĂNG DẦN: lần sau chỉ đọc các khối mới, chia nhỏ từng đoạn. Mỗi RPC giới hạn số khối mỗi lần hỏi khác nhau
 * (vd Alchemy miễn phí chỉ cho 10 khối, publicnode cho 10.000) nên bắt đầu với 2000 khối,
 * bị từ chối thì TỰ GIẢM dần cho tới khi RPC chịu trả lời.
 */
class NhatKySuKien {
  static SO_KHOI_TOI_DA = 2000;
  static SO_KHOI_TOI_THIEU = 10;
  static NGHI_GIUA_HAI_LAN_MS = 3000;

  /** @param {import('./ket-noi-blockchain').KetNoiBlockchain} blockchain */
  constructor(blockchain) {
    this.blockchain = blockchain;
    this._soKhoiMoiLan = NhatKySuKien.SO_KHOI_TOI_DA; // giữ nguyên khi đặt lại: RPC không đổi
    this._datLai(null);
  }

  _datLai(diaChiHopDong) {
    this._diaChiHopDong = diaChiHopDong;
    this._khoiDaQuet = -1;
    this._suKien = [];
    this._thoiGianKhoi = new Map(); // số khối -> thời gian (ms)
    this._lanCapNhatCuoi = 0;
    this._dangCapNhat = null;
  }

  /** Đọc thêm các sự kiện mới (tự bỏ qua nếu vừa đọc cách đây vài giây). */
  async capNhat() {
    if (this._dangCapNhat) return this._dangCapNhat;
    if (Date.now() - this._lanCapNhatCuoi < NhatKySuKien.NGHI_GIUA_HAI_LAN_MS) return;
    this._dangCapNhat = this._quet().finally(() => { this._dangCapNhat = null; this._lanCapNhatCuoi = Date.now(); });
    return this._dangCapNhat;
  }

  async _quet() {
    const hopDong = this.blockchain.hopDong;
    if (hopDong.target !== this._diaChiHopDong) this._datLai(hopDong.target); // triển khai lại hợp đồng -> quét lại từ đầu
    const provider = this.blockchain.provider;
    const khoiMoiNhat = await provider.getBlockNumber();
    if (this._khoiDaQuet > khoiMoiNhat) this._datLai(hopDong.target); // mạng ảo vừa khởi động lại

    let tu = Math.max(this._khoiDaQuet + 1, this.blockchain.khoiTrienKhai);
    while (tu <= khoiMoiNhat) {
      const den = Math.min(tu + this._soKhoiMoiLan - 1, khoiMoiNhat);
      let nhatKy;
      try {
        nhatKy = await provider.getLogs({ address: hopDong.target, fromBlock: tu, toBlock: den });
      } catch (loi) {
        // RPC công khai gồm nhiều máy, có máy chậm vài khối ("beyond current head") -> dừng, lần sau đọc tiếp
        if (/beyond current head|head block|block range is beyond/i.test(JSON.stringify(loi?.error || loi?.message || ''))) break;
        // RPC chê đoạn quá dài -> chia nhỏ hơn rồi hỏi lại (2000 -> 400 -> 80 -> 16 -> 10)
        if (this._soKhoiMoiLan <= NhatKySuKien.SO_KHOI_TOI_THIEU) throw loi;
        this._soKhoiMoiLan = Math.max(NhatKySuKien.SO_KHOI_TOI_THIEU, Math.floor(this._soKhoiMoiLan / 5));
        continue;
      }
      for (const log of nhatKy) {
        let sk;
        try { sk = hopDong.interface.parseLog(log); } catch { continue; }
        if (!sk) continue;
        this._suKien.push({
          ten: sk.name,
          thamSo: Object.fromEntries(sk.fragment.inputs.map((input, i) => [input.name, sk.args[i]])),
          khoi: log.blockNumber,
          viTri: log.index,
          maGiaoDich: log.transactionHash,
        });
      }
      this._khoiDaQuet = den;
      tu = den + 1;
    }
    await this._ganThoiGian();
  }

  /** Lấy thời gian của từng khối có sự kiện (mỗi khối hỏi 1 lần rồi nhớ). */
  async _ganThoiGian() {
    const canHoi = [...new Set(this._suKien.filter((s) => !s.thoiGian).map((s) => s.khoi))].filter((k) => !this._thoiGianKhoi.has(k));
    await Promise.all(canHoi.map(async (k) => {
      const khoi = await this.blockchain.provider.getBlock(k);
      this._thoiGianKhoi.set(k, Number(khoi.timestamp) * 1000);
    }));
    for (const s of this._suKien) if (!s.thoiGian) s.thoiGian = this._thoiGianKhoi.get(s.khoi);
  }

  /** Toàn bộ sự kiện đã đọc (cũ -> mới). */
  get danhSach() {
    return this._suKien;
  }
}

module.exports = { NhatKySuKien };
