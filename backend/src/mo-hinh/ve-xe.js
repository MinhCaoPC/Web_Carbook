/**
 * Mô hình VÉ XE — dữ liệu ĐỌC TỪ BLOCKCHAIN (hợp đồng VeXeNFT).
 * Blockchain là "nguồn sự thật" về: ai sở hữu vé, vé ở trạng thái nào.
 */
class VeXe {
  static TRANG_THAI = ['HIEU_LUC', 'DA_SU_DUNG', 'DA_HUY']; // khớp enum TrangThaiVe trong hợp đồng

  /**
   * @param {number} maVe tokenId
   * @param {object} veTrenChuoi struct Ve trả về từ hợp đồng
   * @param {string|null} chuSoHuu địa chỉ ví chủ vé (null nếu vé đã hủy/đốt)
   * @param {bigint} giaDangRao giá đang rao bán (wei), 0 = không rao
   */
  constructor(maVe, veTrenChuoi, chuSoHuu = null, giaDangRao = 0n) {
    this.maVe = Number(maVe);
    this.maChuyen = veTrenChuoi.maChuyen;
    this.maGhe = veTrenChuoi.maGhe;
    this.giaGocWei = BigInt(veTrenChuoi.giaGoc);
    this.gioKhoiHanh = new Date(Number(veTrenChuoi.gioKhoiHanh) * 1000);
    this.trangThai = VeXe.TRANG_THAI[Number(veTrenChuoi.trangThai)] || 'KHONG_RO';
    this.chuSoHuu = chuSoHuu && chuSoHuu !== '0x0000000000000000000000000000000000000000' ? chuSoHuu.toLowerCase() : null;
    this.giaDangRaoWei = BigInt(giaDangRao || 0);
  }

  get conHieuLuc() {
    return this.trangThai === 'HIEU_LUC';
  }

  toJSON() {
    return {
      maVe: this.maVe,
      maChuyen: this.maChuyen,
      maGhe: this.maGhe,
      giaGocWei: this.giaGocWei.toString(), // BigInt không đưa thẳng vào JSON được -> đổi sang chuỗi
      gioKhoiHanh: this.gioKhoiHanh.toISOString(),
      trangThai: this.trangThai,
      chuSoHuu: this.chuSoHuu,
      giaDangRaoWei: this.giaDangRaoWei.toString(),
    };
  }
}

module.exports = { VeXe };
