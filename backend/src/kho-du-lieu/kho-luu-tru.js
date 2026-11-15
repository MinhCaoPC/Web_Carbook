/**
 * KHO LƯU TRỮ — lớp trừu tượng cho nơi cất dữ liệu off-chain.
 *
 * Phần còn lại của hệ thống chỉ gọi 4 hàm dưới đây, KHÔNG cần biết dữ liệu nằm ở Firestore hay file JSON.
 * Nhờ vậy đổi qua lại giữa Firebase và file chỉ bằng một dòng trong .env (NOI_LUU_DU_LIEU).
 *
 *   KhoLuuTru (lớp cha)
 *     ├── KhoLuuTruFirestore  (kho-luu-tru-firestore.js)
 *     └── KhoLuuTruTep        (kho-luu-tru-tep.js)
 */
class KhoLuuTru {
  /** Đọc 1 bản ghi. Không có thì trả về null. */
  async docMot(bang, ma) { throw new Error('Lớp con phải cài đặt docMot'); }

  /** Đọc toàn bộ một bảng: trả về mảng { ma, ...duLieu }. */
  async docCaBang(bang) { throw new Error('Lớp con phải cài đặt docCaBang'); }

  /** Tìm bản ghi đầu tiên có truong == giaTri. Không có thì null. */
  async timMot(bang, truong, giaTri) { throw new Error('Lớp con phải cài đặt timMot'); }

  /** Ghi (tạo mới hoặc gộp vào bản ghi cũ). */
  async ghi(bang, ma, duLieu) { throw new Error('Lớp con phải cài đặt ghi'); }

  /** Tên hiển thị, dùng khi in log. */
  get ten() { return this.constructor.name; }
}

module.exports = { KhoLuuTru };
