import React, { useEffect, useRef, useState, useCallback } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import EditUserModal from './EditUserModal';
import SessionModal from './SessionModal';
import './UserTable.css';

// Subscription-extend cooldown: button only enables when within this many
// days of expiry (or already expired / revoked). Matches the extension's
// behaviour so admins don't stack 30-day extensions on healthy subs.
const EXTEND_COOLDOWN_DAYS = 7;

function daysUntilCanExtend(u) {
  if (u.status === 'revoked') return 0;        // revoke → extend reactivates
  if (!u.subscription_expiry) return 0;        // no sub → always extendable
  const ms = new Date(u.subscription_expiry).getTime() - Date.now();
  if (ms <= 0) return 0;                       // expired
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return Math.max(0, days - EXTEND_COOLDOWN_DAYS);
}

/*
 * Phase 6 iteration-2 — rebuilt to match the existing Super-Admin extension
 * design: avatar + name/email stack, uppercase countdown columns, status
 * text in color (not pill), per-row action bar [Extend | Session | Edit |
 * Revoke | Copy | 🗑].
 *
 * Props:
 *   type: 'users' | 'admins'
 *   isSuperAdmin: boolean
 */
export default function UserTable({ type, isSuperAdmin }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState('');
  const [editFor, setEditFor]       = useState(null);
  const [sessionFor, setSessionFor] = useState(null);
  const [confirm, setConfirm]       = useState(null);
  const [spinning, setSpinning]     = useState(false);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true); setSpinning(true);
    setErr(null);
    try {
      const r = await window.datProAPI.admin.getUsers(type);
      if (!r || !r.success) { setErr((r && r.message) || 'Failed to load.'); setRows([]); }
      else setRows(r.users || []);
    } catch (_) { setErr('Network error.'); }
    finally {
      setLoading(false);
      setTimeout(() => setSpinning(false), 600);
    }
  }, [type]);

  useEffect(() => { refresh(); }, [refresh]);

  const showToast = (msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const run = async (fn, okMsg) => {
    try {
      const r = await fn();
      if (r && r.success) { showToast(okMsg || r.message, 'success'); refresh(); }
      else showToast((r && r.message) || 'Action failed.', 'error');
    } catch (_) { showToast('Network error.', 'error'); }
  };

  const filtered = rows.filter((u) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (u.email || '').toLowerCase().includes(q)
        || (u.username || '').toLowerCase().includes(q);
  });

  return (
    <div className="ut-wrap">
      <div className="ut-toolbar">
        <input
          type="text"
          placeholder="Filter by name or email…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="ut-filter"
        />
        <button
          className="ut-refresh"
          onClick={() => refresh()}
          aria-label="Refresh"
          title="Refresh"
          disabled={loading}
        >
          <RefreshIcon spinning={spinning} />
        </button>
      </div>

      {err && <div className="ut-error">{err}</div>}

      <div className="ut-tablewrap">
        <table className="ut-table">
          <thead>
            <tr>
              <th>User Information</th>
              <th style={{ textAlign: 'center' }}>Target Site</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Subscription Left</th>
              <th style={{ textAlign: 'center' }}>Session Expiry</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={6} className="ut-empty-cell">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="ut-empty-cell">
                {rows.length === 0 ? 'No users yet.' : 'No matches.'}
              </td></tr>
            ) : filtered.map((u) => (
              <UserRow
                key={u.id || u.email}
                user={u}
                type={type}
                isSuperAdmin={isSuperAdmin}
                onAction={run}
                onEdit={() => setEditFor(u)}
                onSession={() => setSessionFor(u)}
                onCopy={() => copyCreds(u, showToast)}
                askConfirm={setConfirm}
              />
            ))}
          </tbody>
        </table>
      </div>

      {editFor && (
        <EditUserModal
          user={editFor}
          onClose={() => setEditFor(null)}
          onSaved={(msg) => { setEditFor(null); refresh(); showToast(msg, 'success'); }}
          onError={(m) => showToast(m, 'error')}
          askConfirm={setConfirm}
        />
      )}
      {sessionFor && (
        <SessionModal
          user={sessionFor}
          onClose={() => setSessionFor(null)}
          onSaved={(msg) => { setSessionFor(null); refresh(); showToast(msg, 'success'); }}
          onError={(m) => showToast(m, 'error')}
          askConfirm={setConfirm}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel || 'Confirm'}
          danger={!!confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const fn = confirm.onConfirm; setConfirm(null); if (fn) fn(); }}
        />
      )}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function RefreshIcon({ spinning }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? 'ut-spin' : ''}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────
function UserRow({ user: u, type, isSuperAdmin, onAction, onEdit, onSession, onCopy, askConfirm }) {
  const api = window.datProAPI.admin;
  const isRevoked = u.status === 'revoked';

  const nameLine = u.username || prettyName(u.email);

  // Extend cooldown — show "Can extend in N days" tooltip when disabled.
  const extendCooldown = daysUntilCanExtend(u);
  const extendDisabled = extendCooldown > 0;
  const extendTitle = extendDisabled
    ? `Can extend in ${extendCooldown} day${extendCooldown === 1 ? '' : 's'}`
    : (isRevoked ? 'Restore access + add 30 days' : 'Add 30 days to subscription');

  return (
    <tr>
      <td>
        <div className="ut-userinfo">
          <Avatar name={nameLine} />
          <div>
            <div className="ut-name">{nameLine}</div>
            <div className="ut-email">{u.email}</div>
          </div>
        </div>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span className="ut-target">{u.site_name || u.target_url || 'Not Set'}</span>
      </td>
      <td style={{ textAlign: 'center' }}>
        <StatusText status={u.status} />
      </td>
      <td style={{ textAlign: 'center' }}>
        <Countdown
          to={u.subscription_expiry}
          colorLive="var(--countdown-ok, #10b981)"
          colorDead="var(--danger, #ef4444)"
          deadLabel="Expired"
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <SessionExpiryCell user={u} />
      </td>
      <td style={{ textAlign: 'right' }}>
        <div className="ut-actions">
          {type === 'users' && (
            <button
              className={'ut-abtn ut-abtn-ghost' + (extendDisabled ? ' ut-abtn-disabled' : '')}
              disabled={extendDisabled}
              title={extendTitle}
              onClick={() => askConfirm({
                title: 'Extend subscription',
                message: `Add 30 days to ${u.email}'s subscription?`,
                confirmLabel: 'Extend',
                onConfirm: () => onAction(() => api.extendSubscription(u.email), `Extended ${u.email}.`),
              })}
            >Extend</button>
          )}
          {type === 'users' && isSuperAdmin && (
            <button className="ut-abtn ut-abtn-ghost" onClick={onSession}>Session</button>
          )}
          {isSuperAdmin && (
            <button className="ut-abtn ut-abtn-ghost" onClick={onEdit}>Edit</button>
          )}
          {isRevoked ? (
            <button className="ut-abtn ut-abtn-primary"
              onClick={() => askConfirm({
                title: 'Restore access',
                message: `Restore access for ${u.email}? They'll be able to log in again.`,
                confirmLabel: 'Restore',
                onConfirm: () => onAction(() => api.restoreUser(u.email), `Restored ${u.email}.`),
              })}
            >Restore</button>
          ) : (
            <button className="ut-abtn ut-abtn-danger"
              onClick={() => askConfirm({
                title: 'Revoke access',
                message: `Revoke access for ${u.email}? They won't be able to log in until you restore them.`,
                confirmLabel: 'Revoke', danger: true,
                onConfirm: () => onAction(() => api.revokeUser(u.email), `Revoked ${u.email}.`),
              })}
            >Revoke</button>
          )}
          <button className="ut-abtn ut-abtn-ghost" onClick={onCopy}>Copy</button>
          {isSuperAdmin && (
            <button className="ut-abtn ut-abtn-icon"
              aria-label="Delete user"
              title="Delete user"
              onClick={() => askConfirm({
                title: 'Delete user',
                message: `Permanently DELETE ${u.email}? This cannot be undone.`,
                confirmLabel: 'Delete', danger: true,
                onConfirm: () => onAction(() => api.deleteUser(u.email), `Deleted ${u.email}.`),
              })}
            >🗑</button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Status / target / avatar helpers ──────────────────────────────────────
function StatusText({ status }) {
  const map = {
    logged_in:  { color: 'var(--success)', label: 'LOGGED IN' },
    logged_out: { color: 'var(--danger)',  label: 'LOGGED OUT' },
    revoked:    { color: 'var(--danger)',  label: 'REVOKED' },
  };
  const s = map[status] || map.logged_out;
  return (
    <div className="ut-status" style={{ color: s.color }}>
      {s.label.split(' ').map((w, i) => <div key={i}>{w}</div>)}
    </div>
  );
}

function Avatar({ name }) {
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  // stable hue from name
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = ((h << 5) - h) + name.charCodeAt(i) | 0;
  const hue = Math.abs(h) % 360;
  return (
    <div className="ut-avatar"
      style={{ background: `linear-gradient(135deg, hsl(${hue},70%,55%), hsl(${(hue+40)%360},70%,45%))` }}>
      {letter}
    </div>
  );
}

function prettyName(email) {
  if (!email) return 'User';
  return email.split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 30);
}

// ─── Countdown ticking cell ────────────────────────────────────────────────
function Countdown({ to, colorLive, colorDead, deadLabel = 'Dead' }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!to) return <span className="ut-muted">—</span>;
  const target = typeof to === 'number' ? to * 1000 : new Date(to).getTime();
  if (!Number.isFinite(target)) return <span className="ut-muted">—</span>;
  const diff = target - now;
  if (diff <= 0) return <span className="ut-ct" style={{ color: colorDead }}>{deadLabel}</span>;
  return <span className="ut-ct" style={{ color: colorLive }}>{formatDuration(diff)}</span>;
}

function SessionExpiryCell({ user }) {
  // Backend returns `cookie_session_real_expiry` (seconds since epoch)
  // when it could successfully decrypt + find valid non-tracking cookies.
  if (user.cookie_session_real_expiry) {
    return (
      <Countdown
        to={user.cookie_session_real_expiry}
        colorLive="var(--danger-h, #ef4444)"
        colorDead="var(--danger, #ef4444)"
        deadLabel="Session Dead"
      />
    );
  }
  return <span className="ut-ct" style={{ color: 'var(--danger)' }}>Session Dead</span>;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m ${sec}s`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function isSubscriptionHealthy(u) {
  if (!u.subscription_expiry) return false;
  return new Date(u.subscription_expiry).getTime() > Date.now();
}

// ─── Clipboard helper ──────────────────────────────────────────────────────
function copyCreds(u, toast) {
  const payload = u.recovery_password
    ? `Email: ${u.email}\nPassword: ${u.recovery_password}`
    : `Email: ${u.email}`;
  try {
    navigator.clipboard.writeText(payload);
    toast(u.recovery_password ? 'Credentials copied.' : 'Email copied.', 'success');
  } catch (_) {
    toast('Copy failed.', 'error');
  }
}

// ─── Toast ──────────────────────────────────────────────────────────────────
function Toast({ msg, kind, onClose }) {
  const bg = kind === 'error'   ? 'rgba(239,68,68,0.14)'
           : kind === 'success' ? 'rgba(16,185,129,0.14)'
                                : 'rgba(59,130,246,0.14)';
  const color = kind === 'error' ? 'var(--danger)'
              : kind === 'success' ? 'var(--success)'
                                   : 'var(--primary)';
  return (
    <div className="ut-toast" style={{ background: bg, color, borderColor: color + '55' }}>
      <span>{msg}</span>
      <button onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  );
}
