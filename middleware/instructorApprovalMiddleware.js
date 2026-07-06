// middleware/instructorApprovalMiddleware.js - Block pending/rejected instructors
const requireApprovedInstructor = (req, res, next) => {
  if (req.user.role !== 'instructor') return next();

  if (req.user.approvalStatus === 'pending') {
    return res.status(403).json({
      message: 'Your instructor account is awaiting administrator approval.',
    });
  }

  if (req.user.approvalStatus === 'rejected') {
    return res.status(403).json({
      message: 'Your instructor account was rejected. Please contact the administrator.',
    });
  }

  next();
};

module.exports = { requireApprovedInstructor };
