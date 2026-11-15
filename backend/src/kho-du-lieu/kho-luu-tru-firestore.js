const { KhoLuuTru } = require('./kho-luu-tru');

/**
 * Lưu dữ liệu trên Firebase Firestore.
 * Kết nối được tạo LƯỜI (lần đầu thật sự cần mới kết nối), nên máy chủ khởi động không tốn lượt truy cập nào.
 */
class KhoLuuTruFirestore extends KhoLuuTru {
  /** @param {string} fileKhoa đường dẫn serviceAccountKey.json */
  constructor(fileKhoa) {
    super();
    this.fileKhoa = fileKhoa;
    this._db = null;
  }

  get db() {
    if (!this._db) {
      const { initializeApp, cert, getApps } = require('firebase-admin/app');
      const { getFirestore } = require('firebase-admin/firestore');
      if (getApps().length === 0) initializeApp({ credential: cert(this.fileKhoa) });
      this._db = getFirestore();
    }
    return this._db;
  }

  async docMot(bang, ma) {
    const tl = await this.db.collection(bang).doc(String(ma)).get(); // 1 lượt đọc
    return tl.exists ? { ma: tl.id, ...tl.data() } : null;
  }

  async docCaBang(bang) {
    const snap = await this.db.collection(bang).get(); // mỗi tài liệu = 1 lượt đọc
    return snap.docs.map((tl) => ({ ma: tl.id, ...tl.data() }));
  }

  async timMot(bang, truong, giaTri) {
    const snap = await this.db.collection(bang).where(truong, '==', giaTri).limit(1).get();
    return snap.empty ? null : { ma: snap.docs[0].id, ...snap.docs[0].data() };
  }

  async ghi(bang, ma, duLieu) {
    await this.db.collection(bang).doc(String(ma)).set(duLieu, { merge: true }); // 1 lượt ghi
  }
}

module.exports = { KhoLuuTruFirestore };
