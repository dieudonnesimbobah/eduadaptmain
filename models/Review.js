// models/Review.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  comment: {
    type: String,
    maxlength: 1000,
    default: '',
  },
  category: {
    type: String,
    enum: ['overall', 'ui_ux', 'content', 'performance', 'support'],
    default: 'overall',
  },
}, { timestamps: true });

// One review per user — upsert on submit
reviewSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
