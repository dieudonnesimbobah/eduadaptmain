// server.js - EduAdapt main Express server (Cloudinary edition)
require('dotenv').config();

// Force IPv4 DNS resolution — Railway containers lack IPv6 outbound connectivity
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path         = require('path');
const connectDB    = require('./config/db');
const { protect }  = require('./middleware/authMiddleware');

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined. Add JWT_SECRET=<your-secret> to your .env file.');
  process.exit(1);
}

if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.error('❌ CLOUDINARY_CLOUD_NAME is not defined. Add Cloudinary variables to your .env / Railway variables.');
  process.exit(1);
}

const { verifyMailer } = require('./utils/mailer');

const autoSeedAdmin = async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_NAME) return;
  try {
    const User = require('./models/User');
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) return;
    await User.create({
      fullName: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD,
      role: 'admin', approvalStatus: 'approved', isActive: true, isEmailVerified: true,
    });
    console.log(`✅ Admin account created: ${ADMIN_EMAIL}`);
  } catch (e) {
    console.warn('⚠️  Auto-seed admin failed:', e.message);
  }
};

const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error('❌ Failed to start due to MongoDB connection failure.');
    process.exit(1);
  }

  await autoSeedAdmin();

  verifyMailer();

  const app = express();

  // ─── Security Headers (Helmet) ────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:    ["'self'"],
        scriptSrc:     ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: null,    // remove directive — inline event handlers governed by script-src 'unsafe-inline'
        styleSrc:      ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
        fontSrc:       ["'self'", 'fonts.gstatic.com', 'fonts.googleapis.com'],
        imgSrc:        ["'self'", 'data:', 'res.cloudinary.com', 'blob:'],
        connectSrc:    ["'self'", 'res.cloudinary.com', 'api.cloudinary.com',
                        'api.assemblyai.com', 'api.anthropic.com',
                        'api.fapshi.com', 'sandbox.fapshi.com',
                        'fonts.googleapis.com', 'fonts.gstatic.com'],
        mediaSrc:      ["'self'", 'res.cloudinary.com', 'blob:'],
        frameSrc:      ["'none'"],
        objectSrc:     ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // ─── CORS ─────────────────────────────────────────────────────────────────────
  const allowed = new Set([
    'http://localhost:5000',
    'http://localhost:5001',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
    'http://localhost:5500',
    'http://localhost:5501',
    'https://localhost:5000',
    'https://localhost:5001',
    'https://127.0.0.1:5500',
    'https://127.0.0.1:5501',
  ]);

  if (process.env.CLIENT_URL) {
    process.env.CLIENT_URL.split(',').forEach(u => allowed.add(u.trim()));
  }

  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // same-origin / curl

      const isRailway = /\.railway\.app$/.test(origin) || /\.up\.railway\.app$/.test(origin);
      if (isRailway || allowed.has(origin)) return callback(null, true);

      // Reject unknown origins in production; allow in dev
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error(`CORS: origin "${origin}" not allowed`));
      }
      console.warn(`CORS: unlisted origin "${origin}" — allowed in dev mode.`);
      callback(null, true);
    },
    credentials: true,
    methods:      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  };

  // Trust Railway's reverse proxy so rate-limiter sees real client IPs
  app.set('trust proxy', 1);

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // ─── Rate Limiting ────────────────────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { message: 'Too many attempts from this IP. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { message: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/api/health'),
  });

  app.use('/api/auth/login',           authLimiter);
  app.use('/api/auth/register',        authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/',                     apiLimiter);

  // ─── Request Timeout (large video uploads need 5 min) ────────────────────────
  app.use((req, res, next) => {
    req.setTimeout(5 * 60 * 1000);
    res.setTimeout(5 * 60 * 1000);
    next();
  });

  // Reduced body limits — Multer handles multipart (videos); JSON payloads need 10mb max
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // ─── Static Files ─────────────────────────────────────────────────────────────
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // ─── Health Check (before API rate limiter skip) ──────────────────────────────
  app.get('/api/health', (req, res) => {
    res.json({ status: 'EduAdapt API is running', timestamp: new Date().toISOString() });
  });

  // ─── API Routes ───────────────────────────────────────────────────────────────
  app.use('/api/auth',          require('./routes/authRoutes'));
  app.use('/api/admin',         require('./routes/adminRoutes'));
  app.use('/api/instructor',    require('./routes/instructorRoutes'));
  app.use('/api/student',       require('./routes/studentRoutes'));
  app.use('/api/qoe',           require('./routes/qoeRoutes'));
  app.use('/api/video',         require('./routes/videoRoutes'));
  app.use('/api/activity-logs', require('./routes/activityLogRoutes'));
  app.use('/api/transcript',    require('./routes/transcriptRoutes'));
  app.use('/api/chatbot',       require('./routes/chatbotRoute'));
  app.use('/api/public',        require('./routes/publicRoutes'));
  app.use('/api/payments',      require('./routes/paymentRoutes'));
  app.use('/api/notifications', require('./routes/notificationRoutes'));
  app.use('/api/reviews',       require('./routes/reviewRoutes'));
  app.use('/api',               require('./routes/walletRoutes'));

  // ─── Global Error Handler ─────────────────────────────────────────────────────
  app.use((err, req, res, next) => {
    console.error('🔴 Server Error:', {
      message: err.message,
      code:    err.code,
      url:     req.originalUrl,
      method:  req.method,
    });

    if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ message: 'File is too large (max 500MB)' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: 'Too many files' });
    if (err.code === 'LIMIT_PART_COUNT') return res.status(400).json({ message: 'Too many form fields' });

    // CORS errors
    if (err.message && err.message.startsWith('CORS:')) {
      return res.status(403).json({ message: err.message });
    }

    res.status(err.status || 500).json({
      message: err.message || 'Internal server error',
      code:    err.code,
    });
  });

  // ─── Catch-all SPA Route (keep AFTER all /api routes) ────────────────────────
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ─── Start Server ─────────────────────────────────────────────────────────────
  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, () => {
    console.log(`🚀 EduAdapt server running on port ${PORT}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
    } else {
      console.error('❌ Server error:', error);
    }
    process.exit(1);
  });
};

startServer();
