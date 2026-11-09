// Chuẩn hóa dữ liệu nhóm vé trả về từ backend (giống BookingInfo bên app cũ)
import { toDate } from './core.js';

const point = (p) => p && ({
  maDiem: p.maDiem || '', tenDiem: p.tenDiem || '', diaChi: p.diaChi || '', loai: p.loai || 'BEN_XE',
  thoiGianDuKien: p.thoiGianDuKien ? toDate(p.thoiGianDuKien) : null,
});

export function normBooking(j) {
  const cx = j.chuyenXe || {}, hk = j.hanhKhach || {}, ct = j.chiTietThanhToan || {};
  return {
    maChuyenXe: cx.maChuyenXe || '', tenLoTrinh: cx.tenLoTrinh || '',
    diemKhoiHanh: cx.diemKhoiHanh || '', diemKetThuc: cx.diemKetThuc || '',
    xuatPhat: cx.thoiGianXuatPhat ? toDate(cx.thoiGianXuatPhat) : null,
    denDich: cx.thoiGianDenDich ? toDate(cx.thoiGianDenDich) : null,
    tenXe: cx.tenXe || '', bienSoXe: cx.bienSoXe || '',
    hoTen: hk.hoTen || '', sdt: hk.sdt || '', email: hk.email || '', cmnd: hk.cmnd || '',
    ghe: j.danhSachGhe || [],
    ve: (j.danhSachVe || []).map((v) => ({ maDatVe: v.maDatVe, maGhe: v.maGhe, maQR: v.maQR, trangThai: v.trangThaiVe, giaGoc: +v.giaVeGoc || 0, tienGiam: +v.tienGiam || 0, thanhTien: +v.thanhTien || 0, nftTokenId: v.nftTokenId || null, nftStatus: v.nftStatus || null, nftTxHash: v.nftTxHash || null, dangRaoBan: !!v.dangRaoBan })),
    hoaDon: (j.danhSachHoaDon || []).map((h) => ({ ...h, tongTien: +h.tongTien || 0, ngayThanhToan: h.ngayThanhToan ? toDate(h.ngayThanhToan) : null })),
    diemDon: point(j.diemDon), diemTra: point(j.diemTra),
    dsDiemDon: (j.danhSachDiemDonKhaDung || []).map(point),
    dsDiemTra: (j.danhSachDiemTraKhaDung || []).map(point),
    tongTien: +(ct.tongTien ?? j.tongTien) || 0,
    phiThanhToan: +ct.phiThanhToan || 0,
    hetHanGiu: j.hetHanGiu ? toDate(j.hetHanGiu) : null,
    canhBao: j.diemLenXe?.canhBao || '',
  };
}
