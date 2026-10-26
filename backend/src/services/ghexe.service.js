const { db, admin } = require("../config/firebase");

async function generateSeatsForTrip({ maChuyenXe, maXe, ngayDi }) {
  const seatsSnap = await db
    .collection("XE")
    .doc(maXe)
    .collection("SODOGHE")
    .where("trangThaiCoDinh", "==", "HoatDong") 
    .get();

  const batch = db.batch();
  let created = 0;

  seatsSnap.docs.forEach((doc) => {
    const ghe = doc.data();
    const gheXeId = `${maChuyenXe}_${ngayDi}_${ghe.maGhe}`;
    const ref = db.collection("GHEXE").doc(gheXeId);
    batch.set(ref, {
      maChuyenXe,
      maGhe: ghe.maGhe,
      ngayDi,
      trangThai: "TRONG",
      hetHanGiu: null,
    });
    created++;
  });

  await batch.commit();
  return created;
}

module.exports = { generateSeatsForTrip };
