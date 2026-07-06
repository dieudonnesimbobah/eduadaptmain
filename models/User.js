// models/User.js - User schema for students, instructors, and admins
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

const userSchema = new mongoose.Schema({
  fullName: {
    type:     String,
    required: [true, 'Full name is required'],
    trim:     true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  email: {
    type:      String,
    required:  [true, 'Email is required'],
    unique:    true,
    lowercase: true,
    trim:      true,
  },
  password: {
    type:      String,
    required:  [true, 'Password is required'],
    minlength: 8,
  },
  role: {
    type:     String,
    enum:     ['student', 'instructor', 'admin'],
    required: [true, 'Role is required'],
  },
  verificationDocument: { type: String, default: null },
  approvalStatus: {
    type:    String,
    enum:    ['pending', 'approved', 'rejected'],
    default: function () {
      return (this.role === 'student' || this.role === 'admin') ? 'approved' : 'pending';
    },
  },
  rejectionReason: { type: String, default: null },
  isActive:        { type: Boolean, default: true },
  avatar:          { type: String, default: null },
  phone:           { type: String, default: null },

  // ── Email Verification ────────────────────────────────────────────────────────
  isEmailVerified:          { type: Boolean, default: false },
  emailVerificationToken:   { type: String,  default: null, select: false },
  emailVerificationExpire:  { type: Date,    default: null, select: false },

  // ── Password Reset ────────────────────────────────────────────────────────────
  resetPasswordToken:   { type: String, default: null, select: false },
  resetPasswordExpire:  { type: Date,   default: null, select: false },

  // ── Two-Factor Authentication (TOTP) ──────────────────────────────────────────
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret:  { type: String,  default: null,  select: false },
}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ role: 1, approvalStatus: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Generate a password-reset token (returns raw token; hashed stored on doc)
userSchema.methods.getResetPasswordToken = function () {
  const raw    = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  this.resetPasswordToken  = hashed;
  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes
  return raw;
};

// Generate an email-verification token (returns raw token; hashed stored on doc)
userSchema.methods.getEmailVerificationToken = function () {
  const raw    = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  this.emailVerificationToken  = hashed;
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return raw;
};

module.exports = mongoose.model('User', userSchema);
