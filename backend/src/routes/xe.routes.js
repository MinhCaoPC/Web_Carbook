const express = require("express");
const router = express.Router();
const controller = require("../controllers/xe.controller");
// Not using verifyAdmin middleware for now as it's not present or imported consistently in this project's routing yet. If needed, we will add it.
// const { verifyAdmin } = require("../middlewares/auth.middleware");

// router.use(verifyAdmin);

router.get("/templates", controller.listTemplates);       // GET /api/admin/vehicles/templates
router.get("/", controller.list);                          // GET /api/admin/vehicles
router.get("/:id", controller.detail);                      // GET /api/admin/vehicles/:id (kèm sơ đồ ghế)
router.post("/", controller.create);                         // POST /api/admin/vehicles
router.post("/:id/seats/batch", controller.batchUpdateSeats); // POST /api/admin/vehicles/:id/seats/batch
router.patch("/:id/seats/:maGhe/toggle", controller.toggleSeat); // PATCH .../seats/A01/toggle

module.exports = router;
