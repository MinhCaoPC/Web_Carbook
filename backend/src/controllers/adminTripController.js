const { db } = require('../config/firebase');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');

// Helper to clean up Vietnamese accents and symbols for clean text searches
const removeVietnameseAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
};

// getTemplateSeats function removed as we now use actual vehicle layout seats

// CHUYENXE_NGAY.trangThai luôn là 'SapChay' ngay từ lúc sinh (generateDailySchedules.js) và
// không có nơi nào trong code cập nhật lại field này theo thời gian thực — nên KHÔNG dùng nó
// để suy ra trạng thái hiển thị. Suy ra trạng thái thật từ giờ khởi hành/kết thúc + trạng thái
// hủy ở chuyến mẫu (CHUYENXE.trangThai) + có/không có xe được gán.
function tinhTrangThaiHienThi(template, thoiGianXuatPhat, thoiGianDenDich, now) {
  if (template.trangThai === 'Huy') return 'DaHuy';
  if (!template.maXe) return 'ChuaGanXe';
  if (now < thoiGianXuatPhat) return 'SapChay';
  if (now <= thoiGianDenDich) return 'DangChay';
  return 'Xong';
}

// GET /api/admin/trips?date=YYYY-MM-DD
exports.getTripsForDate = async (req, res) => {
  try {
    const { date } = req.query; // e.g. "2026-07-15"
    if (!date) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ngày.' });
    }

    // 1. Fetch all active vehicles (XE)
    const xeSnapshot = await db.collection('XE').get();
    const vehicles = xeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Fetch all drivers (TAIKHOAN where loaiTaiKhoan == 'TX')
    const tkSnapshot = await db.collection('TAIKHOAN').where('loaiTaiKhoan', '==', 'TX').get();
    const drivers = tkSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 3. Fetch all active routes (LOTRINH)
    const ltSnapshot = await db.collection('LOTRINH').get();
    const routes = ltSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const routeMap = Object.fromEntries(routes.map(r => [r.id, r]));

    // 4. Fetch all trips for that day (CHUYENXE_NGAY where ngayDi == date)
    const cxnSnapshot = await db.collection('CHUYENXE_NGAY').where('ngayDi', '==', date).get();
    const dailyTrips = cxnSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 5. Fetch all templates (CHUYENXE) to resolve templates
    const cxSnapshot = await db.collection('CHUYENXE').get();
    const templates = cxSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const templateMap = Object.fromEntries(templates.map(t => [t.id, t]));

    // 6. Join tables
    const now = new Date();
    const joinedTrips = dailyTrips.map(dt => {
      const template = templateMap[dt.maChuyenXe] || {};
      const route = routeMap[template.maLoTrinh] || {};

      // Resolve vehicle info
      const vehicleId = template.maXe;
      const vehicle = vehicles.find(v => v.id === vehicleId) || {};

      // Resolve driver info
      const driverId = dt.maTaiXe || template.maTaiXe;
      const driver = drivers.find(d => d.id === driverId) || {};

      const thoiGianXuatPhat = dt.thoiGianXuatPhat.toDate();
      const thoiGianDenDich = dt.thoiGianDenDich.toDate();

      return {
        id: dt.id,
        maChuyenXe: dt.maChuyenXe,
        ngayDi: dt.ngayDi,
        thoiGianXuatPhat: thoiGianXuatPhat.toISOString(),
        thoiGianDenDich: thoiGianDenDich.toISOString(),
        soGheConTrong: dt.soGheConTrong,
        trangThai: tinhTrangThaiHienThi(template, thoiGianXuatPhat, thoiGianDenDich, now),
        maLoTrinh: template.maLoTrinh || '',
        tenLoTrinh: route.tenLoTrinh || '',
        diemKhoiHanh: route.diemKhoiHanh || '',
        diemKetThuc: route.diemKetThuc || '',
        giaVe: template.giaVe || 0,
        maXe: template.maXe || '',
        bienSoXe: vehicle.bienSoXe || '',
        tenLoaiXe: vehicle.tenLoaiXe || '',
        maTaiXe: dt.maTaiXe || template.maTaiXe || '',
        tenTaiXe: driver.hoTen || (driver.firstName ? `${driver.lastName} ${driver.firstName}`.trim() : ''),
      };
    });

    return res.status(200).json({
      success: true,
      trips: joinedTrips,
      vehicles,
      drivers,
    });
  } catch (error) {
    console.error('getTripsForDate error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách chuyến xe.' });
  }
};

// POST /api/admin/trips/bulk
exports.bulkCreateTrips = async (req, res) => {
  try {
    const {
      maLoTrinh,
      maLoaiXe,
      khungGioXuatBenGoc,
      kieuPhanBo,
      nhomTaiXe,
      nhomXe,
      tuNgay,
      denNgay,
      cacThuTrongTuan,
      tanSuat,
      giaVe
    } = req.body;

    // 1. Basic validation
    if (!maLoTrinh || !khungGioXuatBenGoc || !khungGioXuatBenGoc.length || !tuNgay || !denNgay) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu bắt buộc.' });
    }

    if (!giaVe || Number(giaVe) <= 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp giá vé hợp lệ (lớn hơn 0).' });
    }

    // 2. Fetch route info to get duration
    const routeDoc = await db.collection('LOTRINH').doc(maLoTrinh).get();
    if (!routeDoc.exists) {
      return res.status(404).json({ success: false, message: 'Lộ trình không tồn tại.' });
    }
    const routeData = routeDoc.data();
    // thoiGianDuKien in LOTRINH is a decimal representing hours (e.g. 29 or 2.0)
    const thoiLuongPhut = Math.round((routeData.thoiGianDuKien || 0) * 60);

    // 3. Fetch ready vehicles and drivers if allocating auto
    let availableVehicles = [];
    let availableDrivers = [];

    if (kieuPhanBo === 'TuDongTheoDoi') {
      const xeSnapshot = await db.collection('XE').where('trangThaiXe', '==', 'SanSang').get();
      availableVehicles = xeSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(v => !maLoaiXe || v.maLoaiXe === maLoaiXe || v.tenLoaiXe.toLowerCase().includes(maLoaiXe.toLowerCase()));

      const tkSnapshot = await db.collection('TAIKHOAN').where('loaiTaiKhoan', '==', 'TX').get();
      availableDrivers = tkSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (availableVehicles.length === 0) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy xe khả dụng cho loại xe đã chọn.' });
      }
    }

    // 4. Generate valid dates in range
    const targetDates = [];
    let curDate = new Date(tuNgay);
    const endDate = new Date(denNgay);

    while (curDate <= endDate) {
      const dayOfWeek = curDate.getDay();
      const stdDay = dayOfWeek === 0 ? 8 : dayOfWeek + 1; // mapping: 2=Thứ 2, 8=CN
      
      if (tanSuat === 'HangNgay' || (cacThuTrongTuan && cacThuTrongTuan.map(Number).includes(stdDay))) {
        targetDates.push(new Date(curDate));
      }
      curDate.setDate(curDate.getDate() + 1);
    }

    if (targetDates.length === 0) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy ngày lặp hợp lệ nào trong khoảng thời gian đã chọn.' });
    }

    // 5. Generate proposed trips
    const proposedTrips = [];
    let vehicleIdx = 0;
    let driverIdx = 0;

    for (const dateObj of targetDates) {
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      for (const timeStr of khungGioXuatBenGoc) {
        const [h, m] = timeStr.split(':').map(Number);
        
        const departureTime = new Date(dateObj);
        departureTime.setHours(h, m, 0, 0);
        
        const arrivalTime = new Date(departureTime.getTime() + thoiLuongPhut * 60 * 1000);

        let assignedXe = null;
        let assignedDriver = null;

        if (kieuPhanBo === 'TuDongTheoDoi') {
          assignedXe = availableVehicles[vehicleIdx % availableVehicles.length].id;
          if (availableDrivers.length > 0) {
            assignedDriver = availableDrivers[driverIdx % availableDrivers.length].id;
            driverIdx++;
          }
          vehicleIdx++;
        }

        proposedTrips.push({
          dateStr,
          departureTime,
          arrivalTime,
          maXe: assignedXe,
          maTaiXe: assignedDriver
        });
      }
    }

    // 6. Fetch existing scheduled trips in range to prevent conflicts
    const startOfRange = new Date(tuNgay);
    startOfRange.setHours(0, 0, 0, 0);
    const endOfRange = new Date(denNgay);
    endOfRange.setHours(23, 59, 59, 999);

    const existingTripsSnap = await db.collection('CHUYENXE_NGAY')
      .where('thoiGianXuatPhat', '>=', Timestamp.fromDate(startOfRange))
      .where('thoiGianXuatPhat', '<=', Timestamp.fromDate(endOfRange))
      .get();

    const existingInstances = existingTripsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Fetch template details for existing instances to match maXe/maTaiXe
    const templateIds = [...new Set(existingInstances.map(i => i.maChuyenXe))];
    const templateMap = {};
    if (templateIds.length > 0) {
      // Chunk query templateIds in groups of 30 due to Firestore "in" limits
      for (let i = 0; i < templateIds.length; i += 30) {
        const chunk = templateIds.slice(i, i + 30);
        const templatesSnap = await db.collection('CHUYENXE').where('__name__', 'in', chunk).get();
        templatesSnap.forEach(doc => {
          templateMap[doc.id] = doc.data();
        });
      }
    }

    // Group existing schedules in-memory by Vehicle and Driver for quick lookup
    const schedulesByVehicle = {};
    const schedulesByDriver = {};

    existingInstances.forEach(inst => {
      const template = templateMap[inst.maChuyenXe] || {};
      const maXe = template.maXe;
      const maTaiXe = template.maTaiXe;
      const schedule = {
        start: inst.thoiGianXuatPhat.toDate().getTime(),
        end: inst.thoiGianDenDich.toDate().getTime()
      };

      if (maXe) {
        if (!schedulesByVehicle[maXe]) schedulesByVehicle[maXe] = [];
        schedulesByVehicle[maXe].push(schedule);
      }
      if (maTaiXe) {
        if (!schedulesByDriver[maTaiXe]) schedulesByDriver[maTaiXe] = [];
        schedulesByDriver[maTaiXe].push(schedule);
      }
    });

    // 7. Check conflicts in-memory
    const validTrips = [];
    const conflicts = [];

    for (const pt of proposedTrips) {
      const ptStart = pt.departureTime.getTime();
      const ptEnd = pt.arrivalTime.getTime();

      let hasConflict = false;
      let conflictReason = "";

      // Check vehicle conflict
      if (pt.maXe && schedulesByVehicle[pt.maXe]) {
        for (const sched of schedulesByVehicle[pt.maXe]) {
          if (ptStart < sched.end && ptEnd > sched.start) {
            hasConflict = true;
            conflictReason = `Xe ${pt.maXe} bị trùng lịch chạy.`;
            break;
          }
        }
      }

      // Check driver conflict
      if (!hasConflict && pt.maTaiXe && schedulesByDriver[pt.maTaiXe]) {
        for (const sched of schedulesByDriver[pt.maTaiXe]) {
          if (ptStart < sched.end && ptEnd > sched.start) {
            hasConflict = true;
            conflictReason = `Tài xế ${pt.maTaiXe} bị trùng lịch chạy.`;
            break;
          }
        }
      }

      if (hasConflict) {
        conflicts.push({
          date: pt.dateStr,
          maXe: pt.maXe,
          maTaiXe: pt.maTaiXe,
          reason: conflictReason
        });
      } else {
        validTrips.push(pt);
        // Add pt schedule to in-memory schedules to check conflicts against newly created slots in the same batch
        if (pt.maXe) {
          if (!schedulesByVehicle[pt.maXe]) schedulesByVehicle[pt.maXe] = [];
          schedulesByVehicle[pt.maXe].push({ start: ptStart, end: ptEnd });
        }
        if (pt.maTaiXe) {
          if (!schedulesByDriver[pt.maTaiXe]) schedulesByDriver[pt.maTaiXe] = [];
          schedulesByDriver[pt.maTaiXe].push({ start: ptStart, end: ptEnd });
        }
      }
    }

    // 8. Write valid trips to database
    const batchJobId = "BATCH_" + Date.now();

    // Prefetch seats for all assigned vehicles in validTrips
    const vehicleSeatMaps = {};
    const uniqueVehicles = [...new Set(validTrips.map(t => t.maXe).filter(Boolean))];
    for (const vId of uniqueVehicles) {
      const seatsSnap = await db.collection("XE").doc(vId).collection("SODOGHE").where("trangThaiCoDinh", "==", "HoatDong").get();
      vehicleSeatMaps[vId] = seatsSnap.docs.map(d => d.data().maGhe);
    }

    let writer = db.batch();
    let countInBatch = 0;
    let tripsCreatedCount = 0;

    for (const trip of validTrips) {
      const templateId = "CX" + Math.floor(Math.random() * 10000000000);
      const templateRef = db.collection('CHUYENXE').doc(templateId);
      
      const seatNames = trip.maXe ? (vehicleSeatMaps[trip.maXe] || []) : [];

      // Write CHUYENXE Template
      writer.set(templateRef, {
        maLoTrinh,
        maXe: trip.maXe,
        maTaiXe: trip.maTaiXe,
        giaVe: Number(giaVe),
        soGheConTrong: seatNames.length,
        thoiGianXuatPhat: Timestamp.fromDate(trip.departureTime),
        thoiGianDenDich: Timestamp.fromDate(trip.arrivalTime),
        trangThai: trip.maXe ? "SapChay" : "ChuaGanXe",
        maChuyenGoc: batchJobId,
        ngayTao: FieldValue.serverTimestamp()
      });
      countInBatch++;

      // Write CHUYENXE_NGAY instance
      const instanceId = `${templateId}_${trip.dateStr}`;
      const instanceRef = db.collection('CHUYENXE_NGAY').doc(instanceId);
      writer.set(instanceRef, {
        maChuyenXe: templateId,
        ngayDi: trip.dateStr,
        thoiGianXuatPhat: Timestamp.fromDate(trip.departureTime),
        thoiGianDenDich: Timestamp.fromDate(trip.arrivalTime),
        soGheConTrong: seatNames.length,
        trangThai: "SapChay"
      });
      countInBatch++;

      // Write GHEXE seats for this daily instance (only if maXe is assigned)
      for (const seatName of seatNames) {
        const seatRef = db.collection('GHEXE').doc(`${templateId}_${trip.dateStr}_${seatName}`);
        writer.set(seatRef, {
          maChuyenXe: templateId,
          ngayDi: trip.dateStr,
          maGhe: seatName,
          trangThai: "TRONG",
          hetHanGiu: null
        });
        countInBatch++;

        // Commit batch when reaching Firestore limit
        if (countInBatch >= 450) {
          await writer.commit();
          writer = db.batch();
          countInBatch = 0;
        }
      }

      tripsCreatedCount++;
    }

    // Flush any remaining writes
    if (countInBatch > 0) {
      await writer.commit();
    }

    // 9. Write batch config record log
    const batchJobRef = db.collection("CHUYENXE_NGAY").doc(batchJobId);
    await batchJobRef.set({
      maLoTrinh,
      maLoaiXe,
      khungGioXuatBenGoc,
      kieuPhanBo,
      nhomTaiXe: nhomTaiXe || null,
      nhomXe: nhomXe || null,
      tuNgay: Timestamp.fromDate(new Date(tuNgay)),
      denNgay: Timestamp.fromDate(new Date(denNgay)),
      cacThuTrongTuan: cacThuTrongTuan || [],
      tanSuat,
      tongSoChuyenDuKien: proposedTrips.length,
      soChuyenDaTao: tripsCreatedCount,
      danhSachXungDot: conflicts,
      trangThaiXuLy: "HoanTat",
      ngayTao: FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      batchId: batchJobId,
      soChuyenTao: tripsCreatedCount,
      soXungDot: conflicts.length,
      danhSachXungDot: conflicts
    });

  } catch (error) {
    console.error('bulkCreateTrips error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo chuyến xe hàng loạt.' });
  }
};

// POST /api/admin/trips/auto-assign-drivers
exports.autoAssignDrivers = async (req, res) => {
  try {
    const { date } = req.body; // YYYY-MM-DD
    if (!date) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ngày cần phân công.' });
    }

    // 1. Fetch trips for the day
    const cxnSnapshot = await db.collection('CHUYENXE_NGAY').where('ngayDi', '==', date).get();
    if (cxnSnapshot.empty) {
      return res.status(400).json({ success: false, message: 'Không có chuyến xe nào trong ngày này.' });
    }
    const dailyTrips = cxnSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), docRef: doc.ref }));

    // 2. Fetch templates to check for default drivers
    const cxSnapshot = await db.collection('CHUYENXE').get();
    const templateMap = {};
    cxSnapshot.forEach(doc => {
      templateMap[doc.id] = doc.data();
    });

    // 3. Fetch active drivers
    const tkSnapshot = await db.collection('TAIKHOAN').where('loaiTaiKhoan', '==', 'TX').where('trangThai', '==', 'active').get();
    if (tkSnapshot.empty) {
      return res.status(400).json({ success: false, message: 'Không có tài xế nào đang hoạt động.' });
    }
    const drivers = tkSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Initialize driver schedules for the day
    const driverSchedules = {};
    drivers.forEach(d => {
      driverSchedules[d.id] = [];
    });

    const unassignedTrips = [];

    // Pre-process trips
    for (const trip of dailyTrips) {
      const template = templateMap[trip.maChuyenXe] || {};
      const currentDriver = trip.maTaiXe || template.maTaiXe;
      
      const start = trip.thoiGianXuatPhat.toDate().getTime();
      const end = trip.thoiGianDenDich.toDate().getTime();

      if (currentDriver) {
        // If driver is already assigned, add to their schedule
        if (driverSchedules[currentDriver]) {
          driverSchedules[currentDriver].push({ start, end });
        }
      } else {
        // Needs assignment
        unassignedTrips.push({ ...trip, start, end });
      }
    }

    if (unassignedTrips.length === 0) {
      return res.status(200).json({ success: true, message: 'Tất cả chuyến xe trong ngày đã có tài xế.' });
    }

    // Sort unassigned trips by departure time
    unassignedTrips.sort((a, b) => a.start - b.start);

    let assignedCount = 0;
    const batch = db.batch();
    const BUFFER_TIME = 2 * 60 * 60 * 1000; // 2 hours in ms

    for (const trip of unassignedTrips) {
      let bestDriver = null;
      let minTrips = Infinity;

      for (const driver of drivers) {
        const schedule = driverSchedules[driver.id];
        
        // Check for overlaps with 2-hour buffer
        let hasOverlap = false;
        for (const shift of schedule) {
          const shiftStartWithBuffer = shift.start - BUFFER_TIME;
          const shiftEndWithBuffer = shift.end + BUFFER_TIME;
          
          if (trip.start < shiftEndWithBuffer && trip.end > shiftStartWithBuffer) {
            hasOverlap = true;
            break;
          }
        }

        if (!hasOverlap) {
          // Prioritize driver with least trips today
          if (schedule.length < minTrips) {
            minTrips = schedule.length;
            bestDriver = driver.id;
          }
        }
      }

      if (bestDriver) {
        // Assign driver
        driverSchedules[bestDriver].push({ start: trip.start, end: trip.end });
        batch.update(trip.docRef, { maTaiXe: bestDriver });
        assignedCount++;
      }
    }

    if (assignedCount > 0) {
      await batch.commit();
    }

    return res.status(200).json({ 
      success: true, 
      message: `Đã phân công thành công ${assignedCount} chuyến. Có ${unassignedTrips.length - assignedCount} chuyến không tìm được tài xế rảnh.` 
    });

  } catch (error) {
    console.error('autoAssignDrivers error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi phân công tự động.' });
  }
};
