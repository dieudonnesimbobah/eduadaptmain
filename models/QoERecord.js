// models/QoERecord.js - Quality of Experience records for adaptive decisions
const mongoose = require('mongoose');

const qoeRecordSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null,
  },
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    default: null,
  },
  bandwidthSpeed: { type: Number, default: 0 }, // Mbps
  responseTime: { type: Number, default: 0 },   // ms
  sessionInterruptions: { type: Number, default: 0 },
  selectedMode: {
    type: String,
    enum: ['video', 'audio', 'pdf'],
    default: 'video',
  },
  selectedVideoQuality: {
    type: String,
    enum: ['360p', '480p', '720p', null],
    default: null,
  },
  adaptiveDecision: { type: String, default: '' },
}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
qoeRecordSchema.index({ studentId: 1, createdAt: -1 });
qoeRecordSchema.index({ courseId: 1 });

module.exports = mongoose.model('QoERecord', qoeRecordSchema);
