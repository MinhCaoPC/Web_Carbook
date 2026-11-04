const express = require("express");
const router = express.Router();
const controller = require("../controllers/diemtrungchuyen.controller");

// TODO: Add verifyAdmin middleware if applicable
// router.use(verifyAdmin);

router.get("/stats", controller.stats);
router.get("/all", controller.getAll);
router.get("/activity", controller.recentActivity);
router.get("/geocode/reverse", controller.reverseGeocode);
router.get("/province/:tinhThanh", controller.byProvince);
router.get("/:id", controller.detail);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.patch("/:id/toggle-status", controller.toggleStatus);
router.delete("/:id", controller.remove);

module.exports = router;
