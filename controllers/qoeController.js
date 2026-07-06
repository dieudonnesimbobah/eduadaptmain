// controllers/qoeController.js - Quality of Experience tracking
const QoERecord = require('../models/QoERecord');
const { determineAdaptiveDecision } = require('../utils/adaptiveEngine');
const { logActivity } = require('../middleware/activityLogger');

// POST /api/qoe/record
const createQoERecord = async (req, res) => {
  try {
    const { courseId, lessonId, bandwidthSpeed, responseTime, sessionInterruptions, selectedMode, selectedVideoQuality } = req.body;

    const adaptive = determineAdaptiveDecision({
      bandwidthSpeed: parseFloat(bandwidthSpeed) || 0,
      responseTime: parseFloat(responseTime) || 0,
      sessionInterruptions: parseInt(sessionInterruptions) || 0,
    });

    const record = await QoERecord.create({
      studentId: req.user._id,
      courseId: courseId || null,
      lessonId: lessonId || null,
      bandwidthSpeed: parseFloat(bandwidthSpeed) || 0,
      responseTime: parseFloat(responseTime) || 0,
      sessionInterruptions: parseInt(sessionInterruptions) || 0,
      selectedMode: selectedMode || adaptive.mode,
      selectedVideoQuality: selectedVideoQuality || adaptive.quality,
      adaptiveDecision: adaptive.decision,
    });

    await logActivity({
      userId: req.user._id,
      role: req.user.role,
      action: 'QOE_RECORD',
      entityType: 'QoERecord',
      entityId: record._id,
      description: `QoE record: ${adaptive.decision}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ record, adaptive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/qoe/course/:courseId
const getCourseQoE = async (req, res) => {
  try {
    const records = await QoERecord.find({ studentId: req.user._id, courseId: req.params.courseId })
      .sort({ createdAt: -1 }).limit(20);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/qoe/my-records
const getMyQoERecords = async (req, res) => {
  try {
    const records = await QoERecord.find({ studentId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { createQoERecord, getCourseQoE, getMyQoERecords };
