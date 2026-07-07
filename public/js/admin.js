/* public/js/admin.js – EduAdapt Admin Dashboard Logic */

// ─── State ────────────────────────────────────────────────────────────────────
let allUsers         = [];
let allCourses       = [];
let allInstructors   = [];
let allEnrollments   = [];
let allQoE           = [];
let allLogs          = [];
let rejectTarget     = null;
let userFilterTab    = 'all';
let courseFilter     = 'all';
let instructorFilter = 'all';

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  requireAuth(['admin']);
  setUserDisplay();
  await loadDashboard();
  // Navigate to ?section= if the page was opened via a notification link
  const urlSection = new URLSearchParams(window.location.search).get('section');
  if (urlSection) showSection(urlSection);
});

// ─── Section Navigation ───────────────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('[id^="section-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('section-' + name).style.display = '';
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  if (name === 'instructors') renderInstructors(instructorFilter);
  if (name === 'courses')     renderCourses(courseFilter);
  if (name === 'users')       searchUsers(1);
  if (name === 'settings')    { loadSettings(); if (typeof load2FAStatus === 'function') load2FAStatus(); }
  if (name === 'enrollments') loadEnrollments();
  if (name === 'qoe')         loadQoE();
  if (name === 'logs')        loadLogs();
  if (name === 'reviews')     loadReviews();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  document.getElementById('admin-status-line').textContent =
    'Status Report: ' + dateStr + ' • System Health: Operational';
  await Promise.all([loadStats(), loadUsers(), loadCourses(), loadInstructors()]);
  renderDashboardWidgets();
  renderUsersPreview();
}

async function loadStats() {
  try {
    const stats = await apiGet('/api/admin/dashboard-stats');
    document.getElementById('stat-total-users').textContent         = stats.totalUsers          ?? 0;
    document.getElementById('stat-students').textContent            = stats.totalStudents        ?? 0;
    document.getElementById('stat-instructors').textContent         = stats.totalInstructors     ?? 0;
    document.getElementById('stat-pending-instructors').textContent = stats.pendingInstructors   ?? 0;
    document.getElementById('stat-pending-courses').textContent     = stats.pendingCourses       ?? 0;
    document.getElementById('stat-approved-courses').textContent    = stats.approvedCourses      ?? 0;
    document.getElementById('stat-enrollments').textContent         = stats.totalEnrollments     ?? 0;
    document.getElementById('stat-qoe').textContent                 = stats.totalQoERecords      ?? 0;
  } catch(e) { console.error('Stats error:', e); }
}

let usersPage         = 1;
let usersDebounceTimer = null;

function debounceUserSearch() {
  clearTimeout(usersDebounceTimer);
  usersDebounceTimer = setTimeout(() => searchUsers(1), 350);
}

async function searchUsers(page = 1) {
  usersPage = page;
  const search = (document.getElementById('users-search')?.value || '').trim();
  const role   = document.getElementById('users-role-filter')?.value || '';
  const tbody  = document.getElementById('all-users-tbody');
  const pagEl  = document.getElementById('users-pagination');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">' + (window.t ? t('common.loading') : 'Loading…') + '</td></tr>';
  if (pagEl) pagEl.innerHTML = '';

  const params = new URLSearchParams({ page, limit: 20 });
  if (search) params.set('search', search);
  if (role)   params.set('role', role);

  try {
    const r = await apiGet('/api/admin/users?' + params.toString());
    allUsers = r.users || r;
    renderUserTable(allUsers, 'all-users-tbody', 'all');
    renderPagination('users-pagination', r.pages || 1, page, searchUsers);
  } catch { allUsers = []; }
}

async function loadUsers() {
  try { const r = await apiGet('/api/admin/users?limit=200'); allUsers = r.users || r; } catch { allUsers = []; }
}
async function loadCourses()     { try { const r = await apiGet('/api/admin/courses?limit=200');     allCourses     = r.courses     || r; } catch { allCourses     = []; } }
async function loadInstructors() { try {                  allInstructors = await apiGet('/api/admin/instructors');                        } catch { allInstructors = []; } }

// ─── Dashboard Widgets ────────────────────────────────────────────────────────
function renderDashboardWidgets() {
  const pendingCourses = allCourses.filter(c => c.approvalStatus === 'pending');
  const pcList = document.getElementById('pending-courses-list');
  pcList.innerHTML = !pendingCourses.length
    ? '<p class="empty-state">' + (window.t ? t('adm.no_pending_courses') : 'No courses pending approval.') + '</p>'
    : pendingCourses.slice(0, 4).map(c => `
        <div class="approval-item">
          <div class="approval-thumb" style="background:${hashColor(c._id)};"></div>
          <div class="approval-info">
            <div class="approval-title">${esc(c.title)}</div>
            <div class="approval-sub">by ${esc(c.instructorId?.fullName || 'Unknown')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button class="btn btn-sm btn-success" onclick="approveCourse('${c._id}')">✓</button>
            <button class="btn btn-sm btn-danger"  onclick="openRejectModal('course','${c._id}','${esc(c.title)}')">✕</button>
          </div>
        </div>`).join('');

  const pendingInstructors = allInstructors.filter(i => i.approvalStatus === 'pending');
  const piList = document.getElementById('pending-instructors-list');
  piList.innerHTML = !pendingInstructors.length
    ? '<p class="empty-state">' + (window.t ? t('adm.no_pending_instr') : 'No instructor approvals pending.') + '</p>'
    : pendingInstructors.slice(0, 4).map(i => `
        <div class="approval-item">
          <div class="user-avatar" style="width:40px;height:40px;font-size:1rem;">${(i.fullName||'?')[0].toUpperCase()}</div>
          <div class="approval-info">
            <div class="approval-title">${esc(i.fullName)}</div>
            <div class="approval-sub">${esc(i.email)}</div>
            ${i.verificationDocument ? `<a class="form-hint" href="${resolveUrl(i.verificationDocument)}" target="_blank" style="color:var(--blue-primary);">View Document ↗</a>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button class="btn btn-sm btn-success" onclick="approveInstructor('${i._id}')">✓</button>
            <button class="btn btn-sm btn-danger"  onclick="openRejectModal('instructor','${i._id}','${esc(i.fullName)}')">✕</button>
          </div>
        </div>`).join('');
}

// ─── Users ────────────────────────────────────────────────────────────────────
function renderUsersPreview() { renderUserTable(allUsers, 'users-preview-tbody', userFilterTab); }
function renderAllUsers(users) { renderUserTable(users, 'all-users-tbody', 'all'); }

function filterUsersTab(filter, btn) {
  userFilterTab = filter;
  document.querySelectorAll('#section-dashboard .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderUserTable(allUsers, 'users-preview-tbody', filter);
}

function renderUserTable(users, tbodyId, filter) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const filtered = filter === 'all' ? users : users.filter(u => u.role === filter);
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">' + (window.t ? t('common.no_data') : 'No users found.') + '</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="user-avatar" style="width:34px;height:34px;font-size:0.85rem;">${(u.fullName||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-weight:600;">${esc(u.fullName)}</div>
            <div style="font-size:0.8rem;color:var(--gray-500);">${esc(u.email)}</div>
          </div>
        </div>
      </td>
      <td>${esc(u.email)}</td>
      <td><span class="badge ${roleBadge(u.role)}">${u.role.toUpperCase()}</span></td>
      <td>${formatDate(u.createdAt)}</td>
      <td><span class="badge ${u.isActive ? 'badge-success' : 'badge-danger'}">${u.isActive ? '● ACTIVE' : '● INACTIVE'}</span></td>
      <td>
        ${u.role !== 'admin' ? `
          <button class="btn-icon" title="${u.isActive ? 'Deactivate' : 'Activate'}"
            onclick="toggleUserStatus('${u._id}',${u.isActive})">${u.isActive ? '🚫' : '✅'}</button>
          <button class="btn-icon" title="Delete" onclick="deleteUser('${u._id}')">🗑️</button>
        ` : '<span style="color:var(--gray-400);">–</span>'}
      </td>
    </tr>`).join('');
}

async function toggleUserStatus(userId, isActive) {
  if (!confirm('Are you sure you want to ' + (isActive ? 'deactivate' : 'activate') + ' this user?')) return;
  try {
    await apiPatch('/api/admin/users/' + userId, { isActive: !isActive });
    showToast('User ' + (isActive ? 'deactivated' : 'activated') + '.', 'success');
    await loadUsers();
    renderUsersPreview();
    renderAllUsers(allUsers);
    renderUserTable(allUsers, 'all-users-tbody-settings', 'all');
  } catch(e) { showToast(e.message || 'Action failed.', 'error'); }
}

async function deleteUser(userId) {
  if (!confirm('Permanently delete this user? This cannot be undone.')) return;
  try {
    await apiDelete('/api/admin/users/' + userId);
    showToast('User deleted.', 'success');
    await loadUsers();
    renderUsersPreview();
    renderAllUsers(allUsers);
    renderUserTable(allUsers, 'all-users-tbody-settings', 'all');
  } catch(e) { showToast(e.message || 'Delete failed.', 'error'); }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const user = await apiGet('/api/auth/me');
    const fn = document.getElementById('settings-fullname');
    const em = document.getElementById('settings-email');
    const ph = document.getElementById('settings-phone');
    const av = document.getElementById('settings-avatar-preview');
    if (fn) fn.value = user.fullName || '';
    if (em) em.value = user.email   || '';
    if (ph) ph.value = user.phone   || '';
    if (av) av.src   = user.avatar ? resolveUrl(user.avatar) : '';
    await loadUsers();
    renderAllUsers(allUsers);
    renderUserTable(allUsers, 'all-users-tbody-settings', 'all');
  } catch(e) { console.error('Settings load failed', e); }
}

async function submitAdminProfileForm(event) {
  event.preventDefault();
  try {
    const result = await apiPatchForm('/api/auth/profile', new FormData(document.getElementById('settings-form')));
    setAuth(getToken(), result.user);
    setUserDisplay();
    showToast(result.message || 'Profile updated', 'success');
  } catch(e) { showToast(e.message || 'Profile update failed', 'error'); }
}

async function submitAdminPasswordForm(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('settings-current-password')?.value.trim();
  const newPassword     = document.getElementById('settings-new-password')?.value.trim();
  const confirmPassword = document.getElementById('settings-confirm-password')?.value.trim();
  try {
    const result = await apiPatch('/api/auth/password', { currentPassword, newPassword, confirmPassword });
    document.getElementById('settings-current-password').value = '';
    document.getElementById('settings-new-password').value     = '';
    document.getElementById('settings-confirm-password').value = '';
    showToast(result.message || 'Password updated', 'success');
  } catch(e) { showToast(e.message || 'Password update failed', 'error'); }
}

// ─── Instructors ──────────────────────────────────────────────────────────────
function filterInstructors(filter, btn) {
  instructorFilter = filter;
  document.querySelectorAll('#section-instructors .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderInstructors(filter);
}

function renderInstructors(filter = 'all') {
  const tbody = document.getElementById('instructors-tbody');
  const list  = filter === 'all' ? allInstructors : allInstructors.filter(i => i.approvalStatus === filter);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">' + (window.t ? t('common.no_data') : 'No instructors found.') + '</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(i => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="user-avatar" style="width:34px;height:34px;font-size:0.85rem;">${(i.fullName||'?')[0].toUpperCase()}</div>
          <strong>${esc(i.fullName)}</strong>
        </div>
      </td>
      <td>${esc(i.email)}</td>
      <td>${formatDate(i.createdAt)}</td>
      <td><span class="badge ${statusBadge(i.approvalStatus)}">${i.approvalStatus}</span></td>
      <td>
        ${i.verificationDocument
          ? '<a href="' + resolveUrl(i.verificationDocument) + '" target="_blank" class="btn btn-sm btn-secondary">View Doc ↗</a>'
          : '<span style="color:var(--gray-400);">No document</span>'}
      </td>
      <td>
        ${i.approvalStatus === 'pending' ? `
          <button class="btn btn-sm btn-success" onclick="approveInstructor('${i._id}')">Approve</button>
          <button class="btn btn-sm btn-danger"  onclick="openRejectModal('instructor','${i._id}','${esc(i.fullName)}')">Reject</button>
        ` : i.approvalStatus === 'approved' ? `
          <button class="btn btn-sm btn-secondary" onclick="openRejectModal('instructor','${i._id}','${esc(i.fullName)}')">Revoke</button>
        ` : '<span class="badge badge-danger">Rejected</span>'}
      </td>
    </tr>`).join('');
}

async function approveInstructor(id) {
  try {
    const data = await apiPatch('/api/admin/instructors/' + id + '/approve', {});
    if (data && data.emailSent === false) {
      showToast('Instructor approved! (Email notification failed to send — check SMTP settings.)', 'warning');
    } else {
      showToast('Instructor approved! Notification email sent.', 'success');
    }
    await loadInstructors(); await loadStats();
    renderInstructors(instructorFilter); renderDashboardWidgets();
  } catch(e) { showToast(e.message || 'Failed.', 'error'); }
}

// ─── Courses ──────────────────────────────────────────────────────────────────
function filterCourses(filter, btn) {
  courseFilter = filter;
  document.querySelectorAll('#section-courses .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCourses(filter);
}

function renderCourses(filter = 'all') {
  const tbody = document.getElementById('courses-tbody');
  const list  = filter === 'all' ? allCourses : allCourses.filter(c => c.approvalStatus === filter);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">' + (window.t ? t('common.no_data') : 'No courses found.') + '</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="course-thumb-sm" style="background:${hashColor(c._id)};"></div>
          <div>
            <strong>${esc(c.title)}</strong>
            ${c.rejectionReason ? '<div style="font-size:0.78rem;color:var(--red);">Reason: ' + esc(c.rejectionReason) + '</div>' : ''}
          </div>
        </div>
      </td>
      <td>${esc(c.instructorId?.fullName || 'Unknown')}</td>
      <td>${esc(c.category || '–')}</td>
      <td><span class="badge badge-secondary">${c.difficultyLevel || '–'}</span></td>
      <td><span class="badge ${statusBadge(c.approvalStatus)}">${c.approvalStatus}</span></td>
      <td>
        <button class="btn-icon" title="View Lessons" onclick="viewCourseLessons('${c._id}','${esc(c.title)}')">📋</button>
        ${c.approvalStatus === 'pending' ? `
          <button class="btn btn-sm btn-success" onclick="approveCourse('${c._id}')">Approve</button>
          <button class="btn btn-sm btn-danger"  onclick="openRejectModal('course','${c._id}','${esc(c.title)}')">Reject</button>
        ` : c.approvalStatus === 'approved' ? `
          <button class="btn btn-sm btn-secondary" onclick="openRejectModal('course','${c._id}','${esc(c.title)}')">Revoke</button>
        ` : `
          <button class="btn btn-sm btn-success" onclick="approveCourse('${c._id}')">Re-Approve</button>
        `}
      </td>
    </tr>`).join('');
}

async function approveCourse(id) {
  try {
    await apiPatch('/api/admin/courses/' + id + '/approve', {});
    showToast('Course approved and published!', 'success');
    await loadCourses(); await loadStats();
    renderCourses(courseFilter); renderDashboardWidgets();
  } catch(e) { showToast(e.message || 'Failed.', 'error'); }
}

// ─── View Lessons ─────────────────────────────────────────────────────────────
async function viewCourseLessons(courseId, title) {
  document.getElementById('view-lessons-title').textContent = 'Lessons: ' + title;
  document.getElementById('view-lessons-body').innerHTML = '<p class="empty-state">Loading...</p>';
  openModal('view-lessons-modal');
  try {
    const lessons = await apiGet('/api/admin/courses/' + courseId + '/lessons');
    if (!lessons.length) {
      document.getElementById('view-lessons-body').innerHTML = '<p class="empty-state">No lessons uploaded yet.</p>';
      return;
    }
    document.getElementById('view-lessons-body').innerHTML = '<div class="lesson-list">'
      + lessons.sort((a,b) => a.order - b.order).map(l => `
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
              </div>
            </div>
            <div class="lesson-actions">
              ${l.videoOriginal ? `
                <button class="btn btn-sm btn-primary"
                  onclick="playAdminVideo('${l.videoOriginal}','${esc(l.title)}')">
                  ▶ Play
                </button>` : ''}
              ${l.pdfNote ? '<a class="btn btn-sm btn-secondary" href="' + resolveUrl(l.pdfNote) + '" target="_blank">PDF ↗</a>' : ''}
            </div>
          </div>`).join('')
      + '</div>';
  } catch(e) {
    document.getElementById('view-lessons-body').innerHTML = '<p class="empty-state">Error loading lessons.</p>';
  }
}

// ── FIX: resolve Cloudinary URLs correctly — never prepend / to https:// ──────
function resolveUrl(src) {
  if (!src) return '#';
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return '/' + src.replace(/^\//, '');
}

function playAdminVideo(url, title) {
  document.getElementById('video-modal-title').textContent       = title;
  document.getElementById('admin-video-player').src              = resolveUrl(url); // ← THE FIX
  document.getElementById('admin-video-meta').innerHTML          =
    '<p style="color:var(--gray-500);font-size:0.9rem;">Playing: ' + esc(title) + '</p>';
  openModal('video-modal');
}

function closeVideoModal() {
  const v = document.getElementById('admin-video-player');
  v.pause(); v.src = '';
  closeModal('video-modal');
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function openRejectModal(type, id, name) {
  rejectTarget = { type, id };
  document.getElementById('reject-modal-title').textContent =
    'Reject ' + (type === 'course' ? 'Course' : 'Instructor') + ': ' + name;
  document.getElementById('reject-reason').value = '';
  openModal('reject-modal');
}

async function confirmReject() {
  if (!rejectTarget) return;
  const reason = document.getElementById('reject-reason').value.trim();
  try {
    if (rejectTarget.type === 'instructor') {
      const data = await apiPatch('/api/admin/instructors/' + rejectTarget.id + '/reject', { reason });
      if (data && data.emailSent === false) {
        showToast('Instructor rejected. (Email notification failed to send — check SMTP settings.)', 'warning');
      } else {
        showToast('Instructor rejected. Notification email sent.', 'success');
      }
      await loadInstructors(); renderInstructors(instructorFilter);
    } else {
      await apiPatch('/api/admin/courses/' + rejectTarget.id + '/reject', { reason });
      showToast('Course rejected.', 'success');
      await loadCourses(); renderCourses(courseFilter);
    }
    await loadStats(); renderDashboardWidgets();
    closeModal('reject-modal');
  } catch(e) { showToast(e.message || 'Rejection failed.', 'error'); }
}

// ─── Enrollments ──────────────────────────────────────────────────────────────
let enrollPage = 1;

async function loadEnrollments(page = 1) {
  enrollPage = page;
  const tbody = document.getElementById('enrollments-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="table-empty">' + (window.t ? t('common.loading') : 'Loading...') + '</td></tr>';
  try {
    const r = await apiGet('/api/admin/enrollments?page=' + page + '&limit=20');
    allEnrollments = r.enrollments || r;
    if (!allEnrollments.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">' + (window.t ? t('common.no_data') : 'No enrollments found.') + '</td></tr>';
      renderPagination('enrollments-pagination', r.pages || 1, page, loadEnrollments);
      return;
    }
    tbody.innerHTML = allEnrollments.map(e => `
      <tr>
        <td><strong>${esc(e.studentId?.fullName||'–')}</strong><br><small>${esc(e.studentId?.email||'–')}</small></td>
        <td>${esc(e.courseId?.title||'–')}</td>
        <td>${esc(e.instructorId?.fullName||'–')}</td>
        <td>${formatDate(e.enrolledAt)}</td>
        <td><span class="badge ${e.status==='active'?'badge-success':'badge-secondary'}">${e.status}</span></td>
      </tr>`).join('');
    renderPagination('enrollments-pagination', r.pages || 1, page, loadEnrollments);
  } catch { tbody.innerHTML = '<tr><td colspan="5" class="table-empty">' + (window.t ? t('common.error') : 'Error loading enrollments.') + '</td></tr>'; }
}

// ─── QoE Records ──────────────────────────────────────────────────────────────
async function loadQoE() {
  const tbody = document.getElementById('qoe-tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="table-empty">' + (window.t ? t('common.loading') : 'Loading...') + '</td></tr>';
  try {
    allQoE = await apiGet('/api/admin/qoe-records');
    document.getElementById('qoe-total').textContent = allQoE.length;
    const avgBw = allQoE.length
      ? (allQoE.reduce((s,r) => s + (r.bandwidthSpeed||0), 0) / allQoE.length).toFixed(2) : 0;
    document.getElementById('qoe-avg-bw').textContent       = avgBw + ' Mbps';
    document.getElementById('qoe-video-count').textContent  = allQoE.filter(r => r.selectedMode === 'video').length;
    document.getElementById('qoe-fallback-count').textContent = allQoE.filter(r => r.selectedMode !== 'video').length;
    if (!allQoE.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="table-empty">' + (window.t ? t('common.no_data') : 'No QoE records found.') + '</td></tr>'; return;
    }
    tbody.innerHTML = allQoE.map(r => `
      <tr>
        <td>${esc(r.studentId?.fullName||'–')}</td>
        <td>${esc(r.courseId?.title||'–')}</td>
        <td>${r.bandwidthSpeed!=null ? r.bandwidthSpeed.toFixed(2)+' Mbps' : '–'}</td>
        <td>${r.responseTime!=null ? r.responseTime+' ms' : '–'}</td>
        <td>${r.sessionInterruptions??0}</td>
        <td><span class="badge ${r.selectedMode==='video'?'badge-info':'badge-warning'}">${r.selectedMode||'–'}</span></td>
        <td>${r.selectedVideoQuality||'–'}</td>
        <td style="font-size:0.8rem;max-width:200px;">${esc(r.adaptiveDecision||'–')}</td>
        <td>${formatDate(r.createdAt)}</td>
      </tr>`).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="9" class="table-empty">' + (window.t ? t('common.error') : 'Error loading QoE records.') + '</td></tr>'; }
}

// ─── Activity Logs ────────────────────────────────────────────────────────────
let logsPage = 1;

async function loadLogs(page = 1) {
  logsPage = page;
  const tbody = document.getElementById('logs-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="table-empty">' + (window.t ? t('common.loading') : 'Loading...') + '</td></tr>';
  try {
    const r = await apiGet('/api/activity-logs?page=' + page + '&limit=25');
    allLogs = r.logs || r;
    if (!allLogs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">' + (window.t ? t('common.no_data') : 'No activity logs found.') + '</td></tr>';
      renderPagination('logs-pagination', r.pages || 1, page, loadLogs);
      return;
    }
    tbody.innerHTML = allLogs.map(l => `
      <tr>
        <td>
          <strong>${esc(l.userId?.fullName||'System')}</strong>
          <div style="font-size:0.78rem;color:var(--gray-500);">${esc(l.userId?.email||'')}</div>
        </td>
        <td><span class="badge ${roleBadge(l.role)}">${l.role||'–'}</span></td>
        <td><code style="font-size:0.8rem;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${esc(l.action)}</code></td>
        <td style="font-size:0.88rem;max-width:300px;">${esc(l.description||'–')}</td>
        <td style="font-size:0.85rem;">${formatDate(l.createdAt)}</td>
      </tr>`).join('');
    renderPagination('logs-pagination', r.pages || 1, page, loadLogs);
  } catch { tbody.innerHTML = '<tr><td colspan="5" class="table-empty">' + (window.t ? t('common.error') : 'Error loading logs.') + '</td></tr>'; }
}

// ─── Pagination Helper ────────────────────────────────────────────────────────
function renderPagination(containerId, totalPages, currentPage, loadFn) {
  const el = document.getElementById(containerId);
  if (!el || totalPages <= 1) { if (el) el.innerHTML = ''; return; }
  const prev = currentPage > 1;
  const next = currentPage < totalPages;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;justify-content:center;padding:12px 0;">
      <button class="btn btn-sm btn-secondary" ${prev ? '' : 'disabled'} onclick="${loadFn.name}(${currentPage - 1})">← Prev</button>
      <span style="font-size:0.875rem;color:var(--gray-600);">Page ${currentPage} of ${totalPages}</span>
      <button class="btn btn-sm btn-secondary" ${next ? '' : 'disabled'} onclick="${loadFn.name}(${currentPage + 1})">Next →</button>
    </div>`;
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
  if (s==='approved') return 'badge-success';
  if (s==='pending')  return 'badge-warning';
  if (s==='rejected') return 'badge-danger';
  return 'badge-secondary';
}
function roleBadge(r) {
  if (r==='admin')      return 'badge-danger';
  if (r==='instructor') return 'badge-info';
  return 'badge-secondary';
}
// ─── Reviews ──────────────────────────────────────────────────────────────────
const CATEGORY_LABELS = {
  overall: 'Overall',
  ui_ux: 'UI & UX',
  content: 'Content',
  performance: 'Performance',
  support: 'Support',
};

async function loadReviews() {
  try {
    const [summary, reviews] = await Promise.all([
      apiGet('/api/reviews/summary'),
      apiGet('/api/reviews'),
    ]);
    renderReviewSummary(summary);
    renderReviewsTable(reviews);
  } catch (e) {
    document.getElementById('reviews-tbody').innerHTML =
      '<tr><td colspan="7" class="table-empty">Failed to load reviews.</td></tr>';
  }
}

function renderReviewSummary(s) {
  const total = s.total || 0;
  document.getElementById('rev-stat-total').textContent = total;
  document.getElementById('rev-stat-avg').textContent   = total ? s.avgRating + ' ★' : '–';
  document.getElementById('rev-stat-5star').textContent = s.distribution?.[5] ?? 0;
  const low = (s.distribution?.[1] ?? 0) + (s.distribution?.[2] ?? 0);
  document.getElementById('rev-stat-low').textContent   = low;

  const dist = document.getElementById('rev-distribution');
  if (!total) { dist.innerHTML = '<p class="empty-state">No reviews yet.</p>'; return; }
  dist.innerHTML = [5,4,3,2,1].map(star => {
    const count = s.distribution?.[star] ?? 0;
    const pct   = total ? Math.round((count / total) * 100) : 0;
    return `<div class="rating-bar-row">
      <span class="rating-bar-label">${star} ★</span>
      <div class="rating-bar-track"><div class="rating-bar-fill" style="width:${pct}%"></div></div>
      <span class="rating-bar-count">${count}</span>
    </div>`;
  }).join('');
}

function renderReviewsTable(reviews) {
  const tbody = document.getElementById('reviews-tbody');
  if (!reviews.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No reviews submitted yet.</td></tr>';
    return;
  }
  tbody.innerHTML = reviews.map(r => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const user  = r.userId || {};
    return `<tr>
      <td><strong>${esc(user.fullName || '–')}</strong><div style="font-size:0.78rem;color:var(--gray-500);">${esc(user.email || '')}</div></td>
      <td><span class="badge ${roleBadge(user.role || '')}">${(user.role || '–').toUpperCase()}</span></td>
      <td style="color:#f59e0b;letter-spacing:1px;">${stars}</td>
      <td>${esc(CATEGORY_LABELS[r.category] || r.category)}</td>
      <td style="max-width:260px;word-break:break-word;">${esc(r.comment || '–')}</td>
      <td>${formatDate(r.createdAt)}</td>
      <td><button class="btn-icon" title="Delete review" onclick="deleteReview('${r._id}')">🗑️</button></td>
    </tr>`;
  }).join('');
}

async function deleteReview(id) {
  if (!confirm('Delete this review?')) return;
  try {
    await apiDelete('/api/reviews/' + id);
    showToast('Review deleted', 'success');
    loadReviews();
  } catch (e) {
    showToast(e.message || 'Failed to delete review', 'error');
  }
}

function hashColor(str) {
  const colors = ['#1d4ed8','#0891b2','#059669','#7c3aed','#db2777','#ea580c','#ca8a04'];
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[Math.abs(h)];
}
