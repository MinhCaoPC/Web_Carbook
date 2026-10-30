const { db } = require('../config/firebase');
const { Timestamp } = require('firebase-admin/firestore');

// Helper to generate the next maLoTrinh (e.g., LT143 if max is LT142)
async function generateNextMaLoTrinh() {
  const snapshot = await db.collection('LOTRINH').get();
  let maxNum = 0;
  snapshot.forEach((doc) => {
    const id = doc.id;
    if (id.startsWith('LT')) {
      const num = parseInt(id.replace('LT', ''), 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });
  const nextNum = maxNum + 1;
  return 'LT' + String(nextNum).padStart(3, '0');
}

// 1. Get list of routes with filtering and pagination
exports.listRoutes = async (req, res) => {
  try {
    const { fromProvince, toProvince, page = 1, limit = 10 } = req.query;

    const snapshot = await db.collection('LOTRINH').get();
    let routes = [];
    snapshot.forEach((doc) => {
      routes.push({
        id: doc.id,
        maLoTrinh: doc.id,
        ...doc.data(),
      });
    });

    // Simple sorting: by maLoTrinh ascending (LT001 -> LT064)
    routes.sort((a, b) => a.id.localeCompare(b.id));

    // Helper function to normalize Vietnamese strings (remove accents and lowercase)
    const removeVietnameseAccents = (str) => {
      if (!str) return "";
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
    };

    // Apply filtering on server-side using robust accentless substring and mapping logic
    if (fromProvince && fromProvince !== 'all') {
      const targetFrom = removeVietnameseAccents(fromProvince);
      routes = routes.filter((r) => {
        const routeFrom = removeVietnameseAccents(r.diemKhoiHanh);
        return routeFrom.includes(targetFrom) || 
               (targetFrom === 'kien giang' && (routeFrom.includes('kien giang') || routeFrom.includes('an minh') || routeFrom.includes('rach gia') || routeFrom.includes('ha tien'))) ||
               (targetFrom === 'an giang' && (routeFrom.includes('an giang') || routeFrom.includes('chau doc'))) ||
               (targetFrom === 'tp. ho chi minh' && (routeFrom.includes('ho chi minh') || routeFrom.includes('hcm') || routeFrom.includes('mien tay') || routeFrom.includes('mien dong'))) ||
               (targetFrom === 'binh duong' && (routeFrom.includes('binh duong') || routeFrom.includes('ben cat'))) ||
               (targetFrom === 'soc trang' && (routeFrom.includes('soc trang') || routeFrom.includes('vinh chau'))) ||
               (targetFrom === 'lao cai' && (routeFrom.includes('lao cai') || routeFrom.includes('sapa')));
      });
    }
    if (toProvince && toProvince !== 'all') {
      const targetTo = removeVietnameseAccents(toProvince);
      routes = routes.filter((r) => {
        const routeTo = removeVietnameseAccents(r.diemKetThuc);
        return routeTo.includes(targetTo) || 
               (targetTo === 'kien giang' && (routeTo.includes('kien giang') || routeTo.includes('an minh') || routeTo.includes('rach gia') || routeTo.includes('ha tien'))) ||
               (targetTo === 'an giang' && (routeTo.includes('an giang') || routeTo.includes('chau doc'))) ||
               (targetTo === 'tp. ho chi minh' && (routeTo.includes('ho chi minh') || routeTo.includes('hcm') || routeTo.includes('mien tay') || routeTo.includes('mien dong'))) ||
               (targetTo === 'binh duong' && (routeTo.includes('binh duong') || routeTo.includes('ben cat'))) ||
               (targetTo === 'soc trang' && (routeTo.includes('soc trang') || routeTo.includes('vinh chau'))) ||
               (targetTo === 'lao cai' && (routeTo.includes('lao cai') || routeTo.includes('sapa')));
      });
    }

    const total = routes.length;
    const startIndex = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const paginatedRoutes = routes.slice(startIndex, startIndex + parseInt(limit, 10));

    return res.status(200).json({
      success: true,
      data: paginatedRoutes,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (error) {
    console.error('Error listing routes:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách lộ trình.' });
  }
};

// 2. Get route detail
exports.getRouteDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection('LOTRINH').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lộ trình.' });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: doc.id,
        maLoTrinh: doc.id,
        ...doc.data(),
      },
    });
  } catch (error) {
    console.error('Error getting route detail:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy chi tiết lộ trình.' });
  }
};

// 3. Create a new route
exports.createRoute = async (req, res) => {
  try {
    const { tenLoTrinh, diemKhoiHanh, diemKetThuc, quangDuongKm, thoiGianDuKien, giaVeCoBan, trangThai } = req.body;

    if (!tenLoTrinh || !diemKhoiHanh || !diemKetThuc) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ thông tin: tên, điểm đi, điểm đến.' });
    }

    const maLoTrinh = await generateNextMaLoTrinh();
    const newRoute = {
      tenLoTrinh: tenLoTrinh.trim(),
      diemKhoiHanh: diemKhoiHanh.trim(),
      diemKetThuc: diemKetThuc.trim(),
      quangDuongKm: Number(quangDuongKm) || 0,
      thoiGianDuKien: Number(thoiGianDuKien) || 0, // in hours
      giaVeCoBan: Number(giaVeCoBan) || 0,
      trangThai: trangThai || 'HoatDong',
      ngayTao: Timestamp.now(),
      ngayCapNhat: Timestamp.now(),
    };

    await db.collection('LOTRINH').doc(maLoTrinh).set(newRoute);

    return res.status(201).json({
      success: true,
      message: 'Tạo lộ trình mới thành công.',
      data: { id: maLoTrinh, maLoTrinh, ...newRoute },
    });
  } catch (error) {
    console.error('Error creating route:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo lộ trình mới.' });
  }
};

// 4. Update an existing route
exports.updateRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenLoTrinh, diemKhoiHanh, diemKetThuc, quangDuongKm, thoiGianDuKien, giaVeCoBan, trangThai } = req.body;

    const ref = db.collection('LOTRINH').doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lộ trình.' });
    }

    const updateData = {
      ngayCapNhat: Timestamp.now(),
    };

    if (tenLoTrinh !== undefined) updateData.tenLoTrinh = tenLoTrinh.trim();
    if (diemKhoiHanh !== undefined) updateData.diemKhoiHanh = diemKhoiHanh.trim();
    if (diemKetThuc !== undefined) updateData.diemKetThuc = diemKetThuc.trim();
    if (quangDuongKm !== undefined) updateData.quangDuongKm = Number(quangDuongKm) || 0;
    if (thoiGianDuKien !== undefined) updateData.thoiGianDuKien = Number(thoiGianDuKien) || 0;
    if (giaVeCoBan !== undefined) updateData.giaVeCoBan = Number(giaVeCoBan) || 0;
    if (trangThai !== undefined) updateData.trangThai = trangThai;

    await ref.update(updateData);

    const updatedDoc = await ref.get();
    return res.status(200).json({
      success: true,
      message: 'Cập nhật lộ trình thành công.',
      data: { id, maLoTrinh: id, ...updatedDoc.data() },
    });
  } catch (error) {
    console.error('Error updating route:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật lộ trình.' });
  }
};

// 5. Delete route
exports.deleteRoute = async (req, res) => {
  try {
    const { id } = req.params;

    const ref = db.collection('LOTRINH').doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lộ trình.' });
    }

    // Check constraint: Can't delete if there is an active trip referencing this route
    const tripSnapshot = await db.collection('CHUYENXE').where('maLoTrinh', '==', id).limit(1).get();
    if (!tripSnapshot.empty) {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa lộ trình này vì đang có chuyến xe sử dụng lộ trình.',
      });
    }

    await ref.delete();

    return res.status(200).json({
      success: true,
      message: 'Xóa lộ trình thành công.',
    });
  } catch (error) {
    console.error('Error deleting route:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa lộ trình.' });
  }
};
