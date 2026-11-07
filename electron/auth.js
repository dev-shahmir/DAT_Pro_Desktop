/*
 * Backend auth client + in-memory session store.
 *
 * Everything sensitive (secret_key, session_id, raw cookie blob, proxy creds)
 * lives in this module only — the renderer never sees it. Renderer only gets
 * { email, role, message } shaped results.
 *
 * Phase 3 will read currentSession() to pull proxy + cookies for the DAT
 * webview partition.
 * Phase 5 will add heartbeat + check-session timers reading from here.
 */
const { app } = require('electron');
const BASE = 'https://dat-pro-backend.onrender.com/';
// Real app version from package.json — never hardcode (the backend gates login
// on this against MIN_APP_VERSION). Fallback only if app isn't ready yet.
const APP_VERSION = (() => { try { return app.getVersion(); } catch (_) { return '0.0.0'; } })();
const PLATFORM = 'app';

// In-memory only. Never persisted.
let currentSession = null;

async function post(pathSegment, body) {
  try {
    const res = await fetch(BASE + pathSegment, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { success: false, message: `Server error (${res.status}).` };
    }
    return await res.json();
  } catch (e) {
    return { success: false, message: 'Network error. Check your connection.' };
  }
}

function roleFromResponse(r) {
  if (r.is_super_admin) return 'superAdmin';
  if (r.is_admin) return 'admin';
  return 'user';
}

function sanitize(r, email) {
  // What's safe to tell the renderer: email, role, optionally a message.
  return {
    success: true,
    role: roleFromResponse(r),
    email: r.email || email,
  };
}

async function login({ email, password } = {}) {
  if (!email || !password) {
    return { success: false, message: 'Email and password required.' };
  }

  const r = await post('login/', {
    email, password,
    versionN: APP_VERSION,
    platform: PLATFORM,
  });
  if (!r.success) {
    return {
      success: false,
      message: r.message || 'Login failed.',
    };
  }

  // First-time path: backend has sent an OTP and this user still needs to
  // verify. We trust `is_otp_sent` alone here — do NOT also require
  // `!session_id`, because /create-user/ pre-assigns a session_id UUID even
  // for freshly-created users who haven't verified yet. (Server-side those
  // users still have status='logged_out' and heartbeat would kill them
  // instantly if we tried to log them in directly.) Verified / re-logging
  // users get is_otp_sent cleared by the backend on successful auth.
  if (r.is_otp_sent) {
    return { success: true, needsOtp: true, email: r.email || email };
  }

  // Fully logged in path.
  currentSession = { ...r, role: roleFromResponse(r), email: r.email || email };
  console.log(`[auth] login ok: ${currentSession.email} (${currentSession.role})`);
  return sanitize(r, email);
}

async function verifyOtp({ email, otp } = {}) {
  if (!email || !otp) {
    return { success: false, message: 'Email and OTP required.' };
  }
  const r = await post('verify-otp/', { email, otp, platform: PLATFORM });
  if (!r.success) {
    return { success: false, message: r.message || 'OTP verification failed.' };
  }
  currentSession = { ...r, role: roleFromResponse(r), email: r.email || email };
  console.log(`[auth] OTP verified: ${currentSession.email} (${currentSession.role})`);
  return sanitize(r, email);
}

async function resendOtp(email) {
  if (!email) return { success: false, message: 'Email required.' };
  const r = await post('send-otp/', { email });
  return {
    success: !!r.success,
    message: r.message || (r.success ? 'OTP sent.' : 'Could not send OTP.'),
  };
}

async function forgotPassword(email) {
  if (!email) return { success: false, message: 'Email required.' };
  const r = await post('forgot-password/', { email });
  return {
    success: !!r.success,
    message: r.message || (r.success ? 'OTP sent.' : 'Could not send OTP.'),
  };
}

async function verifyForgotOtp({ email, otp } = {}) {
  if (!email || !otp) return { success: false, message: 'Email and OTP required.' };
  const r = await post('verify-forgot-otp/', { email, otp });
  return {
    success: !!r.success,
    message: r.message || (r.success ? 'Password sent to your email.' : 'Verification failed.'),
  };
}

async function logout() {
  if (!currentSession) return { success: true };
  const { secret_key, session_id, email } = currentSession;
  currentSession = null;
  // Fire the backend logout but don't block on failure — local session is
  // already gone and the server has a stale-heartbeat cleanup cron too.
  try {
    await post('logout/', { secret_key, session_id });
    console.log(`[auth] logout ok: ${email}`);
  } catch (e) { /* ignore */ }
  return { success: true };
}

function getCurrentSession() {
  return currentSession;
}

// Re-fetch this user's current state from the backend and merge it into
// currentSession. Used before DAT setup / on retry so if the super admin
// set a proxy / session / tab-limit AFTER our original login, the next
// attempt sees the fresh values without having to log out and back in.
async function refreshSession() {
  if (!currentSession || !currentSession.secret_key) {
    return { success: false, message: 'Not logged in.' };
  }
  const { secret_key, session_id } = currentSession;
  const r = await post('refresh/', { secret_key, session_id, versionN: APP_VERSION, platform: PLATFORM });
  if (!r || !r.success) {
    return { success: false, message: (r && r.message) || 'Refresh failed.' };
  }
  currentSession = {
    ...r,
    role: roleFromResponse(r),
    email: r.email || currentSession.email,
  };
  return { success: true };
}

// Hard-wipe the in-memory session (no backend call). Used by heartbeat /
// check-session when the server declares our session dead — we tear down
// local state without trying to /logout/ a session that's already gone.
function forceClear() {
  currentSession = null;
}

module.exports = {
  login,
  verifyOtp,
  resendOtp,
  forgotPassword,
  verifyForgotOtp,
  logout,
  getCurrentSession,
  refreshSession,
  forceClear,
};
