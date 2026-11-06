# DAT Pro Desktop

Electron + React desktop application for DAT Pro — secure browser with embedded DAT access, auto-update, and session management.

## Features

- **Secure Login** — Email/password authentication with OTP verification for first-time users
- **Forgot Password** — OTP-based password recovery flow
- **Light/Dark Theme** — Light theme by default with toggle to dark mode
- **Auto-Update** — Automatic update detection and installation via GitHub releases
- **Session Management** — Heartbeat monitoring, disruption detection, connection/proxy change handling
- **Embedded DAT Access** — Secure webview with isolated session partition, navigation whitelist, and UI lockdown
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
src/
  App.jsx          — Screen routing, session state, popup management
  screens/
    Login/         — Login UI with forgot password flow (4 views)
    Otp/           — First-time OTP verification screen
  theme/
    ThemeProvider.jsx — Light/dark theme context with toggle
    variables.css    — CSS custom properties for theming
```

## Security

- `contextIsolation: true` · `sandbox: true` · `nodeIntegration: false`
- `webSecurity: true` · menu removed
- Single-instance lock; all popups denied; WebRTC leak policy on
- Strict CSP; no inline scripts; `frame-ancestors 'none'`
- DAT cookies cleaned up on logout before session clear

## Config

- **electron-builder.yml** — Build config (appId: `com.datpro.desktop`)
- **GitHub Releases** — Auto-update publish target (`dev-shahmir/DAT_Pro_Desktop`)
