const { db } = require('../config/firebase');

// Get all stations (DIEMTRUNGCHUYEN)
exports.listStations = async (req, res) => {
  try {
    const snapshot = await db.collection('DIEMTRUNGCHUYEN').get();
    const stations = [];
    snapshot.forEach((doc) => {
      stations.push({
        id: doc.id,
        maDiem: doc.id,
        ...doc.data(),
      });
    });
    return res.status(200).json({ success: true, data: stations });
  } catch (error) {
    console.error('Error listing stations:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách điểm trung chuyển.' });
  }
};
