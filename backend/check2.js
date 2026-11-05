const { db } = require("./src/config/firebase");

async function check() {
  const tickets = await db.collection('VE').where('maChuyenXe', '==', 'CX043').get();
  console.log('Tickets for CX043:', tickets.size);
  tickets.forEach(t => console.log(t.id, t.data()));
  
  // also check GHEXE
  const ghexes = await db.collection('GHEXE').where('maChuyenXe', '==', 'CX043').get();
  console.log('GHEXE for CX043:', ghexes.size);
  ghexes.forEach(t => console.log(t.id, t.data()));
  
  process.exit(0);
}

check().catch(console.error);
