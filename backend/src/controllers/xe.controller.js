const service = require("../services/xe.service");
const templateService = require("../services/mausodo.service");

exports.listTemplates = async (req, res, next) => {
  try {
    res.json(await templateService.getAllTemplates());
  } catch (err) { next(err); }
};

exports.list = async (req, res, next) => {
  try {
    res.json(await service.getVehicles(req.query));
  } catch (err) { next(err); }
};

exports.detail = async (req, res, next) => {
  try {
    const xe = await service.getVehicleDetail(req.params.id);
    if (!xe) return res.status(404).json({ message: "Không tìm thấy xe" });
    res.json(xe);
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    res.status(201).json(await service.createVehicle(req.body));
  } catch (err) { next(err); }
};

exports.toggleSeat = async (req, res, next) => {
  try {
    const result = await service.toggleSeatState(req.params.id, req.params.maGhe);
    res.json(result);
  } catch (err) { next(err); }
};

exports.batchUpdateSeats = async (req, res, next) => {
  try {
    const result = await service.batchUpdateSeatStates(req.params.id, req.body.seatStates);
    res.json(result);
  } catch (err) { next(err); }
};
