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
  const [updateState, setUpdateState] = useState(null); // null | 'available' | 'downloading' | 'ready'
  const [updateDetected, setUpdateDetected] = useState(false); // stays true once update found — blocks login
  const [updateVersion, setUpdateVersion] = useState('');
  const [updatePercent, setUpdatePercent] = useState(0);
  const [connIssue, setConnIssue] = useState(null); // null | { type, detail?, dismissable? }

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
      api.update.onAvailable(({ version }) => {
        setUpdateVersion(version);
        setUpdateState('available');
        setUpdateDetected(true);
        // Force logout immediately from app & backend
        try { api.logout().catch(() => {}); } catch (_) {}
        goLogin();
      }),
      api.update.onProgress(({ percent }) => { setUpdatePercent(percent); }),
      api.update.onDownloaded(() => { setUpdateState('ready'); }),
      api.update.onError((err) => {
        console.error('[updater] error:', err);
        setUpdateState('error');
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const handleUpdateDownload = () => { setUpdateState('downloading'); setUpdatePercent(0); window.datProAPI.update.download(); };
  const handleUpdateInstall = () => { window.datProAPI.update.install(); };

  // Phase 9 — connection monitor (WiFi, sleep, proxy)
  useEffect(() => {
    const api = window.datProAPI;
    if (!api || !api.onConnectionStatus) return;
    let resumeTimer = null;
    const unsub = api.onConnectionStatus((ev) => {
      if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
      switch (ev.type) {
        case 'offline':
          setConnIssue({ type: 'offline' });
          api.clearDat().catch(() => {});
          break;
        case 'online':
          setConnIssue((prev) => {
            if (prev && prev.type === 'offline') {
              window.datProAPI.logout().catch(() => {}).finally(() => goLogin());
              return null;
            }
            return prev;
          });
          break;
        case 'sleep':
          setConnIssue({ type: 'sleep' });
          break;
        case 'resume':
          setConnIssue({ type: 'reconnecting' });
          resumeTimer = setTimeout(() => setConnIssue(null), 3000);
          break;
        case 'proxy-error':
          setConnIssue({ type: 'proxy-error', detail: ev.detail });
          api.clearDat().catch(() => {});
          break;
        default: break;
      }
    });
    return () => { unsub(); if (resumeTimer) clearTimeout(resumeTimer); };
  }, []);

  // Phase 5 — session dead (revoke, expiry, logged-in-elsewhere, version too old)
  useEffect(() => {
    const api = window.datProAPI;
    if (!api) return;
    const unsubs = [];
    if (api.onSessionDead) {
      unsubs.push(api.onSessionDead(({ reason }) => {
        setConnIssue({ type: 'session-dead', detail: reason || "You've been signed out. Please sign in again." });
        // Auto-logout and go to login after showing popup briefly
        setTimeout(() => {
          api.logout().catch(() => {});
          setConnIssue(null);
          goLogin();
        }, 3000);
      }));
    }
    if (api.onSessionUpdated) {
      unsubs.push(api.onSessionUpdated(({ reason }) => {
        setConnIssue({ type: 'session-updated', detail: reason });
        // Backend logout already done by main process; just go to login after showing popup
        setTimeout(() => {
          setConnIssue(null);
          goLogin();
        }, 3000);
      }));
    }
    return () => unsubs.forEach((u) => u());
  }, []);

  return (
    <div className="app-root" style={{ height: '100vh' }}>
      {screen === 'login' && (
        <LoginScreen
          onLoginSuccess={(role) => { setScreen(role); }}
          onNeedsOtp={(email) => { setPendingEmail(email); setScreen('otp'); }}
          updateAvailable={updateDetected}
        />
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

      {connIssue && (
        <ConnectionPopup
          issue={connIssue}
          onDismiss={() => setConnIssue(null)}
          onRelogin={async () => {
            setConnIssue(null);
            // Always go to login immediately; logout in background (may fail if offline —
            // the 'online' handler will retry backend logout when network returns)
            window.datProAPI.logout().catch(() => {});
            goLogin();
          }}
        />
      )}

      {updateState && (
        <UpdateRequiredModal
          state={updateState}
          version={updateVersion}
          percent={updatePercent}
          onDownload={handleUpdateDownload}
          onInstall={handleUpdateInstall}
        />
      )}

      {logoutConfirm && (
        <ConfirmDialog
          title="Log out"
          message="Sign out and return to the login screen?"
          confirmLabel="Log out"
          danger
          onCancel={() => setLogoutConfirm(false)}
          onConfirm={confirmLogout}
        />
      )}
    </div>
  );
}

function UpdateRequiredModal({ state, version, percent, onDownload, onInstall }) {
  // Prevent Escape key from doing anything while update modal is active
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    background: 'rgba(15, 23, 42, 0.88)',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    userSelect: 'none',
  };

  const modalStyle = {
    background: 'var(--card-bg, #1e293b)',
    border: '1px solid rgba(59, 130, 246, 0.35)',
    color: 'var(--text, #f8fafc)',
    padding: '36px 32px',
    borderRadius: '16px',
    width: '100%',
    maxWidth: 460,
    textAlign: 'center',
    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6), 0 0 35px rgba(59, 130, 246, 0.25)',
  };

  const iconStyle = {
    fontSize: 48,
    marginBottom: 16,
    display: 'inline-block',
  };

  const titleStyle = {
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 10px 0',
    color: '#ffffff',
  };

  const descStyle = {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#94a3b8',
    marginBottom: 24,
  };

  const btnStyle = {
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    padding: '13px 28px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 15,
    width: '100%',
    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
  };

  const progressTrackStyle = {
    width: '100%',
    height: 12,
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    overflow: 'hidden',
    margin: '18px 0 10px 0',
  };

  const progressFillStyle = {
    height: '100%',
    width: `${Math.min(100, Math.max(0, percent))}%`,
    background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
    borderRadius: 6,
    transition: 'width 0.2s ease',
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={iconStyle}>
          {state === 'ready' ? '✅' : state === 'error' ? '⚠️' : '🚀'}
        </div>
        <h2 style={titleStyle}>
          {state === 'ready' ? 'Update Ready to Install' : 'Update Required'}
        </h2>
        <p style={descStyle}>
          {state === 'ready'
            ? `DAT Pro v${version} has been downloaded. Restart the app now to apply the update and continue.`
            : `A new version of DAT Pro (v${version}) is available. For security and stability, your session has been closed. Please download and install the update to continue.`}
        </p>

        {state === 'available' && (
          <button style={btnStyle} onClick={onDownload}>
            Download Update (v{version})
          </button>
        )}

        {state === 'downloading' && (
          <div>
            <div style={progressTrackStyle}>
              <div style={progressFillStyle} />
            </div>
            <div style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>
              Downloading update… {Math.round(percent)}%
            </div>
          </div>
        )}

        {state === 'ready' && (
          <button style={btnStyle} onClick={onInstall}>
            Restart & Install Now
          </button>
        )}

        {state === 'error' && (
          <div>
            <p style={{ color: '#f87171', fontSize: 13, marginBottom: 14 }}>
              Failed to download update. Please check your internet connection.
            </p>
            <button style={btnStyle} onClick={onDownload}>
              Retry Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const CONN_MESSAGES = {
  offline: {
    icon: '📡',
    title: 'No Internet Connection',
    desc: 'Your WiFi or network connection appears to be down. Please check your connection and try again.',
    color: '#ef4444',
  },
  sleep: {
    icon: '💤',
    title: 'System Going to Sleep',
    desc: "Your laptop is going to sleep. You'll be reconnected when you wake it up.",
    color: '#f59e0b',
  },
  reconnecting: {
    icon: '🔄',
    title: 'Reconnecting...',
    desc: 'Your system just woke up. Re-establishing connection to the server.',
    color: '#3b82f6',
  },
  'proxy-error': {
    icon: '🔌',
    title: 'Connection Lost',
    desc: 'Your secure connection to DAT was interrupted. This may be due to a network change.',
    color: '#ef4444',
  },
  'session-dead': {
    icon: '⚠️',
    title: 'Signed Out',
    desc: "You've been signed out. Please sign in again to continue.",
    color: '#ef4444',
  },
  'session-updated': {
    icon: '🔄',
    title: 'Account Updated',
    desc: 'Your account was updated by the administrator. Please sign in again to continue.',
    color: '#3b82f6',
  },
};

function ConnectionPopup({ issue, onDismiss, onRelogin }) {
  const cfg = CONN_MESSAGES[issue.type] || CONN_MESSAGES.offline;
  const showRelogin = false;
  const showClose = ['offline', 'proxy-error'].includes(issue.type);
  const canDismiss = false;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.55)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--surface-2, #1a1a1a)', borderRadius: 14,
        padding: '32px 36px', maxWidth: 420, width: '90%',
        border: `1px solid ${cfg.color}33`, textAlign: 'center',
        boxShadow: `0 0 40px ${cfg.color}22`,
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{cfg.icon}</div>
        <h3 style={{ margin: '0 0 8px', color: cfg.color, fontSize: 18 }}>{cfg.title}</h3>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary, #aaa)', fontSize: 13, lineHeight: 1.5 }}>
          {issue.detail || cfg.desc}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {showRelogin && (
            <button onClick={onRelogin} style={{
              background: cfg.color, color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 24px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>Login Again</button>
          )}
          {showClose && (
            <button onClick={() => window.datProAPI.closeWindow()} style={{
              background: cfg.color, color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 24px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>Close App</button>
          )}
          {canDismiss && (
            <button onClick={onDismiss} style={{
              background: cfg.color, color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 24px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>Dismiss</button>
          )}
        </div>
      </div>
    </div>
  );
}

