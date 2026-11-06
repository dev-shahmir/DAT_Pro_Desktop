import React from 'react';
import { ThemeToggle } from '../theme/ThemeProvider';
import UserTable from './Admin/UserTable';

/*
 * Phase 6 — Admin shell.
 * Shows only the users this admin has created (backend filters by created_by).
 * Admins can revoke / restore / extend. Admins CANNOT set limits, delete, or
 * create new users in this iteration — those are Super-Admin-only (iteration 1).
 */
export default function AdminShell({ onLogout }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 24, gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <strong style={{ color: 'var(--text)', fontSize: 15 }}>DAT Pro</strong>
          <span style={{
            padding: '3px 10px', fontSize: 11, borderRadius: 999,
            background: 'rgba(59,130,246,0.1)', color: 'var(--primary-h)',
            border: '1px solid rgba(59,130,246,0.3)',
          }}>Admin</span>
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

      <UserTable type="users" isSuperAdmin={false} />
    </div>
  );
}
