// utils/notificationHelper.js
// Call these functions from controllers to create notifications automatically.
const Notification = require('../models/Notification');

const createNotification = async ({ recipientId, recipientRole, type, title, message, link, entityType, entityId }) => {
  try {
    await Notification.create({ recipientId, recipientRole, type, title, message, link, entityType, entityId });
  } catch (e) {
    console.warn('Failed to create notification:', e.message);
  }
};

// ── Enrollment: notify instructor when student enrolls ────────────────────────
const notifyEnrollment = async ({ instructorId, studentName, courseTitle, courseId }) => {
  await createNotification({
    recipientId:   instructorId,
    recipientRole: 'instructor',
    type:          'enrollment',
    title:         'New Enrollment',
    message:       `${studentName} enrolled in your course "${courseTitle}"`,
    link:          '/instructor-dashboard.html?section=students',
    entityType:    'Course',
    entityId:      courseId,
  });
};

// ── Course approved: notify instructor ───────────────────────────────────────
const notifyCourseApproved = async ({ instructorId, courseTitle, courseId }) => {
  await createNotification({
    recipientId:   instructorId,
    recipientRole: 'instructor',
    type:          'course_approved',
    title:         'Course Approved ✅',
    message:       `Your course "${courseTitle}" has been approved and is now live!`,
    link:          '/instructor-dashboard.html?section=courses',
    entityType:    'Course',
    entityId:      courseId,
  });
};

// ── Course rejected: notify instructor ───────────────────────────────────────
const notifyCourseRejected = async ({ instructorId, courseTitle, courseId, reason }) => {
  await createNotification({
    recipientId:   instructorId,
    recipientRole: 'instructor',
    type:          'course_rejected',
    title:         'Course Rejected',
    message:       `Your course "${courseTitle}" was rejected${reason ? ': ' + reason : '.'}`,
    link:          '/instructor-dashboard.html?section=courses',
    entityType:    'Course',
    entityId:      courseId,
  });
};

// ── Lesson added: notify all enrolled students ────────────────────────────────
const notifyLessonAdded = async ({ enrolledStudentIds, courseTitle, lessonTitle, courseId }) => {
  const notifications = enrolledStudentIds.map(studentId => ({
    recipientId:   studentId,
    recipientRole: 'student',
    type:          'lesson_added',
    title:         'New Lesson Available',
    message:       `New lesson "${lessonTitle}" added to "${courseTitle}"`,
    link:          '/student-course.html?courseId=' + courseId,
    entityType:    'Course',
    entityId:      courseId,
  }));
  try {
    if (notifications.length) await Notification.insertMany(notifications);
  } catch (e) {
    console.warn('Failed to create lesson notifications:', e.message);
  }
};

// ── New course pending: notify all admins ─────────────────────────────────────
const notifyAdminNewCourse = async ({ adminIds, instructorName, courseTitle, courseId }) => {
  const notifications = adminIds.map(adminId => ({
    recipientId:   adminId,
    recipientRole: 'admin',
    type:          'new_course',
    title:         'New Course Pending Approval',
    message:       `${instructorName} submitted "${courseTitle}" for review`,
    link:          '/admin-dashboard.html?section=courses',
    entityType:    'Course',
    entityId:      courseId,
  }));
  try {
    if (notifications.length) await Notification.insertMany(notifications);
  } catch (e) {
    console.warn('Failed to create admin course notifications:', e.message);
  }
};

// ── New instructor pending: notify all admins ─────────────────────────────────
const notifyAdminNewInstructor = async ({ adminIds, instructorName, instructorId }) => {
  const notifications = adminIds.map(adminId => ({
    recipientId:   adminId,
    recipientRole: 'admin',
    type:          'new_instructor',
    title:         'New Instructor Registration',
    message:       `${instructorName} registered as an instructor and is awaiting approval`,
    link:          '/admin-dashboard.html?section=instructors',
    entityType:    'User',
    entityId:      instructorId,
  }));
  try {
    if (notifications.length) await Notification.insertMany(notifications);
  } catch (e) {
    console.warn('Failed to create admin instructor notifications:', e.message);
  }
};

// ── Payment received: notify instructor ──────────────────────────────────────
const notifyPaymentReceived = async ({ instructorId, studentName, courseTitle, amount }) => {
  await createNotification({
    recipientId:   instructorId,
    recipientRole: 'instructor',
    type:          'payment_received',
    title:         'Payment Received 💰',
    message:       `${studentName} paid ${amount.toLocaleString()} XAF for "${courseTitle}"`,
    link:          '/instructor-dashboard.html?section=wallet',
  });
};

// ── Withdrawal approved/rejected: notify instructor ───────────────────────────
const notifyWithdrawalResult = async ({ instructorId, approved, amount }) => {
  await createNotification({
    recipientId:   instructorId,
    recipientRole: 'instructor',
    type:          approved ? 'withdrawal_approved' : 'withdrawal_rejected',
    title:         approved ? 'Withdrawal Approved ✅' : 'Withdrawal Rejected',
    message:       approved
      ? `Your withdrawal of ${amount.toLocaleString()} XAF has been processed.`
      : `Your withdrawal of ${amount.toLocaleString()} XAF was rejected. Balance refunded.`,
    link:          '/instructor-dashboard.html?section=wallet',
  });
};

// ── New course published: notify all students ─────────────────────────────────
const notifyStudentsNewCourse = async ({ studentIds, instructorName, courseTitle, courseId, isFree, price }) => {
  const priceText = isFree || !price ? 'Free' : price.toLocaleString() + ' XAF';
  const notifications = studentIds.map(studentId => ({
    recipientId:   studentId,
    recipientRole: 'student',
    type:          'new_course',
    title:         'New Course Available 🎓',
    message:       `${instructorName} just published "${courseTitle}" — ${priceText}`,
    link:          '/student-dashboard.html?section=browse',
    entityType:    'Course',
    entityId:      courseId,
  }));
  try {
    if (notifications.length) await Notification.insertMany(notifications);
  } catch (e) {
    console.warn('Failed to notify students of new course:', e.message);
  }
};

module.exports = {
  createNotification,
  notifyEnrollment,
  notifyCourseApproved,
  notifyCourseRejected,
  notifyLessonAdded,
  notifyAdminNewCourse,
  notifyAdminNewInstructor,
  notifyPaymentReceived,
  notifyWithdrawalResult,
  notifyStudentsNewCourse,
};