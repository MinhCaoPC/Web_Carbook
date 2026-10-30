const service = require("../services/diemtrungchuyen.service");

exports.stats = async (req, res, next) => {
  try { 
    res.json(await service.getStatsSummary()); 
  } catch (err) { 
    next(err); 
  }
};

exports.byProvince = async (req, res, next) => {
  try { 
    res.json(await service.getStationsByProvince(req.params.tinhThanh)); 
  } catch (err) { 
    next(err); 
  }
};

exports.getAll = async (req, res, next) => {
  try {
    res.json(await service.getAllStations());
  } catch(err) {
    next(err);
  }
};

exports.detail = async (req, res, next) => {
  try {
    const station = await service.getStationById(req.params.id);
    if (!station) return res.status(404).json({ message: "Không tìm thấy điểm trung chuyển" });
    res.json(station);
  } catch (err) { 
    next(err); 
  }
};

exports.create = async (req, res, next) => {
  try { 
    // using a dummy admin uid since auth is not fully in scope of this script
    res.status(201).json(await service.createStation(req.body, "admin_uid")); 
  } catch (err) { 
    next(err); 
  }
};

exports.update = async (req, res, next) => {
  try {
    const updated = await service.updateStation(req.params.id, req.body, "admin_uid");
    if (!updated) return res.status(404).json({ message: "Không tìm thấy điểm trung chuyển" });
    res.json(updated);
  } catch (err) { 
    next(err); 
  }
};

exports.toggleStatus = async (req, res, next) => {
  try { 
    res.json(await service.toggleStationStatus(req.params.id, "admin_uid")); 
  } catch (err) { 
    next(err); 
  }
};

exports.recentActivity = async (req, res, next) => {
  try { 
    res.json(await service.getRecentActivity()); 
  } catch (err) { 
    next(err); 
  }
};

exports.reverseGeocode = async (req, res, next) => {
  try {
    const { lat, lng } = req.query;
    // Mock reverse geocode cho nhanh vì chưa có Server Key
    // Thực tế sẽ fetch google map API
    let tinhThanh = "TP. Hồ Chí Minh";
    let diaChiDayDu = "123 Đường Tạm, TP. Hồ Chí Minh";
    if (lat && lng) {
       res.json({ diaChiDayDu, tinhThanh });
    } else {
       res.status(400).json({message: "Missing lat/lng"});
    }
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const deleted = await service.deleteStation(req.params.id, "admin_uid");
    if (!deleted) return res.status(404).json({ message: "Không tìm thấy điểm trung chuyển" });
    res.json({ success: true, message: "Đã xóa điểm trung chuyển" });
  } catch (err) {
    next(err);
  }
};
