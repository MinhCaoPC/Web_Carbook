const { db } = require("../src/config/firebase");

async function changeLimoToSleeper() {
  const templateDoc = await db.collection("MAUSODOGHE").doc("GIUONG_NAM_34").get();
  const template = templateDoc.data();

  // Find all vehicles currently using LIMOUSINE_22
  const vehiclesSnap = await db.collection("XE").where("maMauSoDo", "==", "LIMOUSINE_22").get();
  
  if (vehiclesSnap.empty) {
    console.log("No vehicles found using LIMOUSINE_22");
  }

  for (const doc of vehiclesSnap.docs) {
    const xeRef = db.collection("XE").doc(doc.id);
    
    // Delete old seats
    const oldSeatsSnap = await xeRef.collection("SODOGHE").get();
    const batchDelete = db.batch();
    oldSeatsSnap.docs.forEach(s => batchDelete.delete(s.ref));
    await batchDelete.commit();

    // Insert new seats based on GIUONG_NAM_34
    const batchInsert = db.batch();
    template.danhSachGhe.forEach((ghe) => {
      const gheRef = xeRef.collection("SODOGHE").doc(ghe.maGhe);
      batchInsert.set(gheRef, {
        ...ghe,
        loaiGhe: template.loaiGhe,
        trangThaiCoDinh: "HoatDong",
      });
    });
    // Update vehicle to use GIUONG_NAM_34
    batchInsert.update(xeRef, {
      maMauSoDo: "GIUONG_NAM_34",
      tenLoaiXe: "Giường nằm 34 chỗ", // Cập nhật tên loại xe cho phù hợp
      tongSoGhe: 34,
    });
    await batchInsert.commit();
    console.log(`Updated layout for ${doc.id} to GIUONG_NAM_34`);
  }
  
  console.log("Migration complete!");
}

changeLimoToSleeper().then(() => process.exit(0)).catch(console.error);
