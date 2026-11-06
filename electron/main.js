const { app, BrowserWindow, Menu, ipcMain, session, powerMonitor } = require('electron');
const path = require('path');
const auth = require('./auth');
const store = require('./store');
const dat = require('./dat-webview');
const heartbeat = require('./heartbeat');
const admin = require('./admin');
const { lockCss, lockJs } = require('./dat-guard');
const updater = require('./updater');
const connMonitor = require('./connection-monitor');

// Phase 0 saw "GPU state invalid after WaitForGetOffsetInRange" on some
// Windows setups which caused a blank window. Disable HW accel to sidestep it.
// Must be called before app is ready.
app.disableHardwareAcceleration();

// Single-instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DEV_URL = 'http://localhost:5173';

function createMainWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#050505',
    autoHideMenuBar: true,
    show: false, // Show when ready-to-show to prevent white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: true, // required by Phase 3 (embedded DAT view)
      devTools: isDev, // production: no DevTools, no Ctrl+Shift+I
    },
  });

  mainWindow.removeMenu();

  // WebRTC leak block — must be set before any navigation so real IP can't
  // escape even when a proxy is active.
  // NOTE: setWebRTCIPHandlingPolicy lives on WebContents, NOT on Session.
  mainWindow.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');

  // Deny every popup / window.open attempt (Phase-0 decision locked in).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Security] Blocked window.open attempt to:', url);
    return { action: 'deny' };
  });

  // Navigation lock for the ROOT window: it may only navigate to our renderer.
  // The DAT <webview> (Phase 3) runs in its own webContents with its own
  // navigation whitelist and is unaffected by this handler.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev
      ? url.startsWith(DEV_URL)
      : url.startsWith('file://');
    if (!allowed) {
      console.log('[Security] Blocked root navigation to:', url);
      event.preventDefault();
    }
  });

  // Load URL
  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    // mainWindow.webContents.openDevTools(); // uncomment to debug renderer
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Second instance focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ── Proxy auth (Phase 3) ─────────────────────────────────────────────────────
// Supplies username/password when the DAT partition's proxy challenges.
// Credentials are pulled live from auth.currentSession so they never sit
// in global scope.
app.on('login', (event, _webContents, _details, authInfo, callback) => {
  if (!authInfo || !authInfo.isProxy) return;
  const creds = dat.getProxyCreds();
  if (!creds) {
    console.log('[proxy-auth] no creds available — denying');
    return;
  }
  event.preventDefault();
  callback(creds.user, creds.pass);
});

// ── <webview> security (Phase 3) ─────────────────────────────────────────────
// Fires for every webContents the app creates. For webviews (the embedded
// DAT view) we lock navigation, kill popups, block WebRTC leak, and inject
// dat-guard on dom-ready to hide DAT UI the user shouldn't see.
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;

  // Dev-only: open the embedded DAT page's own DevTools in a detached window
  // so we can inspect selectors / console logs from dat-guard.
  if (isDev) {
    contents.once('dom-ready', () => {
      try { contents.openDevTools({ mode: 'detach' }); } catch (_) {}
    });
  }

  // No popups, ever.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // WebRTC leak block — must be set per webContents, not per session.
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');

  // Navigation whitelist (Phase-0 decisions locked in):
  //   - allow any *.login.dat.com    (Auth0 silent refresh iframes)
  //   - allow any one.dat.com/search-loads*   (direct landing)
  //   - redirect other one.dat.com paths to /search-loads
  //   - block account.dat.com entirely
  //   - block everything else
  const navGuard = (event, url) => {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (host === 'account.dat.com' || host.endsWith('.account.dat.com')) {
        event.preventDefault(); return;
      }
      if (host.endsWith('login.dat.com')) return;
      if (host === 'one.dat.com' || host === 'www.one.dat.com') {
        if (!u.pathname.startsWith('/search-loads')) {
          event.preventDefault();
          contents.loadURL('https://one.dat.com/search-loads');
        }
        return;
      }
      if (host === 'dat.com' || host.endsWith('.dat.com')) return;
      event.preventDefault();
      console.log('[dat-webview] blocked nav:', url);
    } catch (_) { event.preventDefault(); }
  };
  contents.on('will-navigate', navGuard);
  contents.on('will-redirect', navGuard);

  // Inject dat-guard (UI lockdown + tab-limit) once the page is interactive.
  // The current user's load_tab_limit is pushed in as a global BEFORE the
  // guard runs, so the guard reads a fresh value on every nav/reload.
  // Convention: 0 = unlimited (super admin hasn't set a cap).
  contents.on('dom-ready', async () => {
    try {
      const sess = auth.getCurrentSession();
      const rawLimit = sess ? Number(sess.load_tab_limit) : 0;
      // Negative / NaN clamp to 0 (unlimited). Positive values pass through.
      const limit = (Number.isFinite(rawLimit) && rawLimit > 0) ? rawLimit : 0;
      await contents.executeJavaScript(`window.__datLoadTabLimit = ${limit};`);
      await contents.insertCSS(lockCss);
      await contents.executeJavaScript(lockJs);
    } catch (_) { /* some URLs (silent-refresh iframes) have no DOM */ }
  });

  // Pipe guard logs to terminal
  contents.on('console-message', (_e, _level, message) => {
    if (message.includes('[DAT-GUARD]')) {
      console.log('[webview-guard]', message);
    }
  });

  // Keep logs clean: Auth0's silent-refresh iframe always aborts after the
  // postMessage handshake — Phase 0 confirmed this is normal.
  contents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3 && url.includes('prompt=none')) return;
    console.log('[dat-webview] fail-load:', code, desc, url);
    // Proxy / network failures surface as specific error codes.
    // -130 = ERR_PROXY_CONNECTION_FAILED, -105/-106 = DNS, -2 = FAILED (generic net)
    if ([-130, -105, -106, -2, -7, -21, -100, -101, -102, -118].includes(code)) {
      connMonitor.reportProxyError(desc || `Connection error (${code})`);
    }
  });

  // ── Phase 5: expose this webContents to heartbeat + record nav events ──
  dat.setDatWebContents(contents);
  contents.on('destroyed', () => dat.setDatWebContents(null));

  // Only record top-level navigations inside DAT (skip Auth0 silent frames).
  contents.on('did-navigate', (_e, url) => {
    if (url && !url.includes('prompt=none')) {
      heartbeat.recordEvent({ type: 'nav', url });
    }
  });
  contents.on('did-navigate-in-page', (_e, url) => {
    heartbeat.recordEvent({ type: 'nav-in-page', url });
  });
  contents.on('page-title-updated', (_e, title) => {
    heartbeat.recordEvent({ type: 'title', title });
  });
});

app.whenReady().then(() => {
  // Strip "Electron/x.y.z" and the app name from the default UA so renderer
  // requests look like a plain Chrome build. The DAT <webview> (Phase 3) will
  // get its own, further-polished UA on its own session partition.
  const def = session.defaultSession;
  const cleanUA = def.getUserAgent()
    .replace(/\s*Electron\/[\d.]+/g, '')
    .replace(/\s*dat-desktop\/[\d.]+/g, '');
  def.setUserAgent(cleanUA);

  createMainWindow();

  // ── Auto-updater (Phase 8) ──────────────────────────────────────────────
  if (!isDev) updater.init(mainWindow);

  // ── Connection monitor (Phase 9) ──────────────────────────────────────
  connMonitor.init(mainWindow);

  // ── Resume from sleep/hibernate ───────────────────────────────────────────
  // When the OS wakes, heartbeat timers may have been frozen for hours and the
  // backend may have killed the session. Probe the backend immediately: if the
  // session is still alive, restart heartbeat so it doesn't fire a stale tick
  // and wrongly kick the user out. If the session is dead, do a full teardown
  // so the next login starts clean (no "already logged in" error).
  powerMonitor.on('resume', async () => {
    console.log('[main] OS resume detected');
    const sess = auth.getCurrentSession();
    if (!sess) return; // not logged in — nothing to do

    const r = await auth.refreshSession();
    if (r && r.success) {
      console.log('[main] session still valid after resume — restarting heartbeat');
      heartbeat.stop();
      startHeartbeat();
    } else {
      console.log('[main] session expired during sleep — cleaning up');
      heartbeat.stop();
      auth.forceClear();
      try { await dat.clearDat(); } catch (_) {}
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('session:dead', { reason: 'Session expired while your device was asleep. Please login again.' });
      }
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ── Phase 5: app-close logout + partition wipe ───────────────────────────────
// If the user is still logged in when the app is about to quit (window X,
// Alt+F4, tray quit, OS shutdown), we POST /logout/ and wipe the DAT partition
// FIRST, then hard-exit. Everything is hard-capped so a slow backend / stuck
// cache clear can never leave the app un-closable.
//
// We use app.exit(0) (hard terminate, no further events) instead of
// app.quit() after preventDefault — re-entrant app.quit() inside before-quit
// is unreliable on Windows.
const withTimeout = (p, ms) => Promise.race([
  Promise.resolve(p).catch(() => {}),
  new Promise((r) => setTimeout(r, ms)),
]);

let quitInProgress = false;
app.on('before-quit', (event) => {
  if (quitInProgress) return;
  const sess = auth.getCurrentSession();
  if (!sess) return; // not logged in — normal quit
  event.preventDefault();
  quitInProgress = true;
  console.log('[main] logging out before quit…');
  (async () => {
    try { heartbeat.stop();        console.log('[main]  ✓ heartbeat stopped'); } catch (e) { console.log('[main] hb stop err:', e && e.message); }
    try { await withTimeout(dat.clearDat(),  2000); console.log('[main]  ✓ dat partition wiped'); }
    catch (_) {}
    try { await withTimeout(auth.logout(),   3000); console.log('[main]  ✓ logout sent'); }
    catch (_) {}
    console.log('[main] exiting now');
    app.exit(0); // hard exit — no further events
  })();
});

// ── Phase 5: heartbeat dependency injection ──────────────────────────────────
// Called from auth:login / auth:verify-otp once a session is live.
function startHeartbeat() {
  heartbeat.start({
    getSession: () => auth.getCurrentSession(),
    getWebview: () => dat.getDatWebContents(),
    onSessionDead: async (reason) => {
      try { await dat.clearDat(); } catch (_) {}
      auth.forceClear();
      if (mainWindow && !mainWindow.isDestroyed()) {
        try { mainWindow.webContents.send('session:dead', { reason }); } catch (_) {}
      }
    },
    onSessionUpdated: async () => {
      try { await dat.clearDat(); } catch (_) {}
      try { await auth.logout(); } catch (_) {}
      auth.forceClear();
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('session:updated', {
            reason: 'Your session has been updated by the administrator. Please login again to continue with the new session.',
          });
        } catch (_) {}
      }
    },
    onProxyChanged: async () => {
      try { await dat.clearDat(); } catch (_) {}
      try { await auth.logout(); } catch (_) {}
      auth.forceClear();
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('session:updated', {
            reason: 'Your proxy has been changed by the administrator. Please login again to connect with the new proxy.',
          });
        } catch (_) {}
      }
    },
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('app:ping', async () => 'pong');
ipcMain.handle('app:get-version', async () => app.getVersion());

ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

// ── Auth IPC (Phase 2) ───────────────────────────────────────────────────────
// Renderer calls go through contextBridge in preload.js. All sensitive bits
// (secret_key, session_id, raw cookie blob, proxy creds) stay in the main
// process; only { success, role, email, message, needsOtp } flows back.
ipcMain.handle('auth:login', async (_e, creds) => {
  const r = await auth.login(creds);
  // Start heartbeat only when we've actually acquired a live session
  // (first-time OTP path does NOT yet — session_id is null until verified).
  if (r && r.success && !r.needsOtp) startHeartbeat();
  return r;
});
ipcMain.handle('auth:verify-otp', async (_e, payload) => {
  const r = await auth.verifyOtp(payload);
  if (r && r.success) startHeartbeat();
  return r;
});
ipcMain.handle('auth:resend-otp', (_e, email) => auth.resendOtp(email));
ipcMain.handle('auth:forgot-password', (_e, email) => auth.forgotPassword(email));
ipcMain.handle('auth:verify-forgot-otp', (_e, payload) => auth.verifyForgotOtp(payload));
ipcMain.handle('auth:logout', async () => {
  try { heartbeat.stop(); } catch (_) {}
  try { await dat.clearDat(); } catch (_) {}  // wipe the DAT partition
  return auth.logout();
});
ipcMain.handle('auth:get-saved-email',  ()            => store.getSavedEmail());
ipcMain.handle('auth:save-email',       (_e, email)   => store.saveEmail(email));
ipcMain.handle('auth:clear-saved-email',()            => store.clearSavedEmail());

// ── DAT embedded view IPC (Phase 3) ──────────────────────────────────────────
ipcMain.handle('dat:prepare',    () => dat.prepareDat());
ipcMain.handle('dat:get-status', () => dat.getStatus());
ipcMain.handle('dat:clear',      () => dat.clearDat());

// ── Admin / Super Admin IPC (Phase 6) ────────────────────────────────────────
// secret_key + session_id are injected server-side by admin.js — the renderer
// NEVER has to (and NEVER should) know them.
ipcMain.handle('admin:get-users',           (_e, type)     => admin.getUsers(type));
ipcMain.handle('admin:create-user',         (_e, payload)  => admin.createUser(payload));
ipcMain.handle('admin:revoke-user',         (_e, email)    => admin.revokeUser(email));
ipcMain.handle('admin:restore-user',        (_e, email)    => admin.restoreUser(email));
ipcMain.handle('admin:extend-subscription', (_e, email)    => admin.extendSubscription(email));
ipcMain.handle('admin:delete-user',         (_e, email)    => admin.deleteUser(email));
ipcMain.handle('admin:set-user-limits',     (_e, p)        => admin.setUserLimits(p.email, p.tab_limit, p.load_tab_limit));
ipcMain.handle('admin:grant-admin',         (_e, email)    => admin.grantAdmin(email));
ipcMain.handle('admin:revoke-admin',        (_e, email)    => admin.revokeAdmin(email));
ipcMain.handle('admin:reset-admin-access',  (_e, email)    => admin.resetAdminAccess(email));
ipcMain.handle('admin:assign-proxy',        (_e, payload)  => admin.assignProxy(payload));
ipcMain.handle('admin:sync-master-session', (_e, cookie_session) => admin.syncMasterSession(cookie_session));
ipcMain.handle('admin:update-user-session', (_e, p)        => admin.updateUserSession(p.email, p.cookie_session));
ipcMain.handle('admin:get-user-session',    (_e, email)    => admin.getUserSession(email));
ipcMain.handle('admin:update-user-details', (_e, payload)  => admin.updateUserDetails(payload));
ipcMain.handle('admin:get-activity-log',    (_e, params)   => admin.getActivityLog(params));
ipcMain.handle('admin:export-activity-log', (_e, params)   => admin.exportActivityLog(params));
ipcMain.handle('admin:get-activity-stats',  (_e, params)   => admin.getActivityStats(params));
