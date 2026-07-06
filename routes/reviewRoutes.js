// routes/reviewRoutes.js
const express = require('express');
const router  = express.Router();
const Review  = require('../models/Review');
const { protect }         = require('../middleware/authMiddleware');
const { authorizeRoles }  = require('../middleware/roleMiddleware');

// GET /api/reviews/public — public reviews for homepage (no auth required)
router.get('/public', async (req, res) => {
  try {
    const reviews = await Review.find({ comment: { $ne: '' } })
      .populate('userId', 'fullName role')
      .sort({ rating: -1, createdAt: -1 })
      .limit(6);

    const agg = await Review.aggregate([
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    res.json({
      reviews: reviews.map(r => ({
        _id:      r._id,
        rating:   r.rating,
        comment:  r.comment,
        category: r.category,
        createdAt: r.createdAt,
        userName: r.userId?.fullName || 'EduAdapt User',
        userRole: r.userId?.role    || 'student',
      })),
      avgRating: agg[0]?.avgRating ? Math.round(agg[0].avgRating * 10) / 10 : 0,
      total:     agg[0]?.count ?? 0,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/reviews — create or update own review (upsert by userId)
router.post('/', protect, async (req, res) => {
  try {
    const { rating, comment, category } = req.body;
    const r = Number(rating);
    if (!r || r < 1 || r > 5) return res.status(400).json({ message: 'Rating must be between 1 and 5' });

    const review = await Review.findOneAndUpdate(
      { userId: req.user._id },
      { rating: r, comment: (comment || '').trim().slice(0, 1000), category: category || 'overall' },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ message: 'Review saved', review });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/reviews/my — get own review
router.get('/my', protect, async (req, res) => {
  try {
    const review = await Review.findOne({ userId: req.user._id });
    res.json(review || null);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/reviews/summary — aggregated stats (any authenticated user)
router.get('/summary', protect, async (req, res) => {
  try {
    const agg = await Review.aggregate([
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const dist = await Review.aggregate([
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    res.json({
      total:      agg[0]?.count    ?? 0,
      avgRating:  agg[0]?.avgRating ? Math.round(agg[0].avgRating * 10) / 10 : 0,
      distribution: dist.reduce((acc, d) => { acc[d._id] = d.count; return acc; }, {}),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/reviews — all reviews (admin only)
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('userId', 'fullName email role')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/reviews/:id — admin delete
router.delete('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
