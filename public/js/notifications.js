/* public/js/notifications.js
   Drop-in notification bell widget for all EduAdapt dashboards.
   Include ONCE per page after auth.js:
     <script src="./js/notifications.js"></script>

   Replaces the existing notification bell button automatically.
   Polls for new notifications every 30 seconds.
*/

(function () {
  // ── Inject CSS ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .notif-bell-wrap {
      position: relative;
      display: inline-flex;
    }
    .notif-bell-btn {
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: var(--gray-100);
      display: flex; align-items: center; justify-content: center;
      font-size: 1.1rem; color: var(--gray-600);
      cursor: pointer; transition: background 0.2s;
      position: relative;
    }
    .notif-bell-btn:hover { background: var(--gray-200); }

    /* Red badge */
    .notif-badge {
      position: absolute; top: -3px; right: -3px;
      background: #ef4444; color: #fff;
      font-size: 0.6rem; font-weight: 700;
      min-width: 16px; height: 16px; border-radius: 99px;
      display: flex; align-items: center; justify-content: center;
      padding: 0 3px; pointer-events: none;
      display: none;
    }

    /* Dropdown panel */
    .notif-panel {
      position: absolute; top: calc(100% + 10px); right: 0;
      width: 360px; max-height: 480px;
      background: var(--white); border: 1px solid var(--gray-200);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      z-index: 9000; display: none; flex-direction: column;
      overflow: hidden;
    }
    .notif-panel.open { display: flex; }

    .notif-panel-header {
      padding: 14px 16px; border-bottom: 1px solid var(--gray-100);
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0;
    }
    .notif-panel-header .title {
      font-weight: 700; font-size: 0.95rem; color: var(--gray-900);
    }
    .notif-mark-all {
      font-size: 0.75rem; color: var(--blue-primary);
      background: none; border: none; cursor: pointer; font-weight: 600;
    }
    .notif-mark-all:hover { text-decoration: underline; }

    .notif-list {
      overflow-y: auto; flex: 1;
    }
    .notif-list::-webkit-scrollbar { width: 4px; }
    .notif-list::-webkit-scrollbar-thumb { background: var(--gray-200); border-radius: 2px; }

    .notif-item {
      display: flex; gap: 10px; padding: 12px 16px;
      border-bottom: 1px solid var(--gray-100);
      cursor: pointer; transition: background 0.15s;
      text-decoration: none; color: inherit;
    }
    .notif-item:hover { background: var(--gray-50); }
    .notif-item.unread { background: var(--blue-lighter); }
    .notif-item.unread:hover { background: #dbeafe; }

    .notif-icon {
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.1rem; flex-shrink: 0; background: var(--gray-100);
    }
    .notif-icon i { font-size: inherit; }
    .notif-icon.enrollment     { background: #dcfce7; }
    .notif-icon.course_approved { background: #dcfce7; }
    .notif-icon.course_rejected { background: #fee2e2; }
    .notif-icon.payment_received { background: #d1fae5; }
    .notif-icon.lesson_added    { background: #eff6ff; }
    .notif-icon.new_course      { background: #fef9c3; }
    .notif-icon.new_instructor  { background: #fef9c3; }
    .notif-icon.withdrawal_approved { background: #d1fae5; }
    .notif-icon.withdrawal_rejected { background: #fee2e2; }

    .notif-body { flex: 1; min-width: 0; }
    .notif-title {
      font-size: 0.85rem; font-weight: 600; color: var(--gray-900);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .notif-msg {
      font-size: 0.78rem; color: var(--gray-500); margin-top: 2px;
      line-height: 1.4; display: -webkit-box;
      -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .notif-time {
      font-size: 0.7rem; color: var(--gray-400); margin-top: 4px;
    }
    .notif-unread-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--blue-primary); flex-shrink: 0; margin-top: 4px;
    }

    .notif-empty {
      padding: 3rem 1rem; text-align: center;
      color: var(--gray-400); font-size: 0.88rem;
    }
    .notif-empty .icon { font-size: 2.5rem; margin-bottom: 0.5rem; }

    .notif-panel-footer {
      padding: 10px 16px; border-top: 1px solid var(--gray-100);
      text-align: center; flex-shrink: 0;
    }
    .notif-panel-footer a {
      font-size: 0.78rem; color: var(--blue-primary); font-weight: 600;
    }

    @media (max-width: 480px) {
      .notif-panel { width: calc(100vw - 24px); right: -60px; }
    }
  `;
  document.head.appendChild(style);

  // ── Icon map ────────────────────────────────────────────────────────────────
  const ICONS = {
    enrollment:           '<i class="fas fa-user"></i>',
    course_approved:      '<i class="fas fa-circle-check"></i>',
    course_rejected:      '<i class="fas fa-circle-xmark"></i>',
    lesson_added:         '<i class="fas fa-film"></i>',
    quiz_available:       '<i class="fas fa-pen-to-square"></i>',
    payment_received:     '<i class="fas fa-coins"></i>',
    withdrawal_approved:  '<i class="fas fa-circle-check"></i>',
    withdrawal_rejected:  '<i class="fas fa-circle-xmark"></i>',
    new_course:           '<i class="fas fa-book-open"></i>',
    new_instructor:       '<i class="fas fa-chalkboard-user"></i>',
  };

  // ── State ───────────────────────────────────────────────────────────────────
  let notifications = [];
  let panelOpen     = false;
  let pollInterval  = null;

  // ── Build the bell widget ───────────────────────────────────────────────────
  const buildWidget = () => {
    const wrap = document.createElement('div');
    wrap.className = 'notif-bell-wrap';
    wrap.innerHTML = `
      <button class="notif-bell-btn" id="notif-bell-btn"
              aria-label="Open notifications"
              aria-haspopup="true"
              aria-expanded="false"
              aria-controls="notif-panel">
        <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
        <span class="notif-badge" id="notif-badge"
              aria-live="polite"
              aria-atomic="true"
              role="status"></span>
      </button>
      <div class="notif-panel" id="notif-panel"
           role="dialog"
           aria-label="Notifications"
           aria-modal="false">
        <div class="notif-panel-header">
          <span class="title" id="notif-panel-title">Notifications</span>
          <button class="notif-mark-all" onclick="notifMarkAllRead()" aria-label="Mark all notifications as read">Mark all read</button>
        </div>
        <div class="notif-list" id="notif-list" aria-live="polite" aria-atomic="false"></div>
        <div class="notif-panel-footer" style="display:none;" id="notif-footer">
          <!-- future: link to full notifications page -->
        </div>
      </div>
    `;
    return wrap;
  };

  // ── Replace existing bell button ────────────────────────────────────────────
  const init = () => {
    const existing = document.querySelector('.header-icon-btn');
    if (!existing) return;

    const widget = buildWidget();

    // Insert widget before the existing bell (or replace it)
    existing.parentNode.insertBefore(widget, existing);
    existing.remove(); // remove the plain button

    // Bell click — toggle panel
    document.getElementById('notif-bell-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      panelOpen = !panelOpen;
      const panel = document.getElementById('notif-panel');
      const bellBtn = document.getElementById('notif-bell-btn');
      panel.classList.toggle('open', panelOpen);
      bellBtn.setAttribute('aria-expanded', String(panelOpen));
      if (panelOpen) {
        loadNotifications().then(() => {
          const unreadCount = notifications.filter(n => !n.read).length;
          const announcer = document.getElementById('sr-announcer');
          if (announcer) {
            announcer.textContent = 'Notification panel opened. You have ' + unreadCount + ' unread notification' + (unreadCount !== 1 ? 's' : '') + '.';
          }
          // Move focus into panel for keyboard users
          const firstFocusable = panel.querySelector('button, [tabindex]:not([tabindex="-1"])');
          if (firstFocusable) firstFocusable.focus();
        });
      }
    });

    // Escape key closes the panel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelOpen) {
        panelOpen = false;
        const panel = document.getElementById('notif-panel');
        const bellBtn = document.getElementById('notif-bell-btn');
        if (panel) panel.classList.remove('open');
        if (bellBtn) {
          bellBtn.setAttribute('aria-expanded', 'false');
          bellBtn.focus();
        }
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.notif-bell-wrap')) {
        panelOpen = false;
        const panel = document.getElementById('notif-panel');
        const bellBtn = document.getElementById('notif-bell-btn');
        if (panel) panel.classList.remove('open');
        if (bellBtn) bellBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Load immediately + poll every 30s
    loadNotifications();
    pollInterval = setInterval(loadUnreadCount, 30000);
  };

  // ── Time ago helper ─────────────────────────────────────────────────────────
  const timeAgo = (dateStr) => {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  };

  // ── Render notifications ────────────────────────────────────────────────────
  const renderList = () => {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (!notifications.length) {
      list.innerHTML = '<div class="notif-empty"><div class="icon"><i class="fas fa-bell"></i></div><p>No notifications yet.</p></div>';
      return;
    }

    list.innerHTML = notifications.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}"
           role="button"
           tabindex="0"
           onclick="notifClick('${n._id}', '${n.link || ''}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();notifClick('${n._id}','${n.link||''}');}"
           aria-label="${esc(n.title)}${!n.read ? ' (unread)' : ''}: ${esc(n.message)}"
           data-id="${n._id}">
        <div class="notif-icon ${n.type}" aria-hidden="true">${ICONS[n.type] || '<i class="fas fa-bell"></i>'}</div>
        <div class="notif-body">
          <div class="notif-title">${esc(n.title)}</div>
          <div class="notif-msg">${esc(n.message)}</div>
          <div class="notif-time">${timeAgo(n.createdAt)}</div>
        </div>
        ${!n.read ? '<div class="notif-unread-dot" aria-hidden="true"></div>' : ''}
      </div>
    `).join('');
  };

  // ── Update badge count ──────────────────────────────────────────────────────
  const updateBadge = (count) => {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (count > 0) {
      const label = (count > 99 ? '99+' : count) + ' unread notification' + (count !== 1 ? 's' : '');
      badge.textContent    = count > 99 ? '99+' : count;
      badge.setAttribute('aria-label', label);
      badge.style.display  = 'flex';
    } else {
      badge.textContent = '';
      badge.removeAttribute('aria-label');
      badge.style.display  = 'none';
    }
  };

  // ── Fetch all notifications ─────────────────────────────────────────────────
  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) return;
      notifications = await res.json();
      renderList();
      updateBadge(notifications.filter(n => !n.read).length);
    } catch {}
  };

  // ── Fetch unread count only (for background poll) ───────────────────────────
  const loadUnreadCount = async () => {
    try {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
      if (!res.ok) return;
      const { count } = await res.json();
      updateBadge(count);
    } catch {}
  };

  // ── Click a notification → mark read → navigate ─────────────────────────────
  window.notifClick = async (id, link) => {
    try {
      await fetch('/api/notifications/' + id + '/read', {
        method: 'PATCH',
        credentials: 'include'
      });
      // Update locally
      const n = notifications.find(x => x._id === id);
      if (n) n.read = true;
      renderList();
      updateBadge(notifications.filter(x => !x.read).length);
    } catch {}

    // Navigate to the link
    if (link && link !== 'null' && link !== '') {
      // Parse section from link query param if on same page
      const url = new URL(link, window.location.origin);
      const section = url.searchParams.get('section');
      const isSamePage = url.pathname === window.location.pathname;

      if (isSamePage && section && typeof showSection === 'function') {
        showSection(section);
        panelOpen = false;
        document.getElementById('notif-panel')?.classList.remove('open');
      } else {
        window.location.href = link;
      }
    }
  };

  // ── Mark all read ────────────────────────────────────────────────────────────
  window.notifMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'PATCH',
        credentials: 'include'
      });
      notifications.forEach(n => n.read = true);
      renderList();
      updateBadge(0);
    } catch {}
  };

  // ── Escape HTML ──────────────────────────────────────────────────────────────
  const esc = (str) => {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };

  // ── Wait for DOM then init ───────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();