// models/Course.js - Course schema
const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Course title is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Course description is required'],
  },
  category: {
    type: String,
    trim: true,
  },
  difficultyLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner',
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  thumbnail: {
    type: String,
    default: null,
  },
  thumbnailPublicId: {
    type: String,
    default: null,
  },
  // Admin must approve before students can see it
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  isPublished: {
    type: Boolean,
    default: false,
  },
  rejectionReason: {
    type: String,
    default: null,
  },

  // ── Pricing (XAF) ─────────────────────────────────────────────────────────
  isFree: { type: Boolean, default: true  },  // true = no payment needed
  price:  { type: Number,  default: 0     },  // price in XAF (0 if free)

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
courseSchema.index({ approvalStatus: 1, isPublished: 1 });
courseSchema.index({ instructorId: 1, approvalStatus: 1 });
courseSchema.index({ category: 1 });
courseSchema.index({ title: 'text', description: 'text' }); // full-text search

module.exports = mongoose.model('Course', courseSchema);