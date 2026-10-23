const { db } = require("../src/config/firebase");

async function reseedSleeperBuses() {
  const templateDoc = await db.collection("MAUSODOGHE").doc("GIUONG_NAM_34").get();
  const template = templateDoc.data();

  const vehiclesSnap = await db.collection("XE").where("maMauSoDo", "==", "GIUONG_NAM_34").get();
  
  for (const doc of vehiclesSnap.docs) {
    const xeRef = db.collection("XE").doc(doc.id);
    
    // Delete old seats
    const oldSeatsSnap = await xeRef.collection("SODOGHE").get();
    const batchDelete = db.batch();
    oldSeatsSnap.docs.forEach(s => batchDelete.delete(s.ref));
    await batchDelete.commit();

    // Insert new seats
    const batchInsert = db.batch();
    template.danhSachGhe.forEach((ghe) => {
      const gheRef = xeRef.collection("SODOGHE").doc(ghe.maGhe);
      batchInsert.set(gheRef, {
        ...ghe,
        loaiGhe: template.loaiGhe,
        trangThaiCoDinh: "HoatDong",
      });
    });
    await batchInsert.commit();
    console.log(`Updated layout for ${doc.id}`);
  }
  
  console.log("Re-seeded sleeper vehicles done!");
}

reseedSleeperBuses().then(() => process.exit(0)).catch(console.error);
