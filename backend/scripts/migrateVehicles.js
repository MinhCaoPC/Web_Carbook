const { db } = require("../src/config/firebase");

async function migrate() {
  const templatesSnap = await db.collection("MAUSODOGHE").get();
  const templates = {};
  templatesSnap.docs.forEach(d => {
    templates[d.id] = d.data();
  });

  const vehiclesSnap = await db.collection("XE").get();
  let count = 0;

  for (const doc of vehiclesSnap.docs) {
    const xe = doc.data();
    let maMauSoDo = xe.maMauSoDo;

    if (!maMauSoDo) {
      if (xe.tenLoaiXe && xe.tenLoaiXe.toLowerCase().includes("limousine")) {
        maMauSoDo = "LIMOUSINE_22";
      } else if (xe.tenLoaiXe && xe.tenLoaiXe.toLowerCase().includes("giường")) {
        maMauSoDo = "GIUONG_NAM_34";
      } else {
        maMauSoDo = "GHE_NGOI_29";
      }
      await db.collection("XE").doc(doc.id).update({ maMauSoDo });
    }

    const template = templates[maMauSoDo];
    if (!template) continue;

    const seatsSnap = await db.collection("XE").doc(doc.id).collection("SODOGHE").limit(1).get();
    if (seatsSnap.empty) {
      const batch = db.batch();
      template.danhSachGhe.forEach((ghe) => {
        const gheRef = db.collection("XE").doc(doc.id).collection("SODOGHE").doc(ghe.maGhe);
        batch.set(gheRef, {
          ...ghe,
          loaiGhe: template.loaiGhe,
          trangThaiCoDinh: "HoatDong",
        });
      });
      await batch.commit();
      count++;
    }
  }
  console.log("Migrated vehicles:", count);
}

migrate().then(() => process.exit(0)).catch(console.error);
