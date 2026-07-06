// routes/videoRoutes.js
const express = require('express');
const router = express.Router();
const { checkFFmpeg, processVideo } = require('../controllers/videoController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.get('/ffmpeg-check', protect, checkFFmpeg);
router.post('/process-lesson-video', protect, authorizeRoles('admin', 'instructor'), processVideo);

module.exports = router;
