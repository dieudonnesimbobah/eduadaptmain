// controllers/studentController.js - Student dashboard, enrollment, progress
const Course     = require('../models/Course');
const Lesson     = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const Progress   = require('../models/Progress');
const Quiz       = require('../models/Quiz');
const QuizResult = require('../models/QuizResult');
const { logActivity }         = require('../middleware/activityLogger');
const { recommendDifficulty } = require('../utils/adaptiveEngine');
const { notifyEnrollment }    = require('../utils/notificationHelper'); // ← NEW

// GET /api/student/dashboard
const getDashboard = async (req, res) => {
  try {
    const studentId = req.user._id;
    const totalEnrollments = await Enrollment.countDocuments({ studentId, status: 'active' });
    const completedCourses = await Enrollment.countDocuments({ studentId, status: 'completed' });
    const progressRecords  = await Progress.find({ studentId });
    const avgProgress = progressRecords.length
      ? Math.round(progressRecords.reduce((sum, p) => sum + p.completionPercentage, 0) / progressRecords.length)
      : 0;
    const lastQuiz = await QuizResult.findOne({ studentId }).sort({ createdAt: -1 });
    const recommendedDifficulty = lastQuiz ? recommendDifficulty(lastQuiz.percentage) : 'beginner';
    res.json({ totalEnrollments, completedCourses, avgProgress, recommendedDifficulty });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/student/courses?search=&category=&level=&page=1&limit=12
const getAvailableCourses = async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(50,  parseInt(req.query.limit) || 12);
    const skip     = (page - 1) * limit;
    const search   = req.query.search   ? req.query.search.trim()   : '';
    const category = req.query.category ? req.query.category.trim() : '';
    const level    = req.query.level    ? req.query.level.trim()    : '';

    const filter = { approvalStatus: 'approved', isPublished: true };
    if (category) filter.category = { $regex: category, $options: 'i' };
    if (level && ['beginner','intermediate','advanced'].includes(level)) filter.difficultyLevel = level;
    if (search) {
      filter.$or = [
        { title:       { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category:    { $regex: search, $options: 'i' } },
      ];
    }

    const [courses, total] = await Promise.all([
      Course.find(filter).populate('instructorId', 'fullName').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Course.countDocuments(filter),
    ]);

    res.json({ courses, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/student/courses/:id
const getCourse = async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.id, approvalStatus: 'approved', isPublished: true })
      .populate('instructorId', 'fullName email');
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/student/courses/:courseId/enroll
const enrollInCourse = async (req, res) => {
  try {
    const courseId  = req.params.courseId;
    const studentId = req.user._id;

    const course = await Course.findOne({ _id: courseId, approvalStatus: 'approved', isPublished: true });
    if (!course) return res.status(404).json({ message: 'Course not available for enrollment' });

    const existing = await Enrollment.findOne({ studentId, courseId });
    if (existing) return res.status(400).json({ message: 'Already enrolled in this course' });

    // Paid course — tell frontend to open payment modal
    if (!course.isFree && course.price > 0) {
      return res.status(402).json({
        message: 'Payment required', paymentRequired: true,
        price: course.price, courseId: course._id, courseTitle: course.title,
      });
    }

    // Free course — enroll directly
    const enrollment = await Enrollment.create({
      studentId, courseId, instructorId: course.instructorId,
    });
    await Progress.create({ studentId, courseId, completionPercentage: 0 });

    // ── Notify instructor ──────────────────────────────────────────────────
    await notifyEnrollment({
      instructorId: course.instructorId,
      studentName:  req.user.fullName || 'A student',
      courseTitle:  course.title,
      courseId:     course._id,
    });

    await logActivity({
      userId: studentId, role: 'student', action: 'ENROLL',
      entityType: 'Course', entityId: courseId,
      description: `Student enrolled in course: ${course.title}`, ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Enrolled successfully', enrollment });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Already enrolled' });
    res.status(500).json({ message: error.message });
  }
};

// GET /api/student/enrollments
const getMyEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ studentId: req.user._id })
      .populate('courseId', '_id title description thumbnail category difficultyLevel isPublished approvalStatus isFree price')
      .populate('instructorId', 'fullName')
      .sort({ createdAt: -1 });
    const valid = enrollments.filter(e => e.courseId && e.courseId._id);
    res.json(valid);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/student/courses/:courseId/lessons
const getCourseLessons = async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({ studentId: req.user._id, courseId: req.params.courseId });
    if (!enrollment) return res.status(403).json({ message: 'You are not enrolled in this course' });
    const lessons = await Lesson.find({ courseId: req.params.courseId }).sort({ order: 1 });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/student/lessons/:lessonId
const getLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
    const enrollment = await Enrollment.findOne({ studentId: req.user._id, courseId: lesson.courseId });
    if (!enrollment) return res.status(403).json({ message: 'Not enrolled in this course' });
    res.json(lesson);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/student/progress
const updateProgress = async (req, res) => {
  try {
    const { courseId, lessonId, mode } = req.body;
    const studentId = req.user._id;

    let progress = await Progress.findOne({ studentId, courseId });
    if (!progress) progress = await Progress.create({ studentId, courseId, completionPercentage: 0 });

    if (mode === 'video' && !progress.watchedVideos.includes(lessonId)) progress.watchedVideos.push(lessonId);
    if (!progress.completedLessons.includes(lessonId)) progress.completedLessons.push(lessonId);

    const totalLessons = await Lesson.countDocuments({ courseId });
    progress.completionPercentage = totalLessons
      ? Math.round((progress.completedLessons.length / totalLessons) * 100) : 0;
    progress.lastAccessedAt = Date.now();

    if (progress.completionPercentage === 100) {
      await Enrollment.findOneAndUpdate({ studentId, courseId }, { status: 'completed' });
    }
    await progress.save();

    await logActivity({
      userId: studentId, role: 'student', action: 'UPDATE_PROGRESS',
      entityType: 'Lesson', entityId: lessonId,
      description: `Student updated progress for course ${courseId}`, ipAddress: req.ip,
    });

    res.json({ message: 'Progress updated', progress });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/student/progress/:courseId
const getProgress = async (req, res) => {
  try {
    const progress = await Progress.findOne({ studentId: req.user._id, courseId: req.params.courseId });
    res.json(progress || { completionPercentage: 0, completedLessons: [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/student/quizzes/:quizId/submit
const submitQuiz = async (req, res) => {
  try {
    const { answers, courseId, lessonId } = req.body;
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    let score = 0;
    quiz.questions.forEach((q, i) => {
      if (answers[i] && answers[i].toString() === q.correctAnswer.toString()) score++;
    });

    const totalQuestions        = quiz.questions.length;
    const percentage            = totalQuestions ? Math.round((score / totalQuestions) * 100) : 0;
    const recommendedDifficulty = recommendDifficulty(percentage);

    await QuizResult.create({
      studentId: req.user._id, courseId: courseId || quiz.courseId,
      lessonId: lessonId || quiz.lessonId, quizId: quiz._id,
      score, totalQuestions, percentage, recommendedDifficulty,
    });

    await logActivity({
      userId: req.user._id, role: 'student', action: 'SUBMIT_QUIZ',
      entityType: 'Quiz', entityId: quiz._id,
      description: `Student scored ${percentage}% on quiz`, ipAddress: req.ip,
    });

    res.json({ message: 'Quiz submitted', score, totalQuestions, percentage, recommendedDifficulty });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/student/courses/:courseId/quizzes (hides correctAnswer)
const getQuizzesForStudent = async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({ studentId: req.user._id, courseId: req.params.courseId });
    if (!enrollment) return res.status(403).json({ message: 'You are not enrolled in this course' });

    const quizzes = await Quiz.find({ courseId: req.params.courseId });

    // Strip correctAnswer so students cannot cheat
    const safeQuizzes = quizzes.map(q => ({
      _id:       q._id,
      title:     q.title,
      courseId:  q.courseId,
      lessonId:  q.lessonId,
      createdAt: q.createdAt,
      questions: q.questions.map(qu => ({
        _id:             qu._id,
        questionText:    qu.questionText,
        options:         qu.options,
        difficultyLevel: qu.difficultyLevel,
        // correctAnswer intentionally omitted
      })),
    }));

    // Also return the student's last result for each quiz
    const results = await QuizResult.find({
      studentId: req.user._id,
      courseId:  req.params.courseId,
    }).sort({ createdAt: -1 });

    const lastResultByQuiz = {};
    results.forEach(r => {
      const key = r.quizId.toString();
      if (!lastResultByQuiz[key]) lastResultByQuiz[key] = r;
    });

    res.json({ quizzes: safeQuizzes, lastResults: lastResultByQuiz });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/student/quiz-results
const getMyQuizResults = async (req, res) => {
  try {
    const results = await QuizResult.find({ studentId: req.user._id })
      .populate('quizId', 'title')
      .populate('courseId', 'title')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/student/recommendations
const getRecommendations = async (req, res) => {
  try {
    const lastQuiz   = await QuizResult.findOne({ studentId: req.user._id }).sort({ createdAt: -1 });
    const difficulty = lastQuiz ? recommendDifficulty(lastQuiz.percentage) : 'beginner';
    const courses    = await Course.find({ approvalStatus: 'approved', isPublished: true, difficultyLevel: difficulty })
      .limit(5).populate('instructorId', 'fullName');
    res.json({ recommendedDifficulty: difficulty, courses });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const downloadLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });

    const enrollment = await Enrollment.findOne({ studentId: req.user._id, courseId: lesson.courseId });
    if (!enrollment) return res.status(403).json({ message: 'You are not enrolled in this course' });

    if (!lesson.videoOriginal) {
      return res.status(404).json({ message: 'No video available for this lesson' });
    }

    // Insert fl_attachment into the Cloudinary URL to force a file download
    const downloadUrl = lesson.videoOriginal.replace('/video/upload/', '/video/upload/fl_attachment/');
    res.redirect(downloadUrl);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDashboard, getAvailableCourses, getCourse, enrollInCourse,
  getMyEnrollments, getCourseLessons, getLesson,
  updateProgress, getProgress, submitQuiz, getRecommendations,
  getQuizzesForStudent, getMyQuizResults, downloadLesson,
};