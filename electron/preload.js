const { contextBridge, ipcRenderer } = require('electron');

// Shared helper: subscribe to a one-way main→renderer event and return an
// unsubscribe function. Never exposes the raw ipcRenderer to the renderer.
function subscribe(channel, callback) {
  const handler = (_e, payload) => {
    try { callback(payload); } catch (_) {}
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// Secure Preload API — the ONLY bridge between the renderer and main.
// Keep this minimal. Never expose ipcRenderer / node globals wholesale.
contextBridge.exposeInMainWorld('datProAPI', {
  // ── Diagnostics ────────────────────────────────────────────────────────────
  ping:           () => ipcRenderer.invoke('app:ping'),
  getAppVersion:  () => ipcRenderer.invoke('app:get-version'),
  getPlatform:    () => process.platform,

  // ── Window controls (custom titlebar in future, if we add one) ────────────
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),

  // ── Auth & Session (Phase 2) ──────────────────────────────────────────────
  // All of these return plain objects — nothing sensitive flows back.
  login:            (credentials) => ipcRenderer.invoke('auth:login', credentials),
  verifyOtp:        (payload)     => ipcRenderer.invoke('auth:verify-otp', payload),
  resendOtp:        (email)       => ipcRenderer.invoke('auth:resend-otp', email),
  logout:           ()            => ipcRenderer.invoke('auth:logout'),
  getSavedEmail:    ()            => ipcRenderer.invoke('auth:get-saved-email'),
  saveEmail:        (email)       => ipcRenderer.invoke('auth:save-email', email),
  clearSavedEmail:  ()            => ipcRenderer.invoke('auth:clear-saved-email'),

  // ── DAT embedded view (Phase 3) ───────────────────────────────────────────
  // prepareDat():  set proxy -> verify IP -> inject cookies. Returns
  //                { ok: true, ip, port } on success or { ok: false, reason }.
  // getDatStatus(): current partition state (badge updates)
  // clearDat():    wipe the partition (called by logout internally too)
  prepareDat:      () => ipcRenderer.invoke('dat:prepare'),
  getDatStatus:    () => ipcRenderer.invoke('dat:get-status'),
  clearDat:        () => ipcRenderer.invoke('dat:clear'),

  // ── Session lifecycle push (Phase 5) ──────────────────────────────────────
  // Main pushes 'session:dead' when heartbeat / check-session finds the
  // server has killed our session (revoke, subscription expired, version too
  // old, logged in elsewhere, etc). Payload: { reason: string }.
  // Returns an unsubscribe function — call it in React cleanup.
  onSessionDead: (callback) => subscribe('session:dead', callback),

  // ── Admin / Super Admin (Phase 6) ─────────────────────────────────────────
  admin: {
    // Reads
    getUsers:           (type)    => ipcRenderer.invoke('admin:get-users', type),
    // User lifecycle
    createUser:         (payload) => ipcRenderer.invoke('admin:create-user', payload),
    revokeUser:         (email)   => ipcRenderer.invoke('admin:revoke-user', email),
    restoreUser:        (email)   => ipcRenderer.invoke('admin:restore-user', email),
    extendSubscription: (email)   => ipcRenderer.invoke('admin:extend-subscription', email),
    deleteUser:         (email)   => ipcRenderer.invoke('admin:delete-user', email),
    // Super Admin only
    setUserLimits:      (email, tab_limit, load_tab_limit) =>
                          ipcRenderer.invoke('admin:set-user-limits',
                            { email, tab_limit, load_tab_limit }),
    grantAdmin:         (email)   => ipcRenderer.invoke('admin:grant-admin', email),
    revokeAdmin:        (email)   => ipcRenderer.invoke('admin:revoke-admin', email),
    resetAdminAccess:   (email)   => ipcRenderer.invoke('admin:reset-admin-access', email),
    assignProxy:        (payload) => ipcRenderer.invoke('admin:assign-proxy', payload),
    syncMasterSession:  (blob)    => ipcRenderer.invoke('admin:sync-master-session', blob),
    updateUserSession:  (email, cookie_session) =>
                          ipcRenderer.invoke('admin:update-user-session',
                            { email, cookie_session }),
    getUserSession:     (email)   => ipcRenderer.invoke('admin:get-user-session', email),
    updateUserDetails:  (payload) => ipcRenderer.invoke('admin:update-user-details', payload),
    getActivityLog:     (params)  => ipcRenderer.invoke('admin:get-activity-log', params),
    exportActivityLog:  (params)  => ipcRenderer.invoke('admin:export-activity-log', params),
    getActivityStats:   (params)  => ipcRenderer.invoke('admin:get-activity-stats', params),
  },

  // ── Auto-update (Phase 8) ───────────────────────────────────────────────
  update: {
    check:    () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install:  () => ipcRenderer.invoke('update:install'),
    onAvailable:    (cb) => subscribe('update:available', cb),
    onNotAvailable: (cb) => subscribe('update:not-available', cb),
    onProgress:     (cb) => subscribe('update:progress', cb),
    onDownloaded:   (cb) => subscribe('update:downloaded', cb),
    onError:        (cb) => subscribe('update:error', cb),
  },
});
