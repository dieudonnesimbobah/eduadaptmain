// routes/publicRoutes.js - Public endpoints accessible without authentication
const express = require('express');
const router = express.Router();
const Course = require('../models/Course');

// GET /api/public/courses/featured - Get approved published courses for home page
router.get('/courses/featured', async (req, res) => {
  try {
    const courses = await Course.find({ 
      approvalStatus: 'approved', 
      isPublished: true 
    })
      .populate('instructorId', 'fullName')
      .sort({ createdAt: -1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
