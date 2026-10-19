import { Timestamp } from 'firebase-admin/firestore';

// --- NHÓM TÀI KHOẢN & NGƯỜI DÙNG ---
export interface TaiKhoan {
  matKhau: string;
  email: string; // UNIQUE
  googleId?: string | null;
  hinhThucDangNhap: 'Local' | 'Google';
  loaiTaiKhoan: 'KH' | 'AD';
  maXacNhan?: string | null;
  trangThai: 'active' | 'locked' | 'destroy';
  ngayTao: Timestamp;
  ngayCapNhat: Timestamp;
}

export interface KhachHang {
  maTaiKhoan: string; // FK
  hoTen: string;
  gioiTinh: 'Nam' | 'Nữ' | 'Khác';
  ngaySinh: Timestamp;
  sdt: string;
  diaChi: string;
}

export interface QuanTriVien {
  maTaiKhoan: string; // FK
  hoTen: string;
  chucVu: 'SuperAdmin' | 'DieuHanh' | 'CSKH';
  sdt: string;
}

// --- NHÓM VÍ VÀ GIAO DỊCH ---
export interface ViNoiBo {
  maTaiKhoan: string; // FK
  diaChiViBlockchain: string; // UNIQUE
  soDuVi: number;
  trangThaiVi: 'active' | 'frozen';
  ngayTao: Timestamp;
}

export interface YeuCauNapTien {
  maVi: string; // FK
  hinhThucNap: 'MOMO' | 'VNPAY';
  maGiaoDichNgoai?: string | null;
  soTien: number;
  trangThai: 'TC' | 'CXN' | 'KTC';
  thoiGianNap: Timestamp;
  thoiGianXuLy?: Timestamp | null;
  ghiChuAdmin?: string | null;
}

export interface YeuCauRutTien {
  maVi: string; // FK
  nganHang: string;
  soTaiKhoanNH: string;
  tenChuTaiKhoan: string;
  soTien: number;
  trangThai: 'TC' | 'CXN' | 'KTC';
  thoiGianYeuCau: Timestamp;
  thoiGianXuLy?: Timestamp | null;
  ghiChuAdmin?: string | null;
}

export interface GiaoDichVi {
  maVi: string; // FK
  txHash: string; // UNIQUE
  loaiGD: 'NAP' | 'RUT' | 'THANHTOAN' | 'HOANTIEN';
  viGui: string;
  viNhan: string;
  soTien: number;
  phiGas: number;
  blockNumber: number;
  trangThai: 'PENDING' | 'CONFIRMED' | 'FAILED';
  thoiGianGD: Timestamp;
}

// --- NHÓM VẬN HÀNH (XE, CHUYẾN, LỘ TRÌNH) ---
export interface LoTrinh {
  tenLoTrinh: string;
  diemKhoiHanh: string;
  diemKetThuc: string;
  quangDuongKm: number;
  thoiGianDuKien: number;
  trangThai: 'HoatDong' | 'Ngung';
}

export interface DiemTrungChuyen {
  maLoTrinh: string; // FK
  tenDiem: string;
  diaChiChiTiet: string;
  khuVuc: string;
  loaiDiem: 'DON' | 'TRA' | 'TRUNGCHUYEN';
}

export interface Xe {
  bienSoXe: string; // UNIQUE
  tenLoaiXe: 'GiuongNam' | 'Limousine' | 'Ghe';
  tongSoGhe: number;
  trangThaiXe: 'SanSang' | 'BaoTri';
}

export interface ChuyenXe {
  maLoTrinh: string; // FK
  maXe: string; // FK
  thoiGianXuatPhat: Timestamp;
  thoiGianDenDich: Timestamp;
  giaVe: number;
  soGheConTrong: number;
  trangThai: 'SapChay' | 'DangChay' | 'Xong' | 'Huy';
}

export interface GheXe {
  maChuyenXe: string; // FK
  maGhe: string;
  trangThai: 'TRONG' | 'DANG_GIU' | 'DA_DAT';
}

// --- NHÓM ĐẶT VÉ & HÓA ĐƠN ---
export interface VeXe {
  maKhachHang: string; // FK
  maChuyenXe: string; // FK
  maGheXe: string; // FK
  maDiemDon?: string | null;
  maDiemTra?: string | null;
  giaVeGoc: number;
  tienGiam: number;
  thanhTien: number;
  maQR: string; // UNIQUE
  trangThaiVe: 'GIU_CHO' | 'DA_TT' | 'HUY' | 'HOAN';
  thoiGianDat: Timestamp;
}

export interface HoaDon {
  maDatVe: string; // FK
  maGiaoDich: string; // FK
  phuongThucTT: 'VINOIBO' | 'MOMO' | 'VNPAY';
  tongTien: number;
  ngayThanhToan: Timestamp;
  trangThaiTT: 'TC' | 'CXN' | 'KTC' | 'HTT';
  moTa: string;
}

export interface DanhGia {
  maKhachHang: string; // FK
  maChuyenXe: string; // FK
  soSao: number;
  noiDungDanhGia: string;
  thoiGianDanhGia: Timestamp;
}

export interface YeuCauHoTro {
  maKhachHang: string; // FK
  maDatVe: string; // FK
  loaiYeuCau: 'DOI_VE' | 'HUY_VE' | 'KHIEUNAI';
  noiDungYeuCau: string;
  trangThai: 'CHO' | 'DANG_XU_LY' | 'HOAN_TAT';
  phanHoiAdmin?: string | null;
  thoiGianTao: Timestamp;
}