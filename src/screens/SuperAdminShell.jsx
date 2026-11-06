import React, { useState } from 'react';
import { ThemeToggle } from '../theme/ThemeProvider';
import UserTable from './Admin/UserTable';
import CreateUserModal from './Admin/CreateUserModal';
import ActivityLogPanel from './Admin/ActivityLogPanel';
import ConfirmDialog from '../components/ConfirmDialog';

/*
 * Phase 6 — Super Admin shell.
 * Iteration 1:
 *   - Tabs: Users | Admins
 *   - Create user button (opens modal)
 *   - Per-row actions: Revoke/Restore, +30 days, Set Limits, Delete
 *
 * Iteration 2 will add:
 *   - Master Session broadcast UI
 *   - Live activity view (polling) + email/username search
 *   - Session-theft alerts panel
 */
export default function SuperAdminShell({ onLogout }) {
  const [tab, setTab] = useState('users');           // 'users' | 'admins' | 'activity'
  const [showCreate, setShowCreate] = useState(false);
  const [confirm, setConfirm]       = useState(null);
  const [toast, setToast] = useState(null);
  const [tableNonce, setTableNonce] = useState(0);   // force re-mount after create

  const showToast = (msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 24, gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <strong style={{ color: 'var(--text)', fontSize: 15 }}>DAT Pro</strong>
          <span style={{
            padding: '3px 10px', fontSize: 11, borderRadius: 999,
            background: 'rgba(16,185,129,0.1)', color: 'var(--success)',
            border: '1px solid rgba(16,185,129,0.3)',
          }}>Super Admin</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ThemeToggle />
          <button
            onClick={onLogout}
            style={{
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          display: 'inline-flex', borderRadius: 'var(--radius-sm)',
          overflow: 'hidden', border: '1px solid var(--border)',
        }}>
          <TabBtn active={tab === 'users'}    onClick={() => setTab('users')}>Users</TabBtn>
          <TabBtn active={tab === 'admins'}   onClick={() => setTab('admins')}>Admins</TabBtn>
          <TabBtn active={tab === 'activity'} onClick={() => setTab('activity')}>Activity</TabBtn>
        </div>

        {tab !== 'activity' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                background: 'var(--primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-sm)',
                padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >+ Create user</button>
          </div>
        )}
      </div>

      {tab === 'activity'
        ? <ActivityLogPanel />
        : <UserTable key={`${tab}-${tableNonce}`} type={tab} isSuperAdmin={true} />
      }

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(msg) => {
            setShowCreate(false);
            showToast(msg, 'success');
            setTableNonce((n) => n + 1);
          }}
          onError={(msg) => showToast(msg, 'error')}
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

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 700,
          background: toast.kind === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
          color: toast.kind === 'error' ? 'var(--danger)' : 'var(--success)',
          border: `1px solid ${toast.kind === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)'}`,
          padding: '10px 16px', borderRadius: 'var(--radius-sm)',
          fontSize: 13, boxShadow: 'var(--shadow)',
        }}>{toast.msg}</div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? '#fff' : 'var(--text-muted)',
        border: 'none',
        padding: '7px 16px',
        fontSize: 13,
        cursor: 'pointer',
        fontWeight: active ? 600 : 500,
        transition: 'all .15s',
      }}
    >{children}</button>
  );
}
