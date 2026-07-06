// models/Lesson.js - Lesson schema with Cloudinary storage
const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Lesson title is required'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  order: {
    type: Number,
    default: 0,
  },
  duration: {
    type: String,
    default: '0:00',
  },

  // ── Free preview ──────────────────────────────────────────────────────────
  // If true, any student can watch this lesson without paying.
  // Instructors use this to offer lesson 1 or 2 as a free preview.
  isFree: { type: Boolean, default: false },

  // ── Cloudinary video ──────────────────────────────────────────────────────
  videoOriginal:  { type: String, default: null },
  videoPublicId:  { type: String, default: null },

  videoQualities: {
    quality360p: { type: String, default: null },
    quality480p: { type: String, default: null },
    quality720p: { type: String, default: null },
  },

  audioVersion: { type: String, default: null },

  // ── PDF notes ─────────────────────────────────────────────────────────────
  pdfNote:     { type: String, default: null },
  pdfPublicId: { type: String, default: null },

  // ── Downloadable materials ────────────────────────────────────────────────
  downloadableMaterials: [
    {
      title:    { type: String },
      fileUrl:  { type: String },
      publicId: { type: String },
      fileType: { type: String },
    },
  ],

  // ── Processing status ─────────────────────────────────────────────────────
  processingStatus: {
    type:    String,
    enum:    ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },

}, { timestamps: true });

module.exports = mongoose.model('Lesson', lessonSchema);