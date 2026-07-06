// routes/instructorRoutes.js
const express = require('express');
const router  = express.Router();
const {
  getDashboard, createCourse, getMyCourses, getCourse, updateCourse,
  deleteCourse, addLesson, getCourseLessons, getLesson,
  getCourseStudents, getCourseProgress, createQuiz, getCourseQuizzes,
} = require('../controllers/instructorController');
const { protect }                   = require('../middleware/authMiddleware');
const { authorizeRoles }            = require('../middleware/roleMiddleware');
const { requireApprovedInstructor } = require('../middleware/instructorApprovalMiddleware');
const { uploadThumbnail }           = require('../middleware/uploadMiddleware');

const instructorAuth = [protect, authorizeRoles('instructor'), requireApprovedInstructor];

router.get('/dashboard', ...instructorAuth, getDashboard);

// Course CRUD — thumbnail is a small image, fine to go through the server
router.post('/courses',       ...instructorAuth, uploadThumbnail.single('thumbnail'), createCourse);
router.get('/courses',        ...instructorAuth, getMyCourses);
router.get('/courses/:id',    ...instructorAuth, getCourse);
router.put('/courses/:id',    ...instructorAuth, uploadThumbnail.single('thumbnail'), updateCourse);
router.delete('/courses/:id', ...instructorAuth, deleteCourse);

// Lesson — NO multer here. The browser uploads files directly to Cloudinary
// and sends only the resulting URLs as a JSON body to this endpoint.
router.post('/courses/:courseId/lessons', ...instructorAuth, addLesson);
router.get('/courses/:courseId/lessons',  ...instructorAuth, getCourseLessons);
router.get('/lessons/:lessonId',          ...instructorAuth, getLesson);

// Students & progress
router.get('/courses/:courseId/students', ...instructorAuth, getCourseStudents);
router.get('/courses/:courseId/progress', ...instructorAuth, getCourseProgress);

// Quizzes
router.post('/courses/:courseId/quizzes', ...instructorAuth, createQuiz);
router.get('/courses/:courseId/quizzes',  ...instructorAuth, getCourseQuizzes);

// Upload signature — browser calls this before uploading directly to Cloudinary
router.use('/upload-signature', require('./uploadSignatureRoute'));

module.exports = router;