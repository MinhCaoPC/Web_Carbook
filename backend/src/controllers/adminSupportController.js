const { db } = require('../config/firebase');

const YEUCAUHOTRO_COLLECTION = 'YEUCAUHOTRO';
const VEXE_COLLECTION = 'VEXE';

exports.getAllSupportRequests = async (req, res) => {
  try {
    // Tối ưu: Lấy 50 yêu cầu mới nhất thay vì load tất cả
    const snapshot = await db.collection(YEUCAUHOTRO_COLLECTION)
      .orderBy('thoiGianTao', 'desc')
      .limit(50)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ success: true, data: [] });
    }

    const requests = [];
    
    // Thu thập các mã khách hàng cần lấy
    const maKhachHangList = [...new Set(snapshot.docs.map(doc => doc.data().maKhachHang).filter(Boolean))];
    const customerDict = {};
    
    // Lấy thông tin từ bảng TAIKHOAN nếu có mã khách hàng
    if (maKhachHangList.length > 0) {
      // Firebase 'in' query supports up to 10 items. For more, we might need multiple queries.
      // Here we assume limit(50) might yield <= 50 unique users.
      // For simplicity, we just fetch one by one or chunk. Let's do a simple Promise.all
      const customerPromises = maKhachHangList.map(id => db.collection('TAIKHOAN').doc(id).get());
      const customerSnaps = await Promise.all(customerPromises);
      customerSnaps.forEach(snap => {
        if (snap.exists) {
          const cData = snap.data();
          const name = cData.firstName && cData.lastName ? `${cData.firstName} ${cData.lastName}` : (cData.hoTen || 'Chưa cập nhật');
          const phone = cData.phone || cData.sdt || 'Chưa cập nhật';
          const email = cData.email || 'Chưa cập nhật';
          customerDict[snap.id] = { name, phone, email, photoUrl: cData.photoUrl || cData.photoURL };
        }
      });
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      
      let thoiGianTaoStr = '';
      if (data.thoiGianTao) {
        const dateObj = data.thoiGianTao.toDate ? data.thoiGianTao.toDate() : new Date(data.thoiGianTao);
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const yyyy = dateObj.getFullYear();
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        
        const ampm = dateObj.getHours() >= 12 ? 'PM' : 'AM';
        const hh_ampm = String(dateObj.getHours() % 12 || 12).padStart(2, '0');
        
        // Format: DD/MM/YYYY - HH:mm AM/PM
        thoiGianTaoStr = `${dd}/${mm}/${yyyy} - ${hh_ampm}:${min} ${ampm}`;
      }

      const customerInfo = customerDict[data.maKhachHang] || { name: 'Khách vãng lai', phone: '', email: '', photoUrl: '' };

      requests.push({
        id: doc.id,
        maYeuCau: data.maYeuCau || doc.id,
        maKhachHang: data.maKhachHang,
        tenKhachHang: customerInfo.name,
        sdtKhachHang: customerInfo.phone,
        emailKhachHang: customerInfo.email,
        anhKhachHang: customerInfo.photoUrl,
        maDatVe: data.maDatVe,
        loaiYeuCau: data.loaiYeuCau,
        noiDungYeuCau: data.noiDungYeuCau,
        thongTinLienHe: data.thongTinLienHe,
        trangThai: data.trangThai,
        thoiGianTao: thoiGianTaoStr,
        phanHoiAdmin: data.phanHoiAdmin || '',
        rawTime: data.thoiGianTao ? (data.thoiGianTao.toDate ? data.thoiGianTao.toDate().getTime() : new Date(data.thoiGianTao).getTime()) : 0
      });
    });
    
    return res.status(200).json({ 
      success: true, 
      data: requests 
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách yêu cầu hỗ trợ (Admin):', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy dữ liệu hỗ trợ.' });
  }
};

exports.updateSupportRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { trangThai, phanHoiAdmin } = req.body;

    if (!trangThai) {
      return res.status(400).json({ success: false, message: 'Thiếu trạng thái.' });
    }

    const docRef = db.collection(YEUCAUHOTRO_COLLECTION).doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
       return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
    }

    const updateData = {
        trangThai: trangThai
    };
    if (phanHoiAdmin !== undefined) {
        updateData.phanHoiAdmin = phanHoiAdmin;
    }

    await docRef.update(updateData);

    return res.status(200).json({ 
      success: true, 
      message: 'Cập nhật yêu cầu thành công.' 
    });

  } catch (error) {
    console.error('Lỗi khi cập nhật yêu cầu hỗ trợ (Admin):', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật dữ liệu hỗ trợ.' });
  }
};
