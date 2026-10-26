const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const { getRegionFromProvince, normalizeProvinceName } = require("../utils/region-map");

// Simple in-memory cache to reduce Firestore reads (save quota)
let cache = {
  allStations: null,
  stats: null,
};

function clearCache() {
  cache.allStations = null;
  cache.stats = null;
}

async function generateMaDiem() {
  const stations = await getAllStations();
  if (!stations || stations.length === 0) return "DTC0001";
  
  let maxNum = 0;
  for (const s of stations) {
    if (s.id.startsWith("DTC")) {
      const num = parseInt(s.id.replace("DTC", ""), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return "DTC" + String(maxNum + 1).padStart(4, "0");
}

async function getStatsSummary() {
  if (cache.stats) return cache.stats;
    const snap = await db.collection("THONGKE").doc("diemTrungChuyen").get();
    const data = snap.exists ? snap.data() : { tongSo: 0, tongVanPhong: 0, tongDiemDonTra: 0, tongTramDung: 0, theoTinh: {} };
    cache.stats = data;
    return data;
}

async function getAllStations() {
  if (cache.allStations) return cache.allStations;
    const snap = await db.collection("DIEMTRUNGCHUYEN").get();
    const stations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    stations.sort((a, b) => (a.tenDiem || "").localeCompare(b.tenDiem || ""));
    cache.allStations = stations;
    return stations;
}

async function getStationsByProvince(tinhThanh) {
  const snap = await db
    .collection("DIEMTRUNGCHUYEN")
    .where("tinhThanh", "==", tinhThanh)
    .get();
  
  const stations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  stations.sort((a, b) => (a.tenDiem || "").localeCompare(b.tenDiem || ""));
  return stations;
}

async function getStationById(id) {
  const doc = await db.collection("DIEMTRUNGCHUYEN").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

// Hàm hỗ trợ cập nhật THONGKE trong Transaction
function updateStatsInTx(stats, oldData, newData) {
  if (oldData) {
    const oldKey = { VANPHONG: "tongVanPhong", DIEMDONTRA: "tongDiemDonTra", TRAMDUNG: "tongTramDung" }[oldData.phanLoai];
    if (oldKey) stats[oldKey] = Math.max(0, (stats[oldKey] || 0) - 1);
    stats.theoTinh[oldData.tinhThanh] = Math.max(0, (stats.theoTinh[oldData.tinhThanh] || 0) - 1);
  }
  if (newData) {
    const newKey = { VANPHONG: "tongVanPhong", DIEMDONTRA: "tongDiemDonTra", TRAMDUNG: "tongTramDung" }[newData.phanLoai];
    if (newKey) stats[newKey] = (stats[newKey] || 0) + 1;
    stats.theoTinh[newData.tinhThanh] = (stats.theoTinh[newData.tinhThanh] || 0) + 1;
  }
}

// Ghi log hoạt động trong Transaction
function logActivityInTx(tx, actionType, maDiem, tenDiem, noiDung, nguoiThucHien) {
  const logRef = db.collection("HOATDONGGANDAY").doc();
  tx.set(logRef, {
    loaiHanhDong: actionType,
    maDiem,
    tenDiem,
    noiDung,
    thoiGian: FieldValue.serverTimestamp(),
    nguoiThucHien: nguoiThucHien || "system",
  });
}

async function createStation(payload, nguoiCapNhat) {
  const maDiem = await generateMaDiem();
  const danhSachMaLoTrinh = payload.danhSachMaLoTrinh || [];

  const data = {
    // --- FIELDS CHUẨN MỚI ---
    tenDiem: payload.tenDiem,
    phanLoai: payload.phanLoai, // "VANPHONG", "DIEMDONTRA", "TRAMDUNG"
    tinhThanh: normalizeProvinceName(payload.tinhThanh),
    khuVuc: getRegionFromProvince(payload.tinhThanh),
    diaChiChiTiet: payload.diaChiChiTiet,
    sdt: payload.sdt || null,
    toaDo: { lat: Number(payload.lat), lng: Number(payload.lng) },
    danhSachMaLoTrinh: danhSachMaLoTrinh,
    trangThai: "HoatDong",
    ngayTao: FieldValue.serverTimestamp(),
    ngayCapNhat: FieldValue.serverTimestamp(),
    nguoiCapNhat: nguoiCapNhat || "admin",
    
    // --- BACKWARD COMPATIBILITY CHO APP MOBILE ---
    loaiDiem: "TRUNGCHUYEN", 
    maLoTrinh: danhSachMaLoTrinh.length > 0 ? danhSachMaLoTrinh[0] : "",
  };

  await db.runTransaction(async (tx) => {
    // 1. Đọc thống kê (READ)
    const statsRef = db.doc("THONGKE/diemTrungChuyen");
    const statsDoc = await tx.get(statsRef);
    const stats = statsDoc.exists ? statsDoc.data() : { tongVanPhong: 0, tongDiemDonTra: 0, tongTramDung: 0, theoTinh: {} };
    if (!stats.theoTinh) stats.theoTinh = {};
    
    // 2. Ghi điểm trung chuyển (WRITE)
    const stationRef = db.collection("DIEMTRUNGCHUYEN").doc(maDiem);
    tx.set(stationRef, data);

    // 3. Cập nhật thống kê (WRITE)
    updateStatsInTx(stats, null, data);
    tx.set(statsRef, stats);

    // 4. Ghi log hoạt động (WRITE)
    logActivityInTx(tx, "ThemDiem", maDiem, data.tenDiem, "Tạo điểm trung chuyển mới", data.nguoiCapNhat);
  });
  
  clearCache(); // Xóa cache để lần sau lấy danh sách mới nhất
  return { id: maDiem, ...data };
}

async function updateStation(id, payload, nguoiCapNhat) {
  const ref = db.collection("DIEMTRUNGCHUYEN").doc(id);
  
  let updatedData = null;

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("Không tìm thấy điểm trung chuyển");
    
    const oldData = doc.data();
    
    const updatePayload = { 
      ...payload, 
      ngayCapNhat: FieldValue.serverTimestamp(), 
      nguoiCapNhat: nguoiCapNhat || "admin" 
    };
    
    if (payload.tinhThanh) {
      updatePayload.tinhThanh = normalizeProvinceName(payload.tinhThanh);
      updatePayload.khuVuc = getRegionFromProvince(updatePayload.tinhThanh);
    }
    
    if (payload.lat !== undefined && payload.lng !== undefined) {
      updatePayload.toaDo = { lat: Number(payload.lat), lng: Number(payload.lng) };
      delete updatePayload.lat;
      delete updatePayload.lng;
    }
    
    if (payload.danhSachMaLoTrinh) {
      updatePayload.maLoTrinh = payload.danhSachMaLoTrinh.length > 0 ? payload.danhSachMaLoTrinh[0] : "";
    }

    // LUÔN BẢO VỆ backward compatibility
    updatePayload.loaiDiem = "TRUNGCHUYEN";

    // Merge for stats comparison
    const newData = { ...oldData, ...updatePayload };
    updatedData = newData;

    // ĐỌC THỐNG KÊ (NẾU CẦN) - PHẢI THỰC HIỆN TRƯỚC KHI GHI
    let stats = null;
    let statsRef = null;
    if (oldData.phanLoai !== newData.phanLoai || oldData.tinhThanh !== newData.tinhThanh) {
      statsRef = db.doc("THONGKE/diemTrungChuyen");
      const statsDoc = await tx.get(statsRef);
      if (statsDoc.exists) {
        stats = statsDoc.data();
        if (!stats.theoTinh) stats.theoTinh = {};
      }
    }

    // GHI ĐIỂM TRUNG CHUYỂN
    tx.update(ref, updatePayload);

    // GHI THỐNG KÊ NẾU CÓ THAY ĐỔI
    if (stats) {
      updateStatsInTx(stats, oldData, newData);
      tx.set(statsRef, stats);
    }

    // GHI LOG
    logActivityInTx(tx, "CapNhatDiem", id, newData.tenDiem, "Cập nhật thông tin điểm trung chuyển", updatePayload.nguoiCapNhat);
  });
  
  clearCache(); // Xóa cache
  return { id, ...updatedData };
}

async function toggleStationStatus(id, nguoiCapNhat) {
  const ref = db.collection("DIEMTRUNGCHUYEN").doc(id);
  let newStatus = "";
  
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("Không tìm thấy điểm trung chuyển");

    newStatus = doc.data().trangThai === "HoatDong" ? "TamNgung" : "HoatDong";
    tx.update(ref, { 
      trangThai: newStatus, 
      ngayCapNhat: FieldValue.serverTimestamp(),
      nguoiCapNhat: nguoiCapNhat || "admin" 
    });

    logActivityInTx(tx, newStatus === "HoatDong" ? "KichHoat" : "TamNgung", id, doc.data().tenDiem, 
      newStatus === "HoatDong" ? "Khôi phục hoạt động" : "Tạm ngừng điểm", nguoiCapNhat);
  });
  
  clearCache(); // Xóa cache
  return { id, trangThai: newStatus };
}

async function getRecentActivity(limit = 5) {
  const snap = await db.collection("HOATDONGGANDAY").orderBy("thoiGian", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function deleteStation(id, nguoiCapNhat) {
  const ref = db.collection("DIEMTRUNGCHUYEN").doc(id);
  
  await db.runTransaction(async (tx) => {
    // 1. Đọc điểm (READ)
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("Không tìm thấy điểm trung chuyển");
    
    const data = doc.data();
    
    // 2. Đọc thống kê (READ)
    const statsRef = db.doc("THONGKE/diemTrungChuyen");
    const statsDoc = await tx.get(statsRef);
    let stats = null;
    if (statsDoc.exists) {
      stats = statsDoc.data();
      if (!stats.theoTinh) stats.theoTinh = {};
    }
    
    // 3. Xóa điểm (WRITE)
    tx.delete(ref);

    // 4. Cập nhật thống kê (WRITE)
    if (stats) {
      updateStatsInTx(stats, data, null);
      tx.set(statsRef, stats);
    }

    // 5. Ghi log hoạt động (WRITE)
    logActivityInTx(tx, "XoaDiem", id, data.tenDiem, "Xóa điểm trung chuyển", nguoiCapNhat || "admin");
  });
  
  clearCache();
  return true;
}

module.exports = {
  generateMaDiem,
  getStatsSummary,
  getAllStations,
  getStationsByProvince,
  getStationById,
  createStation,
  updateStation,
  toggleStationStatus,
  getRecentActivity,
  deleteStation,
};
