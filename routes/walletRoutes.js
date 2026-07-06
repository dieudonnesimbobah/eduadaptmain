// routes/walletRoutes.js
const express = require('express');
const router  = express.Router();
const {
  getInstructorWallet, requestWithdrawal,
  getAdminRevenue, approveWithdrawal, rejectWithdrawal, adminWithdraw,
} = require('../controllers/walletController');
const { protect }                   = require('../middleware/authMiddleware');
const { authorizeRoles }            = require('../middleware/roleMiddleware');
const { requireApprovedInstructor } = require('../middleware/instructorApprovalMiddleware');

// Instructor
router.get('/instructor/wallet',   protect, authorizeRoles('instructor'), requireApprovedInstructor, getInstructorWallet);
router.post('/instructor/withdraw',protect, authorizeRoles('instructor'), requireApprovedInstructor, requestWithdrawal);

// Admin
router.get('/admin/revenue',                   protect, authorizeRoles('admin'), getAdminRevenue);
router.post('/admin/withdrawals/:id/approve',  protect, authorizeRoles('admin'), approveWithdrawal);
router.post('/admin/withdrawals/:id/reject',   protect, authorizeRoles('admin'), rejectWithdrawal);
router.post('/admin/withdraw',                 protect, authorizeRoles('admin'), adminWithdraw);

module.exports = router;