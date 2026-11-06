/*
 * Connection monitor — detects network, sleep, and proxy disruptions.
 * Sends typed events to the renderer so it can show contextual pop-ups.
 *
 * Events pushed to renderer (channel: 'connection:status'):
 *   { type: 'offline' }              — WiFi / network went down
 *   { type: 'online' }               — network came back
 *   { type: 'sleep' }                — OS is about to suspend
 *   { type: 'resume' }               — OS woke up
 *   { type: 'proxy-error', detail }  — DAT webview proxy/load failure
 */
const { powerMonitor } = require('electron');

let win = null;

function send(data) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('connection:status', data);
  }
}

function init(mainWindow) {
  win = mainWindow;

  // ── Network online/offline ──
  // Chromium's net module exposes online state; powerMonitor is more reliable
  // on Windows for detecting actual connectivity changes.
  const { net } = require('electron');

  // Poll-free: Electron fires these when the OS reports connectivity change.
  powerMonitor.on('shutdown', () => {}); // no-op, just ensure monitor is active

  // Check periodically because Electron doesn't have a direct 'offline' event
  // on powerMonitor. We use the net.online property with a lightweight poll.
  let wasOnline = net.online;
  const checkInterval = setInterval(() => {
    const isOnline = net.online;
    if (wasOnline && !isOnline) {
      console.log('[conn-monitor] network went offline');
      send({ type: 'offline' });
    } else if (!wasOnline && isOnline) {
      console.log('[conn-monitor] network back online');
      send({ type: 'online' });
    }
    wasOnline = isOnline;
  }, 3000);

  // ── Sleep / Resume ──
  powerMonitor.on('suspend', () => {
    console.log('[conn-monitor] OS suspend');
    send({ type: 'sleep' });
  });
  powerMonitor.on('resume', () => {
    console.log('[conn-monitor] OS resume');
    send({ type: 'resume' });
  });

  // Cleanup on window close
  mainWindow.on('closed', () => {
    clearInterval(checkInterval);
    win = null;
  });
}

// Called by main.js when the DAT webview has a proxy/load failure.
function reportProxyError(detail) {
  console.log('[conn-monitor] proxy error:', detail);
  send({ type: 'proxy-error', detail });
}

module.exports = { init, reportProxyError };
