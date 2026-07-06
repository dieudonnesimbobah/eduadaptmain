// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Who receives this notification
  recipientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipientRole: { type: String, enum: ['student', 'instructor', 'admin'], required: true },

  // What type of notification
  type: {
    type: String,
    enum: [
      'enrollment',        // student enrolled in instructor's course
      'course_approved',   // admin approved instructor's course
      'course_rejected',   // admin rejected instructor's course
      'lesson_added',      // instructor added a lesson to enrolled course
      'quiz_available',    // new quiz added to enrolled course
      'payment_received',  // instructor received payment
      'withdrawal_approved', // admin approved instructor withdrawal
      'withdrawal_rejected', // admin rejected instructor withdrawal
      'new_course',        // admin notified of new course pending approval
      'new_instructor',    // admin notified of new instructor pending approval
    ],
    required: true,
  },

  title:   { type: String, required: true },
  message: { type: String, required: true },

  // Where to navigate when clicked
  link: { type: String, default: null },

  read: { type: Boolean, default: false },

  // Optional reference to related entity
  entityType: { type: String },
  entityId:   { type: mongoose.Schema.Types.ObjectId },

}, { timestamps: true });

// Index for fast unread count queries
notificationSchema.index({ recipientId: 1, read: 1 });
notificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);