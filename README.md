# DAT Pro Desktop

Electron + React (JSX) shell. **Phase 1 — skeleton**, with secure defaults
locked in from Phase 0 (see `../PLAN.md` and `../PROGRESS.md`).

## Install
```
cd dat-desktop
npm install
```
First run downloads Electron (~200MB).

## Dev (hot reload)
```
npm run dev
```
- Vite serves the renderer on **http://localhost:5173**
- Electron launches once Vite is up and loads that URL
- Hit Ctrl+C in that terminal to stop both

## Build & preview
```
npm run build      # vite build -> dist/
npm run preview    # launches Electron against the built dist/
```

## Package (Phase 8)
```
npm run dist       # electron-builder -> release/ (Win .exe NSIS + Mac .dmg)
```
Config: `electron-builder.yml` (appId `com.datpro.desktop`).

## Structure
- `electron/main.js` — main process: single-instance lock, popup deny,
  WebRTC leak block, window IPC, `webviewTag: true` (for Phase 3 embed)
- `electron/preload.js` — `window.datProAPI` (ping, version, window controls,
  Phase-2 auth placeholders)
- `electron/dat-guard.js` — UI lockdown script for DAT webview (Phase-0 confirmed)
- `src/main.jsx` + `src/App.jsx` — React entry + screen state
- `src/screens/Login/LoginScreen.jsx` + `LoginScreen.css` — login UI
- `src/theme/variables.css` — design tokens (deep black `#050505`, primary
  `#3b82f6`, success `#10b981`, custom scrollbar)
- `index.html` — strict CSP for the renderer

## Security defaults (locked)
- `contextIsolation: true` · `sandbox: true` · `nodeIntegration: false`
- `webSecurity: true` · menu removed
- Single-instance lock; all popups denied; WebRTC leak policy on
- Strict CSP; no inline scripts; `frame-ancestors 'none'`

## What's next (per PLAN.md)
- **Phase 2:** wire login + OTP + email remember + role routing to backend
- **Phase 3:** embedded DAT `<webview>` with isolated session partition,
  proxy verify + fail-closed + leak block, navigation whitelist, dat-guard inject
