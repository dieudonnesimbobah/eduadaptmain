// models/Payment.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  studentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Amounts in XAF
  amount:           { type: Number, required: true },   // total paid by student
  platformFee:      { type: Number, required: true },   // platform's cut
  instructorAmount: { type: Number, required: true },   // instructor's cut

  platformFeePercent: { type: Number, default: 20 },    // % taken by platform

  // Fapshi payment details
  reference:    { type: String, unique: true },         // Fapshi transaction ID
  phone:        { type: String },                       // student's Mobile Money number
  provider:     { type: String, enum: ['mtn', 'orange'] },

  status: {
    type: String,
    enum: ['pending', 'successful', 'failed', 'refunded'],
    default: 'pending',
  },

  paidAt: Date,

}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);