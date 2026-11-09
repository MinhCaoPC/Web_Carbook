// Test phạm vi miền Tây: phân loại tuyến + chọn số chuyến mỗi tuyến. Chạy: npm test
const path = require('path');
const { laLoTrinhMienTay, chonChuyenMoiTuyen, phanLoaiDiem } = require('../src/utils/mekong');
const { check, failed } = require('./fakeFirestore').createChecker();

const lt = (a, b) => ({ diemKhoiHanh: a, diemKetThuc: b });
check('Cần Thơ - Cà Mau: giữ', laLoTrinhMienTay(lt('Cần Thơ', 'Cà Mau')));
check('Hà Tiên (An Giang) - Miền Tây: giữ', laLoTrinhMienTay(lt('Hà Tiên (An Giang)', 'Miền Tây')));
check('Bến Cát (TP.HCM) - Sóc Trăng (Cần Thơ): giữ (TP.HCM là đầu mối)', laLoTrinhMienTay(lt('Bến Cát (TP.HCM)', 'Sóc Trăng (Cần Thơ)')));
check('TP.HCM - Hà Nội: loại', !laLoTrinhMienTay(lt('TP.HCM', 'Hà Nội')));
check('TP.HCM - TP.HCM: loại (không có đầu miền Tây)', !laLoTrinhMienTay(lt('TP.HCM', 'Bình Dương (TP.HCM)')));
check('Miền Tây - Vũng Tàu (TP.HCM): loại', !laLoTrinhMienTay(lt('Miền Tây', 'Vũng Tàu (TP.HCM)')));
check('Cần Thơ - Miền Đông Mới: loại', !laLoTrinhMienTay(lt('Cần Thơ', 'Miền Đông Mới')));
check('không dấu / hoa thường vẫn nhận: "can tho"', phanLoaiDiem('can tho') === 'MIEN_TAY');
check('địa giới mới: Sóc Trăng/Trà Vinh vẫn nhận là địa danh miền Tây', laLoTrinhMienTay(lt('Sóc Trăng (Cần Thơ)', 'Trà Vinh (Vĩnh Long)')));
check('Long An nay thuộc Tây Ninh: loại', !laLoTrinhMienTay(lt('Cần Thơ', 'Long An')));
check('rỗng/undefined: loại', !laLoTrinhMienTay(lt('', undefined)));

const mk = (id, tuyen, gio) => ({ id, maLoTrinh: tuyen, thoiGianXuatPhat: `2026-07-15 ${gio}:00` });
const trips = [mk('a', 'T1', '08:00'), mk('b', 'T1', '14:00'), mk('c', 'T1', '20:00'), mk('d', 'T2', '09:00'), mk('e', 'T3', '07:00'), mk('f', 'T3', '12:00')];
const chon = chonChuyenMoiTuyen(trips, 2).map((t) => t.id).sort().join(',');
check('mỗi tuyến tối đa 2 chuyến, tuyến 3 chuyến giữ sớm nhất + muộn nhất', chon === 'a,c,d,e,f', chon);
check('k=1 giữ chuyến giữa', chonChuyenMoiTuyen(trips, 1).filter((t) => t.maLoTrinh === 'T1')[0].id === 'b');
check('tuyến ít hơn k chuyến giữ nguyên', chonChuyenMoiTuyen(trips, 5).length === trips.length);

// Dữ liệu thật trong database/*.xlsx
try {
  const XLSX = require('xlsx');
  const doc = (f) => { const wb = XLSX.readFile(path.join(__dirname, '..', 'database', f)); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]); };
  const tuyen = doc('LOTRINH_Data_Fixed.xlsx'); const chuyen = doc('CHUYENXE_Data_Fixed.xlsx');
  const giu = new Set(tuyen.filter(laLoTrinhMienTay).map((t) => t.maLoTrinh));
  const bi_loai = tuyen.filter((t) => !giu.has(t.maLoTrinh)).map((t) => t.maLoTrinh).sort().join(',');
  check('dữ liệu thật: loại đúng 6 tuyến ra miền Đông/Vũng Tàu', bi_loai === 'LT020,LT036,LT048,LT049,LT053,LT064', bi_loai);
  const sau = chonChuyenMoiTuyen(chuyen.filter((c) => giu.has(c.maLoTrinh)), 2);
  check('dữ liệu thật: từ 192 chuyến còn 116 chuyến/ngày', sau.length === 116, sau.length);
} catch (e) { check('đọc dữ liệu xlsx', false, e.message); }

console.log(failed() ? `\n${failed()} test FAIL` : '\nTất cả test miền Tây đều PASS');
process.exit(failed() ? 1 : 0);
