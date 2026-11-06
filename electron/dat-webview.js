/*
 * DAT embedded-browser orchestrator.
 *
 * Owns the in-memory session partition used by the <webview> in UserShell.
 * On prepareDat():
 *   1. Set the per-user proxy on the partition (from currentSession).
 *   2. Verify egress IP via a hidden window through the SAME partition.
 *      If egress != proxy host  -> ABORT (fail-closed). Never let DAT see
 *      the real IP.
 *   3. Decrypt + inject the user's DAT cookies into the partition.
 *   4. Return { ok: true, ip, port } so UserShell can mount the webview.
 *
 * clearDat() wipes the partition on logout. Because the partition name has
 * no 'persist:' prefix, nothing is written to disk — closing the app also
 * drops it.
 */
const { session, BrowserWindow } = require('electron');
const auth = require('./auth');
const { decryptCookieBundles } = require('./crypto');

const DAT_PARTITION = 'dat-session'; // in-memory (no 'persist:' prefix)
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let currentStatus = { state: 'idle', proxy: null, error: null };

function getDatSession() {
  const ses = session.fromPartition(DAT_PARTITION, { cache: true });
  ses.setUserAgent(UA);
  return ses;
}

function getStatus() { return currentStatus; }

// Hidden-window IP-echo through the partition — proven pattern from Phase 0.
// net.request has quirks with proxy auth; a BrowserWindow uses the full
// Chromium stack and app.on('login') path, matching how the real webview
// will authenticate to the proxy.
function verifyEgressIP() {
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      show: false,
      webPreferences: { partition: DAT_PARTITION },
    });
    w.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    w.webContents.setUserAgent(UA);
    let done = false;
    const finish = (ip) => {
      if (done) return;
      done = true;
      try { w.destroy(); } catch (_) {}
      resolve(ip);
    };
    w.webContents.on('did-finish-load', async () => {
      try {
        const txt = await w.webContents.executeJavaScript('document.body.innerText');
        const m = txt && txt.match(/"ip"\s*:\s*"([^"]+)"/);
        finish(m ? m[1] : null);
      } catch (_) { finish(null); }
    });
    w.webContents.on('did-fail-load', (_e, code, desc) => {
      console.log('[dat] IP-verify fail-load', code, desc);
      finish(null);
    });
    w.loadURL('https://api.ipify.org?format=json');
    setTimeout(() => finish(null), 25000);
  });
}

async function injectCookies(ses, cookiesArray) {
  const bundles = decryptCookieBundles(cookiesArray);
  let ok = 0, fail = 0;
  for (const bundle of bundles) {
    for (const c of bundle.cookies || []) {
      const bareDomain = (c.domain || '').replace(/^\./, '');
      if (!bareDomain || !c.name) { fail++; continue; }
      const url = (c.secure ? 'https://' : 'http://') + bareDomain + (c.path || '/');
      const details = {
        url,
        name: c.name,
        value: c.value == null ? '' : String(c.value),
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite || 'unspecified',
      };
      if (!c.hostOnly) details.domain = c.domain;
      if (!c.session && c.expirationDate) details.expirationDate = c.expirationDate;
      try { await ses.cookies.set(details); ok++; }
      catch (_) { fail++; }
    }
  }
  return { ok, fail, bundles: bundles.length };
}

async function prepareDat() {
  currentStatus = { state: 'preparing', proxy: null, error: null };

  // Pull the LATEST session state from the backend first — if the super
  // admin assigned a proxy or updated the cookie session after our original
  // login, we want to see it. Network failures are tolerated; we fall back
  // to the cached session (this is the common path on first mount too).
  try { await auth.refreshSession(); } catch (_) {}

  const s = auth.getCurrentSession();
  if (!s) {
    currentStatus = { state: 'failed', proxy: null, error: 'Not logged in.' };
    return { ok: false, reason: currentStatus.error };
  }
  if (s.role !== 'user') {
    currentStatus = { state: 'failed', proxy: null, error: 'Admins do not use embedded DAT.' };
    return { ok: false, reason: currentStatus.error };
  }
  if (!s.host || !s.port) {
    currentStatus = { state: 'failed', proxy: null, error: 'No proxy assigned to this account.' };
    return { ok: false, reason: currentStatus.error };
  }
  if (!s.have_cookie || !Array.isArray(s.cookies) || s.cookies.length === 0) {
    currentStatus = { state: 'failed', proxy: null, error: 'No DAT session assigned to this account.' };
    return { ok: false, reason: currentStatus.error };
  }

  const ses = getDatSession();

  // 1. Proxy FIRST — before any navigation.
  const proxyRules = `http=${s.host}:${s.port};https=${s.host}:${s.port}`;
  try { await ses.setProxy({ proxyRules }); }
  catch (e) {
    currentStatus = { state: 'failed', proxy: null, error: 'Could not set proxy: ' + e.message };
    return { ok: false, reason: currentStatus.error };
  }
  console.log(`[dat] proxy set: ${s.host}:${s.port}`);

  // 2. Verify egress IP (fail-closed)
  const egress = await verifyEgressIP();
  console.log(`[dat] egress IP: ${egress}`);
  if (egress !== s.host) {
    currentStatus = {
      state: 'failed',
      proxy: null,
      error: `Proxy verification failed — egress IP ${egress || 'unknown'} does not match proxy ${s.host}. DAT not loaded (fail-closed).`,
    };
    return { ok: false, reason: currentStatus.error };
  }
  console.log('[dat] proxy verified ✓');

  // 3. Inject cookies
  const cookieResult = await injectCookies(ses, s.cookies);
  console.log(`[dat] cookies: ${cookieResult.ok} set, ${cookieResult.fail} failed, ${cookieResult.bundles} bundles`);
  if (cookieResult.ok === 0) {
    currentStatus = { state: 'failed', proxy: null, error: 'Cookie injection failed (0 cookies set).' };
    return { ok: false, reason: currentStatus.error };
  }

  currentStatus = { state: 'ready', proxy: { ip: s.host, port: s.port }, error: null };
  return { ok: true, ip: s.host, port: s.port, cookies: cookieResult.ok };
}

async function clearDat() {
  const ses = getDatSession();
  try { await ses.clearStorageData(); } catch (_) {}
  try { await ses.clearCache(); } catch (_) {}
  try { await ses.cookies.flushStore(); } catch (_) {}
  try {
    const cookies = await ses.cookies.get({});
    for (const c of cookies) {
      const url = (c.secure ? 'https://' : 'http://') + (c.domain || '').replace(/^\./, '') + (c.path || '/');
      await ses.cookies.remove(url, c.name).catch(() => {});
    }
  } catch (_) {}
  try { await ses.setProxy({ proxyRules: '' }); } catch (_) {}
  currentStatus = { state: 'idle', proxy: null, error: null };
  console.log('[dat] session cleared (cookies, cache, proxy, storage)');
}

// Returns proxy credentials for app.on('login') proxy-auth callbacks.
function getProxyCreds() {
  const s = auth.getCurrentSession();
  if (!s || !s.user || !s.pass) return null;
  return { user: s.user, pass: s.pass };
}

// Track the actual webview webContents so other modules (heartbeat) can read
// live URL / title / tab-count without needing to find it themselves.
let datWebContents = null;
function setDatWebContents(wc) { datWebContents = wc; }
function getDatWebContents() {
  if (datWebContents && !datWebContents.isDestroyed()) return datWebContents;
  return null;
}

module.exports = {
  prepareDat,
  clearDat,
  getStatus,
  getProxyCreds,
  DAT_PARTITION,
  UA,
  setDatWebContents,
  getDatWebContents,
};
