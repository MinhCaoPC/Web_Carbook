const express = require('express');
const router = express.Router();
const adminTripController = require('../controllers/adminTripController');

router.get('/', adminTripController.getTripsForDate);
router.post('/bulk', adminTripController.bulkCreateTrips);
router.post('/auto-assign-drivers', adminTripController.autoAssignDrivers);

module.exports = router;
