// tests/auth.test.js — Auth route integration tests
require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const request  = require('supertest');
const mongoose = require('mongoose');
const express  = require('express');
const User     = require('../models/User');

// ── Minimal app for testing (no Cloudinary check, no mailer) ─────────────────
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  return app;
};

let app;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  app = buildApp();
  // Clean up test users before suite
  await User.deleteMany({ email: /^test_jest_/i });
});

afterAll(async () => {
  await User.deleteMany({ email: /^test_jest_/i });
  await mongoose.connection.close();
});

// ── Registration ──────────────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  it('registers a new student successfully', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName:        'Test Jest Student',
      email:           'test_jest_student@example.com',
      password:        'Password1',
      confirmPassword: 'Password1',
      role:            'student',
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/registration successful/i);
  });

  it('rejects duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName:        'Test Jest Dup',
      email:           'test_jest_student@example.com',
      password:        'Password1',
      confirmPassword: 'Password1',
      role:            'student',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email already registered/i);
  });

  it('rejects mismatched passwords', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName:        'Test Jest Mismatch',
      email:           'test_jest_mismatch@example.com',
      password:        'Password1',
      confirmPassword: 'Different1',
      role:            'student',
    });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/do not match/i);
  });

  it('rejects short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName:        'Test Jest Short',
      email:           'test_jest_short@example.com',
      password:        'abc',
      confirmPassword: 'abc',
      role:            'student',
    });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/8 characters/i);
  });

  it('rejects admin role registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName:        'Test Jest Admin',
      email:           'test_jest_admin@example.com',
      password:        'Password1',
      confirmPassword: 'Password1',
      role:            'admin',
    });
    expect([400, 403, 422]).toContain(res.status);
  });

  it('rejects invalid email format', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName:        'Test Jest Bad Email',
      email:           'not-an-email',
      password:        'Password1',
      confirmPassword: 'Password1',
      role:            'student',
    });
    expect(res.status).toBe(422);
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email:    'test_jest_student@example.com',
      password: 'Password1',
      role:     'student',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('student');
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email:    'test_jest_student@example.com',
      password: 'WrongPass1',
      role:     'student',
    });
    expect(res.status).toBe(401);
  });

  it('rejects wrong role', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email:    'test_jest_student@example.com',
      password: 'Password1',
      role:     'instructor',
    });
    expect(res.status).toBe(401);
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'test_jest_student@example.com' });
    expect(res.status).toBe(422);
  });
});

// ── Forgot Password ───────────────────────────────────────────────────────────
describe('POST /api/auth/forgot-password', () => {
  it('returns success for existing email (anti-enumeration)', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'test_jest_student@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link/i);
  });

  it('returns same success message for non-existent email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'test_jest_nonexistent@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link/i);
  });

  it('rejects invalid email format', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });
});

// ── Reset Password ────────────────────────────────────────────────────────────
describe('POST /api/auth/reset-password', () => {
  it('rejects invalid token', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({
      token:           'invalid_token_here',
      newPassword:     'NewPassword1',
      confirmPassword: 'NewPassword1',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  it('rejects mismatched passwords', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({
      token:           'some_token',
      newPassword:     'NewPassword1',
      confirmPassword: 'DifferentPassword1',
    });
    expect(res.status).toBe(422);
  });
});

// ── GET /api/auth/me (protected) ──────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid_token_here');
    expect(res.status).toBe(401);
  });
});
