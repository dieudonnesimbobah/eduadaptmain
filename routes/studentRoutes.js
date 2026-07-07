// routes/studentRoutes.js
const express    = require('express');
const router     = express.Router();
const {
  getDashboard, getAvailableCourses, getCourse, enrollInCourse,
  getMyEnrollments, getCourseLessons, getLesson, updateProgress,
  getProgress, submitQuiz, getRecommendations,
  getQuizzesForStudent, getMyQuizResults, downloadLesson,
} = require('../controllers/studentController');
const Course     = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const User       = require('../models/User');
const { protect }        = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const studentAuth = [protect, authorizeRoles('student')];

// ── PUBLIC routes (no login required) ────────────────────────────────────────

// Popular courses + accurate stats for homepage (public, supports search+category+pagination)
router.get('/courses/popular', async (req, res) => {
  try {
    const { search, category, page = 1, limit = 9 } = req.query;
    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(24, parseInt(limit) || 9);

    const filter = { approvalStatus: 'approved', isPublished: true };
    if (search) {
      filter.$or = [
        { title:       { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category:    { $regex: search, $options: 'i' } },
      ];
    }
    if (category) filter.category = { $regex: `^${category}$`, $options: 'i' };

    const total   = await Course.countDocuments(filter);
    const courses = await Course.find(filter)
      .populate('instructorId', 'fullName')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const withCounts = await Promise.all(courses.map(async (c) => {
      const count = await Enrollment.countDocuments({ courseId: c._id });
      return { ...c, enrollmentCount: count };
    }));

    if (!search && !category) {
      withCounts.sort((a, b) => b.enrollmentCount - a.enrollmentCount);
    }

    const totalStudents = await User.countDocuments({ role: 'student' });

    res.json({
      courses:       withCounts,
      totalCourses:  total,
      totalStudents,
      total,
      page:  pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── PROTECTED routes (login required) ────────────────────────────────────────
router.get('/dashboard',                 ...studentAuth, getDashboard);
router.get('/courses',                   ...studentAuth, getAvailableCourses);
router.get('/courses/:id',               ...studentAuth, getCourse);
router.post('/courses/:courseId/enroll', ...studentAuth, enrollInCourse);
router.get('/enrollments',               ...studentAuth, getMyEnrollments);
router.get('/courses/:courseId/lessons', ...studentAuth, getCourseLessons);
router.get('/lessons/:lessonId',          ...studentAuth, getLesson);
router.get('/lessons/:lessonId/download', ...studentAuth, downloadLesson);
router.post('/progress',                 ...studentAuth, updateProgress);
router.get('/progress/:courseId',        ...studentAuth, getProgress);
router.get('/courses/:courseId/quizzes', ...studentAuth, getQuizzesForStudent);
router.post('/quizzes/:quizId/submit',   ...studentAuth, submitQuiz);
router.get('/quiz-results',              ...studentAuth, getMyQuizResults);
router.get('/recommendations',           ...studentAuth, getRecommendations);

module.exports = router;