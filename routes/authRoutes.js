// routes/authRoutes.js
const express = require('express');
const router  = express.Router();
const {
  register, login, logout, getMe, updateProfile, changePassword,
  forgotPassword, resetPassword, verifyEmail, resendVerification,
  setup2FA, enable2FA, disable2FA, verify2FA,
} = require('../controllers/authController');
const { protect }                              = require('../middleware/authMiddleware');
const { uploadVerificationDoc, uploadAvatar }  = require('../middleware/uploadMiddleware');
const {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
} = require('../middleware/validationMiddleware');

router.post('/register',             uploadVerificationDoc, validateRegister,    register);
router.post('/login',                validateLogin,                               login);
router.post('/logout',                                                            logout);
router.get ('/verify-email',                                                      verifyEmail);
router.post('/resend-verification',                                               resendVerification);
router.post('/forgot-password',      validateForgotPassword,                      forgotPassword);
router.post('/reset-password',       validateResetPassword,                       resetPassword);
router.get ('/me',                   protect,                                     getMe);
router.patch('/profile',             protect, uploadAvatar,                       updateProfile);
router.patch('/password',            protect, validateChangePassword,             changePassword);

// ── 2FA (TOTP) ────────────────────────────────────────────────────────────────
router.get ('/2fa/setup',            protect,                                     setup2FA);
router.post('/2fa/enable',           protect,                                     enable2FA);
router.post('/2fa/disable',          protect,                                     disable2FA);
router.post('/2fa/verify',                                                        verify2FA); // public — called before session exists

module.exports = router;
