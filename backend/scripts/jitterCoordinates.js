const { db } = require("../src/config/firebase");

async function jitterCoordinates() {
  const snap = await db.collection("DIEMTRUNGCHUYEN").get();
  
  if (snap.empty) {
    console.log("No stations found");
    return;
  }

  const batch = db.batch();
  let updatedCount = 0;

  snap.docs.forEach((doc, index) => {
    const data = doc.data();
    if (data.toaDo && data.toaDo.lat === 10.762622 && data.toaDo.lng === 106.660172) {
      // Tọa độ mặc định đang bị trùng nhau hoàn toàn, tạo độ lệch ngẫu nhiên nhỏ
      // 0.01 độ tương đương khoảng 1km
      const randomLatOffset = (Math.random() - 0.5) * 0.1; // +/- 0.05
      const randomLngOffset = (Math.random() - 0.5) * 0.1; // +/- 0.05
      
      const newToaDo = {
        lat: data.toaDo.lat + randomLatOffset,
        lng: data.toaDo.lng + randomLngOffset
      };

      batch.update(doc.ref, { toaDo: newToaDo });
      updatedCount++;
    }
  });

  if (updatedCount > 0) {
    await batch.commit();
    console.log(`Đã phân tán tọa độ cho ${updatedCount} điểm trung chuyển thành công!`);
  } else {
    console.log("Không có điểm nào bị trùng tọa độ mặc định.");
  }
}

jitterCoordinates().then(() => process.exit(0)).catch(console.error);
