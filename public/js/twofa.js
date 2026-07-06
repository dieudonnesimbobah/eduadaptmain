// public/js/twofa.js — 2FA setup/disable UI, shared across all dashboards

(function () {

// ── Render the status card ────────────────────────────────────────────────────
async function load2FAStatus() {
  const card = document.getElementById('twofa-status-card');
  if (!card) return;
  card.innerHTML = '<p style="color:var(--gray-400);font-size:0.875rem;">Loading…</p>';

  try {
    const data = await apiGet('/api/auth/me');
    if (data.twoFactorEnabled) {
      renderEnabled(card);
    } else {
      renderDisabled(card);
    }
  } catch {
    card.innerHTML = '<p style="color:var(--red);">Could not load 2FA status.</p>';
  }
}

// ── 2FA is OFF — show enable flow ─────────────────────────────────────────────
function renderDisabled(card) {
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem;">
      <span class="material-symbols-outlined" style="font-size:2rem;color:var(--gray-400);">shield</span>
      <div>
        <div style="font-weight:600;">2FA is <span style="color:var(--red);">disabled</span></div>
        <div style="font-size:0.8rem;color:var(--gray-500);">Add an extra layer of security to your account.</div>
      </div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="start2FASetup()">Enable Two-Factor Authentication</button>

    <!-- Setup wizard (hidden until button clicked) -->
    <div id="twofa-setup-wizard" class="hidden" style="margin-top:1.5rem;border-top:1px solid var(--gray-200);padding-top:1.25rem;">
      <p style="font-size:0.875rem;margin-bottom:1rem;">
        <strong>Step 1.</strong> Install an authenticator app on your phone
        (<a href="https://googleauthenticator.net" target="_blank" rel="noopener">Google Authenticator</a>,
        <a href="https://authy.com" target="_blank" rel="noopener">Authy</a>, or similar).<br>
        <strong>Step 2.</strong> Scan the QR code below, or enter the key manually.<br>
        <strong>Step 3.</strong> Enter the 6-digit code to confirm.
      </p>
      <div id="twofa-qr-wrap" style="text-align:center;margin-bottom:1rem;">
        <div class="spinner" style="margin:auto;"></div>
      </div>
      <div id="twofa-manual-key" style="font-size:0.8rem;color:var(--gray-500);word-break:break-all;text-align:center;margin-bottom:1rem;"></div>
      <div id="twofa-setup-alert"></div>
      <div class="form-group" style="margin-bottom:0.75rem;">
        <label class="form-label" for="twofa-enable-code">Enter the 6-digit code from your app</label>
        <input type="text" id="twofa-enable-code" class="form-input"
          placeholder="000 000" maxlength="7" inputmode="numeric"
          style="letter-spacing:0.3em;font-size:1.4rem;text-align:center;" />
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" id="twofa-enable-btn" onclick="confirmEnable2FA()">Activate 2FA</button>
        <button class="btn btn-secondary btn-sm" onclick="cancelSetup()">Cancel</button>
      </div>
    </div>`;
}

// ── 2FA is ON — show disable flow ─────────────────────────────────────────────
function renderEnabled(card) {
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem;">
      <span class="material-symbols-outlined" style="font-size:2rem;color:var(--green);">verified_user</span>
      <div>
        <div style="font-weight:600;">2FA is <span style="color:var(--green);">enabled</span></div>
        <div style="font-size:0.8rem;color:var(--gray-500);">Your account is protected with an authenticator app.</div>
      </div>
    </div>
    <button class="btn btn-secondary btn-sm" onclick="showDisable2FA()" style="border-color:var(--red);color:var(--red);">
      Disable Two-Factor Authentication
    </button>

    <!-- Disable form (hidden until button clicked) -->
    <div id="twofa-disable-form" class="hidden" style="margin-top:1.5rem;border-top:1px solid var(--gray-200);padding-top:1.25rem;">
      <p style="font-size:0.875rem;margin-bottom:1rem;">
        To disable 2FA, confirm your password and enter a valid authenticator code.
      </p>
      <div id="twofa-disable-alert"></div>
      <div class="form-group">
        <label class="form-label" for="twofa-disable-password">Current Password</label>
        <input type="password" id="twofa-disable-password" class="form-input" autocomplete="current-password" />
      </div>
      <div class="form-group">
        <label class="form-label" for="twofa-disable-code">Authenticator Code</label>
        <input type="text" id="twofa-disable-code" class="form-input"
          placeholder="000 000" maxlength="7" inputmode="numeric"
          style="letter-spacing:0.3em;font-size:1.4rem;text-align:center;" />
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" id="twofa-disable-btn" onclick="confirmDisable2FA()"
          style="border-color:var(--red);color:var(--red);">Confirm Disable</button>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('twofa-disable-form').classList.add('hidden')">Cancel</button>
      </div>
    </div>`;
}

// ── Start setup: call backend to get QR code ──────────────────────────────────
window.start2FASetup = async function () {
  const wizard = document.getElementById('twofa-setup-wizard');
  wizard.classList.remove('hidden');
  document.getElementById('twofa-qr-wrap').innerHTML = '<div class="spinner" style="margin:auto;"></div>';
  document.getElementById('twofa-manual-key').textContent = '';
  window._2fa_pending_secret = null;

  try {
    const data = await apiGet('/api/auth/2fa/setup');
    window._2fa_pending_secret = data.secret;

    document.getElementById('twofa-qr-wrap').innerHTML =
      `<img src="${data.qrCodeDataUrl}" alt="2FA QR code — scan with your authenticator app"
            style="width:180px;height:180px;border-radius:8px;border:1px solid var(--gray-200);" />`;

    document.getElementById('twofa-manual-key').innerHTML =
      `<strong>Can't scan?</strong> Enter this key manually: <code style="background:var(--gray-100);padding:2px 6px;border-radius:4px;">${data.manualKey}</code>`;
  } catch (err) {
    document.getElementById('twofa-qr-wrap').innerHTML =
      `<span style="color:var(--red);">⚠ ${err.message}</span>`;
  }
};

window.cancelSetup = function () {
  document.getElementById('twofa-setup-wizard').classList.add('hidden');
  window._2fa_pending_secret = null;
};

// ── Confirm enable: send secret + code to backend ────────────────────────────
window.confirmEnable2FA = async function () {
  const alertEl = document.getElementById('twofa-setup-alert');
  const btn     = document.getElementById('twofa-enable-btn');
  const code    = (document.getElementById('twofa-enable-code').value || '').replace(/\s/g, '');
  const secret  = window._2fa_pending_secret;
  alertEl.innerHTML = '';

  if (!secret) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠ QR code not loaded. Please wait and try again.</div>';
    return;
  }
  if (code.length < 6) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠ Enter the 6-digit code from your authenticator app.</div>';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Activating…';

  try {
    const res  = await authFetch('/api/auth/2fa/enable', {
      method: 'POST',
      body:   JSON.stringify({ secret, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      alertEl.innerHTML = `<div class="alert alert-error">⚠ ${data.message}</div>`;
      btn.disabled = false;
      btn.textContent = 'Activate 2FA';
      return;
    }
    window._2fa_pending_secret = null;
    if (typeof showToast === 'function') showToast(data.message, 'success');
    load2FAStatus(); // re-render card
  } catch {
    alertEl.innerHTML = '<div class="alert alert-error">⚠ Network error. Please try again.</div>';
    btn.disabled = false;
    btn.textContent = 'Activate 2FA';
  }
};

// ── Show disable form ─────────────────────────────────────────────────────────
window.showDisable2FA = function () {
  document.getElementById('twofa-disable-form').classList.remove('hidden');
};

// ── Confirm disable ───────────────────────────────────────────────────────────
window.confirmDisable2FA = async function () {
  const alertEl  = document.getElementById('twofa-disable-alert');
  const btn      = document.getElementById('twofa-disable-btn');
  const password = document.getElementById('twofa-disable-password').value;
  const code     = (document.getElementById('twofa-disable-code').value || '').replace(/\s/g, '');
  alertEl.innerHTML = '';

  if (!password || code.length < 6) {
    alertEl.innerHTML = '<div class="alert alert-error">⚠ Enter your password and the 6-digit authenticator code.</div>';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Disabling…';

  try {
    const res  = await authFetch('/api/auth/2fa/disable', {
      method: 'POST',
      body:   JSON.stringify({ password, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      alertEl.innerHTML = `<div class="alert alert-error">⚠ ${data.message}</div>`;
      btn.disabled = false;
      btn.textContent = 'Confirm Disable';
      return;
    }
    if (typeof showToast === 'function') showToast(data.message, 'success');
    load2FAStatus();
  } catch {
    alertEl.innerHTML = '<div class="alert alert-error">⚠ Network error. Please try again.</div>';
    btn.disabled = false;
    btn.textContent = 'Confirm Disable';
  }
};

// Auto-format TOTP inputs
function wireOTPFormat(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 3) v = v.slice(0, 3) + ' ' + v.slice(3, 6);
    e.target.value = v;
  });
}

// Expose load function globally for dashboard nav handlers to call
window.load2FAStatus = load2FAStatus;

// Auto-wire OTP inputs once the card is rendered (using MutationObserver)
const observer = new MutationObserver(() => {
  wireOTPFormat('twofa-enable-code');
  wireOTPFormat('twofa-disable-code');
});
const card = document.getElementById('twofa-status-card');
if (card) observer.observe(card, { childList: true, subtree: true });

})();
