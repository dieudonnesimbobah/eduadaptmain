# EduAdapt – Adaptive E-Learning Platform

**"Design and Implementation of an Adaptive E-Learning Platform Based on Quality of Experience for Inclusive Education in Cameroon"**

---

## 📁 Project Structure

```
eduadapt/
├── server.js                      # Express entry point
├── package.json
├── .env                           # Environment variables
├── config/
│   └── db.js                      # MongoDB connection
├── models/                        # Mongoose schemas
│   ├── User.js
│   ├── Course.js
│   ├── Lesson.js
│   ├── Enrollment.js
│   ├── Quiz.js
│   ├── QuizResult.js
│   ├── Progress.js
│   ├── QoERecord.js
│   └── ActivityLog.js
├── middleware/
│   ├── authMiddleware.js           # JWT verify
│   ├── roleMiddleware.js           # Role-based access
│   ├── instructorApprovalMiddleware.js
│   ├── uploadMiddleware.js         # Multer config
│   └── activityLogger.js          # Audit log helper
├── controllers/
│   ├── authController.js
│   ├── adminController.js
│   ├── instructorController.js
│   ├── studentController.js
│   ├── qoeController.js
│   └── videoController.js
├── routes/
│   ├── authRoutes.js
│   ├── adminRoutes.js
│   ├── instructorRoutes.js
│   ├── studentRoutes.js
│   ├── qoeRoutes.js
│   ├── videoRoutes.js
│   └── activityLogRoutes.js
├── utils/
│   ├── generateToken.js           # JWT signing
│   ├── adaptiveEngine.js          # QoE adaptive rules
│   ├── ffmpegProcessor.js         # Video processing
│   └── seedAdmin.js               # Admin account seed
├── uploads/                       # File storage
│   ├── verification-documents/
│   ├── thumbnails/
│   ├── videos/
│   ├── processed-videos/
│   ├── audios/
│   ├── pdfs/
│   └── materials/
└── public/                        # Frontend
    ├── index.html                 # Homepage
    ├── login.html
    ├── register.html
    ├── student-dashboard.html
    ├── student-course.html
    ├── instructor-dashboard.html
    ├── admin-dashboard.html
    ├── css/
    │   └── style.css
    └── js/
        ├── auth.js
        ├── student.js
        ├── instructor.js
        ├── admin.js
        ├── qoe.js
        └── adaptiveVideo.js
```

---

## ⚙️ Environment Variables

Copy `.env` and set your values:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/eduadapt
JWT_SECRET=your_super_secret_jwt_key_here
ADMIN_EMAIL=admin@eduadapt.com
ADMIN_PASSWORD=Admin@1234
ADMIN_NAME=EduAdapt Administrator
CLIENT_URL=http://localhost:5000
```

> Railway deployment note: when using MongoDB Atlas, make sure your cluster allows access from Railway's outbound IPs. For testing, add `0.0.0.0/0` to Atlas Network Access temporarily or configure the proper IP access list and SRV connection string.

---

## 🚀 Running Locally

### Prerequisites
- **Node.js** v18+
- **MongoDB** running locally or MongoDB Atlas URI
- **FFmpeg** installed on system (`brew install ffmpeg` / `apt install ffmpeg`)

### Steps

```bash
# 1. Clone or extract project
cd eduadapt

# 2. Install dependencies
npm install

# 3. Set environment variables
cp .env.example .env
# Edit .env with your values

# 4. Seed the admin account
node utils/seedAdmin.js

# 5. Start the server
npm start

# Or for development with auto-reload:
npm run dev
```

Server runs at: **http://localhost:50001**

---

## 🌐 Pages

| Page | URL |
|------|-----|
| Homepage | http://localhost:5000 |
| Login | http://localhost:5000/login.html |
| Register | http://localhost:5000/register.html |
| Student Dashboard | http://localhost:5000/student-dashboard.html |
| Student Course Player | http://localhost:5000/student-course.html?courseId=... |
| Instructor Dashboard | http://localhost:5000/instructor-dashboard.html |
| Admin Dashboard | http://localhost:5000/admin-dashboard.html |

---

## 🚂 Railway Deployment

### Steps

1. Push project to GitHub

2. Create new Railway project → **Deploy from GitHub repo**

3. Add environment variables in Railway dashboard:
   - `MONGO_URI` → your MongoDB Atlas connection string
   - `JWT_SECRET` → random secure string
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`
   - `CLIENT_URL` → your Railway public URL (e.g. `https://eduadapt.up.railway.app`)
   - `PORT` → Railway sets this automatically

4. Railway auto-detects Node.js and runs `npm start`

5. Run admin seed via Railway console:
   ```bash
   node utils/seedAdmin.js
   ```

### Notes
- **FFmpeg** is included via `ffmpeg-static` npm package — no system install needed on Railway
- **File uploads** use local disk storage. For production, replace `multer` dest with **Cloudinary** or **AWS S3**
- MongoDB should use **MongoDB Atlas** for Railway deployments (local MongoDB won't work)

---

## 📡 API Reference

### Auth
```
POST   /api/auth/register       Register student or instructor
POST   /api/auth/login          Login (role-based redirect)
GET    /api/auth/me             Get current user
```

### Admin
```
GET    /api/admin/dashboard-stats
GET    /api/admin/instructors
PATCH  /api/admin/instructors/:id/approve
PATCH  /api/admin/instructors/:id/reject
GET    /api/admin/users
PATCH  /api/admin/users/:id           Toggle isActive
DELETE /api/admin/users/:id           Deactivate
GET    /api/admin/courses
GET    /api/admin/pending-courses
PATCH  /api/admin/courses/:id/approve
PATCH  /api/admin/courses/:id/reject
GET    /api/admin/courses/:courseId/lessons
GET    /api/admin/enrollments
GET    /api/admin/qoe-records
GET    /api/admin/activity-logs
```

### Instructor
```
GET    /api/instructor/dashboard
POST   /api/instructor/courses         Create course
GET    /api/instructor/courses
GET    /api/instructor/courses/:id
PUT    /api/instructor/courses/:id
DELETE /api/instructor/courses/:id
POST   /api/instructor/courses/:courseId/lessons   Upload lesson + video
GET    /api/instructor/courses/:courseId/lessons
GET    /api/instructor/lessons/:lessonId
GET    /api/instructor/courses/:courseId/students
GET    /api/instructor/courses/:courseId/progress
POST   /api/instructor/courses/:courseId/quizzes
GET    /api/instructor/courses/:courseId/quizzes
```

### Student
```
GET    /api/student/dashboard
GET    /api/student/courses            Approved+published courses
GET    /api/student/courses/:id
POST   /api/student/courses/:courseId/enroll
GET    /api/student/enrollments
GET    /api/student/courses/:courseId/lessons
GET    /api/student/lessons/:lessonId
POST   /api/student/progress
GET    /api/student/progress/:courseId
POST   /api/student/quizzes/:quizId/submit
GET    /api/student/recommendations
```

### QoE
```
POST   /api/qoe/record               Submit QoE measurement
GET    /api/qoe/course/:courseId
GET    /api/qoe/my-records
```

### Video
```
GET    /api/video/ffmpeg-check        Check FFmpeg status
POST   /api/video/process-lesson-video
```

---

## 🧪 Testing Checklist

### ✅ Student Testing
- [ ] Register as student → auto-approved
- [ ] Login as student → redirected to student-dashboard.html
- [ ] View available approved courses
- [ ] Enroll in a course
- [ ] Open course player (student-course.html)
- [ ] Play video at 360p / 480p / 720p
- [ ] Switch to audio mode
- [ ] Download PDF lesson notes
- [ ] Complete a lesson → progress updates
- [ ] Submit quiz → score displayed + difficulty recommendation
- [ ] Check QoE panel → bandwidth measured
- [ ] Verify adaptive recommendation changes with poor network simulation

### ✅ Instructor Testing
- [ ] Register as instructor (upload verification document)
- [ ] Login as instructor → blocked with "awaiting approval" message
- [ ] Admin approves instructor
- [ ] Instructor logs in → redirected to instructor-dashboard.html
- [ ] Create a new course → status shows "pending"
- [ ] Admin approves course
- [ ] Course appears as "approved" in instructor dashboard
- [ ] Add a lesson with video upload
- [ ] Wait for FFmpeg processing → verify 360p/480p/720p files appear in uploads/processed-videos/
- [ ] Audio MP3 appears in uploads/audios/
- [ ] Create a quiz with multiple questions
- [ ] View enrolled students (only from own courses)
- [ ] Preview lesson video from dashboard

### ✅ Admin Testing
- [ ] Seed admin: `node utils/seedAdmin.js`
- [ ] Login with admin credentials → redirected to admin-dashboard.html
- [ ] View dashboard stats (users, courses, pending, enrollments)
- [ ] View pending instructor list
- [ ] View instructor verification document
- [ ] Approve an instructor
- [ ] Reject an instructor with reason
- [ ] View pending course queue
- [ ] Approve a course
- [ ] Reject a course with reason
- [ ] View all users → filter by role
- [ ] Deactivate a user
- [ ] View all enrollments
- [ ] Play lesson video from admin dashboard
- [ ] View QoE records with bandwidth stats
- [ ] View activity logs (all system events)

### ✅ FFmpeg Testing
- [ ] Visit `GET /api/video/ffmpeg-check` → returns FFmpeg version
- [ ] Upload a lesson video as instructor
- [ ] Check `uploads/processed-videos/` for 360p, 480p, 720p files
- [ ] Check `uploads/audios/` for MP3 file
- [ ] Open student-course.html → quality buttons (360p/480p/720p) work

### ✅ Course Approval Workflow
- [ ] Instructor creates course → status: pending
- [ ] Students cannot see pending course
- [ ] Admin approves → status: approved, isPublished: true
- [ ] Students can now see and enroll in course
- [ ] Admin rejects with reason → instructor sees rejection + reason
- [ ] Enrolled students see only their approved courses

### ✅ Enrollment Testing
- [ ] Student enrolls in approved course → enrollment created
- [ ] Progress record created on enrollment
- [ ] Duplicate enrollment blocked (409 error)
- [ ] Student cannot enroll in pending/rejected course

### ✅ Activity Logs Testing
- [ ] Register → log: REGISTER
- [ ] Login → log: LOGIN
- [ ] Approve instructor → log: APPROVE_INSTRUCTOR
- [ ] Create course → log: CREATE_COURSE
- [ ] Enroll → log: ENROLL
- [ ] Submit quiz → log: SUBMIT_QUIZ
- [ ] QoE record → log: QOE_RECORD
- [ ] All logs visible in admin → Activity Logs section

---

## 🧠 Adaptive Engine Logic

```
Bandwidth ≥ 5 Mbps   → 720p video
Bandwidth 2–5 Mbps   → 480p video
Bandwidth 1–2 Mbps   → 360p video
Bandwidth < 1 Mbps   → Audio mode recommended
Interruptions ≥ 3    → PDF notes recommended

Quiz ≥ 70%           → Advanced difficulty content
Quiz 50–70%          → Intermediate content
Quiz < 50%           → Beginner / easier content
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS |
| Backend | Node.js, Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Video | FFmpeg (ffmpeg-static) |
| File Upload | Multer |
| Hosting | Railway |

---

## 📌 Notes for Final Year Project

- The adaptive engine in `utils/adaptiveEngine.js` implements the QoE-based decision rules for inclusive education
- QoE records track bandwidth, response time, interruptions, and adaptive decisions per session
- Activity logs provide a full audit trail for research analysis
- The system supports students in low-bandwidth environments (Cameroon context) by gracefully downgrading to audio or PDF mode
- All three user roles (student, instructor, admin) have separate isolated dashboards with role-enforced API access

---
<!-- ================================= Updates ======================================== -->
== ADD THESE LINES TO server.js (with your other routes) ==

// Payment routes
app.use('/api/payments', require('./routes/paymentRoutes'));

// Wallet + Revenue routes (covers /api/instructor/wallet, /api/admin/revenue etc)
app.use('/api', require('./routes/walletRoutes'));

// Popular courses endpoint (add to studentRoutes.js — see below)


== ADD THIS TO routes/studentRoutes.js ==

// GET /api/student/courses/popular — courses sorted by enrollment count
router.get('/courses/popular', async (req, res) => {
  try {
    const Course     = require('../models/Course');
    const Enrollment = require('../models/Enrollment');
    const courses = await Course.find({ approvalStatus: 'approved', isPublished: true })
      .populate('instructorId', 'fullName').lean();

    const withCounts = await Promise.all(courses.map(async (c) => {
      const count = await Enrollment.countDocuments({ courseId: c._id });
      return { ...c, enrollmentCount: count };
    }));

    withCounts.sort((a, b) => b.enrollmentCount - a.enrollmentCount);
    res.json(withCounts.slice(0, 12));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});


== ADD THESE ENV VARS TO RAILWAY ==

FAPSHI_API_USER=your_fapshi_api_user
FAPSHI_API_KEY=your_fapshi_api_key
APP_URL=https://your-app.up.railway.app
PLATFORM_FEE_PERCENT=20


== ADD theme-lang.js TO EVERY HTML PAGE ==
Add before </body> on every page:
<script src="./js/theme-lang.js"></script>

Pages to update:
- public/index.html          ← already done (in output)
- public/login.html          ← add the script tag
- public/register.html       ← add the script tag
- public/student-dashboard.html     ← add the script tag
- public/student-course.html        ← add the script tag
- public/instructor-dashboard.html  ← add the script tag
- public/admin-dashboard.html       ← add the script tag


== UPDATE Course model to add pricing fields ==
In models/Course.js add these fields to the schema:

  isFree: { type: Boolean, default: true },
  price:  { type: Number, default: 0 },     // in XAF


== UPDATE Lesson model to add free preview field ==
In models/Lesson.js add:

  isFree: { type: Boolean, default: false }, // free preview lesson


== UPDATE instructorController.js createCourse and addLesson ==
In createCourse, add to Course.create():
  isFree: req.body.isFree !== 'false' && req.body.isFree !== false,
  price:  parseInt(req.body.price) || 0,

In addLesson, add to Lesson.create():
  isFree: req.body.isFree === 'true' || req.body.isFree === true,


== UPDATE studentController.js enrollInCourse ==
Replace the enroll logic with payment check:

const enrollInCourse = async (req, res) => {
  const courseId  = req.params.courseId;
  const studentId = req.user._id;
  const course = await Course.findOne({ _id: courseId, approvalStatus: 'approved', isPublished: true });
  if (!course) return res.status(404).json({ message: 'Course not available' });
  const existing = await Enrollment.findOne({ studentId, courseId });
  if (existing) return res.status(400).json({ message: 'Already enrolled in this course' });
  if (!course.isFree && course.price > 0) {
    // Paid course — return payment required signal
    return res.status(402).json({
      message: 'Payment required',
      paymentRequired: true,
      price: course.price,
      courseId: course._id,
      courseTitle: course.title,
    });
  }
  // Free course — enroll directly
  await Enrollment.create({ studentId, courseId, instructorId: course.instructorId });
  await Progress.create({ studentId, courseId, completionPercentage: 0 });
  res.status(201).json({ message: 'Enrolled successfully', enrollment });
};

*EduAdapt © 2026 – Adaptive E-Learning for Inclusive Education in Cameroon*
