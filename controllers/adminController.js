// controllers/adminController.js - Admin management functions
const User = require('../models/User');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const QoERecord = require('../models/QoERecord');
const ActivityLog = require('../models/ActivityLog');
const { logActivity } = require('../middleware/activityLogger');
const {
  notifyCourseApproved,
  notifyCourseRejected,
} = require('../utils/notificationHelper');
const { sendInstructorApprovedEmail, sendInstructorRejectedEmail } = require('../utils/mailer');

// GET /api/admin/dashboard-stats
const getDashboardStats = async (req, res) => {
  try {
    const totalUsers         = await User.countDocuments({ role: { $ne: 'admin' } });
    const totalStudents      = await User.countDocuments({ role: 'student' });
    const totalInstructors   = await User.countDocuments({ role: 'instructor' });
    const pendingInstructors = await User.countDocuments({ role: 'instructor', approvalStatus: 'pending' });
    const pendingCourses     = await Course.countDocuments({ approvalStatus: 'pending' });
    const approvedCourses    = await Course.countDocuments({ approvalStatus: 'approved' });
    const rejectedCourses    = await Course.countDocuments({ approvalStatus: 'rejected' });
    const totalEnrollments   = await Enrollment.countDocuments();
    const totalQoERecords    = await QoERecord.countDocuments();
    res.json({
      totalUsers, totalStudents, totalInstructors, pendingInstructors,
      pendingCourses, approvedCourses, rejectedCourses, totalEnrollments, totalQoERecords,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/pending-instructors
const getPendingInstructors = async (req, res) => {
  try {
    const instructors = await User.find({ role: 'instructor', approvalStatus: 'pending' }).select('-password');
    res.json(instructors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/instructors
const getAllInstructors = async (req, res) => {
  try {
    const instructors = await User.find({ role: 'instructor' }).select('-password');
    res.json(instructors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/instructors/:id/approve
const approveInstructor = async (req, res) => {
  try {
    const instructor = await User.findByIdAndUpdate(
      req.params.id, { approvalStatus: 'approved' }, { new: true }
    ).select('-password');
    if (!instructor) return res.status(404).json({ message: 'Instructor not found' });

    await logActivity({
      userId: req.user._id, role: 'admin', action: 'APPROVE_INSTRUCTOR',
      entityType: 'User', entityId: instructor._id,
      description: `Admin approved instructor: ${instructor.email}`, ipAddress: req.ip,
    });

    // Send approval email (non-blocking — error logged internally)
    sendInstructorApprovedEmail({ email: instructor.email, fullName: instructor.fullName });

    res.json({ message: 'Instructor approved', instructor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/instructors/:id/reject
const rejectInstructor = async (req, res) => {
  try {
    const { reason } = req.body;
    const instructor = await User.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'rejected', rejectionReason: reason || 'No reason provided' },
      { new: true }
    ).select('-password');
    if (!instructor) return res.status(404).json({ message: 'Instructor not found' });

    await logActivity({
      userId: req.user._id, role: 'admin', action: 'REJECT_INSTRUCTOR',
      entityType: 'User', entityId: instructor._id,
      description: `Admin rejected instructor: ${instructor.email}`, ipAddress: req.ip,
    });

    // Send rejection email (non-blocking — error logged internally)
    sendInstructorRejectedEmail({ email: instructor.email, fullName: instructor.fullName, reason });

    res.json({ message: 'Instructor rejected', instructor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/users?page=1&limit=20&search=&role=
const getAllUsers = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : '';
    const role   = req.query.role;

    const filter = { role: { $ne: 'admin' } };
    if (role && ['student', 'instructor'].includes(role)) filter.role = role;
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email:    { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/users/:id
const updateUser = async (req, res) => {
  try {
    const updates = {};
    const { fullName, isActive, role, approvalStatus, phone } = req.body;
    if (fullName !== undefined)       updates.fullName       = fullName;
    if (isActive !== undefined)       updates.isActive       = isActive;
    if (role !== undefined)           updates.role           = role;
    if (approvalStatus !== undefined) updates.approvalStatus = approvalStatus;
    if (phone !== undefined)          updates.phone          = phone;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    await logActivity({
      userId: req.user._id, role: 'admin', action: 'UPDATE_USER',
      entityType: 'User', entityId: user._id,
      description: `Admin updated user: ${user.email}`, ipAddress: req.ip,
    });

    res.json({ message: 'User updated', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    await logActivity({
      userId: req.user._id, role: 'admin', action: 'DELETE_USER',
      entityType: 'User', entityId: user._id,
      description: `Admin deleted user: ${user.email}`, ipAddress: req.ip,
    });

    res.json({ message: 'User deleted', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/courses?page=1&limit=20&search=&status=
const getAllCourses = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : '';
    const status = req.query.status;

    const filter = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) filter.approvalStatus = status;
    if (search) {
      filter.$or = [
        { title:       { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category:    { $regex: search, $options: 'i' } },
      ];
    }

    const [courses, total] = await Promise.all([
      Course.find(filter).populate('instructorId', 'fullName email').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Course.countDocuments(filter),
    ]);

    res.json({ courses, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/pending-courses
const getPendingCourses = async (req, res) => {
  try {
    const courses = await Course.find({ approvalStatus: 'pending' }).populate('instructorId', 'fullName email');
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/courses/:id/approve
const approveCourse = async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id, { approvalStatus: 'approved', isPublished: true }, { new: true }
    );
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // ── Notify instructor their course was approved ─────────────────────────
    await notifyCourseApproved({
      instructorId: course.instructorId,
      courseTitle:  course.title,
      courseId:     course._id,
    });

    await logActivity({
      userId: req.user._id, role: 'admin', action: 'APPROVE_COURSE',
      entityType: 'Course', entityId: course._id,
      description: `Admin approved course: ${course.title}`, ipAddress: req.ip,
    });

    res.json({ message: 'Course approved and published', course });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/courses/:id/reject
const rejectCourse = async (req, res) => {
  try {
    const { reason } = req.body;
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: 'rejected', isPublished: false, rejectionReason: reason || 'No reason provided' },
      { new: true }
    );
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // ── Notify instructor their course was rejected ─────────────────────────
    await notifyCourseRejected({
      instructorId: course.instructorId,
      courseTitle:  course.title,
      courseId:     course._id,
      reason:       reason,
    });

    await logActivity({
      userId: req.user._id, role: 'admin', action: 'REJECT_COURSE',
      entityType: 'Course', entityId: course._id,
      description: `Admin rejected course: ${course.title}`, ipAddress: req.ip,
    });

    res.json({ message: 'Course rejected', course });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/courses/:courseId/lessons
const getCourseLessons = async (req, res) => {
  try {
    const lessons = await Lesson.find({ courseId: req.params.courseId }).sort({ order: 1 });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/enrollments?page=1&limit=20
const getAllEnrollments = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [enrollments, total] = await Promise.all([
      Enrollment.find()
        .populate('studentId',   'fullName email')
        .populate('courseId',    'title')
        .populate('instructorId', 'fullName')
        .sort({ enrolledAt: -1 })
        .skip(skip).limit(limit),
      Enrollment.countDocuments(),
    ]);

    res.json({ enrollments, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/qoe-records
const getQoERecords = async (req, res) => {
  try {
    const records = await QoERecord.find()
      .populate('studentId', 'fullName email')
      .populate('courseId', 'title')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/activity-logs?page=1&limit=25&action=
const getActivityLogs = async (req, res) => {
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
        .skip(skip).limit(limit),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDashboardStats, getPendingInstructors, getAllInstructors,
  approveInstructor, rejectInstructor, getAllUsers, updateUser, deleteUser,
  getAllCourses, getPendingCourses, approveCourse, rejectCourse,
  getCourseLessons, getAllEnrollments, getQoERecords, getActivityLogs,
};