// controllers/authController.js - Registration, login, and profile
const fs       = require('fs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode   = require('qrcode');
const User     = require('../models/User');
const cloudinary   = require('../config/cloudinary');
const generateToken = require('../utils/generateToken');
const { logActivity } = require('../middleware/activityLogger');
const { notifyAdminNewInstructor } = require('../utils/notificationHelper');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../utils/mailer');

// Short-lived JWT used only between credential check and 2FA verification
const generate2FATempToken = (userId) =>
  jwt.sign({ id: String(userId), purpose: '2fa' }, process.env.JWT_SECRET, { expiresIn: '10m' });

const verify2FATempToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.purpose !== '2fa') throw new Error('Invalid token purpose');
  return decoded;
};

// POST /api/auth/register
const register = async (req, res) => {
  let localFilePath = null;
  try {
    const { fullName, email, password, confirmPassword, role } = req.body;

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (role === 'admin') {
      return res.status(403).json({ message: 'Admin registration is not permitted' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    if (role === 'instructor' && !req.file) {
      return res.status(400).json({ message: 'Verification document is required for instructors' });
    }

    // Upload verification document to Cloudinary so it persists on Railway
    let verificationDocUrl = null;
    if (req.file) {
      localFilePath = req.file.path;
      const result = await cloudinary.uploader.upload(localFilePath, {
        folder: 'eduadapt/verification-docs',
        resource_type: 'auto',
      });
      verificationDocUrl = result.secure_url;
      fs.unlink(localFilePath, () => {}); // delete local temp file
      localFilePath = null;
    }

    // Students are auto-verified — they are pre-approved and can log in immediately.
    // Instructors must verify email because their account also requires admin review.
    const isStudent = role === 'student';

    const userData = {
      fullName, email, password, role,
      approvalStatus:  isStudent ? 'approved' : 'pending',
      isEmailVerified: isStudent,
      verificationDocument: verificationDocUrl,
    };

    const user = await User.create(userData);

    // ── Send verification / welcome email (non-blocking — never blocks login) ──
    if (!isStudent) {
      const rawVerifyToken = user.getEmailVerificationToken();
      await user.save({ validateBeforeSave: false });
      const verifyUrl = `${process.env.APP_URL}/verify-email.html?token=${rawVerifyToken}`;
      sendVerificationEmail({ email: user.email, fullName: user.fullName, verifyUrl });
    }

    // ── Notify all admins when a new instructor registers ──────────────────
    if (role === 'instructor') {
      const adminIds = await User.find({ role: 'admin' }).distinct('_id');
      await notifyAdminNewInstructor({
        adminIds,
        instructorName: fullName,
        instructorId:   user._id,
      });
    }

    await logActivity({
      userId: user._id, role: user.role, action: 'REGISTER',
      entityType: 'User', entityId: user._id,
      description: `New ${role} registered: ${email}`, ipAddress: req.ip,
    });

    res.status(201).json({
      message: role === 'instructor'
        ? 'Registration successful. Check your email to verify your address, then wait for admin approval.'
        : 'Registration successful! You can now log in.',
      user: {
        _id: user._id, fullName: user.fullName,
        email: user.email, role: user.role, approvalStatus: user.approvalStatus,
      },
    });
  } catch (error) {
    // Clean up local temp file if Cloudinary upload failed mid-way
    if (localFilePath) fs.unlink(localFilePath, () => {});
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Email, password and role are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.role !== role) {
      return res.status(401).json({ message: `No ${role} account found with this email` });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated' });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: 'Please verify your email before logging in. Check your inbox or request a new verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    if (user.role === 'instructor') {
      if (user.approvalStatus === 'pending') {
        return res.status(403).json({ message: 'Your instructor account is awaiting administrator approval.' });
      }
      if (user.approvalStatus === 'rejected') {
        return res.status(403).json({ message: 'Your instructor account was rejected. Please contact the administrator.' });
      }
    }

    // If 2FA is enabled, issue a short-lived temp token instead of a full session
    if (user.twoFactorEnabled) {
      return res.json({
        requires2FA: true,
        tempToken:   generate2FATempToken(user._id),
      });
    }

    const token = generateToken(user._id);

    await logActivity({
      userId: user._id, role: user.role, action: 'LOGIN',
      entityType: 'User', entityId: user._id,
      description: `${user.role} logged in: ${email}`, ipAddress: req.ip,
    });

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('ea_token', token, {
      httpOnly: true,
      secure:   isProduction,
      sameSite: isProduction ? 'Strict' : 'Lax',
      maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      token, // kept for backward compat with any API clients
      user: {
        _id: user._id, fullName: user.fullName, email: user.email,
        role: user.role, approvalStatus: user.approvalStatus,
        avatar: user.avatar, phone: user.phone,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/auth/profile
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { fullName, phone } = req.body;
    if (fullName) user.fullName = fullName;
    user.phone = phone || user.phone;

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'eduadapt/avatars',
        transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
      });
      fs.unlink(req.file.path, () => {});
      user.avatar = result.secure_url;
    }

    await user.save();

    await logActivity({
      userId: user._id, role: user.role, action: 'UPDATE_PROFILE',
      entityType: 'User', entityId: user._id,
      description: `User updated profile: ${user.email}`, ipAddress: req.ip,
    });

    res.json({
      message: 'Profile updated successfully',
      user: {
        _id: user._id, fullName: user.fullName, email: user.email,
        role: user.role, approvalStatus: user.approvalStatus,
        avatar: user.avatar, phone: user.phone,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/auth/password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All password fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New passwords do not match' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    await logActivity({
      userId: user._id, role: user.role, action: 'CHANGE_PASSWORD',
      entityType: 'User', entityId: user._id,
      description: `User changed password: ${user.email}`, ipAddress: req.ip,
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/auth/verify-email?token=
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'Verification token is required' });

    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken:  hashed,
      emailVerificationExpire: { $gt: Date.now() },
    }).select('+emailVerificationToken +emailVerificationExpire');

    if (!user) {
      return res.status(400).json({ message: 'Verification link is invalid or has expired. Please request a new one.' });
    }

    user.isEmailVerified         = true;
    user.emailVerificationToken  = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });

    await logActivity({
      userId: user._id, role: user.role, action: 'VERIFY_EMAIL',
      entityType: 'User', entityId: user._id,
      description: `Email verified: ${user.email}`, ipAddress: req.ip,
    });

    res.json({ message: 'Email verified successfully! You can now log in.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/resend-verification
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+emailVerificationToken +emailVerificationExpire');

    // Always succeed to prevent enumeration
    if (!user || user.isEmailVerified) {
      return res.json({ message: 'If that email exists and is unverified, a new link has been sent.' });
    }

    const rawToken = user.getEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${process.env.APP_URL}/verify-email.html?token=${rawToken}`;
    sendVerificationEmail({ email: user.email, fullName: user.fullName, verifyUrl });

    res.json({ message: 'If that email exists and is unverified, a new link has been sent.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const rawToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.APP_URL}/reset-password.html?token=${rawToken}`;
    await sendPasswordResetEmail({ email: user.email, fullName: user.fullName, resetUrl });

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Token, new password and confirmation are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken:  hashed,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+resetPasswordToken +resetPasswordExpire');

    if (!user) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired. Please request a new one.' });
    }

    user.password            = newPassword;
    user.resetPasswordToken  = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    await logActivity({
      userId: user._id, role: user.role, action: 'RESET_PASSWORD',
      entityType: 'User', entityId: user._id,
      description: `Password reset for: ${user.email}`, ipAddress: req.ip,
    });

    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/auth/2fa/setup — generate a TOTP secret + QR code (does NOT save yet)
const setup2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    if (user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is already enabled on this account.' });
    }

    const secret = speakeasy.generateSecret({
      name:   `EduAdapt (${user.email})`,
      length: 20,
    });

    // Return QR code as data URL — secret is NOT persisted until enable2FA confirms it
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.json({
      secret:       secret.base32,
      qrCodeDataUrl,
      manualKey:    secret.base32, // for users who can't scan
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/2fa/enable — verify TOTP code, then save secret and turn on 2FA
const enable2FA = async (req, res) => {
  try {
    const { secret, code } = req.body;
    if (!secret || !code) {
      return res.status(400).json({ message: 'Secret and verification code are required.' });
    }

    const valid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token:    code.replace(/\s/g, ''),
      window:   1, // allow 30s clock drift
    });

    if (!valid) {
      return res.status(400).json({ message: 'Invalid verification code. Check your authenticator app and try again.' });
    }

    const user = await User.findById(req.user._id);
    user.twoFactorSecret  = secret;
    user.twoFactorEnabled = true;
    await user.save();

    await logActivity({
      userId: user._id, role: user.role, action: '2FA_ENABLED',
      entityType: 'User', entityId: user._id,
      description: `${user.email} enabled 2FA`, ipAddress: req.ip,
    });

    res.json({ message: 'Two-factor authentication has been enabled successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/2fa/disable — requires current password + valid TOTP code
const disable2FA = async (req, res) => {
  try {
    const { password, code } = req.body;
    if (!password || !code) {
      return res.status(400).json({ message: 'Password and authenticator code are required.' });
    }

    const user = await User.findById(req.user._id).select('+password +twoFactorSecret');
    if (!user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is not enabled on this account.' });
    }

    const passwordOk = await user.matchPassword(password);
    if (!passwordOk) {
      return res.status(401).json({ message: 'Incorrect password.' });
    }

    const codeOk = speakeasy.totp.verify({
      secret:   user.twoFactorSecret,
      encoding: 'base32',
      token:    code.replace(/\s/g, ''),
      window:   1,
    });
    if (!codeOk) {
      return res.status(400).json({ message: 'Invalid authenticator code.' });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret  = null;
    await user.save();

    await logActivity({
      userId: user._id, role: user.role, action: '2FA_DISABLED',
      entityType: 'User', entityId: user._id,
      description: `${user.email} disabled 2FA`, ipAddress: req.ip,
    });

    res.json({ message: 'Two-factor authentication has been disabled.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/2fa/verify — second step of login when 2FA is required
const verify2FA = async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ message: 'Temp token and authenticator code are required.' });
    }

    let decoded;
    try {
      decoded = verify2FATempToken(tempToken);
    } catch {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }

    const user = await User.findById(decoded.id).select('+twoFactorSecret');
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ message: 'Invalid 2FA state.' });
    }

    const valid = speakeasy.totp.verify({
      secret:   user.twoFactorSecret,
      encoding: 'base32',
      token:    code.replace(/\s/g, ''),
      window:   1,
    });
    if (!valid) {
      return res.status(400).json({ message: 'Invalid authenticator code. Try again.' });
    }

    const token = generateToken(user._id);

    await logActivity({
      userId: user._id, role: user.role, action: 'LOGIN',
      entityType: 'User', entityId: user._id,
      description: `${user.role} logged in with 2FA: ${user.email}`, ipAddress: req.ip,
    });

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('ea_token', token, {
      httpOnly: true,
      secure:   isProduction,
      sameSite: isProduction ? 'Strict' : 'Lax',
      maxAge:   30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token,
      user: {
        _id: user._id, fullName: user.fullName, email: user.email,
        role: user.role, approvalStatus: user.approvalStatus,
        avatar: user.avatar, phone: user.phone,
        twoFactorEnabled: true,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/logout
const logout = (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('ea_token', {
    httpOnly: true,
    secure:   isProduction,
    sameSite: isProduction ? 'Strict' : 'Lax',
  });
  res.json({ message: 'Logged out successfully' });
};

module.exports = { register, login, logout, getMe, updateProfile, changePassword, forgotPassword, resetPassword, verifyEmail, resendVerification, setup2FA, enable2FA, disable2FA, verify2FA };