// middleware/activityLogger.js - Helper to save activity logs
const ActivityLog = require('../models/ActivityLog');

/**
 * Log a user action to the database
 * @param {Object} params
 * @param {ObjectId} params.userId
 * @param {string} params.role
 * @param {string} params.action
 * @param {string} params.entityType
 * @param {ObjectId} params.entityId
 * @param {string} params.description
 * @param {string} params.ipAddress
 */
const logActivity = async ({ userId, role, action, entityType, entityId, description, ipAddress }) => {
  try {
    await ActivityLog.create({
      userId: userId || null,
      role: role || '',
      action,
      entityType: entityType || '',
      entityId: entityId || null,
      description: description || '',
      ipAddress: ipAddress || '',
    });
  } catch (err) {
    // Log errors should not crash the app
    console.error('Activity log error:', err.message);
  }
};

module.exports = { logActivity };
