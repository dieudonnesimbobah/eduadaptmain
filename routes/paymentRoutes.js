// routes/paymentRoutes.js
const express = require('express');
const router  = express.Router();
const { initiatePayment, verifyPayment, getMyPayments, handleWebhook } = require('../controllers/paymentController');
const { protect }        = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

// Webhook is public — Fapshi POSTs here without credentials
router.post('/webhook',            handleWebhook);
router.post('/initiate',           protect, authorizeRoles('student'), initiatePayment);
router.get('/verify/:transId',     protect, authorizeRoles('student'), verifyPayment);
router.get('/my-payments',         protect, authorizeRoles('student'), getMyPayments);

module.exports = router;