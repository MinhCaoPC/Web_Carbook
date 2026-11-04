const express = require('express');
const router = express.Router();
const lotrinhController = require('../controllers/lotrinhController');

router.get('/', lotrinhController.listRoutes);
router.get('/:id', lotrinhController.getRouteDetail);
router.post('/', lotrinhController.createRoute);
router.put('/:id', lotrinhController.updateRoute);
router.delete('/:id', lotrinhController.deleteRoute);

module.exports = router;
