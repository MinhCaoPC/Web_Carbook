const { db } = require("../src/config/firebase");
const { getRegionFromProvince } = require("../src/utils/region-map");

async function migrateStations() {
  const snap = await db.collection("DIEMTRUNGCHUYEN").get();
  
  if (snap.empty) {
    console.log("No stations found");
    return;
  }

  const batch = db.batch();
  let countVP = 0;
  let countDDT = 0;
  let countTD = 0;
  const theoTinh = {};

  snap.docs.forEach((doc) => {
    const data = doc.data();
    const tenDiemLower = data.tenDiem ? data.tenDiem.toLowerCase() : "";
    
    // Determine phanLoai
    let phanLoai = "VANPHONG";
    if (tenDiemLower.includes("trạm") || tenDiemLower.includes("tram")) {
      phanLoai = "TRAMDUNG";
    } else if (tenDiemLower.includes("đón trả") || tenDiemLower.includes("don tra")) {
      phanLoai = "DIEMDONTRA";
    }

    if (phanLoai === "VANPHONG") countVP++;
    else if (phanLoai === "DIEMDONTRA") countDDT++;
    else if (phanLoai === "TRAMDUNG") countTD++;

    const tinhThanh = data.tinhThanh || "TP. Hồ Chí Minh";
    theoTinh[tinhThanh] = (theoTinh[tinhThanh] || 0) + 1;

    const danhSachMaLoTrinh = data.danhSachMaLoTrinh || (data.maLoTrinh ? [data.maLoTrinh] : []);

    const updatedData = {
      ...data,
      phanLoai,
      khuVuc: getRegionFromProvince(tinhThanh),
      toaDo: data.toaDo || { lat: 10.762622, lng: 106.660172 }, // Default HCM
      danhSachMaLoTrinh,
      trangThai: data.trangThai || "HoatDong",
      // Giữ nguyên cho App
      loaiDiem: "TRUNGCHUYEN",
      maLoTrinh: danhSachMaLoTrinh.length > 0 ? danhSachMaLoTrinh[0] : "",
    };

    batch.update(doc.ref, updatedData);
  });

  // Write THONGKE
  const statsRef = db.doc("THONGKE/diemTrungChuyen");
  batch.set(statsRef, {
    tongVanPhong: countVP,
    tongDiemDonTra: countDDT,
    tongTramDung: countTD,
    theoTinh,
  });

  await batch.commit();
  console.log(`Migrated ${snap.size} stations successfully!`);
}

migrateStations().then(() => process.exit(0)).catch(console.error);
