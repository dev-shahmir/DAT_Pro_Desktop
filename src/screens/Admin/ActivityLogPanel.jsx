import React, { useEffect, useState, useCallback } from 'react';

const EVENT_LABELS = {
  login: 'Login', logout: 'Logout', force_login: 'Force Login',
  session_dead: 'Session Dead', revoked: 'Revoked', restored: 'Restored',
  subscription_expired: 'Sub Expired', heartbeat_miss: 'HB Miss',
  session_kick: 'Session Kick', app_close: 'App Close',
  sleep_expired: 'Sleep Expired', created: 'Created', deleted: 'Deleted',
  extended: 'Extended', session_updated: 'Session Updated',
  proxy_updated: 'Proxy Updated', limits_updated: 'Limits Updated',
  password_changed: 'Password Changed',
};

const EVENT_COLORS = {
  login: 'var(--success)', logout: 'var(--text-muted)', force_login: '#f59e0b',
  session_dead: 'var(--danger)', revoked: 'var(--danger)', restored: 'var(--success)',
  subscription_expired: 'var(--danger)', session_kick: '#f59e0b',
  created: 'var(--primary)', deleted: 'var(--danger)', extended: 'var(--success)',
};

const PAGE_SIZE = 50;

export default function ActivityLogPanel() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (filter) params.email = filter;
      if (eventFilter) params.event = eventFilter;
      const r = await window.datProAPI.admin.getActivityLog(params);
      if (r && r.success) { setLogs(r.logs || []); setTotal(r.total || 0); }
      else setErr((r && r.message) || 'Failed to load.');
    } catch (_) { setErr('Network error.'); }
    finally { setLoading(false); }
  }, [filter, eventFilter, page]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await window.datProAPI.admin.getActivityStats({ days: 7 });
      if (r && r.success) setStats(r.stats);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleExport = async () => {
    try {
      const params = {};
      if (filter) params.email = filter;
      if (eventFilter) params.event = eventFilter;
      const r = await window.datProAPI.admin.exportActivityLog(params);
      if (r && r.success) {
        const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (_) {}
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="ut-wrap">
      {/* Stats row */}
      {stats && stats.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stats.map(s => (
            <div key={s._id} style={{
              padding: '4px 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', fontSize: 11,
              color: EVENT_COLORS[s._id] || 'var(--text-muted)',
              background: 'var(--card-bg)',
            }}>
              {EVENT_LABELS[s._id] || s._id}: <strong>{s.count}</strong>
            </div>
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>last 7 days</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="ut-toolbar">
        <input
          type="text"
          placeholder="Filter by email…"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          className="ut-filter"
          onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
        />
        <select
          value={eventFilter}
          onChange={(e) => { setEventFilter(e.target.value); setPage(0); }}
          style={{
            padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: 13, outline: 'none',
          }}
        >
          <option value="">All Events</option>
          {Object.entries(EVENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="ut-refresh" onClick={fetchLogs} disabled={loading} title="Refresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <button
          className="ut-abtn ut-abtn-ghost"
          onClick={handleExport}
          style={{ fontSize: 12 }}
        >Export JSON</button>
      </div>

      {err && <div className="ut-error">{err}</div>}

      {/* Table */}
      <div className="ut-tablewrap">
        <table className="ut-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Event</th>
              <th>Detail</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr><td colSpan={5} className="ut-empty-cell">Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="ut-empty-cell">No activity logs found.</td></tr>
            ) : logs.map((log, i) => (
              <tr key={log._id || i}>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                  {formatTime(log.created_at)}
                </td>
                <td style={{ fontSize: 12, fontWeight: 500 }}>{log.email}</td>
                <td>
                  <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: EVENT_COLORS[log.event] || 'var(--text-muted)',
                  }}>
                    {EVENT_LABELS[log.event] || log.event}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.detail || '—'}
                </td>
                <td style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--text-dim)' }}>
                  {log.ip || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
          <button className="ut-abtn ut-abtn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ fontSize: 12 }}>← Prev</button>
          <span>Page {page + 1} of {totalPages} ({total} total)</span>
          <button className="ut-abtn ut-abtn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ fontSize: 12 }}>Next →</button>
        </div>
      )}
    </div>
  );
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h ago`;
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
