// models/Wallet.js
// One wallet per instructor + one for the platform (admin)
const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  // owner: instructor userId OR 'platform' for the admin wallet
  ownerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ownerType: { type: String, enum: ['instructor', 'platform'], required: true },

  balance:        { type: Number, default: 0 },   // available to withdraw (XAF)
  totalEarned:    { type: Number, default: 0 },   // all-time earnings
  totalWithdrawn: { type: Number, default: 0 },   // all-time withdrawals

}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);