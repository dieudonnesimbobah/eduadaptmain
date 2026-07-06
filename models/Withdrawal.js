// models/Withdrawal.js
const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  ownerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ownerType: { type: String, enum: ['instructor', 'platform'] },

  amount:   { type: Number, required: true },
  phone:    { type: String, required: true },   // Mobile Money number to pay to
  provider: { type: String, enum: ['mtn', 'orange'], required: true },

  status: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'rejected'],
    default: 'pending',
  },

  note: String,   // admin note on approval/rejection

}, { timestamps: true });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);