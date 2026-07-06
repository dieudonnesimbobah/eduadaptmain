// controllers/instructorController.js - Instructor dashboard and course management
const fs = require('fs');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const Course     = require('../models/Course');
const Lesson     = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const Progress   = require('../models/Progress');
const Quiz       = require('../models/Quiz');
const User       = require('../models/User');
const { logActivity } = require('../middleware/activityLogger');
const {
  notifyAdminNewCourse,
  notifyLessonAdded,
  notifyStudentsNewCourse,
} = require('../utils/notificationHelper'); // ← NEW

// ── Cloudinary Upload Helper ──────────────────────────────────────────────────
const uploadToCloudinary = async (filePath, folder, resourceType = 'auto') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder, resource_type: resourceType, timeout: 120000,
    });
    return { url: result.secure_url, publicId: result.public_id };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Failed to upload file to Cloudinary: ${error.message}`);
  }
};

// ── Delete from Cloudinary ────────────────────────────────────────────────────
const deleteFromCloudinary = async (publicId) => {
  try {
    if (publicId) await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.warn('Failed to delete from Cloudinary:', error);
  }
};

// ── Cloudinary URL helpers ────────────────────────────────────────────────────
const qualityUrl = (baseUrl, transform) => {
  if (!baseUrl) return null;
  return baseUrl.replace('/upload/', `/upload/${transform}/`);
};

const audioUrl = (videoUrl) => {
  if (!videoUrl) return null;
  return videoUrl.replace(/\.(mp4|mov|avi|mkv|webm)(\?.*)?$/i, '.mp3');
};

// ── GET /api/instructor/dashboard ─────────────────────────────────────────────
const getDashboard = async (req, res) => {
  try {
    const instructorId = req.user._id;
    const totalCourses    = await Course.countDocuments({ instructorId });
    const activeCourses   = await Course.countDocuments({ instructorId, approvalStatus: 'approved' });
    const pendingCourses  = await Course.countDocuments({ instructorId, approvalStatus: 'pending' });
    const rejectedCourses = await Course.countDocuments({ instructorId, approvalStatus: 'rejected' });
    const courseIds       = await Course.find({ instructorId }).distinct('_id');
    const totalStudents   = await Enrollment.countDocuments({
      courseId: { $in: courseIds }, status: { $in: ['active', 'completed'] },
    });
    const progressRecords = await Progress.find({ courseId: { $in: courseIds } });
    const avgProgress = progressRecords.length
      ? Math.round(progressRecords.reduce((s, p) => s + p.completionPercentage, 0) / progressRecords.length)
      : 0;
    res.json({ totalCourses, activeCourses, pendingCourses, rejectedCourses, totalStudents, avgProgress });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/instructor/courses ──────────────────────────────────────────────
const createCourse = async (req, res) => {
  let uploadedFile = null;
  try {
    const { title, description, category, difficultyLevel } = req.body;
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const isApproved = req.user.approvalStatus === 'approved';
    let thumbnailUrl = null, thumbnailPublicId = null;

    if (req.file) {
      uploadedFile = req.file.path;
      const thumbCloud  = await uploadToCloudinary(req.file.path, 'eduadapt/thumbnails', 'image');
      thumbnailUrl      = thumbCloud.url;
      thumbnailPublicId = thumbCloud.publicId;
    }

    const course = await Course.create({
      title, description, category,
      difficultyLevel:  difficultyLevel || 'beginner',
      instructorId:     req.user._id,
      thumbnail:        thumbnailUrl,
      thumbnailPublicId,
      approvalStatus:   isApproved ? 'approved' : 'pending',
      isPublished:      isApproved,
      isFree: req.body.isFree !== 'false' && req.body.isFree !== false,
      price:  parseInt(req.body.price) || 0,
    });

    if (uploadedFile) { try { if (fs.existsSync(uploadedFile)) fs.unlinkSync(uploadedFile); } catch {} }

    // ── Notify all admins of new course (always, regardless of approval status)
    const adminIds = await User.find({ role: 'admin' }).distinct('_id');
    await notifyAdminNewCourse({
      adminIds,
      instructorName: req.user.fullName || 'An instructor',
      courseTitle:    title,
      courseId:       course._id,
    });

    // ── Notify all students about the new course ────────────────────────────
    const studentIds = await User.find({ role: 'student' }).distinct('_id');
    await notifyStudentsNewCourse({
      studentIds,
      instructorName: req.user.fullName || 'An instructor',
      courseTitle:    title,
      courseId:       course._id,
      isFree:         course.isFree,
      price:          course.price,
    });

    await logActivity({
      userId: req.user._id, role: 'instructor', action: 'CREATE_COURSE',
      entityType: 'Course', entityId: course._id,
      description: `Instructor created course: ${title}`, ipAddress: req.ip,
    });

    res.status(201).json({
      message: isApproved ? 'Course created and published.' : 'Course created. Awaiting admin approval.',
      course,
    });
  } catch (error) {
    if (uploadedFile) { try { if (fs.existsSync(uploadedFile)) fs.unlinkSync(uploadedFile); } catch {} }
    res.status(500).json({ message: error.message || 'Failed to create course' });
  }
};

// ── GET /api/instructor/courses ───────────────────────────────────────────────
const getMyCourses = async (req, res) => {
  try {
    const courses = await Course.find({ instructorId: req.user._id }).sort({ createdAt: -1 });
    const withCounts = await Promise.all(courses.map(async (c) => {
      const enrollmentCount = await Enrollment.countDocuments({
        courseId: c._id, status: { $in: ['active', 'completed'] },
      });
      return { ...c.toObject(), enrollmentCount };
    }));
    res.json(withCounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/instructor/courses/:id ──────────────────────────────────────────
const getCourse = async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.id, instructorId: req.user._id });
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── PUT /api/instructor/courses/:id ──────────────────────────────────────────
const updateCourse = async (req, res) => {
  let uploadedFile = null;
  try {
    const course = await Course.findOne({ _id: req.params.id, instructorId: req.user._id });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const { title, description, category, difficultyLevel } = req.body;
    if (title)           course.title           = title;
    if (description)     course.description     = description;
    if (category)        course.category        = category;
    if (difficultyLevel) course.difficultyLevel = difficultyLevel;
    if (req.body.isFree !== undefined) course.isFree = req.body.isFree !== 'false' && req.body.isFree !== false;
    if (req.body.price  !== undefined) course.price  = parseInt(req.body.price) || 0;

    if (req.file) {
      uploadedFile = req.file.path;
      const thumbCloud = await uploadToCloudinary(req.file.path, 'eduadapt/thumbnails', 'image');
      if (course.thumbnailPublicId) await deleteFromCloudinary(course.thumbnailPublicId);
      course.thumbnail         = thumbCloud.url;
      course.thumbnailPublicId = thumbCloud.publicId;
    }

    await course.save();
    if (uploadedFile) { try { if (fs.existsSync(uploadedFile)) fs.unlinkSync(uploadedFile); } catch {} }
    res.json({ message: 'Course updated', course });
  } catch (error) {
    if (uploadedFile) { try { if (fs.existsSync(uploadedFile)) fs.unlinkSync(uploadedFile); } catch {} }
    res.status(500).json({ message: error.message || 'Failed to update course' });
  }
};

// ── DELETE /api/instructor/courses/:id ───────────────────────────────────────
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findOneAndDelete({ _id: req.params.id, instructorId: req.user._id });
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json({ message: 'Course deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/instructor/courses/:courseId/lessons ────────────────────────────
const addLesson = async (req, res) => {
  try {
    const {
      title, description, order,
      videoUrl, videoPublicId,
      pdfUrl, pdfPublicId,
      materialUrl, materialPublicId, materialTitle,
    } = req.body;

    const courseId = req.params.courseId;
    if (!title)    return res.status(400).json({ message: 'Lesson title is required' });
    if (!videoUrl) return res.status(400).json({ message: 'Video URL is required' });

    const course = await Course.findOne({ _id: courseId, instructorId: req.user._id });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const videoQualities = {
      quality360p: qualityUrl(videoUrl, 'q_auto:low,w_640,h_360,c_limit'),
      quality480p: qualityUrl(videoUrl, 'q_auto:good,w_854,h_480,c_limit'),
      quality720p: qualityUrl(videoUrl, 'q_auto:best,w_1280,h_720,c_limit'),
    };

    const downloadableMaterials = [];
    if (materialUrl) {
      downloadableMaterials.push({
        title: materialTitle || 'Lesson Material',
        fileUrl: materialUrl, publicId: materialPublicId || null,
      });
    }

    const lesson = await Lesson.create({
      courseId, instructorId: req.user._id, title,
      description:   description || '',
      order:         parseInt(order) || 0,
      videoOriginal: videoUrl,
      videoPublicId: videoPublicId || null,
      videoQualities,
      audioVersion:  audioUrl(videoUrl),
      pdfNote:       pdfUrl      || null,
      pdfPublicId:   pdfPublicId || null,
      downloadableMaterials,
      processingStatus: 'completed',
      isFree: req.body.isFree === 'true' || req.body.isFree === true,
    });

    // ── Notify all enrolled students about the new lesson ──────────────────
    const enrolledStudentIds = await Enrollment.find({ courseId }).distinct('studentId');
    await notifyLessonAdded({
      enrolledStudentIds,
      courseTitle: course.title,
      lessonTitle: title,
      courseId,
    });

    await logActivity({
      userId: req.user._id, role: 'instructor', action: 'ADD_LESSON',
      entityType: 'Lesson', entityId: lesson._id,
      description: `Instructor added lesson: ${title} to course ${course.title}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Lesson added successfully.', lesson });
  } catch (error) {
    console.error('Error adding lesson:', error);
    res.status(500).json({ message: error.message || 'Failed to add lesson' });
  }
};

// ── GET /api/instructor/courses/:courseId/lessons ─────────────────────────────
const getCourseLessons = async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: req.user._id });
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const lessons = await Lesson.find({ courseId: req.params.courseId }).sort({ order: 1 });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/instructor/lessons/:lessonId ─────────────────────────────────────
const getLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findOne({ _id: req.params.lessonId, instructorId: req.user._id });
    if (!lesson) return res.status(404).json({ message: 'Lesson not found' });
    res.json(lesson);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/instructor/courses/:courseId/students ────────────────────────────
const getCourseStudents = async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: req.user._id });
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const enrollments = await Enrollment.find({
      courseId: req.params.courseId, status: { $in: ['active', 'completed'] },
    }).populate('studentId', 'fullName email createdAt');
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/instructor/courses/:courseId/progress ────────────────────────────
const getCourseProgress = async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: req.user._id });
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const progress = await Progress.find({ courseId: req.params.courseId })
      .populate('studentId', 'fullName email');
    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/instructor/courses/:courseId/quizzes ────────────────────────────
const createQuiz = async (req, res) => {
  try {
    const { lessonId, title, questions } = req.body;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: req.user._id });
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const quiz = await Quiz.create({
      courseId: req.params.courseId, lessonId: lessonId || null,
      instructorId: req.user._id, title: title || 'Quiz', questions: questions || [],
    });
    res.status(201).json({ message: 'Quiz created', quiz });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/instructor/courses/:courseId/quizzes ─────────────────────────────
const getCourseQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find({ courseId: req.params.courseId, instructorId: req.user._id });
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDashboard, createCourse, getMyCourses, getCourse, updateCourse,
  deleteCourse, addLesson, getCourseLessons, getLesson,
  getCourseStudents, getCourseProgress, createQuiz, getCourseQuizzes,
};