// public/js/auth.js - Authentication helpers for all pages

const API = (() => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // If on production Railway domain, use relative URLs
  if (hostname === 'eduadapt-production-66d9.up.railway.app' || hostname.includes('railway.app')) {
    return '';
  }
  
  // If testing locally or from Live Server, route to Railway backend (use HTTPS)
  if (hostname === '127.0.0.1' || hostname === 'localhost') {
    return 'https://eduadapt-production-66d9.up.railway.app';
  }
  
  // Default to relative URLs
  return '';
})();

// ─── Token Management ─────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem('ea_token');
const getUser = () => {
  const u = localStorage.getItem('ea_user');
  return u ? JSON.parse(u) : null;
};
const setAuth = (token, user) => {
  if (token) localStorage.setItem('ea_token', token); // null/undefined = cookie-only session
  if (user)  localStorage.setItem('ea_user', JSON.stringify(user));
};
const clearAuth = () => {
  localStorage.removeItem('ea_token');
  localStorage.removeItem('ea_user');
};

// ─── Authenticated fetch ──────────────────────────────────────────────────────
const resolveApiUrl = (url) => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  const normalizedUrl = url.startsWith('/api')
    ? url
    : url.startsWith('/')
      ? `/api${url}`
      : `/api/${url}`;

  return `${API}${normalizedUrl}`;
};

const authFetch = async (url, options = {}) => {
  const token = getToken();
  return fetch(resolveApiUrl(url), {
    ...options,
    credentials: 'include', // send httpOnly cookie on every request
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
};

// authFetch with FormData (no Content-Type override)
const authFetchForm = async (url, options = {}) => {
  const token = getToken();
  return fetch(resolveApiUrl(url), {
    ...options,
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
};

// ─── Toast Notifications ──────────────────────────────────────────────────────
const showToast = (message, type = 'default') => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
};

// ─── Route Guards ─────────────────────────────────────────────────────────────
// Auth uses httpOnly cookies — token is never readable by JS.
// requireAuth only checks the cached user profile for role-based routing.
// Real auth enforcement happens server-side on every API call.
const requireAuth = (expectedRole) => {
  const user = getUser();
  if (!user) {
    window.location.href = './login.html';
    return false;
  }

  if (expectedRole) {
    const roles = Array.isArray(expectedRole) ? expectedRole : [expectedRole];
    if (!roles.includes(user.role)) {
      window.location.href = './login.html';
      return false;
    }
  }

  return true;
};

const redirectIfLoggedIn = () => {
  const user = getUser();
  if (!user) return;
  if (user.role === 'admin') window.location.href = './admin-dashboard.html';
  else if (user.role === 'instructor') window.location.href = './instructor-dashboard.html';
  else window.location.href = './student-dashboard.html';
};

// ─── Logout ───────────────────────────────────────────────────────────────────
const logout = () => {
  // Clear server-side httpOnly cookie
  fetch(resolveApiUrl('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include',
  }).finally(() => {
    clearAuth();
    window.location.href = './login.html';
  });
};

// ─── Set user display in sidebar ──────────────────────────────────────────────
const setUserDisplay = () => {
  const user = getUser();
  if (!user) return;

  const nameEls = document.querySelectorAll('.user-display-name');
  const roleEls = document.querySelectorAll('.user-display-role');
  const avatarEls = document.querySelectorAll('.user-display-avatar');

  nameEls.forEach(el => el.textContent = user.fullName || 'User');
  roleEls.forEach(el => el.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1));
  avatarEls.forEach(el => el.textContent = (user.fullName || 'U').charAt(0).toUpperCase());
};

// ─── Navigation active state ──────────────────────────────────────────────────
const setActiveNav = (id) => {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
};

// ─── Format date ─────────────────────────────────────────────────────────────
const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// ─── API Helpers ──────────────────────────────────────────────────────────────
const parseResponse = async (res) => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const normalizeApiError = (data) => {
  if (!data) return 'Request failed';
  if (typeof data === 'string') {
    const stripped = data.replace(/<[^>]*>/g, '').trim();
    return stripped || 'Request failed';
  }
  if (data.message) return data.message;
  return 'Request failed';
};

const handle401 = (res) => {
  if (res.status === 401) {
    clearAuth();
    window.location.href = './login.html';
    return true;
  }
  return false;
};

const apiGet = async (url) => {
  const res = await authFetch(url);
  if (handle401(res)) return;
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(normalizeApiError(data));
  return data;
};

const apiPost = async (url, body) => {
  const res = await authFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (handle401(res)) return;
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(normalizeApiError(data));
  return data;
};

const apiPatch = async (url, body = {}) => {
  const res = await authFetch(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (handle401(res)) return;
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(normalizeApiError(data));
  return data;
};

const apiPatchForm = async (url, formData) => {
  const res = await authFetchForm(url, {
    method: 'PATCH',
    body: formData,
  });
  if (handle401(res)) return;
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(normalizeApiError(data));
  return data;
};

const apiDelete = async (url) => {
  const res = await authFetch(url, { method: 'DELETE' });
  if (handle401(res)) return;
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(normalizeApiError(data));
  return data;
};

// ── Password visibility toggle ────────────────────────────────────────────────
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = isHidden ? 'visibility_off' : 'visibility';
}
