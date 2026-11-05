const { db } = require("./src/config/firebase");

async function check() {
  const ghexes = await db.collection('GHEXE').where('maChuyenXe', '==', 'CX043').get();
  let found = false;
  ghexes.forEach(t => {
    const data = t.data();
    if (data.trangThai !== 'TRONG') {
      console.log('Booked seat on CX043:', t.id, data);
      found = true;
    }
  });
  if (!found) console.log("No booked seats found for CX043 in GHEXE.");
  
  // also check if any VE exists for XE014 ? No, VE has maChuyenXe
  const ve = await db.collection('VE').where('maChuyenXe', '==', 'CX043').get();
  if (!ve.empty) {
    ve.forEach(v => console.log('VE found:', v.id, v.data()));
  } else {
    console.log("No tickets found for CX043.");
  }

  process.exit(0);
}

check().catch(console.error);
