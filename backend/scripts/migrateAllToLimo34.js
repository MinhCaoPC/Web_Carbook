const { db } = require("../src/config/firebase");

async function changeAllToLimo34() {
  const templateDoc = await db.collection("MAUSODOGHE").doc("LIMOUSINE_34").get();
  if (!templateDoc.exists) {
    console.error("Template LIMOUSINE_34 not found. Did you run seedSeatTemplates.js?");
    return;
  }
  const template = templateDoc.data();

  // Find all vehicles
  const vehiclesSnap = await db.collection("XE").get();
  
  if (vehiclesSnap.empty) {
    console.log("No vehicles found");
  }

  for (const doc of vehiclesSnap.docs) {
    const xeRef = db.collection("XE").doc(doc.id);
    
    // Delete old seats
    const oldSeatsSnap = await xeRef.collection("SODOGHE").get();
    const batchDelete = db.batch();
    oldSeatsSnap.docs.forEach(s => batchDelete.delete(s.ref));
    await batchDelete.commit();

    // Insert new seats based on LIMOUSINE_34
    const batchInsert = db.batch();
    template.danhSachGhe.forEach((ghe) => {
      const gheRef = xeRef.collection("SODOGHE").doc(ghe.maGhe);
      batchInsert.set(gheRef, {
        ...ghe,
        loaiGhe: template.loaiGhe,
        trangThaiCoDinh: "HoatDong",
      });
    });
    // Update vehicle to use LIMOUSINE_34
    batchInsert.update(xeRef, {
      maMauSoDo: "LIMOUSINE_34",
      tenLoaiXe: "Limousine 34 chỗ", 
      tongSoGhe: 34,
    });
    await batchInsert.commit();
    console.log(`Updated layout for ${doc.id} to LIMOUSINE_34`);
  }
  
  console.log("Migration complete!");
}

changeAllToLimo34().then(() => process.exit(0)).catch(console.error);
