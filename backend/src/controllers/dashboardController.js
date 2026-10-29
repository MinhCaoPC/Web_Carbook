const { db } = require('../config/firebase');

exports.overview = async (req, res) => {
  try {
    const veXeRef = db.collection('VEXE');

    // Đếm số lượng bằng count() không cần composite index
    const tongHanhKhachQuery = veXeRef.where('trangThaiVe', '!=', 'HUY');

    const yeuCauHoTroRef = db.collection('YEUCAUHOTRO');
    const yeuCauHoTroQuery = yeuCauHoTroRef.where('trangThai', '==', 'CHO');

    // "Chuyến đang chạy": CHUYENXE.trangThai chỉ có 2 giá trị thật ('SapChay'/'ChuaGanXe',
    // xem bulkCreateTrips) và không bao giờ được cập nhật theo thời gian thực, nên đếm theo
    // field đó luôn ra tổng số chuyến MẪU (sai bản chất). Thay bằng suy ra từ CHUYENXE_NGAY
    // của hôm nay: chuyến nào đang nằm trong khoảng [giờ xuất phát, giờ đến] tính đến hiện tại.
    const homNay = (() => {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })();

    const [chuyenNgaySnap, tongHanhKhachSnap, yeuCauHoTroSnap] = await Promise.all([
      db.collection('CHUYENXE_NGAY').where('ngayDi', '==', homNay).get(),
      tongHanhKhachQuery.count().get(),
      yeuCauHoTroQuery.count().get()
    ]);

    const now = new Date();
    const activeTripsCount = chuyenNgaySnap.docs.filter((doc) => {
      const d = doc.data();
      const start = d.thoiGianXuatPhat?.toDate?.();
      const end = d.thoiGianDenDich?.toDate?.();
      return start && end && now >= start && now <= end;
    }).length;

    const totalPassengers = tongHanhKhachSnap.data().count || 0;
    const supportRequestsCount = yeuCauHoTroSnap.data().count || 0;

    // Tính tổng doanh thu và biểu đồ (từ bảng HOADON giống adminReportController)
    const hoadonSnap = await db.collection('HOADON').where('trangThaiTT', '==', 'TC').get();
    
    let totalRevenue = 0;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    // Khởi tạo mảng biểu đồ 30 ngày
    const chartMap = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const label = `${d.getDate().toString().padStart(2, '0')}/${d.getMonth() + 1}`;
      chartMap[label] = { label, revenue: 0, dateObj: new Date(d.setHours(0,0,0,0)) };
    }

    hoadonSnap.docs.forEach(doc => {
      const data = doc.data();
      const tongTien = Number(data.tongTien) || 0;
      totalRevenue += tongTien;

      let ngay = data.ngayThanhToan;
      if (ngay) {
        const dateVal = ngay.toDate ? ngay.toDate() : new Date(ngay);
        const label = `${dateVal.getDate().toString().padStart(2, '0')}/${dateVal.getMonth() + 1}`;
        if (chartMap[label]) {
            chartMap[label].revenue += tongTien;
        }
      }
    });

    const revenueChartData = Object.values(chartMap).sort((a, b) => a.dateObj - b.dateObj).map(item => ({ label: item.label, revenue: item.revenue }));

    // Hoạt động gần đây (không dùng aggregate)
    const recentTicketsSnap = await veXeRef.orderBy('thoiGianDat', 'desc').limit(5).get();
    const recentActivity = recentTicketsSnap.docs.map(doc => {
      const data = doc.data();
      let statusClass = 'badge--info';
      if (data.trangThaiVe === 'HUY') statusClass = 'badge--off';
      if (data.trangThaiVe === 'DA_TT') statusClass = 'badge--ok';
      if (data.trangThaiVe === 'GIU_CHO') statusClass = 'badge--warn';

      const thoiGian = data.thoiGianDat?.toDate ? data.thoiGianDat.toDate() : (data.thoiGianDat ? new Date(data.thoiGianDat) : null);

      return {
        id: doc.id.substring(0, 8).toUpperCase(),
        type: 'Đặt vé',
        typeIcon: 'bi-ticket-detailed',
        detail: `Chuyến xe ${data.maChuyenXe || 'Không rõ'}`,
        user: `Khách: ${data.hoTenHanhKhach || data.maKhachHang || 'Khách vãng lai'}`,
        status: data.trangThaiVe,
        statusClass: statusClass,
        time: thoiGian ? thoiGian.toLocaleString('vi-VN') : 'Mới đây',
        timestampMs: thoiGian ? thoiGian.getTime() : 0,
      };
    });

    const recentSupportSnap = await yeuCauHoTroRef.orderBy('thoiGianTao', 'desc').limit(3).get();
    recentSupportSnap.docs.forEach(doc => {
      const data = doc.data();
      const thoiGian = data.thoiGianTao?.toDate ? data.thoiGianTao.toDate() : (data.thoiGianTao ? new Date(data.thoiGianTao) : null);
      recentActivity.push({
        id: doc.id.substring(0, 8).toUpperCase(),
        type: 'Hỗ trợ',
        typeIcon: 'bi-exclamation-triangle',
        detail: data.loaiYeuCau || 'Cần hỗ trợ',
        user: `Khách: ${data.maKhachHang || 'Không rõ'}`,
        status: data.trangThai || 'Đang chờ',
        statusClass: 'badge--warn',
        time: thoiGian ? thoiGian.toLocaleString('vi-VN') : 'Mới đây',
        timestampMs: thoiGian ? thoiGian.getTime() : 0,
      });
    });

    // Sắp xếp thật theo thời gian mới nhất trước (trước đây sort() luôn return -1, không sort gì cả)
    recentActivity.sort((a, b) => b.timestampMs - a.timestampMs);
    recentActivity.forEach((item) => delete item.timestampMs);

    // Tỷ lệ lấp đầy theo tuyến (dựa trên chuyến chạy hôm nay): occupied = tổng ghế xe - số ghế
    // còn trống (CHUYENXE_NGAY.soGheConTrong), tổng ghế lấy từ XE.tongSoGhe của xe được gán.
    const [chuyenXeMauSnap, xeSnap] = await Promise.all([
      db.collection('CHUYENXE').get(),
      db.collection('XE').get(),
    ]);
    const templateMap = Object.fromEntries(chuyenXeMauSnap.docs.map((d) => [d.id, d.data()]));
    const vehicleMap = Object.fromEntries(xeSnap.docs.map((d) => [d.id, d.data()]));
    const lotrinhSnap = await db.collection('LOTRINH').get();
    const routeNameMap = Object.fromEntries(lotrinhSnap.docs.map((d) => [d.id, d.data().tenLoTrinh]));

    const occupancyByRoute = {};
    chuyenNgaySnap.docs.forEach((doc) => {
      const dt = doc.data();
      const template = templateMap[dt.maChuyenXe];
      if (!template || !template.maXe || !template.maLoTrinh) return;

      const vehicle = vehicleMap[template.maXe];
      const tongGhe = vehicle?.tongSoGhe || 0;
      if (tongGhe <= 0) return;

      const gheConTrong = typeof dt.soGheConTrong === 'number' ? dt.soGheConTrong : tongGhe;
      const daDat = Math.max(0, tongGhe - gheConTrong);

      if (!occupancyByRoute[template.maLoTrinh]) {
        occupancyByRoute[template.maLoTrinh] = { tongGhe: 0, daDat: 0 };
      }
      occupancyByRoute[template.maLoTrinh].tongGhe += tongGhe;
      occupancyByRoute[template.maLoTrinh].daDat += daDat;
    });

    const occupancyColors = ['#00BA88', '#1B56F3', '#FFB020', '#ED2E7E'];
    const occupancyRates = Object.entries(occupancyByRoute)
      .map(([maLoTrinh, agg]) => ({
        routeName: routeNameMap[maLoTrinh] || maLoTrinh,
        percentage: Math.round((agg.daDat / agg.tongGhe) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 4)
      .map((item, index) => ({ ...item, color: occupancyColors[index % occupancyColors.length] }));

    res.status(200).json({
      success: true,
      data: {
        topCards: {
          totalRevenue,
          activeTripsCount,
          totalPassengers,
          supportRequestsCount
        },
        revenueChartData,
        recentActivity,
        occupancyRates
      }
    });

  } catch (error) {
    console.error('Lỗi lấy dữ liệu dashboard:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

