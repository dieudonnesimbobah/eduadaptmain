// routes/activityLogRoutes.js
const express      = require('express');
const router       = express.Router();
const { protect }  = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const ActivityLog  = require('../models/ActivityLog');

// GET /api/activity-logs?page=1&limit=25&action=
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 25);
    const skip   = (page - 1) * limit;
    const action = req.query.action;

    const filter = {};
    if (action) filter.action = action.toUpperCase();

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate('userId', 'fullName email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
