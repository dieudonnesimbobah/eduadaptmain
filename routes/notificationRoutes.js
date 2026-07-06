// routes/notificationRoutes.js
const express      = require('express');
const router       = express.Router();
const Notification = require('../models/Notification');
const { protect }  = require('../middleware/authMiddleware');

// ── GET /api/notifications — get latest 20 notifications for logged-in user ──
router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(notifications);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── GET /api/notifications/unread-count ───────────────────────────────────────
router.get('/unread-count', protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipientId: req.user._id, read: false });
    res.json({ count });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── PATCH /api/notifications/:id/read — mark one as read ─────────────────────
router.patch('/:id/read', protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user._id },
      { read: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── PATCH /api/notifications/mark-all-read ────────────────────────────────────
router.patch('/mark-all-read', protect, async (req, res) => {
  try {
    await Notification.updateMany({ recipientId: req.user._id, read: false }, { read: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── DELETE /api/notifications/:id ─────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipientId: req.user._id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;