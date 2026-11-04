const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');

router.get('/search', tripController.searchTrips);
router.get('/tuyen', tripController.getTuyen);
router.get('/locations', tripController.getLocations);
router.get('/ngay-cho-phep', tripController.getNgayChoPhep);

module.exports = router;
