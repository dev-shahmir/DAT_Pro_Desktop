# DAT Desktop — Progress

## Completed Phases

### Phase 1 — Project Setup
- Electron + React (Vite) scaffold
- Custom titlebar, window controls

### Phase 2 — Auth & Session
- Login, OTP verification, resend OTP
- Role-based routing (user / admin / superAdmin)
- Saved email persistence
- Logout with backend API call

### Phase 3 — DAT Embedded View
- In-memory session partition (no persist: prefix)
- Proxy setup per user on partition
- Egress IP verification (fail-closed)
- Cookie decryption + injection
- clearDat() — full cleanup (cookies individually, cache, storage, proxy rules)

### Phase 5 — Session Lifecycle
- Heartbeat every 60s (send-heartbeat/)
- Check-session every 15s (check-session/)
- Session dead detection (revoke, expiry, logged-in-elsewhere, version too old)
- Session dead popup (3s auto-dismiss) → auto-logout → login screen
- Admin session update detection via cookie_session_updated_at timestamp comparison
- Session updated popup (3s auto-dismiss) → auto-logout → login screen

### Phase 6 — Admin / Super Admin
- User CRUD (create, revoke, restore, extend, delete)
- Super admin: set limits, grant/revoke admin, assign proxy, sync master session
- Update user session, get user session
- Activity log (get, export, stats)

### Phase 7 — Activity Logging
- Event buffer in heartbeat (nav, title changes)
- Flushed to server on each heartbeat

### Phase 8 — Auto-Update
- electron-updater (lazy-loaded to avoid dev mode crash)
- Check on launch (5s delay)
- Update available / downloading / ready UI banner
- Download + install (restart) flow

### Phase 9 — Connection & Disruption Detection
- **Network monitor**: polls `net.online` every 3s, detects offline/online transitions
- **Sleep/wake**: `powerMonitor` suspend/resume events
- **Proxy errors**: webview `did-fail-load` error codes (-130, -105, -106, etc.)
- **Proxy change detection**: heartbeat compares host/port from server vs local session
- **Unified popup system** (ConnectionPopup component):
  - Offline → "No Internet Connection" + "Close App" button; auto-logout on network restore
  - Sleep → "System Going to Sleep" (no buttons)
  - Resume → "Reconnecting..." (auto-dismiss 3s)
  - Proxy error → "Proxy Connection Lost" + "Close App" button
  - Session dead → popup 3s → auto backend logout → login screen
  - Session updated → popup 3s → auto backend logout → login screen
  - Proxy changed → popup 3s → auto backend logout → login screen
- **No dismiss button** — popups cannot be manually dismissed

### Thorough Cleanup on Every Logout Path
- DAT injected cookies cleared FIRST (individual cookie removal)
- Session storage, cache, proxy rules cleared
- Backend logout API call
- Local session cleared
- Applies to: manual logout, app close (before-quit), session dead, session updated, proxy changed, network restore after offline

## Files Modified/Created (Phase 9)

| File | Change |
|------|--------|
| `electron/connection-monitor.js` | NEW — network/sleep/proxy disruption detection |
| `electron/updater.js` | Lazy-load autoUpdater to fix dev crash |
| `electron/main.js` | Connection monitor init, proxy error detection, onSessionUpdated/onProxyChanged callbacks, cleanup order (DAT first) |
| `electron/heartbeat.js` | Session update detection (cookie_session_updated_at), proxy change detection (host/port) |
| `electron/preload.js` | onConnectionStatus, onSessionUpdated bridge APIs |
| `electron/dat-webview.js` | Thorough clearDat() (cookies, cache, storage, proxy) |
| `src/App.jsx` | ConnectionPopup, CONN_MESSAGES, connection/session listeners, auto-logout flows |

## Pending

- [ ] Full testing of all popup scenarios
- [ ] Version bump + build + GitHub release (also tests auto-update)
- [ ] Mac DMG files to GitHub release
- [ ] electron-builder.yml owner change (dev-shahmir) commit/push
