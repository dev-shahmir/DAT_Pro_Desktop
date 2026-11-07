# DAT Pro Desktop

Electron + React desktop application for DAT Pro — secure browser with embedded DAT access, auto-update, and session management.

## Features

- **Secure Login** — Email/password authentication with OTP verification for first-time users
- **Role-Based Shells** — Separate User, Admin, and Super Admin interfaces resolved from the backend login response
- **Super Admin Dashboard** — Create/edit/revoke users, set proxy and tab limits, master session, activity log
- **Platform Restriction** — Each account is allowed on the app, the extension, or both (`both` users can be logged in on app **and** extension at the same time); super-admin controlled per user
- **Version Gate** — Login/refresh/heartbeat enforce a minimum app version server-side (safety net behind the in-app update banner)
- **Forgot Password** — OTP-based password recovery flow
- **Light/Dark Theme** — Light theme by default with toggle to dark mode
- **Auto-Update** — Update detection via GitHub releases; a non-dismissable banner appears and the login button is disabled until the user updates
- **Session Management** — Heartbeat monitoring, disruption detection, connection/proxy change handling
- **Embedded DAT Access** — Secure webview locked to the DAT load board, isolated session partition, navigation whitelist, sidebar lockdown, and a per-user DAT search-tab limit
- **IP-Leak Protection** — The egress IP is verified through the proxy before any DAT request loads (fail-closed)
- **Single Instance** — Only one app instance allowed at a time

## Install

```bash
cd dat-desktop
npm install
```

## Development

```bash
npm run dev
```

- Vite serves the renderer on **http://localhost:5173**
- Electron launches once Vite is up and loads that URL

## Build & Package

```bash
npm run build        # Vite build -> dist/
npm run preview      # Launch Electron against built dist/
npm run dist:win     # Windows installer (.exe NSIS) -> release/
npm run dist:mac     # macOS installer (.dmg) -> release/
```

## Project Structure

```
electron/
  main.js          — Main process: single-instance, auto-update, IPC handlers
  preload.js       — window.datProAPI bridge (auth, session, window controls)
  auth.js          — Login, OTP, forgot password API calls
  heartbeat.js     — Session heartbeat and disruption detection
  updater.js       — Auto-update via electron-updater
  dat-webview.js   — DAT webview session/proxy management
  dat-guard.js     — UI lockdown script injected into DAT webview
  admin.js         — Admin / Super Admin backend client (auto-injects secret_key + session_id)
src/
  App.jsx          — Screen routing, session state, update banner, popup management
  screens/
    Login/         — Login UI with forgot password flow (4 views)
    Otp/           — First-time OTP verification screen
    UserShell / AdminShell / SuperAdminShell — role-based interfaces
    Admin/         — Create/Edit user modals, user table, activity log, session modals
  theme/
    ThemeProvider.jsx — Light/dark theme context with toggle
    variables.css    — CSS custom properties for theming
```

## Roles & Platform

- Role comes from the backend login response: `is_super_admin` → Super Admin, `is_admin` → Admin, else regular User.
- Each account has a `platform` setting (`app` / `extension` / `both`, default `both`), set by the super admin at create or edit time. The app sends `platform: 'app'` on every auth call; login is rejected if the account isn't allowed on the app.
- Regular users get the embedded DAT view; admins/super admins get management dashboards.

## Security

- `contextIsolation: true` · `sandbox: true` · `nodeIntegration: false`
- `webSecurity: true` · menu removed
- Single-instance lock; all popups denied; WebRTC leak policy on
- Strict CSP; no inline scripts; `frame-ancestors 'none'`
- DAT cookies cleaned up on logout before session clear
- Egress IP verified through the proxy before DAT loads (fail-closed — never leaks the real IP)
- Every authenticated request carries a server-issued `session_id` (not just the user id)

## Config

- **electron-builder.yml** — Build config (appId: `com.datpro.desktop`)
- **GitHub Releases** — Auto-update publish target (`dev-shahmir/DAT_Pro_Desktop`)
