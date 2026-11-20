const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null;
let autoUpdater = null;

const UPDATER_CACHE_NAME = 'dat-desktop-updater'; // = electron-builder.yml updaterCacheDirName

// Semver-ish compare: 1 if a>b, -1 if a<b, 0 if equal. Non-numeric -> 0.
function cmpVersion(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

// Where electron-updater keeps its download cache (per platform).
function updaterCacheDir() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    return path.join(base, UPDATER_CACHE_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Caches', UPDATER_CACHE_NAME);
  }
  return path.join(app.getPath('home'), '.cache', UPDATER_CACHE_NAME);
}

// Guard 1 — on launch, wipe a leftover "pending" download whose version is NOT
// newer than the one we're already running. This clears the stale cache that
// made the updater keep re-prompting (with an empty version) on machines that
// are already up to date. Best-effort; never throws.
function clearStalePending() {
  try {
    const dir = updaterCacheDir();
    const infoPath = path.join(dir, 'pending', 'update-info.json');
    if (!fs.existsSync(infoPath)) return;
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    const m = /(\d+\.\d+\.\d+)/.exec((info && info.fileName) || '');
    if (!m) return;
    if (cmpVersion(app.getVersion(), m[1]) >= 0) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[updater] cleared stale pending cache (${m[1]}); running ${app.getVersion()}`);
    }
  } catch (e) {
    console.log('[updater] stale-cache cleanup skipped:', e && e.message);
  }
}

function send(channel, data) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

function init(mainWindow, opts = {}) {
  win = mainWindow;
  const onUpdateAvailable = opts.onUpdateAvailable;

  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    console.log('[updater] electron-updater not available:', e.message);
    return;
  }

  // Do NOT auto-download in background; user will be shown download option
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Guard 1 — remove any stale leftover download for a version we already run,
  // so the updater stops re-prompting on machines that are up to date.
  clearStalePending();

  autoUpdater.on('update-available', async (info) => {
    const v = info && info.version;
    // Guard 2 — only act when the remote version is valid AND strictly newer
    // than what we're running. An empty or not-newer version is a stale /
    // duplicate signal (leftover pending cache); it must NOT fire the dialog
    // or the backend force-logout below.
    if (!v || cmpVersion(v, app.getVersion()) <= 0) {
      console.log(`[updater] ignoring stale update-available: '${v || '(empty)'}' vs running ${app.getVersion()}`);
      return;
    }
    console.log('[updater] update available:', v);
    if (onUpdateAvailable) {
      try { await onUpdateAvailable(v); } catch (e) {
        console.log('[updater] onUpdateAvailable error:', e && e.message);
      }
    }
    send('update:available', { version: v });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] no update available');
    send('update:not-available', {});
  });

  autoUpdater.on('download-progress', (progress) => {
    send('update:progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    const v = info && info.version;
    if (!v || cmpVersion(v, app.getVersion()) <= 0) {
      console.log(`[updater] ignoring stale update-downloaded: '${v || '(empty)'}' vs running ${app.getVersion()}`);
      return;
    }
    console.log('[updater] update downloaded:', v);
    send('update:downloaded', { version: v });
  });

  autoUpdater.on('error', (err) => {
    console.log('[updater] error:', err && err.message);
    send('update:error', { message: err && err.message });
  });

  // IPC handlers
  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates().catch(() => null));
  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate().catch(() => null));
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(false, true));

  // Check on launch (after 5s delay so app loads first)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);

  // Periodic check every 5 minutes so running apps detect updates promptly
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5 * 60 * 1000);
}

module.exports = { init };
