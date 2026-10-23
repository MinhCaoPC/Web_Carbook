const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function run() {
  console.log("Seeding mock vehicles...");
  
  // Seed Vehicles (XE)
  const vehicles = [
    {
      id: "XE001",
      data: {
        bienSoXe: "95C-98879",
        tenLoaiXe: "Limousine 22 phòng cao cấp",
        tongSoGhe: 34,
        trangThaiXe: "SanSang",
        nhomXe: "GARAGE_SAIGON",
        maLoaiXe: "limo-22"
      }
    },
    {
      id: "XE002",
      data: {
        bienSoXe: "29B-123.45",
        tenLoaiXe: "Limousine 22 phòng cao cấp",
        tongSoGhe: 34,
        trangThaiXe: "SanSang",
        nhomXe: "GARAGE_SAIGON",
        maLoaiXe: "limo-22"
      }
    },
    {
      id: "XE003",
      data: {
        bienSoXe: "29C-567.89",
        tenLoaiXe: "Giường nằm 34 chỗ",
        tongSoGhe: 34,
        trangThaiXe: "SanSang",
        nhomXe: "GARAGE_SAIGON",
        maLoaiXe: "bed-34"
      }
    }
  ];

  for (const v of vehicles) {
    await db.collection("XE").doc(v.id).set(v.data, { merge: true });
    console.log(`- Seeded vehicle ${v.id} (${v.data.bienSoXe})`);
  }

  console.log("Seeding mock drivers...");

  // Seed Drivers (TAIKHOAN)
  const drivers = [
    {
      id: "TK_DRV001",
      data: {
        firstName: "Văn A",
        lastName: "Nguyễn",
        email: "nguyenvana@carbook.vn",
        phone: "0901234567",
        loaiTaiKhoan: "TX", // Driver role
        nhomTaiXe: "DOI1_MIENTAY",
        trangThai: "active",
        hoTen: "Nguyễn Văn A"
      }
    },
    {
      id: "TK_DRV002",
      data: {
        firstName: "Thị B",
        lastName: "Trần",
        email: "tranthib@carbook.vn",
        phone: "0901234568",
        loaiTaiKhoan: "TX",
        nhomTaiXe: "DOI1_MIENTAY",
        trangThai: "active",
        hoTen: "Trần Thị B"
      }
    },
    {
      id: "TK_DRV003",
      data: {
        firstName: "Văn C",
        lastName: "Lê",
        email: "levanc@carbook.vn",
        phone: "0901234569",
        loaiTaiKhoan: "TX",
        nhomTaiXe: "DOI1_MIENTAY",
        trangThai: "active",
        hoTen: "Lê Văn C"
      }
    }
  ];

  for (const d of drivers) {
    await db.collection("TAIKHOAN").doc(d.id).set(d.data, { merge: true });
    console.log(`- Seeded driver ${d.id} (${d.data.hoTen})`);
  }

  console.log("Seeding successfully completed!");
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
