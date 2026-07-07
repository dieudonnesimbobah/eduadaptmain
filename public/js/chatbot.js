// public/js/chatbot.js — EduAdapt AI Assistant
// Uses the Anthropic Claude API via your backend proxy endpoint.
// Works on all pages: homepage, student dashboard, instructor dashboard, admin dashboard.

(function () {
  // ── System prompt — teaches Claude about EduAdapt ──────────────────────────
  const SYSTEM_PROMPT = `You are EduBot, the friendly AI assistant for EduAdapt — an adaptive e-learning platform designed for inclusive education in Cameroon.

Your job is to help users understand and navigate EduAdapt. Be concise, friendly, and practical. Always answer in the same language the user writes in (English or French).

== PLATFORM OVERVIEW ==
EduAdapt is an adaptive learning platform that automatically adjusts video quality based on the student's internet connection. It supports three learning modes: Video, Audio, and PDF Transcript.

== USER ROLES ==
1. STUDENT
   - Browse and enroll in courses from the Browse Courses section
   - Access enrolled courses from My Courses or Dashboard
   - Watch lessons in Video mode (quality auto-adjusts: 360p/480p/720p)
   - Switch to Audio mode to listen instead of watching
   - Download PDF transcripts (auto-generated from video using AI)
   - Take quizzes to test knowledge
   - Track progress in the My Progress section
   - View network quality in the Network & QoE section

2. INSTRUCTOR
   - Register and wait for admin approval before creating courses
   - Create courses from the My Courses section
   - Add lessons by uploading videos (direct to Cloudinary — fast upload)
   - Upload PDF notes and downloadable materials per lesson
   - Create quizzes with multiple-choice questions
   - View enrolled students and their progress
   - Monitor course approval status (pending/approved/rejected)

3. ADMIN
   - Approve or reject instructor registrations
   - Approve or reject courses before they go live to students
   - View all users, enrollments, QoE records, and activity logs
   - Manage user accounts (activate/deactivate/delete)

== HOW TO DO COMMON TASKS ==

STUDENT TASKS:
- Enroll in a course: Go to Browse Courses → click Enroll on any course
- Watch a lesson: Go to My Courses → click Continue → select a lesson from the right sidebar
- Switch video quality: Use the 360p/480p/720p buttons below the video player
- Switch to audio: Click the "Audio" mode button above the video
- Download transcript PDF: Click "PDF" mode → click "Download Transcript PDF"
- Take a quiz: Open a lesson → click the Quiz tab at the bottom
- Check progress: Go to My Progress in the sidebar

INSTRUCTOR TASKS:
- Create a course: Go to My Courses → click "+ Create New Course"
- Add a lesson: Go to Lessons → select a course → click "+ Add Lesson" → upload video
- Create a quiz: Go to Quizzes → select a course → click "+ Create Quiz" → add questions
- Check students: Go to Students section or click Lessons → select course

ADMIN TASKS:
- Approve instructor: Go to Instructors section → click Approve next to pending instructor
- Approve course: Go to Courses section → click Approve next to pending course
- View enrollments: Go to Enrollments section
- View QoE data: Go to QoE Records section

== ADAPTIVE SYSTEM ==
- The platform automatically measures the student's internet bandwidth
- Video quality adjusts automatically (720p for fast connections, 360p for slow)
- Students can manually override quality using the quality buttons
- Students choose their own mode (Video/Audio/PDF) — the system only suggests

== COMMON ISSUES ==
- "I can't see my enrolled courses": Go to My Courses in the sidebar. Make sure you enrolled successfully.
- "Video won't play": Try clicking the 360p quality button. Or switch to Audio mode.
- "Transcript not downloading": The AI transcription takes 30–120 seconds. Wait and try again.
- "My course shows pending": An admin needs to approve it. Check back later.
- "Upload is slow": Videos under 50MB upload fastest. Use HandBrake to compress large videos.
- "I can't enroll": The course may not be approved yet, or you may already be enrolled.

Always be helpful, encouraging, and keep answers short (2–5 sentences max unless a step-by-step is needed).`;

  // ── State ──────────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'edubot_history';
  const MAX_STORED  = 40; // keep last 40 messages (20 exchanges)

  const loadHistory = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };

  const saveHistory = (msgs) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_STORED)));
    } catch { /* storage full — skip silently */ }
  };

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    messages = [];
  };

  let messages      = loadHistory(); // conversation history (persisted)
  let isOpen        = false;
  let isTyping      = false;
  let ttsEnabled    = false;

  // ── Inject CSS ─────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #edubot-fab {
      position:fixed; bottom:24px; right:24px; z-index:9999;
      width:56px; height:56px; border-radius:50%;
      background:linear-gradient(135deg,#2563eb,#7c3aed);
      border:none; cursor:pointer; box-shadow:0 4px 20px rgba(37,99,235,0.4);
      display:flex; align-items:center; justify-content:center;
      font-size:1.6rem; transition:transform 0.2s, box-shadow 0.2s;
      color:#fff;
    }
    #edubot-fab:hover { transform:scale(1.1); box-shadow:0 6px 28px rgba(37,99,235,0.5); }
    #edubot-fab .badge {
      position:absolute; top:-4px; right:-4px;
      background:#ef4444; color:#fff; border-radius:50%;
      width:18px; height:18px; font-size:0.65rem; font-weight:700;
      display:flex; align-items:center; justify-content:center;
      display:none;
    }

    #edubot-window {
      position:fixed; bottom:92px; right:24px; z-index:9998;
      width:360px; height:520px; border-radius:16px;
      background:#fff; box-shadow:0 8px 40px rgba(0,0,0,0.18);
      display:flex; flex-direction:column; overflow:hidden;
      transform:scale(0.85) translateY(20px); opacity:0;
      transform-origin:bottom right;
      transition:transform 0.25s cubic-bezier(.34,1.56,.64,1), opacity 0.2s;
      pointer-events:none;
    }
    #edubot-window.open {
      transform:scale(1) translateY(0); opacity:1; pointer-events:all;
    }

    #edubot-header {
      background:linear-gradient(135deg,#2563eb,#7c3aed);
      color:#fff; padding:14px 16px;
      display:flex; align-items:center; gap:10px;
      flex-shrink:0;
    }
    #edubot-header .avatar {
      width:36px; height:36px; border-radius:50%;
      background:rgba(255,255,255,0.2);
      display:flex; align-items:center; justify-content:center;
      font-size:1.2rem; flex-shrink:0;
    }
    #edubot-header .info { flex:1; }
    #edubot-header .name { font-weight:700; font-size:0.95rem; }
    #edubot-header .status { font-size:0.72rem; opacity:0.85; }
    #edubot-header .close-btn {
      background:none; border:none; color:#fff; cursor:pointer;
      font-size:1.2rem; padding:4px; border-radius:4px; opacity:0.8;
      transition:opacity 0.15s;
    }
    #edubot-header .close-btn:hover { opacity:1; }

    #edubot-messages {
      flex:1; overflow-y:auto; padding:14px 12px;
      display:flex; flex-direction:column; gap:10px;
      background:#f8fafc;
    }
    #edubot-messages::-webkit-scrollbar { width:4px; }
    #edubot-messages::-webkit-scrollbar-track { background:transparent; }
    #edubot-messages::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:2px; }

    .edubot-msg {
      max-width:82%; word-wrap:break-word; font-size:0.875rem; line-height:1.5;
      padding:10px 13px; border-radius:14px; animation:msgIn 0.2s ease;
    }
    @keyframes msgIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }

    .edubot-msg.bot {
      background:#fff; color:#1e293b;
      border:1px solid #e2e8f0; border-bottom-left-radius:4px;
      align-self:flex-start; box-shadow:0 1px 3px rgba(0,0,0,0.06);
    }
    .edubot-msg.user {
      background:linear-gradient(135deg,#2563eb,#7c3aed);
      color:#fff; border-bottom-right-radius:4px;
      align-self:flex-end;
    }

    .edubot-typing {
      align-self:flex-start; background:#fff; border:1px solid #e2e8f0;
      border-radius:14px; border-bottom-left-radius:4px;
      padding:10px 14px; display:flex; gap:5px; align-items:center;
    }
    .edubot-typing span {
      width:7px; height:7px; border-radius:50%; background:#94a3b8;
      animation:bounce 1.2s infinite;
    }
    .edubot-typing span:nth-child(2) { animation-delay:0.2s; }
    .edubot-typing span:nth-child(3) { animation-delay:0.4s; }
    @keyframes bounce {
      0%,60%,100% { transform:translateY(0); }
      30%          { transform:translateY(-6px); }
    }

    .edubot-suggestions {
      display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;
    }
    .edubot-suggestion {
      background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;
      border-radius:20px; padding:4px 10px; font-size:0.75rem;
      cursor:pointer; transition:background 0.15s;
      white-space:nowrap;
    }
    .edubot-suggestion:hover { background:#dbeafe; }

    #edubot-input-row {
      padding:10px 12px; border-top:1px solid #e2e8f0;
      display:flex; gap:8px; align-items:flex-end; background:#fff;
      flex-shrink:0;
    }
    #edubot-input {
      flex:1; border:1px solid #e2e8f0; border-radius:20px;
      padding:9px 14px; font-size:0.875rem; resize:none;
      max-height:100px; min-height:38px; outline:none;
      font-family:inherit; line-height:1.4; color:#1e293b;
      transition:border-color 0.15s;
    }
    #edubot-input:focus { border-color:#2563eb; }
    #edubot-send {
      width:38px; height:38px; border-radius:50%; flex-shrink:0;
      background:linear-gradient(135deg,#2563eb,#7c3aed);
      border:none; cursor:pointer; color:#fff; font-size:1rem;
      display:flex; align-items:center; justify-content:center;
      transition:transform 0.15s, opacity 0.15s;
    }
    #edubot-send:hover { transform:scale(1.08); }
    #edubot-send:disabled { opacity:0.5; cursor:not-allowed; transform:none; }

    @media (max-width: 480px) {
      #edubot-window { width:calc(100vw - 24px); right:12px; bottom:80px; height:70vh; }
      #edubot-fab    { right:12px; bottom:16px; }
    }
  `;
  document.head.appendChild(style);

  // ── Inject HTML ────────────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.innerHTML = `
    <button id="edubot-fab"
            aria-label="Open AI chat assistant EduBot"
            aria-expanded="false"
            aria-controls="edubot-window">
      <i class="fas fa-robot"></i>
      <div class="badge" id="edubot-badge" aria-hidden="true">1</div>
    </button>

    <div id="edubot-window"
         role="dialog"
         aria-modal="false"
         aria-label="EduBot AI Study Assistant"
         aria-live="off">
      <div id="edubot-header">
        <div class="avatar" aria-hidden="true"><i class="fas fa-robot"></i></div>
        <div class="info">
          <div class="name">EduBot</div>
          <div class="status">● Online — here to help</div>
        </div>
        <button class="close-btn" id="edubot-clear" aria-label="Clear chat history" title="Clear chat"
          style="font-size:0.75rem;margin-right:4px;"><i class="fas fa-trash"></i></button>
        <button class="close-btn" id="edubot-close" aria-label="Close EduBot chat"><i class="fas fa-times"></i></button>
      </div>

      <div id="edubot-messages"
           role="log"
           aria-live="polite"
           aria-atomic="false"
           aria-label="Chat messages"></div>

      <div id="edubot-input-row">
        <button id="tts-toggle"
                aria-label="Enable text-to-speech for AI responses"
                aria-pressed="false"
                style="background:none;border:1px solid #e2e8f0;border-radius:20px;padding:4px 10px;font-size:0.75rem;cursor:pointer;color:#64748b;white-space:nowrap;flex-shrink:0;">
          <i class="fas fa-volume-high"></i> Read aloud
        </button>
        <textarea id="edubot-input"
                  placeholder="Ask me anything…"
                  aria-label="Type your question to the AI assistant"
                  rows="1"></textarea>
        <button id="edubot-send" aria-label="Send message to AI assistant"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const fab      = document.getElementById('edubot-fab');
  const win      = document.getElementById('edubot-window');
  const closeBtn = document.getElementById('edubot-close');
  const msgList  = document.getElementById('edubot-messages');
  const input    = document.getElementById('edubot-input');
  const sendBtn  = document.getElementById('edubot-send');
  const badge    = document.getElementById('edubot-badge');

  // ── TTS helper ─────────────────────────────────────────────────────────────
  const speak = (text) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ''));
    utterance.lang  = 'en-US';
    utterance.rate  = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  // ── Toggle open/close ──────────────────────────────────────────────────────
  const restoreMessages = () => {
    if (!messages.length) return;
    messages.forEach(m => {
      if (m.role === 'user')      addUserMessage(m.content);
      else if (m.role === 'assistant') addBotMessage(m.content);
    });
  };

  let historyRestored = false;

  const openChat = () => {
    isOpen = true;
    win.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');
    badge.style.display = 'none';
    input.focus();
    if (!historyRestored) {
      historyRestored = true;
      if (messages.length) restoreMessages();
      else showWelcome();
    }
    scrollBottom();
  };

  const closeChat = () => {
    isOpen = false;
    win.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  };

  fab.addEventListener('click', () => isOpen ? closeChat() : openChat());
  closeBtn.addEventListener('click', closeChat);

  const clearBtn = document.getElementById('edubot-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearHistory();
      msgList.innerHTML = '';
      showWelcome();
    });
  }

  // Escape key closes chat
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeChat();
  });

  // ── TTS toggle button ─────────────────────────────────────────────────────
  const ttsBtn = document.getElementById('tts-toggle');
  if (ttsBtn) {
    ttsBtn.addEventListener('click', () => {
      ttsEnabled = !ttsEnabled;
      ttsBtn.setAttribute('aria-pressed', String(ttsEnabled));
      ttsBtn.innerHTML   = ttsEnabled ? '<i class="fas fa-volume-high"></i> Reading: ON' : '<i class="fas fa-volume-high"></i> Read aloud';
    });
  }

  // ── Welcome message + suggestions ─────────────────────────────────────────
  const showWelcome = () => {
    const suggestions = [
      'How do I enroll in a course?',
      'How do I upload a lesson?',
      'Why is my video quality low?',
      'How do I download a transcript?',
      'How do I approve a course?',
    ];
    addBotMessage(
      "Hi! I'm **EduBot**, your EduAdapt assistant. I can help you navigate the platform, fix issues, and explain features.\n\nWhat would you like to know?",
      suggestions
    );
  };

  // ── Render a bot message ───────────────────────────────────────────────────
  const addBotMessage = (text, suggestions = []) => {
    const div = document.createElement('div');
    div.className = 'edubot-msg bot';
    div.innerHTML = formatText(text);

    if (suggestions.length) {
      const row = document.createElement('div');
      row.className = 'edubot-suggestions';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', 'Suggested questions');
      suggestions.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'edubot-suggestion';
        btn.textContent = s;
        btn.setAttribute('aria-label', 'Ask: ' + s);
        btn.addEventListener('click', () => sendMessage(s));
        row.appendChild(btn);
      });
      div.appendChild(row);
    }

    msgList.appendChild(div);
    speak(text);
    scrollBottom();
  };

  // ── Render a user message ──────────────────────────────────────────────────
  const addUserMessage = (text) => {
    const div = document.createElement('div');
    div.className = 'edubot-msg user';
    div.textContent = text;
    msgList.appendChild(div);
    scrollBottom();
  };

  // ── Typing indicator ───────────────────────────────────────────────────────
  let typingEl = null;
  const showTyping = () => {
    typingEl = document.createElement('div');
    typingEl.className = 'edubot-typing';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
    msgList.appendChild(typingEl);
    scrollBottom();
  };
  const hideTyping = () => {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  };

  // ── Format text (bold, newlines) ───────────────────────────────────────────
  const formatText = (text) => {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  };

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  const scrollBottom = () => {
    setTimeout(() => { msgList.scrollTop = msgList.scrollHeight; }, 50);
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    text = (text || input.value).trim();
    if (!text || isTyping) return;

    input.value = '';
    input.style.height = 'auto';
    addUserMessage(text);

    messages.push({ role: 'user', content: text });
    saveHistory(messages);

    isTyping = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const token   = typeof getToken === 'function' ? getToken() : null;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const res = await fetch('/api/chatbot', {
        method:  'POST',
        headers,
        body: JSON.stringify({ messages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to get response');
      }

      const data   = await res.json();
      const reply  = data.reply || 'Sorry, I could not generate a response.';

      messages.push({ role: 'assistant', content: reply });
      saveHistory(messages);

      hideTyping();
      addBotMessage(reply);

    } catch (e) {
      hideTyping();
      addBotMessage('<i class="fas fa-triangle-exclamation"></i> Sorry, I\'m having trouble connecting right now. Please try again in a moment.');
      console.error('EduBot error:', e);
    } finally {
      isTyping    = false;
      sendBtn.disabled = false;
      input.focus();
    }
  };

  // ── Input events ───────────────────────────────────────────────────────────
  sendBtn.addEventListener('click', () => sendMessage());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  // ── Show badge after 3s on pages where chat hasn't been opened ─────────────
  setTimeout(() => {
    if (!isOpen && messages.length === 0) {
      badge.style.display = 'flex';
    }
  }, 3000);

})();