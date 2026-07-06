// public/js/adaptiveVideo.js - Adaptive video player logic
//
// RULES:
//   - Mode (Video / Audio / PDF) is NEVER switched automatically.
//     The student always chooses the mode manually.
//   - Quality (360p / 480p / 720p) is adjusted automatically based on bandwidth.
//     The student can also override quality manually.

let currentLesson  = null;
let currentMode    = 'video';
let currentQuality = '360p';

// ── Safe URL resolver ─────────────────────────────────────────────────────────
const resolveMediaUrl = (src) => {
  if (!src) return null;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return '/' + src.replace(/^\//, '');
};

// ── Build video URL with fallback ─────────────────────────────────────────────
const buildVideoUrl = (lesson, quality) => {
  let primary = null;
  if (quality === '720p') primary = lesson.videoQualities?.quality720p;
  else if (quality === '480p') primary = lesson.videoQualities?.quality480p;
  if (!primary || quality === '360p') primary = lesson.videoQualities?.quality360p;
  const fallback = lesson.videoOriginal;
  return { primary: primary || fallback, fallback };
};

// ── Apply adaptive recommendation ─────────────────────────────────────────────
// Called by qoe.js after every bandwidth measurement.
// ONLY adjusts video quality — never touches the mode.
const applyAdaptiveRecommendation = () => {
  if (!currentLesson) return;

  const { mode, quality, decision } = getAdaptiveDecision();

  // Update the info banner so the student can see the recommendation
  const banner = document.getElementById('adaptive-banner');
  if (banner) {
    banner.textContent = '📡 ' + decision;
    banner.classList.remove('hidden');
  }

  // Only auto-adjust quality while in video mode — never switch the mode itself
  if (currentMode === 'video' && quality && quality !== currentQuality) {
    // Only auto-switch quality if the student hasn't manually overridden it
    if (!window.userChoseQuality) {
      loadVideo(quality);
    }
  }

  // Update QoE sidebar
  const modeEl = document.getElementById('qoe-mode');
  if (modeEl) {
    modeEl.textContent = currentMode === 'video'
      ? 'Video ' + currentQuality
      : currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
  }
};

// ── sr-announcer helper ───────────────────────────────────────────────────────
const srAnnounce = (text) => {
  const el = document.getElementById('sr-announcer');
  if (el) { el.textContent = ''; setTimeout(() => { el.textContent = text; }, 50); }
};

// ── Switch mode (only called by student button clicks) ────────────────────────
const switchMode = (mode, quality) => {
  currentMode = mode;

  // Pause video when leaving video mode — stops background audio
  const videoEl = document.getElementById('lesson-video');
  if (mode !== 'video' && videoEl && !videoEl.paused) {
    videoEl.pause();
  }
  // Pause audio when leaving audio mode
  const audioEl = document.getElementById('lesson-audio');
  if (mode !== 'audio' && audioEl && !audioEl.paused) {
    audioEl.pause();
  }

  const videoSection = document.getElementById('video-section');
  const audioSection = document.getElementById('audio-section');
  const pdfSection   = document.getElementById('pdf-section');

  if (videoSection) videoSection.classList.add('hidden');
  if (audioSection) audioSection.classList.add('hidden');
  if (pdfSection)   pdfSection.classList.add('hidden');

  if (mode === 'video') {
    if (videoSection) videoSection.classList.remove('hidden');
    loadVideo(quality || currentQuality);
  } else if (mode === 'audio') {
    if (audioSection) audioSection.classList.remove('hidden');
    loadAudio();
  } else if (mode === 'pdf') {
    if (pdfSection) pdfSection.classList.remove('hidden');
  }

  // Update mode buttons and aria-pressed
  document.querySelectorAll('.mode-btn').forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  // Announce mode change to screen readers (skip on initial load)
  if (currentLesson) {
    const modeLabel = mode === 'video' ? 'Video' : mode === 'audio' ? 'Audio only' : 'PDF Transcript';
    srAnnounce('Switched to ' + modeLabel + ' mode');
  }
};

// ── Load video at a given quality ─────────────────────────────────────────────
const loadVideo = (quality) => {
  if (!currentLesson) return;
  currentQuality = quality;

  const videoEl = document.getElementById('lesson-video');
  if (!videoEl) return;

  const { primary, fallback } = buildVideoUrl(currentLesson, quality);
  const url = resolveMediaUrl(primary);

  if (url && videoEl.src !== url) {
    const savedTime  = videoEl.currentTime || 0;
    const wasPlaying = !videoEl.paused;
    videoEl.src = url;
    videoEl.currentTime = savedTime;
    if (wasPlaying) videoEl.play().catch(() => {});

    // If transformed URL fails (free-tier Cloudinary limit), use original
    videoEl.onerror = () => {
      const fallbackUrl = resolveMediaUrl(fallback);
      if (fallbackUrl && videoEl.src !== fallbackUrl) {
        console.warn('Transformed URL failed, falling back to original.');
        videoEl.onerror = null;
        const t = videoEl.currentTime || 0;
        videoEl.src = fallbackUrl;
        videoEl.currentTime = t;
        if (wasPlaying) videoEl.play().catch(() => {});
      }
    };
  }

  // Update quality badge overlay
  const badge = document.getElementById('quality-badge');
  if (badge) {
    badge.textContent = quality;
    badge.setAttribute('aria-label', 'Current quality: ' + quality);
  }

  // Notify page to update QoE sidebar
  if (typeof window.onQualityChanged === 'function') window.onQualityChanged(quality);

  // Update quality buttons and aria-pressed
  document.querySelectorAll('.quality-btn').forEach(btn => {
    const isActive = btn.dataset.quality === quality;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  // Announce quality change to screen readers
  srAnnounce('Video quality changed to ' + quality);
};

// ── Load audio ────────────────────────────────────────────────────────────────
// Cloudinary auto-transcodes video → mp3 when the URL extension is .mp3
const loadAudio = () => {
  if (!currentLesson) return;
  const audioEl = document.getElementById('lesson-audio');
  if (!audioEl) return;

  let audioSrc = currentLesson.audioVersion || null;
  if (!audioSrc && currentLesson.videoOriginal) {
    audioSrc = currentLesson.videoOriginal.replace(/\.(mp4|mov|avi|mkv|webm)(\?.*)?$/i, '.mp3');
  }
  const url = resolveMediaUrl(audioSrc);
  if (url) audioEl.src = url;
};

// ── Load lesson into player ───────────────────────────────────────────────────
const loadLesson = (lesson) => {
  currentLesson = lesson;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('lesson-name-crumb',  lesson.title);
  set('lesson-title',       lesson.title);
  set('lesson-description', lesson.description || '');
  set('audio-lesson-title', lesson.title);

  // PDF notes link (instructor-uploaded)
  const pdfUrl  = resolveMediaUrl(lesson.pdfNote);
  const pdfLink = document.getElementById('pdf-download-link');
  if (pdfLink) {
    if (pdfUrl) { pdfLink.href = pdfUrl; pdfLink.classList.remove('hidden'); }
    else          pdfLink.classList.add('hidden');
  }

  // Downloadable materials
  const matList = document.getElementById('materials-list');
  const noRes   = document.getElementById('no-resources');
  if (matList) {
    matList.innerHTML = '';
    const mats = lesson.downloadableMaterials || [];
    mats.forEach(m => {
      const a       = document.createElement('a');
      a.href        = resolveMediaUrl(m.fileUrl) || '#';
      a.download    = m.title;
      a.className   = 'btn btn-secondary btn-sm';
      a.textContent = '⬇ ' + m.title;
      matList.appendChild(a);
    });
    if (noRes) noRes.style.display = mats.length ? 'none' : 'block';
  }

  // Always start in VIDEO mode — never auto-switch on load
  switchMode('video', currentQuality);
};

// ── Init selectors ────────────────────────────────────────────────────────────
const initQualitySelector = () => {
  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.quality === currentQuality));
    btn.setAttribute('aria-label', 'Switch to ' + btn.dataset.quality + ' quality');
    btn.addEventListener('click', () => {
      window.userChoseQuality = true;
      currentQuality = btn.dataset.quality;
      loadVideo(currentQuality);
    });
  });
};

const initModeSelector = () => {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === currentMode));
    const modeLabels = { video: 'Switch to Video mode', audio: 'Switch to Audio only mode', pdf: 'Switch to PDF Transcript mode' };
    btn.setAttribute('aria-label', modeLabels[btn.dataset.mode] || btn.dataset.mode);
    btn.addEventListener('click', () => {
      switchMode(btn.dataset.mode, currentQuality);
    });
  });
};