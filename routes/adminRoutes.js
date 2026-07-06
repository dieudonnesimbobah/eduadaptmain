// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const {
  getDashboardStats, getPendingInstructors, getAllInstructors,
  approveInstructor, rejectInstructor, getAllUsers, updateUser, deleteUser,
  getAllCourses, getPendingCourses, approveCourse, rejectCourse,
  getCourseLessons, getAllEnrollments, getQoERecords, getActivityLogs,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const adminAuth = [protect, authorizeRoles('admin')];

router.get('/dashboard-stats', ...adminAuth, getDashboardStats);
router.get('/pending-instructors', ...adminAuth, getPendingInstructors);
router.get('/instructors', ...adminAuth, getAllInstructors);
router.patch('/instructors/:id/approve', ...adminAuth, approveInstructor);
router.patch('/instructors/:id/reject', ...adminAuth, rejectInstructor);
router.get('/users', ...adminAuth, getAllUsers);
router.patch('/users/:id', ...adminAuth, updateUser);
router.delete('/users/:id', ...adminAuth, deleteUser);
router.get('/courses', ...adminAuth, getAllCourses);
router.get('/pending-courses', ...adminAuth, getPendingCourses);
router.patch('/courses/:id/approve', ...adminAuth, approveCourse);
router.patch('/courses/:id/reject', ...adminAuth, rejectCourse);
router.get('/courses/:courseId/lessons', ...adminAuth, getCourseLessons);
router.get('/enrollments', ...adminAuth, getAllEnrollments);
router.get('/qoe-records', ...adminAuth, getQoERecords);
router.get('/activity-logs', ...adminAuth, getActivityLogs);

// ── Mail diagnostics (admin only) ─────────────────────────────────────────────
const { sendMail } = require('../utils/mailer');
router.get('/test-mail', ...adminAuth, async (req, res) => {
  const to = req.query.to || req.user.email;
  try {
    await sendMail({
      to,
      subject: 'EduAdapt – Mail Test',
      html: `<p>If you received this, SMTP is working correctly on Railway.<br/>Sent at ${new Date().toISOString()}</p>`,
    });
    res.json({ message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ message: 'Mail send failed', error: err.message });
  }
});

module.exports = router;
