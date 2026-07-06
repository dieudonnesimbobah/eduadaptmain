// routes/chatbotRoute.js
// POST /api/chatbot
// Tries Anthropic Claude first; falls back to local FAQ engine if unavailable.
const express = require('express');
const router  = express.Router();

// ── System prompt (used by Claude when credits are available) ─────────────────
const SYSTEM_PROMPT = `You are EduBot, the friendly AI assistant for EduAdapt — an adaptive e-learning platform for inclusive education in Cameroon.

Help users navigate EduAdapt. Be concise, friendly, and practical. Answer in the same language the user writes in (English or French). Keep answers to 2–5 sentences unless step-by-step instructions are needed.

== ROLES ==
STUDENT: Browse/enroll in courses, watch lessons (video/audio/PDF), take quizzes, track progress.
INSTRUCTOR: Create courses, upload lessons (video direct to Cloudinary), create quizzes, view student progress. Must be approved by admin first.
ADMIN: Approve/reject instructors and courses, manage users, view enrollments and QoE records.

== KEY TASKS ==
Enroll in course: Browse Courses → Enroll button.
Watch lesson: My Courses → Continue → select lesson from right sidebar.
Switch quality: 360p/480p/720p buttons below the video player (auto-adjusts to connection speed).
Switch mode: Video/Audio/PDF buttons above the player. Student chooses — system only suggests.
Download transcript: PDF mode → Download Transcript PDF (AI-generated, takes 30–120 seconds).
Upload lesson (instructor): Lessons → select course → Add Lesson → upload video.
Approve course (admin): Courses section → Approve button.
Approve instructor (admin): Instructors section → Approve button.

== COMMON ISSUES ==
Can't see enrolled courses: Check My Courses in sidebar.
Video won't play: Try 360p button or switch to Audio mode.
Transcript slow: Takes 30–120 seconds — wait and retry.
Course shows pending: Admin needs to approve it.
Upload slow: Compress video to under 50MB with HandBrake (free tool).
Can't enroll: Already enrolled, or course not yet approved.

Always be encouraging and helpful.`;

// ── Local FAQ engine ──────────────────────────────────────────────────────────
const FAQ = [
  // ── Enrollment ──────────────────────────────────────────────────────────────
  {
    keywords: ['enroll', 'enrol', 'enrolment', 'enrollment', 'sign up', 'register for', 'join course', 'join a course', 'subscribe', 'inscrire', 'inscription', 'rejoindre'],
    answer: `To enroll in a course:\n1. Click **Browse Courses** in the sidebar\n2. Find the course you want\n3. Click the **Enroll** button\n4. If it's a paid course, complete payment with MTN or Orange Money\n5. The course will appear under **My Courses** ✅`
  },

  // ── My Courses / can't find course ──────────────────────────────────────────
  {
    keywords: ['my courses', 'mes cours', 'find course', 'where course', 'cant find', "can't find", 'enrolled course', 'missing course', 'course not showing', 'course disappeared'],
    answer: `Your enrolled courses are in the **My Courses** section of the sidebar. If a course is missing:\n• Make sure you completed enrollment (paid if required)\n• Try refreshing the page\n• Contact support if it still doesn't appear`
  },

  // ── Video quality ────────────────────────────────────────────────────────────
  {
    keywords: ['quality', 'low quality', 'bad quality', '360p', '480p', '720p', 'resolution', 'blurry', 'pixelated', 'buffer', 'buffering', 'slow video', 'qualité', 'changer qualité'],
    answer: `To change video quality:\n• Use the **360p / 480p / 720p** buttons below the video player\n• Quality auto-adjusts based on your internet speed\n• If video is slow or buffering, switch to **360p** for a smoother experience\n• You can also switch to **Audio mode** to save data 🎧`
  },

  // ── Video won't play ─────────────────────────────────────────────────────────
  {
    keywords: ['video not playing', 'video not working', "video won't play", 'video wont play', 'cant play', "can't play", 'black screen', 'video error', 'no video', 'lecture ne marche pas'],
    answer: `If the video won't play:\n1. Try clicking **360p** to use the lowest quality\n2. Switch to **Audio** mode (click Audio button above player)\n3. Check your internet connection\n4. Refresh the page and try again\n5. Try a different browser (Chrome or Edge recommended)`
  },

  // ── Switch mode (audio/PDF) ──────────────────────────────────────────────────
  {
    keywords: ['audio mode', 'audio only', 'switch mode', 'change mode', 'pdf mode', 'listen', 'no video', 'save data', 'économiser', 'mode audio'],
    answer: `EduAdapt supports 3 playback modes:\n• **Video** — standard video player\n• **Audio** — audio-only stream (saves data)\n• **PDF** — transcript PDF for offline study\n\nClick the **Video / Audio / PDF** buttons above the player to switch. Your choice is always respected — the system only suggests, never forces a switch.`
  },

  // ── Transcript ───────────────────────────────────────────────────────────────
  {
    keywords: ['transcript', 'download transcript', 'pdf transcript', 'notes', 'offline', 'study offline', 'télécharger', 'transcription'],
    answer: `To get the lesson transcript:\n1. Open the lesson and click **PDF** mode\n2. Click **Download Transcript PDF**\n3. Wait 30–120 seconds (AI-generated)\n4. The PDF will download automatically\n\nYou can also download instructor-uploaded notes if available.`
  },

  // ── Quiz ─────────────────────────────────────────────────────────────────────
  {
    keywords: ['quiz', 'test', 'question', 'assessment', 'exam', 'take quiz', 'where quiz', 'quizz', 'évaluation'],
    answer: `To take a quiz:\n1. Open a lesson in any course\n2. Scroll down to the **Quiz** tab (below the video)\n3. Answer all questions and submit\n\nQuizzes are created by your instructor and help reinforce what you learned 📝`
  },

  // ── Progress ─────────────────────────────────────────────────────────────────
  {
    keywords: ['progress', 'progression', 'how far', 'completion', 'track', 'progrès', 'avancement', 'percent', 'completed'],
    answer: `Track your progress:\n• **My Progress** section in the sidebar shows your overall stats\n• The right sidebar in any lesson shows course progress with a % bar\n• Lessons you've watched are marked with ✓\n• Complete all lessons to reach 100% 🎯`
  },

  // ── Payment ──────────────────────────────────────────────────────────────────
  {
    keywords: ['pay', 'payment', 'price', 'cost', 'fee', 'mtn', 'orange', 'mobile money', 'how much', 'payer', 'frais', 'prix', 'tarif', 'gratuit', 'free course'],
    answer: `Payments on EduAdapt:\n• **Free courses** — enroll directly, no payment needed\n• **Paid courses** — pay with **MTN Mobile Money** or **Orange Money**\n\nSteps:\n1. Click Enroll on a paid course\n2. Choose MTN or Orange Money\n3. Enter your mobile number\n4. Confirm the payment on your phone\n5. You'll be enrolled automatically ✅`
  },

  // ── Create account / register ────────────────────────────────────────────────
  {
    keywords: ['create account', 'sign up', 'register', 'new account', 'how to register', 'créer compte', "s'inscrire", 'nouveau compte'],
    answer: `To create an account:\n1. Go to the **Register** page\n2. Choose your role: **Student** or **Instructor**\n3. Fill in your name, email, and password\n4. Instructors must upload a verification document (ID or teaching certificate)\n5. Check your email and log in 🎓`
  },

  // ── Login issues ─────────────────────────────────────────────────────────────
  {
    keywords: ['login', 'log in', 'cant login', "can't login", 'sign in', 'password wrong', 'forgot password', 'connexion', 'mot de passe', 'oublié'],
    answer: `Login problems:\n• Make sure you selected the correct **role** (Student / Instructor / Administrator)\n• Check your email and password are correct\n• Passwords are case-sensitive\n• If you forgot your password, contact support at **eduadapt92@gmail.com**\n• New instructor accounts must be approved by admin before login is possible`
  },

  // ── Password / profile settings ──────────────────────────────────────────────
  {
    keywords: ['change password', 'update password', 'reset password', 'profile', 'update profile', 'change name', 'change email', 'settings', 'changer mot de passe', 'profil'],
    answer: `To update your profile or password:\n1. Click **Settings** in the sidebar\n2. Update your name, phone, or profile photo under **Profile**\n3. To change your password, use the **Change Password** section\n4. Click Save when done ✅`
  },

  // ── Instructor: create course ────────────────────────────────────────────────
  {
    keywords: ['create course', 'add course', 'new course', 'publish course', 'upload course', 'créer cours', 'ajouter cours', 'nouveau cours'],
    answer: `To create a course (Instructor):\n1. Go to your **Instructor Dashboard**\n2. Click **+ Create New Course**\n3. Fill in the title, description, category, and difficulty\n4. Set it as Free or Paid (with price in XAF)\n5. Upload a thumbnail\n6. Submit — an admin will review and approve it 📚`
  },

  // ── Instructor: upload lesson ────────────────────────────────────────────────
  {
    keywords: ['upload lesson', 'add lesson', 'create lesson', 'upload video', 'add video', 'téléverser', 'ajouter leçon', 'leçon', 'lesson'],
    answer: `To upload a lesson (Instructor):\n1. Go to **Lessons** in the sidebar\n2. Select the course\n3. Click **Add Lesson**\n4. Enter title, description, and order number\n5. Upload your video (MP4, under 50MB recommended)\n6. Optionally add PDF notes or downloadable materials\n7. Click **Upload Lesson** 🎬\n\n💡 Tip: Mark the first 1–2 lessons as **Free Preview** so students can try before enrolling.`
  },

  // ── Instructor: pending/rejected ──────────────────────────────────────────────
  {
    keywords: ['course pending', 'course rejected', 'not approved', 'waiting approval', 'under review', 'cours en attente', 'rejeté', 'approuver'],
    answer: `Course status:\n• **Pending** — your course is waiting for admin review (usually within 24–48 hours)\n• **Rejected** — check the rejection reason in your dashboard and fix the issue, then resubmit\n• **Active** — your course is live and students can enroll\n\nContact the admin if your course has been pending for more than 2 days.`
  },

  // ── Admin: approve instructor ────────────────────────────────────────────────
  {
    keywords: ['approve instructor', 'reject instructor', 'instructor approval', 'instructor request', 'approuver instructeur'],
    answer: `To approve an instructor (Admin):\n1. Go to **Instructors** in the admin sidebar\n2. Find the instructor with **Pending** status\n3. Review their verification document\n4. Click **Approve** or **Reject** with a reason\n\nApproved instructors can log in and start creating courses immediately ✅`
  },

  // ── Admin: approve course ────────────────────────────────────────────────────
  {
    keywords: ['approve course', 'reject course', 'course approval', 'approuver cours', 'publier cours'],
    answer: `To approve a course (Admin):\n1. Go to **Courses** in the admin sidebar\n2. Find the course with **Pending** status\n3. Review the course content and lessons\n4. Click **Approve** to publish or **Reject** with a reason\n\nApproved courses are immediately visible to students in Browse Courses 📋`
  },

  // ── Network / QoE ────────────────────────────────────────────────────────────
  {
    keywords: ['network', 'connection', 'internet', 'slow', 'speed', 'bandwidth', 'qoe', 'connexion', 'lent', 'réseau'],
    answer: `EduAdapt adapts to your connection:\n• The **Network & QoE** section shows your current bandwidth and response time\n• Video quality auto-switches between 360p/480p/720p based on your speed\n• On slow connections, switch to **Audio** mode to save data\n• You can manually override the quality at any time using the quality buttons`
  },

  // ── What is EduAdapt ─────────────────────────────────────────────────────────
  {
    keywords: ['what is eduadapt', 'about eduadapt', "c'est quoi eduadapt", 'platform', 'plateforme', 'explain', 'how does it work'],
    answer: `**EduAdapt** is an adaptive e-learning platform designed for inclusive education in Cameroon 🇨🇲\n\n• **Students** enroll in courses and watch lessons in Video, Audio, or PDF mode\n• **Instructors** create and upload courses with videos, quizzes, and materials\n• **Admins** approve instructors and courses, and manage the platform\n\nThe platform automatically adjusts video quality based on your internet speed, so learning continues even on slow connections.`
  },

  // ── Roles ────────────────────────────────────────────────────────────────────
  {
    keywords: ['role', 'student', 'instructor', 'admin', 'administrator', 'difference', 'rôle', 'étudiant', 'enseignant'],
    answer: `EduAdapt has 3 roles:\n\n👩‍🎓 **Student** — Browse and enroll in courses, watch lessons, take quizzes, track progress\n\n👨‍🏫 **Instructor** — Create courses, upload lessons and quizzes, view student progress (requires admin approval)\n\n🛡️ **Admin** — Approve instructors and courses, manage all users and enrollments`
  },

  // ── Contact / support ────────────────────────────────────────────────────────
  {
    keywords: ['contact', 'support', 'help', 'email', 'problem', 'issue', 'bug', 'report', 'aide', 'problème', 'signaler'],
    answer: `Need more help?\n\n📧 Email support: **eduadapt92@gmail.com**\n\nWhen reporting an issue, please include:\n• Your role (Student/Instructor/Admin)\n• What you were trying to do\n• What error message you saw (if any)\n\nWe aim to respond within 24 hours 🕐`
  },
];

// ── FAQ matching engine ───────────────────────────────────────────────────────
function localFAQReply(userMessage) {
  const msg = userMessage.toLowerCase().replace(/[^a-z0-9\s'éèêëàâùûîïôçæœ]/g, ' ');

  let best = null;
  let bestScore = 0;

  for (const item of FAQ) {
    let score = 0;
    for (const kw of item.keywords) {
      if (msg.includes(kw.toLowerCase())) score += kw.split(' ').length; // longer phrase = higher weight
    }
    if (score > bestScore) { bestScore = score; best = item; }
  }

  if (best && bestScore >= 1) return best.answer;

  // Default fallback
  return `I'm not sure about that specific question. Here are the topics I can help with:\n\n` +
    `• **Enrolling** in a course\n` +
    `• **Video quality** and playback modes (Video/Audio/PDF)\n` +
    `• **Quizzes** and progress tracking\n` +
    `• **Payments** (MTN / Orange Money)\n` +
    `• **Creating courses** (Instructor)\n` +
    `• **Approving** instructors and courses (Admin)\n` +
    `• **Account settings** and password\n` +
    `• **Login** issues\n\n` +
    `Try asking about one of these topics, or email us at **eduadapt92@gmail.com** 📧`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ message: 'messages array is required' });
    }

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // Try Anthropic Claude first if key is configured
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model:      'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system:     SYSTEM_PROMPT,
            messages:   messages.slice(-10),
          }),
        });

        if (response.ok) {
          const data  = await response.json();
          const reply = data.content?.[0]?.text || '';
          if (reply) return res.json({ reply, source: 'claude' });
        }

        // If Claude fails (credits, rate limit, etc.), fall through to local FAQ
        const errData = await response.json().catch(() => ({}));
        console.warn('[chatbot] Claude unavailable:', errData.error?.message || response.status, '— using local FAQ');
      } catch (fetchErr) {
        console.warn('[chatbot] Claude fetch error:', fetchErr.message, '— using local FAQ');
      }
    }

    // Local FAQ fallback
    const reply = localFAQReply(lastUserMessage);
    return res.json({ reply, source: 'local' });

  } catch (error) {
    console.error('Chatbot error:', error.message);
    res.status(500).json({ message: error.message || 'Chatbot unavailable' });
  }
});

module.exports = router;
