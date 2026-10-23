const { db } = require("../src/config/firebase");

// --- Mẫu 1: Limousine 34 phòng (3 cột, khuyết giữa hàng đầu, 2 tầng) ---
function buildLimousine34() {
  const seats = [];
  
  // Tầng 1 (Prefix A)
  let countA = 1;
  for (let hang = 1; hang <= 6; hang++) {
    for (let cot = 1; cot <= 3; cot++) {
      if (hang === 1 && cot === 2) continue; // Khuyết ghế giữa hàng 1
      const num = String(countA).padStart(2, "0");
      seats.push({ maGhe: `A${num}`, tang: 1, hang, cot });
      countA++;
    }
  }

  // Tầng 2 (Prefix B)
  let countB = 1;
  for (let hang = 1; hang <= 6; hang++) {
    for (let cot = 1; cot <= 3; cot++) {
      if (hang === 1 && cot === 2) continue; // Khuyết ghế giữa hàng 1
      const num = String(countB).padStart(2, "0");
      seats.push({ maGhe: `B${num}`, tang: 2, hang, cot });
      countB++;
    }
  }

  return seats;
}

// --- Mẫu 2: Giường nằm 34 (3 cột, khuyết giữa hàng đầu, 2 tầng) ---
function buildGiuongNam34() {
  const seats = [];
  
  // Tầng 1 (Prefix A)
  let countA = 1;
  for (let hang = 1; hang <= 6; hang++) {
    for (let cot = 1; cot <= 3; cot++) {
      if (hang === 1 && cot === 2) continue; // Khuyết ghế giữa hàng 1
      const num = String(countA).padStart(2, "0");
      seats.push({ maGhe: `A${num}`, tang: 1, hang, cot });
      countA++;
    }
  }

  // Tầng 2 (Prefix B)
  let countB = 1;
  for (let hang = 1; hang <= 6; hang++) {
    for (let cot = 1; cot <= 3; cot++) {
      if (hang === 1 && cot === 2) continue; // Khuyết ghế giữa hàng 1
      const num = String(countB).padStart(2, "0");
      seats.push({ maGhe: `B${num}`, tang: 2, hang, cot });
      countB++;
    }
  }

  return seats;
}

// --- Mẫu 3: Ghế ngồi 29 (2-2, 1 tầng, hàng cuối 5 ghế liền) ---
function buildGheNgoi29() {
  const seats = [];
  let count = 0;
  const soHangThuong = 6; // 6 hàng x 4 ghế = 24
  for (let hang = 1; hang <= soHangThuong; hang++) {
    for (let cot = 1; cot <= 4; cot++) {
      seats.push({ maGhe: `H${hang}-${cot}`, tang: 1, hang, cot });
      count++;
    }
  }
  // Hàng cuối 5 ghế liền (không lối đi) — hàng ghế sau cùng của xe khách
  for (let cot = 1; cot <= 5; cot++) {
    seats.push({ maGhe: `H${soHangThuong + 1}-${cot}`, tang: 1, hang: soHangThuong + 1, cot });
    count++;
  }
  return seats.slice(0, 29);
}

async function seed() {
  const templates = [
    {
      id: "LIMOUSINE_34",
      tenMau: "Limousine 34 Phòng",
      moTa: "34 Phòng, VIP",
      soTang: 2,
      loaiGhe: "phong",
      layoutMoTa: "3 Cột | 2 TẦNG",
      danhSachGhe: buildLimousine34(),
    },
    {
      id: "GIUONG_NAM_34",
      tenMau: "Giường nằm 34",
      moTa: "34 Giường, 2 Tầng (2-1 layout)",
      soTang: 2,
      loaiGhe: "giuong",
      layoutMoTa: "3 HÀNG | 2 TẦNG",
      danhSachGhe: buildGiuongNam34(),
    },
    {
      id: "GHE_NGOI_29",
      tenMau: "Ghế ngồi 29",
      moTa: "29 Ghế, Standard Bus",
      soTang: 1,
      loaiGhe: "ghengoi",
      layoutMoTa: "2-2 | 1 TẦNG",
      danhSachGhe: buildGheNgoi29(),
    },
  ];

  for (const t of templates) {
    const { id, ...data } = t;
    await db.collection("MAUSODOGHE").doc(id).set(data);
    console.log(`Đã tạo mẫu: ${id} (${data.danhSachGhe.length} ghế)`);
  }
  process.exit(0);
}

seed();
