import React, { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '../theme/ThemeProvider';
import './UserShell.css';

/*
 * UserShell — hosts the embedded DAT view as browser-style TABS.
 *
 * Lifecycle:
 *   mount -> status 'connecting' -> window.datProAPI.prepareDat()
 *     ok    -> status 'ready'  -> open the first DAT tab (/search-loads)
 *     fail  -> status 'failed' -> red overlay with Retry (fail-closed)
 *
 * Tabs:
 *   - Every tab is a <webview> on the SAME in-memory partition ('dat-session'),
 *     so all tabs share the one DAT account + the verified proxy. Security
 *     (WebRTC block, nav whitelist, dat-guard) is applied per-webview by the
 *     main process, so new tabs are automatically locked down.
 *   - "+ New tab" opens one.dat.com/search-loads only (no address bar, no
 *     arbitrary sites).
 *   - The number of open tabs is capped by the super-admin's tab_limit
 *     (>= 1). Trying to exceed it shows a "limit reached" alert and opens
 *     nothing.
 *
 * No DAT request EVER leaves the app before prepareDat() returns ok, so the
 * user's real IP cannot leak before the proxy is verified.
 */
const DAT_URL = 'https://one.dat.com/search-loads';

export default function UserShell({ onLogout }) {
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'ready' | 'failed'
  const [proxy, setProxy] = useState(null);           // { ip, port }
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const [tabLimit, setTabLimit] = useState(1);
  const [tabs, setTabs] = useState([]);                // [{ id }]
  const [activeId, setActiveId] = useState(null);
  const [limitAlert, setLimitAlert] = useState(false);

  const idCounter = useRef(0);
  const webviewRefs = useRef({});                      // id -> <webview> element

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
          setTabLimit(Math.max(1, Number(r.tab_limit) || 1));
          // Open the first DAT tab.
          const firstId = ++idCounter.current;
          setTabs([{ id: firstId }]);
          setActiveId(firstId);
          setStatus('ready');
        } else {
          setError((r && r.reason) || 'Secure connection check failed.');
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

  // Report open tab count to main (used by the heartbeat telemetry).
  useEffect(() => {
    if (status !== 'ready') return;
    try { window.datProAPI.setTabCount && window.datProAPI.setTabCount(tabs.length); } catch (_) {}
  }, [tabs, status]);

  // Tell main which webview is the active tab (for live URL/title in heartbeat).
  useEffect(() => {
    if (activeId == null) return;
    const el = webviewRefs.current[activeId];
    if (!el) return;
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      try { window.datProAPI.setActiveTab && window.datProAPI.setActiveTab(el.getWebContentsId()); } catch (_) {}
    };
    // getWebContentsId() throws until the webview is attached — wait for dom-ready.
    try { el.getWebContentsId(); fire(); }
    catch (_) { el.addEventListener('dom-ready', fire, { once: true }); }
    return () => { try { el.removeEventListener('dom-ready', fire); } catch (_) {} };
  }, [activeId, tabs]);

  const retry = () => setAttempt((n) => n + 1);

  const newTab = () => {
    if (tabs.length >= tabLimit) { setLimitAlert(true); return; }
    const id = ++idCounter.current;
    setTabs((prev) => [...prev, { id }]);
    setActiveId(id);
  };

  const closeTab = (id, e) => {
    if (e) e.stopPropagation();
    if (tabs.length <= 1) return; // always keep at least one DAT tab
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId && next.length) {
        const fallback = next[Math.max(0, idx - 1)] || next[0];
        setActiveId(fallback.id);
      }
      return next;
    });
    delete webviewRefs.current[id];
  };

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

      {status === 'ready' && (
        <div className="user-shell-tabs">
          {tabs.map((t, i) => (
            <div
              key={t.id}
              className={'ut-tab' + (t.id === activeId ? ' active' : '')}
              onClick={() => setActiveId(t.id)}
              title={`DAT ${i + 1}`}
            >
              <span>DAT {i + 1}</span>
              {tabs.length > 1 && (
                <span className="ut-tab-close" onClick={(e) => closeTab(t.id, e)}>×</span>
              )}
            </div>
          ))}
          <button
            className="ut-newtab"
            onClick={newTab}
            title={tabs.length >= tabLimit ? 'Tab limit reached' : 'New DAT tab'}
          >
            +
          </button>
        </div>
      )}

      <div className="user-shell-body">
        {status === 'ready' && tabs.map((t) => (
          <webview
            key={t.id}
            ref={(el) => { if (el) webviewRefs.current[t.id] = el; }}
            src={DAT_URL}
            partition="dat-session"
            allowpopups="false"
            className="user-shell-webview"
            style={{ display: t.id === activeId ? 'inline-flex' : 'none' }}
          />
        ))}

        {status === 'connecting' && (
          <div className="user-shell-overlay overlay-info">
            <div className="overlay-card">
              <div className="overlay-spinner" />
              <h3>Connecting securely…</h3>
              <p>Securing your connection…</p>
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

        {limitAlert && (
          <div className="user-shell-overlay overlay-info" style={{ zIndex: 20 }}>
            <div className="overlay-card">
              <div className="overlay-icon">🚫</div>
              <h3>Tab limit reached</h3>
              <p>You have reached your tab limit. You can open up to {tabLimit} tab{tabLimit > 1 ? 's' : ''}.</p>
              <button className="overlay-retry" onClick={() => setLimitAlert(false)}>OK</button>
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
