// tests/models.test.js — User model unit tests (no DB connection needed for most)
require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const mongoose = require('mongoose');
const User     = require('../models/User');

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
});

afterAll(async () => {
  await User.deleteMany({ email: /^test_model_jest_/i });
  await mongoose.connection.close();
});

describe('User model', () => {
  it('hashes password before save', async () => {
    const user = new User({
      fullName: 'Model Test User',
      email:    'test_model_jest_hash@example.com',
      password: 'Password1',
      role:     'student',
    });
    await user.save();
    expect(user.password).not.toBe('Password1');
    expect(user.password.startsWith('$2')).toBe(true); // bcrypt hash
  });

  it('matchPassword returns true for correct password', async () => {
    const user = await User.findOne({ email: 'test_model_jest_hash@example.com' });
    const match = await user.matchPassword('Password1');
    expect(match).toBe(true);
  });

  it('matchPassword returns false for wrong password', async () => {
    const user = await User.findOne({ email: 'test_model_jest_hash@example.com' });
    const match = await user.matchPassword('WrongPassword');
    expect(match).toBe(false);
  });

  it('getResetPasswordToken returns raw token and sets hashed version', async () => {
    const user = await User.findOne({ email: 'test_model_jest_hash@example.com' }).select('+resetPasswordToken +resetPasswordExpire');
    const raw  = user.getResetPasswordToken();
    expect(typeof raw).toBe('string');
    expect(raw.length).toBe(64); // hex string from 32 bytes
    expect(user.resetPasswordToken).toBeDefined();
    expect(user.resetPasswordToken).not.toBe(raw); // stored version is hashed
    expect(user.resetPasswordExpire).toBeInstanceOf(Date);
    expect(user.resetPasswordExpire.getTime()).toBeGreaterThan(Date.now());
  });

  it('requires email to be unique', async () => {
    const dup = new User({
      fullName: 'Duplicate',
      email:    'test_model_jest_hash@example.com',
      password: 'Password1',
      role:     'student',
    });
    await expect(dup.save()).rejects.toThrow();
  });

  it('requires role to be a valid enum', async () => {
    const user = new User({
      fullName: 'Bad Role',
      email:    'test_model_jest_badrole@example.com',
      password: 'Password1',
      role:     'superuser',
    });
    await expect(user.save()).rejects.toThrow();
  });

  it('sets approvalStatus to approved for students', async () => {
    const user = new User({
      fullName: 'Auto Approved',
      email:    'test_model_jest_approved@example.com',
      password: 'Password1',
      role:     'student',
    });
    await user.save();
    expect(user.approvalStatus).toBe('approved');
  });

  it('sets approvalStatus to pending for instructors', async () => {
    const user = new User({
      fullName: 'Pending Instructor',
      email:    'test_model_jest_instructor@example.com',
      password: 'Password1',
      role:     'instructor',
    });
    await user.save();
    expect(user.approvalStatus).toBe('pending');
  });
});
