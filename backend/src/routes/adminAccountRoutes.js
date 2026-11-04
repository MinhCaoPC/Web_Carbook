const express = require('express');
const router = express.Router();
const adminAccountController = require('../controllers/adminAccountController');

router.get('/', adminAccountController.getAllAccounts);
router.post('/', adminAccountController.createAccount);
router.put('/:id/status', adminAccountController.toggleStatus);

module.exports = router;
