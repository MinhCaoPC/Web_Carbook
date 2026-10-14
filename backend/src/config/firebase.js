const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.resolve(__dirname, '..', '..', 'serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccountPath),
});

const db = getFirestore();

module.exports = { db };
