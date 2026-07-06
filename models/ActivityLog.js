// models/ActivityLog.js - System-wide activity audit log
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  role: { type: String, default: '' },
  action: { type: String, required: true },
  entityType: { type: String, default: '' },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  description: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1 });
activityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
