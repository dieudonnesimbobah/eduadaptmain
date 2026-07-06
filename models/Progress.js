// models/Progress.js - Tracks student learning progress per course
const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  completedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
  watchedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
  completedMaterials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
  quizCompleted: { type: Boolean, default: false },
  completionPercentage: { type: Number, default: 0 },
  lastAccessedAt: { type: Date, default: Date.now },
}, { timestamps: true });

progressSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);
