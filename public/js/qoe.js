// public/js/qoe.js - Network quality monitoring and QoE recording

let interruptions       = 0;
let sessionStartTime    = Date.now();
let currentBandwidth    = null; // null = not yet measured
let currentResponseTime = 0;
let qoeInterval         = null;

// ── Bandwidth estimation ──────────────────────────────────────────────────────
// Downloads a real image from Cloudinary CDN so the measurement is accurate.
const estimateBandwidth = async () => {
  const testUrl    = `https://res.cloudinary.com/dmom3jega/image/upload/w_400,h_300,c_fill/sample.jpg?t=${Date.now()}`;
  const fallbackUrl = `/api/health?t=${Date.now()}`;

  const tryMeasure = async (url, assumedBytes) => {
    const start = performance.now();
    const res   = await fetch(url, { cache: 'no-store' });
    const blob  = await res.blob();
    const secs  = (performance.now() - start) / 1000;
    const bytes = blob.size > 100 ? blob.size : assumedBytes;
    return {
      bandwidth:    parseFloat(((bytes * 8) / secs / 1e6).toFixed(2)),
      responseTime: Math.round(performance.now() - start),
    };
  };

  try {
    const r         = await tryMeasure(testUrl, 15000);
    currentBandwidth    = r.bandwidth;
    currentResponseTime = r.responseTime;
  } catch {
    // Fallback: use health endpoint response-time heuristic
    try {
      const start = performance.now();
      await fetch(fallbackUrl, { cache: 'no-store' });
      currentResponseTime = Math.round(performance.now() - start);
      if      (currentResponseTime < 150)  currentBandwidth = 5.0;
      else if (currentResponseTime < 300)  currentBandwidth = 2.0;
      else if (currentResponseTime < 600)  currentBandwidth = 1.0;
      else if (currentResponseTime < 1500) currentBandwidth = 0.5;
      else                                 currentBandwidth = 0.1;
    } catch {
      currentBandwidth    = 0;
      currentResponseTime = 9999;
      interruptions++;
    }
  }

  return currentBandwidth;
};

// ── Update QoE display panel ──────────────────────────────────────────────────
const updateQoEPanel = () => {
  const bwEl       = document.getElementById('qoe-bandwidth');
  const rtEl       = document.getElementById('qoe-response-time');
  const intEl      = document.getElementById('qoe-interruptions');
  const modeEl     = document.getElementById('qoe-mode');
  const decisionEl = document.getElementById('qoe-decision');

  if (bwEl)  bwEl.textContent  = currentBandwidth !== null ? currentBandwidth + ' Mbps' : 'Measuring...';
  if (rtEl)  rtEl.textContent  = currentResponseTime + ' ms';
  if (intEl) intEl.textContent = interruptions;

  const { quality, decision } = getAdaptiveDecision();
  // Show quality recommendation — never show "switch to PDF/Audio" as a decision
  if (modeEl)     modeEl.textContent     = 'Video ' + (quality || '360p');
  if (decisionEl) decisionEl.textContent = decision;
};

// ── Adaptive decision — quality only, no forced mode ─────────────────────────
// Returns the best VIDEO QUALITY for the current bandwidth.
// Mode switching is the student's choice — this function never forces it.
const getAdaptiveDecision = () => {
  const bw   = currentBandwidth !== null ? currentBandwidth : 2; // default to 2 Mbps before first measure
  const ints = interruptions;

  let quality, decision;

  if (bw >= 5) {
    quality  = '720p';
    decision = 'Excellent connection (' + bw + ' Mbps). Streaming 720p.';
  } else if (bw >= 2) {
    quality  = '480p';
    decision = 'Good connection (' + bw + ' Mbps). Streaming 480p.';
  } else if (bw >= 0.5) {
    quality  = '360p';
    decision = 'Fair connection (' + bw + ' Mbps). Streaming 360p.';
  } else {
    quality  = '360p';
    decision = 'Slow connection (' + bw + ' Mbps). Consider switching to Audio or PDF mode.';
  }

  if (ints >= 3) {
    decision += ' (' + ints + ' interruptions detected)';
  }

  // mode is always whatever the student currently has — we never change it here
  const mode = (typeof currentMode !== 'undefined') ? currentMode : 'video';
  return { mode, quality, decision };
};

// ── Send QoE record to server ─────────────────────────────────────────────────
const sendQoERecord = async (courseId, lessonId) => {
  if (currentBandwidth === null) return;
  try {
    const { mode, quality } = getAdaptiveDecision();
    await authFetch('/api/qoe/record', {
      method: 'POST',
      body: JSON.stringify({
        courseId,
        lessonId,
        bandwidthSpeed:       currentBandwidth,
        responseTime:         currentResponseTime,
        sessionInterruptions: interruptions,
        selectedMode:         mode,
        selectedVideoQuality: quality,
      }),
    });
  } catch (e) {
    console.warn('QoE record failed:', e.message);
  }
};

// ── Start QoE monitoring ──────────────────────────────────────────────────────
const startQoEMonitoring = (courseId, lessonId, intervalMs = 30000) => {
  // First measurement — only updates quality, never switches mode
  estimateBandwidth().then(() => {
    updateQoEPanel();
    if (typeof applyAdaptiveRecommendation === 'function') {
      applyAdaptiveRecommendation(); // adjusts quality only
    }
  });

  qoeInterval = setInterval(async () => {
    await estimateBandwidth();
    updateQoEPanel();
    await sendQoERecord(courseId, lessonId);
    if (typeof applyAdaptiveRecommendation === 'function') {
      applyAdaptiveRecommendation(); // adjusts quality only
    }
  }, intervalMs);
};

const stopQoEMonitoring = () => {
  if (qoeInterval) { clearInterval(qoeInterval); qoeInterval = null; }
};

// ── Track video stalls as interruptions ───────────────────────────────────────
const trackVideoElement = (videoEl) => {
  if (!videoEl) return;
  videoEl.addEventListener('waiting', () => { interruptions++; updateQoEPanel(); });
  videoEl.addEventListener('stalled', () => { interruptions++; updateQoEPanel(); });
};