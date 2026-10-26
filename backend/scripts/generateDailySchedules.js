// Chạy tay khi cần (vd: vừa đổi lịch trình, muốn sinh lại ngay thay vì đợi cron):
//
//   node scripts/generateDailySchedules.js               # sinh ngày còn thiếu + xóa ghế ngày cũ
//   node scripts/generateDailySchedules.js --xoa-ca-lich # xóa cả CHUYENXE_NGAY ngày cũ (mặc định giữ
//                                                        # lại để lịch sử vé còn hiện đúng giờ đi)
//
// Bình thường KHÔNG cần chạy tay nữa — server.js đã tự chạy lại mỗi ngày qua node-cron
// (xem src/services/tripScheduleGenerationService.js).

const { generateDailySchedules } = require('../src/services/tripScheduleGenerationService');

const xoaCaLich = process.argv.includes('--xoa-ca-lich');

generateDailySchedules({ xoaCaLich })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi khi sinh lịch trình theo ngày:', err);
    process.exit(1);
  });
