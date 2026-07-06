/* public/js/instructor.js – EduAdapt Instructor Dashboard Logic */

let allCourses             = [];
let allStudents            = [];
let currentCourseFilter    = 'all';
let selectedLessonCourseId = null;
let quizQuestions          = [];

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  requireAuth(['instructor']);
  setUserDisplay();
  await loadDashboard();
});

// ─── Section Navigation ───────────────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('[id^="section-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('section-' + name).style.display = '';
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  if (name === 'courses')  renderCoursesGrid(currentCourseFilter);
  if (name === 'students') loadStudentsSection();
  if (name === 'lessons')  populateLessonCourseSelect();
  if (name === 'quizzes')  populateQuizCourseSelect();
  if (name === 'settings') { loadInstructorSettings(); if (typeof load2FAStatus === 'function') load2FAStatus(); }
  if (name === 'feedback') initFeedbackSection();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const data = await apiGet('/api/instructor/dashboard');
    document.getElementById('stat-students').textContent      = data.totalStudents    ?? 0;
    document.getElementById('stat-active').textContent        = data.activeCourses    ?? 0;
    document.getElementById('stat-pending').textContent       = data.pendingCourses   ?? 0;
    document.getElementById('stat-avg-progress').textContent  = (data.avgProgress     ?? 0) + '%';
    document.getElementById('breakdown-approved').textContent = data.activeCourses    ?? 0;
    document.getElementById('breakdown-pending').textContent  = data.pendingCourses   ?? 0;
    document.getElementById('breakdown-rejected').textContent = data.rejectedCourses  ?? 0;
  } catch(e) { console.error('Dashboard stats error:', e); }
  await loadCourses();
  renderDashboardCourseTable();
  loadRecentStudents();
}

async function loadCourses() {
  try   { allCourses = await apiGet('/api/instructor/courses'); }
  catch { allCourses = []; }
}

// ── Price badge helper ────────────────────────────────────────────────────────
function priceBadge(c) {
  if (c.isFree || !c.price || c.price === 0) {
    return '<span class="badge" style="background:var(--green-light);color:var(--green);">🆓 Free</span>';
  }
  return '<span class="badge badge-blue">💰 ' + Number(c.price).toLocaleString() + ' XAF</span>';
}

function renderDashboardCourseTable() {
  const tbody = document.getElementById('dashboard-courses-tbody');
  if (!allCourses.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No courses yet. Create your first course!</td></tr>';
    return;
  }
  tbody.innerHTML = allCourses.slice(0, 5).map(c => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="course-thumb-sm" style="background:${hashColor(c._id)};"></div>
          <strong>${esc(c.title)}</strong>
        </div>
      </td>
      <td>${c.enrollmentCount ?? 0}</td>
      <td>${priceBadge(c)}</td>
      <td><span class="badge ${statusBadge(c.approvalStatus)}">${c.approvalStatus}</span></td>
      <td>
        <button class="btn-icon" onclick="showSection('lessons');setLessonCourse('${c._id}')" title="Manage Lessons">🎬</button>
        <button class="btn-icon" onclick="editCourse('${c._id}')" title="Edit">✏️</button>
      </td>
    </tr>`).join('');
}

// ─── Courses Grid ─────────────────────────────────────────────────────────────
function renderCoursesGrid(filter = 'all') {
  currentCourseFilter = filter;
  const grid    = document.getElementById('courses-grid');
  const courses = filter === 'all' ? allCourses : allCourses.filter(c => c.approvalStatus === filter);
  if (!courses.length) { grid.innerHTML = '<p class="empty-state">No courses found.</p>'; return; }
  grid.innerHTML = courses.map(c => `
    <div class="course-card">
      <div class="course-card-thumb" style="background:${hashColor(c._id)};"></div>
      <div class="course-card-body">
        <div class="course-card-meta">
          <span class="badge ${statusBadge(c.approvalStatus)}">${c.approvalStatus}</span>
          <span class="badge badge-info">${c.difficultyLevel || 'N/A'}</span>
          ${priceBadge(c)}
        </div>
        <h3 class="course-card-title">${esc(c.title)}</h3>
        <p class="course-card-desc">${esc(c.description?.slice(0,80) || '')}...</p>
        ${c.approvalStatus === 'rejected' && c.rejectionReason ? `
          <div class="alert alert-danger" style="font-size:0.8rem;padding:0.5rem;margin-top:0.5rem;">
            <strong>Rejection reason:</strong> ${esc(c.rejectionReason)}
          </div>` : ''}
        <div class="course-card-footer">
          <span>${c.enrollmentCount ?? 0} students</span>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-secondary" onclick="manageLessons('${c._id}')">Lessons</button>
            <button class="btn btn-sm btn-primary"   onclick="editCourse('${c._id}')">Edit</button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

function filterCourses(filter, btn) {
  document.querySelectorAll('#section-courses .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCoursesGrid(filter);
}

// ─── Students ─────────────────────────────────────────────────────────────────
async function loadStudentsSection() {
  const sel = document.getElementById('student-course-filter');
  sel.innerHTML = '<option value="">All My Courses</option>' +
    allCourses.map(c => `<option value="${c._id}">${esc(c.title)}</option>`).join('');
  await loadStudentsForCourse('');
}

async function loadStudentsForCourse(courseId) {
  const tbody = document.getElementById('students-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Loading...</td></tr>';
  try {
    let students = [];
    if (courseId) {
      const data = await apiGet('/api/instructor/courses/' + courseId + '/students');
      students = (data.students || data).map(s => ({ ...s, courseName: allCourses.find(c => c._id === courseId)?.title || '–' }));
    } else {
      const results = await Promise.all(
        allCourses.filter(c => c.approvalStatus === 'approved').map(async c => {
          try {
            const d = await apiGet('/api/instructor/courses/' + c._id + '/students');
            return (d.students || d).map(s => ({ ...s, courseName: c.title }));
          } catch { return []; }
        })
      );
      students = results.flat();
    }
    if (!students.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No students enrolled yet.</td></tr>';
      return;
    }
    tbody.innerHTML = students.map(s => `
      <tr>
        <td><strong>${esc(s.studentId?.fullName || s.fullName || '–')}</strong></td>
        <td>${esc(s.studentId?.email || s.email || '–')}</td>
        <td>${esc(s.courseName)}</td>
        <td>
          <div class="progress-bar-row">
            <div class="mini-progress">
              <div class="mini-progress-fill" style="width:${s.completionPercentage ?? 0}%"></div>
            </div>
            <span>${s.completionPercentage ?? 0}%</span>
          </div>
        </td>
        <td>${formatDate(s.enrolledAt)}</td>
      </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Error loading students.</td></tr>';
  }
}

async function loadRecentStudents() {
  const container = document.getElementById('recent-students-list');
  try {
    const first = allCourses.find(c => c.approvalStatus === 'approved');
    if (!first) { container.innerHTML = '<p class="empty-state">No approved courses yet.</p>'; return; }
    const data     = await apiGet('/api/instructor/courses/' + first._id + '/students');
    const students = (data.students || data).slice(0, 4);
    if (!students.length) { container.innerHTML = '<p class="empty-state">No students yet.</p>'; return; }
    container.innerHTML = students.map(s => `
      <div class="user-row">
        <div class="user-avatar">${(s.studentId?.fullName || s.fullName || 'S')[0].toUpperCase()}</div>
        <div class="user-info">
          <div class="user-name">${esc(s.studentId?.fullName || s.fullName || '–')}</div>
          <div class="user-sub">${esc(s.studentId?.email || s.email || '–')}</div>
        </div>
        <div class="user-badge">${s.completionPercentage ?? 0}%</div>
      </div>`).join('');
  } catch { container.innerHTML = '<p class="empty-state">Unable to load students.</p>'; }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
const loadInstructorSettings = async () => {
  try {
    const user = await apiGet('/api/auth/me');
    document.getElementById('settings-fullname').value = user.fullName || '';
    document.getElementById('settings-email').value    = user.email   || '';
    document.getElementById('settings-phone').value    = user.phone   || '';
  } catch { showToast('Unable to load profile settings.', 'error'); }
};

const saveInstructorProfile = async (event) => {
  event.preventDefault();
  const data = new FormData(document.getElementById('instructor-settings-form'));
  try {
    const result = await apiPatchForm('/api/auth/profile', data);
    setAuth(getToken(), result.user);
    setUserDisplay();
    showToast(result.message || 'Profile updated.', 'success');
  } catch(e) { showToast(e.message || 'Failed to save profile.', 'error'); }
};

const changeInstructorPassword = async (event) => {
  event.preventDefault();
  const currentPassword = document.getElementById('settings-current-password').value.trim();
  const newPassword     = document.getElementById('settings-new-password').value.trim();
  const confirmPassword = document.getElementById('settings-confirm-password').value.trim();
  try {
    const result = await apiPatch('/api/auth/password', { currentPassword, newPassword, confirmPassword });
    document.getElementById('settings-current-password').value = '';
    document.getElementById('settings-new-password').value     = '';
    document.getElementById('settings-confirm-password').value = '';
    showToast(result.message || 'Password updated', 'success');
  } catch(e) { showToast(e.message || 'Failed to update password.', 'error'); }
};

const previewProfileAvatar = (event, previewId) => {
  const file    = event.target.files?.[0];
  const preview = document.getElementById(previewId);
  if (!file || !preview) return;
  const reader = new FileReader();
  reader.onload = () => {
    preview.style.backgroundImage = 'url(' + reader.result + ')';
    preview.textContent = '';
    preview.style.backgroundSize = 'cover';
  };
  reader.readAsDataURL(file);
};

// ─── Lessons ──────────────────────────────────────────────────────────────────
function populateLessonCourseSelect() {
  const sel = document.getElementById('lesson-course-select');
  sel.innerHTML = '<option value="">Choose a course...</option>' +
    allCourses.map(c => `<option value="${c._id}">${esc(c.title)}</option>`).join('');
}

function manageLessons(courseId) {
  showSection('lessons');
  setTimeout(() => setLessonCourse(courseId), 100);
}

function setLessonCourse(courseId) {
  document.getElementById('lesson-course-select').value = courseId;
  loadLessonsForCourse(courseId);
}

async function loadLessonsForCourse(courseId) {
  selectedLessonCourseId = courseId;
  const container = document.getElementById('lessons-container');
  const bar       = document.getElementById('add-lesson-bar');
  if (!courseId) {
    container.innerHTML = '<p class="empty-state">Select a course to view its lessons.</p>';
    bar.style.display = 'none';
    return;
  }
  bar.style.display = '';
  document.getElementById('lesson-course-id').value = courseId;
  container.innerHTML = '<p class="empty-state">Loading lessons...</p>';
  try {
    const lessons = await apiGet('/api/instructor/courses/' + courseId + '/lessons');
    if (!lessons.length) {
      container.innerHTML = '<p class="empty-state">No lessons yet. Add the first lesson!</p>';
      return;
    }
    container.innerHTML = '<div class="lesson-list">' +
      lessons.sort((a, b) => a.order - b.order).map(l => `
        <div class="lesson-item">
          <div class="lesson-order">${l.order || '–'}</div>
          <div class="lesson-info">
            <div class="lesson-title">${esc(l.title)}</div>
            <div class="lesson-meta">
              ${l.videoQualities?.quality720p ? '<span class="badge badge-success">720p</span>' : ''}
              ${l.videoQualities?.quality480p ? '<span class="badge badge-info">480p</span>'   : ''}
              ${l.videoQualities?.quality360p ? '<span class="badge badge-info">360p</span>'   : ''}
              ${l.audioVersion ? '<span class="badge badge-warning">Audio</span>'              : ''}
              ${l.pdfNote      ? '<span class="badge badge-secondary">PDF</span>'              : ''}
              <span class="badge ${l.processingStatus === 'completed' ? 'badge-success' : 'badge-secondary'}">${l.processingStatus || 'pending'}</span>
              ${l.isFree
                ? '<span class="badge" style="background:var(--green-light);color:var(--green);">🆓 Free Preview</span>'
                : '<span class="badge" style="background:var(--blue-lighter);color:var(--blue-primary);">🔒 Paid</span>'}
            </div>
          </div>
          <div class="lesson-actions">
            ${l.videoOriginal ? `<button class="btn btn-sm btn-secondary" onclick="previewLesson('${l._id}','${esc(l.title)}','${l.videoOriginal}')">▶ Preview</button>` : ''}
          </div>
        </div>`).join('') + '</div>';
  } catch(e) {
    container.innerHTML = '<p class="empty-state">Error loading lessons.</p>';
    showToast('Unable to load lessons: ' + (e.message || 'server error'), 'error');
  }
}

function openAddLessonModal() {
  if (!selectedLessonCourseId) { showToast('Please select a course first.', 'error'); return; }
  document.getElementById('lesson-course-id').value = selectedLessonCourseId;
  document.getElementById('add-lesson-form').reset();
  // Reset free preview checkbox to unchecked (paid by default)
  const isFreeCheckbox = document.getElementById('lesson-is-free');
  if (isFreeCheckbox) isFreeCheckbox.checked = false;
  document.getElementById('lesson-upload-progress').style.display = 'none';
  setUploadStatus('');
  openModal('add-lesson-modal');
}

function setUploadStatus(msg) {
  const el = document.getElementById('upload-status-text');
  if (el) el.textContent = msg;
}

function setUploadBar(pct) {
  const bar = document.getElementById('upload-bar-fill');
  if (bar) bar.style.width = Math.min(pct, 100) + '%';
}

function resetUploadUI() {
  setUploadStatus('');
  setUploadBar(0);
}

// ─── Direct Cloudinary Upload ─────────────────────────────────────────────────
const CLOUDINARY_FOLDERS = {
  video:    'eduadapt/lessons',
  pdf:      'eduadapt/lessons',
  material: 'eduadapt/lessons',
};

const CHUNK_SIZE = 6 * 1024 * 1024; // 6 MB chunks

async function uploadToCloudinary(file, folder, onProgress) {
  const sigRes = await authFetch('/api/instructor/upload-signature', {
    method:  'POST',
    body:    JSON.stringify({ folder }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!sigRes.ok) {
    const err = await sigRes.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to get upload signature');
  }
  const { signature, timestamp, cloudName, apiKey } = await sigRes.json();
  const cloudUrl = 'https://api.cloudinary.com/v1_1/' + cloudName + '/auto/upload';

  // Small file: single upload
  if (file.size <= CHUNK_SIZE) {
    const fd = new FormData();
    fd.append('file', file); fd.append('signature', signature);
    fd.append('timestamp', timestamp); fd.append('api_key', apiKey);
    fd.append('folder', folder);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      if (onProgress) xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Invalid Cloudinary response')); }
        } else {
          let msg = 'Upload failed (' + xhr.status + ')';
          try { msg = JSON.parse(xhr.responseText)?.error?.message || msg; } catch {}
          reject(new Error(msg));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.open('POST', cloudUrl); xhr.send(fd);
    });
  }

  // Large file: chunked upload
  const fileSize    = file.size;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  const uploadId    = 'eid_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  let result = null;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end   = Math.min(start + CHUNK_SIZE, fileSize);
    const chunk = file.slice(start, end);
    const fd = new FormData();
    fd.append('file', chunk); fd.append('signature', signature);
    fd.append('timestamp', timestamp); fd.append('api_key', apiKey);
    fd.append('folder', folder);

    result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round(((i + e.loaded / e.total) / totalChunks) * 100));
        }
      });
      xhr.addEventListener('load', () => {
        if (xhr.status === 200 || xhr.status === 308) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
        } else {
          let msg = 'Chunk upload failed (' + xhr.status + ')';
          try { msg = JSON.parse(xhr.responseText)?.error?.message || msg; } catch {}
          reject(new Error(msg));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Network error on chunk ' + (i+1))));
      xhr.open('POST', cloudUrl);
      xhr.setRequestHeader('X-Unique-Upload-Id', uploadId);
      xhr.setRequestHeader('Content-Range', 'bytes ' + start + '-' + (end-1) + '/' + fileSize);
      xhr.send(fd);
    });
    if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 100));
  }
  return result;
}

// ─── Submit Add Lesson ────────────────────────────────────────────────────────
async function submitAddLesson(event) {
  event.preventDefault();

  const courseId    = document.getElementById('lesson-course-id').value;
  const videoFile   = document.getElementById('lesson-video').files[0];
  const pdfFile     = document.getElementById('lesson-pdf').files[0];
  const matFile     = document.getElementById('lesson-material-file').files[0];
  const matTitle    = document.getElementById('lesson-material-title').value.trim();
  const lessonTitle = document.getElementById('lesson-title').value.trim();
  const lessonDesc  = document.getElementById('lesson-desc').value.trim();
  const lessonOrder = document.getElementById('lesson-order').value;
  // ── Free preview flag ──────────────────────────────────────────────────────
  const isFreeLesson = document.getElementById('lesson-is-free')?.checked || false;

  if (!courseId)  { showToast('No course selected.',    'error'); return; }
  if (!videoFile) { showToast('Video file is required.','error'); return; }

  const btn        = document.getElementById('add-lesson-btn');
  const progressEl = document.getElementById('lesson-upload-progress');
  btn.disabled     = true;
  btn.textContent  = 'Uploading...';
  progressEl.style.display = '';
  resetUploadUI();

  const uploadStart = Date.now();

  try {
    // Step 1: upload video
    setUploadStatus('Uploading video...');
    const videoResult = await uploadToCloudinary(
      videoFile, CLOUDINARY_FOLDERS.video,
      (pct) => {
        setUploadBar(pct);
        const elapsed  = (Date.now() - uploadStart) / 1000;
        const speedMBs = elapsed > 0 ? ((pct / 100 * videoFile.size) / (1024*1024) / elapsed).toFixed(1) : '–';
        const remaining = pct > 0 && elapsed > 0 ? Math.round((100 - pct) / pct * elapsed) : '–';
        setUploadStatus('Uploading video... ' + pct + '%  (' + speedMBs + ' MB/s' + (remaining !== '–' ? ' · ~' + remaining + 's left' : '') + ')');
      }
    );
    if (!videoResult?.secure_url) throw new Error('Video upload failed — no URL returned.');
    setUploadStatus('Video uploaded ✓'); setUploadBar(100);

    // Step 2: upload PDF
    let pdfResult = null;
    if (pdfFile) {
      setUploadStatus('Uploading PDF notes...'); setUploadBar(0);
      pdfResult = await uploadToCloudinary(pdfFile, CLOUDINARY_FOLDERS.pdf, pct => setUploadBar(pct));
      setUploadStatus('PDF uploaded ✓');
    }

    // Step 3: upload material
    let matResult = null;
    if (matFile) {
      setUploadStatus('Uploading material...'); setUploadBar(0);
      matResult = await uploadToCloudinary(matFile, CLOUDINARY_FOLDERS.material, pct => setUploadBar(pct));
      setUploadStatus('Material uploaded ✓');
    }

    // Step 4: save to database
    setUploadStatus('Saving lesson...'); setUploadBar(100);
    await apiPost('/api/instructor/courses/' + courseId + '/lessons', {
      title:            lessonTitle,
      description:      lessonDesc,
      order:            lessonOrder,
      isFree:           isFreeLesson,           // ← free preview flag
      videoUrl:         videoResult.secure_url,
      videoPublicId:    videoResult.public_id,
      pdfUrl:           pdfResult  ? pdfResult.secure_url   : null,
      pdfPublicId:      pdfResult  ? pdfResult.public_id    : null,
      materialUrl:      matResult  ? matResult.secure_url   : null,
      materialPublicId: matResult  ? matResult.public_id    : null,
      materialTitle:    matTitle   || (matFile ? matFile.name : ''),
    });

    const totalSecs = Math.round((Date.now() - uploadStart) / 1000);
    showToast('Lesson uploaded in ' + totalSecs + 's!', 'success');
    closeModal('add-lesson-modal');
    loadLessonsForCourse(courseId);

  } catch(e) {
    console.error('Lesson upload error:', e);
    showToast(e.message || 'Upload failed. Please try again.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Upload Lesson';
    progressEl.style.display = 'none';
    resetUploadUI();
  }
}

function previewLesson(lessonId, title, videoUrl) {
  document.getElementById('view-lesson-title').textContent = title;
  const vid = document.getElementById('view-lesson-video');
  vid.src = videoUrl.startsWith('http') ? videoUrl : '/' + videoUrl.replace(/^\//, '');
  openModal('view-lesson-modal');
}

// ─── Quizzes ──────────────────────────────────────────────────────────────────
function populateQuizCourseSelect() {
  const sel = document.getElementById('quiz-course-select');
  sel.innerHTML = '<option value="">Choose a course...</option>' +
    allCourses.map(c => `<option value="${c._id}">${esc(c.title)}</option>`).join('');
}

async function loadQuizzesForCourse(courseId) {
  const container = document.getElementById('quizzes-container');
  const bar       = document.getElementById('create-quiz-bar');
  if (!courseId) {
    container.innerHTML = '<p class="empty-state">Select a course to view its quizzes.</p>';
    bar.style.display = 'none';
    return;
  }
  document.getElementById('quiz-course-id-input').value = courseId;
  bar.style.display = '';
  container.innerHTML = '<p class="empty-state">Loading quizzes...</p>';
  try {
    const quizzes = await apiGet('/api/instructor/courses/' + courseId + '/quizzes');
    if (!quizzes.length) { container.innerHTML = '<p class="empty-state">No quizzes yet. Create one!</p>'; return; }
    container.innerHTML = quizzes.map(q => `
      <div class="section" style="margin-bottom:1rem;">
        <div class="section-header">
          <h3 class="section-title">${esc(q.title || 'Quiz')} <span style="font-weight:400;color:var(--gray-500);font-size:0.85rem;">(${q.questions?.length || 0} questions)</span></h3>
          <span class="badge badge-info">${formatDate(q.createdAt)}</span>
        </div>
        <div style="padding:1rem;">
          ${(q.questions || []).map((qu, i) => `
            <div style="margin-bottom:0.75rem;padding:0.75rem;background:var(--gray-50);border-radius:8px;">
              <strong>Q${i+1}.</strong> ${esc(qu.questionText)}
              <div style="margin-top:0.5rem;display:grid;grid-template-columns:1fr 1fr;gap:0.25rem;">
                ${qu.options.map((o, j) => `
                  <span style="font-size:0.85rem;${o === qu.correctAnswer ? 'color:var(--green);font-weight:600;' : 'color:var(--gray-600);'}">
                    ${String.fromCharCode(65+j)}. ${esc(o)} ${o === qu.correctAnswer ? '✓' : ''}
                  </span>`).join('')}
              </div>
              <span class="badge badge-secondary" style="margin-top:0.5rem;">${qu.difficultyLevel}</span>
            </div>`).join('')}
        </div>
      </div>`).join('');
  } catch { container.innerHTML = '<p class="empty-state">Error loading quizzes.</p>'; }
}

// ─── Quiz Builder ─────────────────────────────────────────────────────────────
quizQuestions = [];

function addQuizQuestion() {
  const qIndex = quizQuestions.length;
  // correctAnswerIndex stored separately so radio selection time doesn't matter
  quizQuestions.push({ questionText: '', options: ['','','',''], correctAnswerIndex: -1, difficultyLevel: 'beginner' });
  const container = document.getElementById('quiz-questions-container');
  const div = document.createElement('div');
  div.className = 'quiz-question-block';
  div.id = 'qq-' + qIndex;
  div.innerHTML = `
    <div class="section" style="margin-bottom:1rem;">
      <div class="section-header">
        <h4>Question ${qIndex + 1}</h4>
        <button type="button" class="btn-icon btn-danger-icon" onclick="removeQuestion(${qIndex})">✕</button>
      </div>
      <div style="padding:1rem;">
        <div class="form-group">
          <label class="form-label">Question Text *</label>
          <input type="text" class="form-input" placeholder="Enter question..." oninput="quizQuestions[${qIndex}].questionText=this.value" required />
        </div>
        <div class="form-group">
          <label class="form-label">Options — type each option, then select the correct one</label>
          ${[0,1,2,3].map(i => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <input type="radio" name="correct-${qIndex}" value="${i}"
                onchange="quizQuestions[${qIndex}].correctAnswerIndex=${i}" />
              <input type="text" class="form-input" placeholder="Option ${String.fromCharCode(65+i)}" style="flex:1;"
                oninput="quizQuestions[${qIndex}].options[${i}]=this.value" required />
            </div>`).join('')}
          <small class="form-hint">Select the radio button next to the correct answer (you can do this after typing).</small>
        </div>
        <div class="form-group">
          <label class="form-label">Difficulty</label>
          <select class="form-select" onchange="quizQuestions[${qIndex}].difficultyLevel=this.value">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>
    </div>`;
  container.appendChild(div);
}

function removeQuestion(index) {
  document.getElementById('qq-' + index)?.remove();
  quizQuestions.splice(index, 1);
}

async function submitCreateQuiz(event) {
  event.preventDefault();
  const courseId  = document.getElementById('quiz-course-id-input').value;
  const quizTitle = document.getElementById('quiz-title-input')?.value?.trim() || 'Course Quiz';
  if (!courseId) { showToast('Please select a course first.', 'error'); return; }
  if (!quizQuestions.length) { showToast('Add at least one question.', 'error'); return; }

  // Resolve correctAnswer from the stored index at submit time (fixes timing bug)
  const resolved = quizQuestions.map((q, qi) => ({
    questionText:    q.questionText,
    options:         q.options,
    difficultyLevel: q.difficultyLevel,
    correctAnswer:   q.correctAnswerIndex >= 0 ? q.options[q.correctAnswerIndex] : '',
  }));

  const badQuestion = resolved.findIndex(q => !q.questionText.trim());
  if (badQuestion !== -1) { showToast('Question ' + (badQuestion + 1) + ' is missing its text.', 'error'); return; }

  const badOption = resolved.findIndex(q => q.options.some(o => !o.trim()));
  if (badOption !== -1) { showToast('Question ' + (badOption + 1) + ' has an empty option. Fill in all 4 options.', 'error'); return; }

  const noAnswer = resolved.findIndex(q => !q.correctAnswer);
  if (noAnswer !== -1) { showToast('Question ' + (noAnswer + 1) + ': please select the correct answer.', 'error'); return; }

  try {
    await apiPost('/api/instructor/courses/' + courseId + '/quizzes', { title: quizTitle, questions: resolved });
    showToast('Quiz created successfully!', 'success');
    closeModal('create-quiz-modal');
    quizQuestions = [];
    document.getElementById('quiz-questions-container').innerHTML = '';
    if (document.getElementById('quiz-title-input')) document.getElementById('quiz-title-input').value = '';
    loadQuizzesForCourse(courseId);
  } catch(e) { showToast(e.message || 'Failed to create quiz.', 'error'); }
}

// ─── Create Course ────────────────────────────────────────────────────────────
async function submitCreateCourse(event) {
  event.preventDefault();
  const btn = document.getElementById('create-course-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  const fd = new FormData();
  fd.append('title',           document.getElementById('course-title').value.trim());
  fd.append('description',     document.getElementById('course-desc').value.trim());
  fd.append('category',        document.getElementById('course-category').value.trim());
  fd.append('difficultyLevel', document.getElementById('course-difficulty').value);
  const thumb = document.getElementById('course-thumbnail').files[0];
  if (thumb) fd.append('thumbnail', thumb);

  // ── Pricing ─────────────────────────────────────────────────────────────────
  // course-is-paid: unchecked = FREE, checked = PAID
  const isPaidCheckbox = document.getElementById('course-is-paid');
  const isPaid         = isPaidCheckbox ? isPaidCheckbox.checked : false;
  fd.append('isFree', isPaid ? 'false' : 'true');

  if (isPaid) {
    // Paid course — price is required
    const price = document.getElementById('course-price')?.value;
    if (!price || parseInt(price) < 100) {
      showToast('Please enter a course price of at least 100 XAF.', 'error');
      btn.disabled = false; btn.textContent = 'Create Course';
      return;
    }
    fd.append('price', price);
  } else {
    // Free course — price is 0
    fd.append('price', '0');
  }

  try {
    const res  = await authFetchForm('/api/instructor/courses', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to create course');
    const priceMsg = !isPaid ? '(Free)' : '(' + parseInt(document.getElementById('course-price')?.value).toLocaleString() + ' XAF)';
    showToast('Course created! ' + priceMsg + ' Awaiting admin approval.', 'success');
    closeModal('create-course-modal');
    document.getElementById('create-course-form').reset();
    // Reset pricing UI back to FREE (default)
    const isPaidEl = document.getElementById('course-is-paid');
    const priceGrp = document.getElementById('course-price-group');
    const labelEl  = document.getElementById('course-pricing-label');
    const hintEl   = document.getElementById('course-pricing-hint');
    const priceEl  = document.getElementById('course-price');
    if (isPaidEl) isPaidEl.checked       = false;
    if (priceGrp) priceGrp.style.display = 'none';
    if (labelEl)  labelEl.textContent    = '🆓 This course is FREE';
    if (hintEl)   hintEl.textContent     = 'Students can enroll without paying. Check to make it paid.';
    if (priceEl)  priceEl.value          = '';
    await loadCourses();
    renderDashboardCourseTable();
    renderCoursesGrid(currentCourseFilter);
    const stats = await apiGet('/api/instructor/dashboard');
    document.getElementById('stat-pending').textContent      = stats.pendingCourses ?? 0;
    document.getElementById('breakdown-pending').textContent = stats.pendingCourses ?? 0;
  } catch(e) { showToast(e.message, 'error'); }
  finally    { btn.disabled = false; btn.textContent = 'Create Course'; }
}

function editCourse(courseId) {
  const course = allCourses.find(c => c._id === courseId);
  if (!course) return;
  document.getElementById('course-title').value      = course.title;
  document.getElementById('course-desc').value       = course.description;
  document.getElementById('course-category').value   = course.category || '';
  document.getElementById('course-difficulty').value = course.difficultyLevel || 'beginner';

  // Restore pricing state
  // course-is-paid: unchecked=FREE, checked=PAID
  const isPaidCheckbox = document.getElementById('course-is-paid');
  const priceGroup     = document.getElementById('course-price-group');
  const pricingLabel   = document.getElementById('course-pricing-label');
  const pricingHint    = document.getElementById('course-pricing-hint');

  const courseIsFree = course.isFree !== false && (!course.price || course.price === 0);
  if (isPaidCheckbox) {
    isPaidCheckbox.checked = !courseIsFree;  // checked when PAID
    if (priceGroup)   priceGroup.style.display = courseIsFree ? 'none' : 'block';
    if (pricingLabel) pricingLabel.textContent = courseIsFree ? '🆓 This course is FREE' : '💳 This course is PAID';
    if (pricingHint)  pricingHint.textContent  = courseIsFree
      ? 'Students can enroll without paying. Check to make it paid.'
      : 'Students must pay before enrolling. Uncheck to make it free.';
  }
  const priceInput = document.getElementById('course-price');
  if (priceInput) priceInput.value = course.price || '';

  openModal('create-course-modal');
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function handleOverlayClick(e, id) { if (e.target.id === id) closeModal(id); }

// ─── Utility Helpers ──────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function statusBadge(s) {
  if (s === 'approved') return 'badge-success';
  if (s === 'pending')  return 'badge-warning';
  if (s === 'rejected') return 'badge-danger';
  return 'badge-secondary';
}
function hashColor(str) {
  const colors = ['#1d4ed8','#0891b2','#059669','#7c3aed','#db2777','#ea580c','#ca8a04'];
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[Math.abs(h)];
}

// ─── Feedback / Review ────────────────────────────────────────────────────────
const RATING_LABELS = { 1:'Poor', 2:'Below Average', 3:'Average', 4:'Good', 5:'Excellent' };
let _selectedRating = 0;

function _updateStars(val) {
  document.querySelectorAll('#review-stars .star').forEach(s => {
    s.classList.toggle('active', Number(s.dataset.value) <= val);
  });
  const label = document.getElementById('review-rating-label');
  if (label) label.textContent = val ? RATING_LABELS[val] + ' (' + val + '/5)' : 'Click a star to rate';
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#review-stars .star').forEach(star => {
    star.addEventListener('click',      () => { _selectedRating = Number(star.dataset.value); _updateStars(_selectedRating); });
    star.addEventListener('mouseenter', () => _updateStars(Number(star.dataset.value)));
    star.addEventListener('mouseleave', () => _updateStars(_selectedRating));
  });
});

async function initFeedbackSection() {
  await Promise.all([loadMyReview(), loadReviewSummary()]);
}

async function loadMyReview() {
  const area = document.getElementById('my-review-area');
  if (!area) return;
  try {
    const r = await apiGet('/api/reviews/my');
    if (!r) { area.innerHTML = '<p class="text-gray">No review submitted yet.</p>'; return; }
    _selectedRating = r.rating;
    _updateStars(r.rating);
    document.getElementById('review-category').value = r.category || 'overall';
    document.getElementById('review-comment').value  = r.comment  || '';
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    area.innerHTML = `<div style="padding:0.75rem;background:var(--gray-50);border-radius:8px;border:1px solid var(--gray-200);">
      <div style="font-size:1.25rem;color:#f59e0b;letter-spacing:2px;">${stars}</div>
      <div style="font-size:0.8rem;color:var(--gray-500);margin-top:4px;">${RATING_LABELS[r.rating]} &bull; ${esc(r.category)}</div>
      ${r.comment ? `<p style="margin-top:0.5rem;font-size:0.875rem;">"${esc(r.comment)}"</p>` : ''}
      <div style="font-size:0.75rem;color:var(--gray-400);margin-top:0.5rem;">Submitted ${formatDate(r.createdAt)}</div>
    </div>`;
  } catch { area.innerHTML = '<p class="text-gray">Could not load your review.</p>'; }
}

async function loadReviewSummary() {
  const area = document.getElementById('review-summary-area');
  if (!area) return;
  try {
    const s = await apiGet('/api/reviews/summary');
    if (!s.total) { area.innerHTML = '<p class="text-gray">No ratings yet — be the first!</p>'; return; }
    const filled = Math.round(s.avgRating);
    const stars  = '★'.repeat(filled) + '☆'.repeat(5 - filled);
    area.innerHTML = `<div style="text-align:center;margin-bottom:1rem;">
      <div style="font-size:2.5rem;font-weight:800;color:#f59e0b;">${s.avgRating}</div>
      <div style="font-size:1.25rem;color:#f59e0b;letter-spacing:2px;">${stars}</div>
      <div style="font-size:0.8rem;color:var(--gray-500);margin-top:2px;">${s.total} review${s.total !== 1 ? 's' : ''}</div>
    </div>` +
    [5,4,3,2,1].map(n => {
      const count = s.distribution?.[n] ?? 0;
      const pct   = s.total ? Math.round((count / s.total) * 100) : 0;
      return `<div class="rating-bar-row">
        <span class="rating-bar-label">${n} ★</span>
        <div class="rating-bar-track"><div class="rating-bar-fill" style="width:${pct}%"></div></div>
        <span class="rating-bar-count">${count}</span>
      </div>`;
    }).join('');
  } catch { area.innerHTML = '<p class="text-gray">Could not load ratings.</p>'; }
}

async function submitReview() {
  if (!_selectedRating) { showToast('Please select a star rating first.', 'error'); return; }
  const payload = {
    rating:   _selectedRating,
    category: document.getElementById('review-category').value,
    comment:  (document.getElementById('review-comment').value || '').trim(),
  };
  try {
    await apiPost('/api/reviews', payload);
    showToast('Thank you for your feedback!', 'success');
    await initFeedbackSection();
  } catch (e) { showToast(e.message || 'Failed to submit review', 'error'); }
}