const { db } = require("../config/firebase");

async function getAllTemplates() {
  const snap = await db.collection("MAUSODOGHE").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { getAllTemplates };
