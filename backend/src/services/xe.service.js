const { db } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");

async function generateMaXe() {
  // Không dùng orderBy('__name__') — project Firestore này đòi composite index cho kiểu
  // query đó (chưa được tạo) khiến tạo xe mới lỗi thẳng FAILED_PRECONDITION. Lấy toàn bộ rồi
  // tính số lớn nhất bằng JS, giống cách generateNextMaLoTrinh() đang làm cho LOTRINH.
  const snap = await db.collection("XE").get();
  let maxNum = 0;
  snap.forEach((doc) => {
    if (doc.id.startsWith("XE")) {
      const num = parseInt(doc.id.replace("XE", ""), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return "XE" + String(maxNum + 1).padStart(3, "0");
}

// Lấy danh sách xe (cho tab bar trong vehicles.html)
async function getVehicles({ nhomXe, trangThai }) {
  let query = db.collection("XE");
  if (nhomXe && nhomXe !== "all") query = query.where("nhomXe", "==", nhomXe);
  if (trangThai && trangThai !== "all") query = query.where("trangThaiXe", "==", trangThai);

  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Lấy chi tiết 1 xe + toàn bộ sơ đồ ghế (đã nhóm theo tầng)
async function getVehicleDetail(maXe) {
  const xeDoc = await db.collection("XE").doc(maXe).get();
  if (!xeDoc.exists) return null;

  const seatsSnap = await db.collection("XE").doc(maXe).collection("SODOGHE").get();
  const seats = seatsSnap.docs.map((d) => d.data());

  // Tìm các chuyến xe sắp chạy hoặc đang chạy của xe này
  const tripsSnap = await db.collection("CHUYENXE")
    .where("maXe", "==", maXe)
    .where("trangThai", "in", ["SapChay", "DangChay"])
    .get();
  
  const tripIds = tripsSnap.docs.map(d => d.id);
  const bookedSeats = new Set();

  // Chỉ tính ghế "đã đặt" cho hôm nay trở đi — GHEXE không tự xóa ngay khi qua ngày (việc dọn
  // ghế các ngày cũ do generateDailySchedules.js làm định kỳ, có độ trễ), nên nếu không lọc
  // ngày thì vé của những chuyến ĐÃ CHẠY XONG vẫn bị tính là "đã đặt" và khóa ghế vĩnh viễn,
  // khiến admin không bao giờ bật lại được ghế đó dù chuyến đã kết thúc từ lâu.
  const homNay = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  if (tripIds.length > 0) {
    for (let i = 0; i < tripIds.length; i += 30) {
      const chunk = tripIds.slice(i, i + 30);
      const gheSnap = await db.collection("GHEXE").where("maChuyenXe", "in", chunk).get();
      gheSnap.forEach(d => {
        const ghe = d.data();
        if (ghe.trangThai !== "TRONG" && ghe.ngayDi >= homNay) {
          bookedSeats.add(ghe.maGhe);
        }
      });
    }
  }

  const seatsByFloor = seats.reduce((acc, s) => {
    acc[s.tang] = acc[s.tang] || [];
    // Ghi đè trạng thái nếu ghế đã được khách đặt trong bất kỳ chuyến nào
    if (bookedSeats.has(s.maGhe)) {
      s.trangThaiCoDinh = "DaDat";
    }
    acc[s.tang].push(s);
    return acc;
  }, {});

  return { id: xeDoc.id, ...xeDoc.data(), seatsByFloor };
}

// Tạo xe mới: clone sơ đồ ghế từ MAUSODOGHE
async function createVehicle(payload) {
  const maXe = await generateMaXe();
  const templateDoc = await db.collection("MAUSODOGHE").doc(payload.maMauSoDo).get();
  if (!templateDoc.exists) throw new Error("Mẫu sơ đồ ghế không tồn tại");

  const template = templateDoc.data();

  const xeData = {
    bienSoXe: payload.bienSoXe,
    maLoaiXe: payload.maLoaiXe,
    tenLoaiXe: payload.tenLoaiXe,
    nhomXe: payload.nhomXe,
    hangSanXuat: payload.hangSanXuat,
    namSanXuat: Number(payload.namSanXuat),
    tongSoGhe: template.danhSachGhe.length,
    tienIch: payload.tienIch || [],
    maMauSoDo: payload.maMauSoDo,
    soTang: template.soTang,
    trangThaiXe: "SanSang",
    ngayTao: FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  const xeRef = db.collection("XE").doc(maXe);
  batch.set(xeRef, xeData);

  // Clone toàn bộ ghế từ template vào subcollection của xe mới
  template.danhSachGhe.forEach((ghe) => {
    const gheRef = xeRef.collection("SODOGHE").doc(ghe.maGhe);
    batch.set(gheRef, {
      ...ghe,
      loaiGhe: template.loaiGhe,
      trangThaiCoDinh: "HoatDong",
    });
  });

  await batch.commit();
  return { id: maXe, ...xeData };
}

// Đổi trạng thái 1 ghế: HoatDong -> Khoa -> Hong -> HoatDong (bấm xoay vòng)
async function toggleSeatState(maXe, maGhe) {
  const gheRef = db.collection("XE").doc(maXe).collection("SODOGHE").doc(maGhe);
  const gheDoc = await gheRef.get();
  if (!gheDoc.exists) throw new Error("Không tìm thấy ghế");

  const NEXT_STATE = { HoatDong: "Khoa", Khoa: "Hong", Hong: "HoatDong" };
  const newState = NEXT_STATE[gheDoc.data().trangThaiCoDinh] || "HoatDong";

  await gheRef.update({ trangThaiCoDinh: newState });
  return { maGhe, trangThaiCoDinh: newState };
}

async function batchUpdateSeatStates(maXe, seatStates) {
  const batch = db.batch();
  for (const [maGhe, newState] of Object.entries(seatStates)) {
    const gheRef = db.collection("XE").doc(maXe).collection("SODOGHE").doc(maGhe);
    batch.update(gheRef, { trangThaiCoDinh: newState });
  }
  await batch.commit();
  return { success: true };
}

module.exports = { getVehicles, getVehicleDetail, createVehicle, toggleSeatState, batchUpdateSeatStates, generateMaXe };
