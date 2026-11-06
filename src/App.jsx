import React, { useEffect, useState } from 'react';
import LoginScreen from './screens/Login/LoginScreen';
import OtpScreen from './screens/Otp/OtpScreen';
import UserShell from './screens/UserShell';
import AdminShell from './screens/AdminShell';
import SuperAdminShell from './screens/SuperAdminShell';
import ConfirmDialog from './components/ConfirmDialog';

/*
 * App shell + screen router.
 * Screens: 'login' -> 'otp' (first-time only) -> 'user' | 'admin' | 'superAdmin'
 * Role comes from the backend /login/ (or /verify-otp/) response:
 *   is_super_admin -> 'superAdmin' | is_admin -> 'admin' | else -> 'user'.
 */
export default function App() {
  const [screen, setScreen] = useState('login');
  const [pendingEmail, setPendingEmail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sessionDeadMsg, setSessionDeadMsg] = useState(null);
  const [updateState, setUpdateState] = useState(null); // null | 'available' | 'downloading' | 'ready'
  const [updateVersion, setUpdateVersion] = useState('');
  const [updatePercent, setUpdatePercent] = useState(0);

  const goLogin = () => {
    setPendingEmail(null);
    setScreen('login');
  };

  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const handleLogout = () => {
    if (busy) return;
    setLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setLogoutConfirm(false);
    if (busy) return;
    setBusy(true);
    try {
      await window.datProAPI.logout();
    } catch (_) { /* server-side cleanup is best-effort */ }
    setBusy(false);
    goLogin();
  };

  // Phase 8 — auto-update listeners
  useEffect(() => {
    const api = window.datProAPI;
    if (!api || !api.update) return;
    const unsubs = [
      api.update.onAvailable(({ version }) => { setUpdateVersion(version); setUpdateState('available'); }),
      api.update.onProgress(({ percent }) => { setUpdatePercent(percent); }),
      api.update.onDownloaded(() => { setUpdateState('ready'); }),
      api.update.onError(() => { setUpdateState(null); }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const handleUpdateDownload = () => { setUpdateState('downloading'); setUpdatePercent(0); window.datProAPI.update.download(); };
  const handleUpdateInstall = () => { window.datProAPI.update.install(); };

  // Phase 5 — main pushes 'session:dead' when heartbeat/check-session detects
  // the server has killed our session (revoke, expiry, logged-in-elsewhere,
  // version too old). We force the UI back to login and surface the reason.
  useEffect(() => {
    if (!window.datProAPI || !window.datProAPI.onSessionDead) return;
    const unsub = window.datProAPI.onSessionDead(({ reason }) => {
      setSessionDeadMsg(reason || 'Your session has ended.');
      goLogin();
    });
    return unsub;
  }, []);

  return (
    <div className="app-root" style={{ height: '100vh' }}>
      {screen === 'login' && (
        <>
          <LoginScreen
            onLoginSuccess={(role) => { setSessionDeadMsg(null); setScreen(role); }}
            onNeedsOtp={(email) => { setSessionDeadMsg(null); setPendingEmail(email); setScreen('otp'); }}
          />
          {sessionDeadMsg && <SessionDeadBanner message={sessionDeadMsg} onDismiss={() => setSessionDeadMsg(null)} />}
        </>
      )}

      {screen === 'otp' && (
        <OtpScreen
          email={pendingEmail}
          onVerified={(role) => setScreen(role)}
          onCancel={goLogin}
        />
      )}

      {screen === 'user'       && <UserShell       onLogout={handleLogout} />}
      {screen === 'admin'      && <AdminShell      onLogout={handleLogout} />}
      {screen === 'superAdmin' && <SuperAdminShell onLogout={handleLogout} />}

      {updateState && (
        <UpdateBanner
          state={updateState}
          version={updateVersion}
          percent={updatePercent}
          onDownload={handleUpdateDownload}
          onInstall={handleUpdateInstall}
          onDismiss={() => setUpdateState(null)}
        />
      )}

      {logoutConfirm && (
        <ConfirmDialog
          title="Log out"
          message="End your session and return to the login screen?"
          confirmLabel="Log out"
          danger
          onCancel={() => setLogoutConfirm(false)}
          onConfirm={confirmLogout}
        />
      )}
    </div>
  );
}

function UpdateBanner({ state, version, percent, onDownload, onInstall, onDismiss }) {
  const bannerStyle = {
    position: 'fixed', bottom: 20, right: 20, zIndex: 1000,
    background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.5)',
    color: '#4ade80', padding: '12px 18px', borderRadius: 8, fontSize: 13,
    display: 'flex', alignItems: 'center', gap: 12,
    backdropFilter: 'blur(10px)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', maxWidth: '90vw',
  };
  const btnStyle = {
    background: '#22c55e', color: '#000', border: 'none', borderRadius: 6,
    padding: '5px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 12,
  };
  return (
    <div style={bannerStyle}>
      {state === 'available' && <>
        <span>Update v{version} available</span>
        <button style={btnStyle} onClick={onDownload}>Download</button>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}>×</button>
      </>}
      {state === 'downloading' && <span>Downloading update… {percent}%</span>}
      {state === 'ready' && <>
        <span>Update ready — restart to apply</span>
        <button style={btnStyle} onClick={onInstall}>Restart Now</button>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}>×</button>
      </>}
    </div>
  );
}

function SessionDeadBanner({ message, onDismiss }) {
  return (
    <div style={{
      position: 'fixed',
      top: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      background: 'rgba(239, 68, 68, 0.14)',
      border: '1px solid rgba(239, 68, 68, 0.5)',
      color: 'var(--danger-h, #f87171)',
      padding: '10px 18px',
      borderRadius: 'var(--radius-sm, 8px)',
      fontSize: 13,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      maxWidth: '90vw',
    }}>
      <span>⚠️ {message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          opacity: 0.7,
        }}
        aria-label="Dismiss"
      >×</button>
    </div>
  );
}
