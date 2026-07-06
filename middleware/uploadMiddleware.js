// middleware/uploadMiddleware.js - Multer configuration with local storage
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// ── Local Storage ──────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
ensureDir(uploadsDir);

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    cb(null, `${timestamp}-${random}${path.extname(file.originalname)}`);
  },
});

// ── Upload Instances ──────────────────────────────────────────────────────────

// Instructor registration: verification document (PDF or image)
const uploadVerificationDoc = multer({
  storage: localStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
}).single('verificationDocument');

// Course thumbnail (image only)
const uploadThumbnail = multer({
  storage: localStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image format'));
  },
});

// Profile avatar (image only)
const uploadAvatar = multer({
  storage: localStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image format'));
  },
}).single('avatar');

// Lesson files: video + pdf + downloadable material in a single request
const uploadLessonFiles = multer({
  storage: localStorage,
  limits: { 
    fileSize: 500 * 1024 * 1024,  // 500 MB (covers large videos)
    files: 3,                       // Max 3 files
  },
}).fields([
  { name: 'video',    maxCount: 1 },
  { name: 'pdf',      maxCount: 1 },
  { name: 'material', maxCount: 1 },
]);

module.exports = {
  uploadVerificationDoc,
  uploadThumbnail,
  uploadAvatar,
  uploadLessonFiles,
};