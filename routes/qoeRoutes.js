// routes/qoeRoutes.js
const express = require('express');
const router = express.Router();
const { createQoERecord, getCourseQoE, getMyQoERecords } = require('../controllers/qoeController');
const { protect } = require('../middleware/authMiddleware');

router.post('/record', protect, createQoERecord);
router.get('/course/:courseId', protect, getCourseQoE);
router.get('/my-records', protect, getMyQoERecords);

module.exports = router;
