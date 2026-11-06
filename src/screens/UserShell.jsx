import React, { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '../theme/ThemeProvider';
import './UserShell.css';

/*
 * UserShell — hosts the embedded DAT <webview>.
 *
 * Lifecycle:
 *   mount -> status 'connecting' -> window.datProAPI.prepareDat()
 *     ok    -> status 'ready'  -> mount <webview src="/search-loads">
 *     fail  -> status 'failed' -> red overlay with Retry (fail-closed)
 *
 * No DAT request EVER leaves the app before prepareDat() returns ok, so the
 * user's real IP cannot leak before the proxy is verified.
 */
export default function UserShell({ onLogout }) {
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'ready' | 'failed'
  const [proxy, setProxy] = useState(null);           // { ip, port }
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const wvRef = useRef(null);

  // Run prepareDat on mount and whenever we retry.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('connecting');
      setError(null);
      try {
        const r = await window.datProAPI.prepareDat();
        if (cancelled) return;
        if (r && r.ok) {
          setProxy({ ip: r.ip, port: r.port });
          setStatus('ready');
        } else {
          setError((r && r.reason) || 'Proxy verification failed.');
          setStatus('failed');
        }
      } catch (e) {
        if (cancelled) return;
        setError('Unexpected error. Try again.');
        setStatus('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <div className="user-shell">
      <header className="user-shell-header">
        <div className="user-shell-brand">
          <strong>DAT Pro</strong>
          <ProxyBadge status={status} proxy={proxy} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ThemeToggle />
          <button className="user-shell-logout" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="user-shell-body">
        {status === 'ready' && (
          <webview
            ref={wvRef}
            src="https://one.dat.com/search-loads"
            partition="dat-session"
            allowpopups="false"
            className="user-shell-webview"
          />
        )}

        {status === 'connecting' && (
          <div className="user-shell-overlay overlay-info">
            <div className="overlay-card">
              <div className="overlay-spinner" />
              <h3>Connecting securely…</h3>
              <p>Setting up proxy and verifying egress IP.</p>
            </div>
          </div>
        )}

        {status === 'failed' && (
          <div className="user-shell-overlay overlay-error">
            <div className="overlay-card">
              <div className="overlay-icon">⛔</div>
              <h3>Secure connection failed</h3>
              <p>{error}</p>
              <button className="overlay-retry" onClick={retry}>Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProxyBadge({ status, proxy }) {
  const base = {
    padding: '4px 12px',
    fontSize: 11,
    borderRadius: 999,
    fontWeight: 500,
    border: '1px solid',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
  if (status === 'ready') {
    return (
      <span style={{ ...base, background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderColor: 'rgba(16,185,129,0.4)' }}>
        <Dot color="var(--success)" />
        Security on
      </span>
    );
  }
  if (status === 'connecting') {
    return (
      <span style={{ ...base, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}>
        <Dot color="#f59e0b" pulse />
        Connecting…
      </span>
    );
  }
  return (
    <span style={{ ...base, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.4)' }}>
      <Dot color="var(--danger)" />
      Connection insecure
    </span>
  );
}

function Dot({ color, pulse }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', background: color,
      boxShadow: `0 0 0 3px ${hexA(color, 0.2)}`,
      animation: pulse ? 'proxy-pulse 1.3s ease-in-out infinite' : 'none',
    }} />
  );
}

function hexA(c, a) {
  // tiny helper — only used for dot halo; let CSS handle rgb falls back fine
  if (typeof c === 'string' && c.startsWith('var(')) return `rgba(16,185,129,${a})`;
  return c;
}

function maskIp(ip) {
  if (!ip) return '';
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.•.•`;
}
