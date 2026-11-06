/*
 * Phase 5 — Session lifecycle.
 *
 * While a user is logged in, two periodic pings run in the main process:
 *   /send-heartbeat/  every 60s  — keeps the server-side session alive and
 *                                   ships telemetry (URL, title, tab counts,
 *                                   events[], device).
 *   /check-session/   every 15s  — lightweight server probe that detects
 *                                   revoke / subscription-expiry / mismatched
 *                                   session_id much faster than heartbeat.
 *
 * When EITHER call returns { success: false }, the server considers us dead:
 * we stop the timers and invoke onSessionDead(reason). main.js wires that to
 * clear auth + wipe the DAT partition + push 'session:dead' to the renderer
 * so the UI returns to the login screen.
 */
const BASE = 'https://dat-pro-backend.onrender.com/';
const APP_VERSION = '3.0.5';

const HEARTBEAT_MS      = 60_000;
const CHECK_SESSION_MS  = 15_000;
const FIRST_HEARTBEAT_DELAY_MS = 1_000;

let hbTimer = null;
let csTimer = null;
let running = false;

// Pluggable deps injected by main.js at start(): getSession(), getWebview(),
// onSessionDead(reason).
let deps = {};

// Short rolling buffer of lightweight events (nav, title). Flushed to the
// server on every heartbeat. Phase 7 (ActivityLog) will persist these.
let eventsBuffer = [];

function device() {
  return { os: process.platform, browser: 'DAT Pro Desktop ' + APP_VERSION };
}

function recordEvent(ev) {
  if (!running) return;
  eventsBuffer.push({ ...ev, t: Date.now() });
  if (eventsBuffer.length > 300) {
    eventsBuffer.splice(0, eventsBuffer.length - 300);
  }
}

async function post(pathSegment, body, timeoutMs = 20_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + pathSegment, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) return { success: false, message: 'HTTP ' + res.status };
    return await res.json();
  } catch (e) {
    return { success: false, networkError: true, message: 'Network error' };
  } finally {
    clearTimeout(t);
  }
}

async function readWebviewSnapshot() {
  const snap = {
    current_url: null,
    current_title: null,
    dat_tab_count: 0,
    total_tab_count: 0,
  };
  try {
    const wc = deps.getWebview && deps.getWebview();
    if (!wc || wc.isDestroyed()) return snap;
    snap.current_url   = wc.getURL();
    snap.current_title = wc.getTitle();
    try {
      const n = await wc.executeJavaScript('window.__datTabCount || 0', true);
      const val = Number(n);
      if (Number.isFinite(val) && val >= 0) {
        snap.dat_tab_count = val;
        snap.total_tab_count = val; // app only hosts the DAT view
      }
    } catch (_) {}
  } catch (_) {}
  return snap;
}

async function sendHeartbeat() {
  if (!running) return;
  const s = deps.getSession && deps.getSession();
  if (!s || !s.secret_key || !s.session_id) return;

  const snap = await readWebviewSnapshot();
  const flushed = eventsBuffer;
  eventsBuffer = [];

  const payload = {
    secret_key: s.secret_key,
    session_id: s.session_id,
    versionN: APP_VERSION,
    device: device(),
    cookie_sync_time: s.cookie_session_updated_at || null,
    current_url:   snap.current_url,
    current_title: snap.current_title,
    dat_tab_count: snap.dat_tab_count,
    other_tab_count: 0,
    total_tab_count: snap.total_tab_count,
    tab_count: snap.dat_tab_count,
    events: flushed,
  };

  const r = await post('send-heartbeat/', payload);
  // Network errors are transient — don't force logout on those.
  if (r && r.networkError) {
    console.log('[heartbeat] network error (ignored)');
    return;
  }
  if (!r || !r.success) {
    const reason = (r && r.message) || 'Session ended.';
    console.log('[heartbeat] session dead:', reason);
    stop();
    if (deps.onSessionDead) deps.onSessionDead(reason);
    return;
  }

  // Detect proxy change by admin — host or port differ from local session.
  if (r.host && r.port && s.host && s.port) {
    if (r.host !== s.host || String(r.port) !== String(s.port)) {
      console.log('[heartbeat] proxy changed by admin — forcing re-login');
      stop();
      if (deps.onProxyChanged) deps.onProxyChanged();
      return;
    }
  }

  // Detect session update by super admin — cookie_session_updated_at changed.
  if (r.cookie_session_updated_at && s.cookie_session_updated_at) {
    const serverTime = new Date(r.cookie_session_updated_at).getTime();
    const localTime = new Date(s.cookie_session_updated_at).getTime();
    if (!isNaN(serverTime) && !isNaN(localTime) && serverTime !== localTime) {
      console.log('[heartbeat] session updated by admin — forcing re-login');
      stop();
      if (deps.onSessionUpdated) deps.onSessionUpdated();
      return;
    }
  }
}

async function checkSession() {
  if (!running) return;
  const s = deps.getSession && deps.getSession();
  if (!s || !s.secret_key || !s.session_id) return;
  const r = await post('check-session/', {
    secret_key: s.secret_key,
    session_id: s.session_id,
  }, 10_000);
  if (r && r.networkError) return;
  if (!r || !r.success) {
    const reason = (r && r.message) || 'Session ended.';
    console.log('[check-session] session dead:', reason);
    stop();
    if (deps.onSessionDead) deps.onSessionDead(reason);
  }
}

function start(injected) {
  deps = injected || {};
  stop();
  running = true;
  eventsBuffer = [];
  hbTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
  csTimer = setInterval(checkSession, CHECK_SESSION_MS);
  // Fire a first heartbeat quickly so server sees the session alive right away.
  setTimeout(sendHeartbeat, FIRST_HEARTBEAT_DELAY_MS);
  console.log('[heartbeat] started');
}

function stop() {
  running = false;
  if (hbTimer) clearInterval(hbTimer);
  if (csTimer) clearInterval(csTimer);
  hbTimer = null;
  csTimer = null;
}

function isRunning() { return running; }

module.exports = { start, stop, recordEvent, isRunning };
