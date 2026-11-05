const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function test() {
  const xe = await db.collection('XE').get();
  console.log(`Found ${xe.size} vehicles in XE collection.`);
  xe.forEach(doc => console.log(doc.id, "=>", JSON.stringify(doc.data(), null, 2)));

  const lotrinh = await db.collection('LOTRINH').get();
  console.log(`Found ${lotrinh.size} routes in LOTRINH collection.`);
  lotrinh.forEach(doc => console.log(doc.id, "=>", JSON.stringify(doc.data(), null, 2)));
}

test().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
