const { ipcMain } = require('electron');

let win = null;
let autoUpdater = null;

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

  autoUpdater.on('update-available', async (info) => {
    console.log('[updater] update available:', info.version);
    if (onUpdateAvailable) {
      try { await onUpdateAvailable(info.version); } catch (e) {
        console.log('[updater] onUpdateAvailable error:', e && e.message);
      }
    }
    send('update:available', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] no update available');
    send('update:not-available', {});
  });

  autoUpdater.on('download-progress', (progress) => {
    send('update:progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] update downloaded:', info.version);
    send('update:downloaded', { version: info.version });
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
