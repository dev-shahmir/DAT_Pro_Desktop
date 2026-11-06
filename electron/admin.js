/*
 * Phase 6 — Admin / Super Admin backend client.
 *
 * All calls run in the main process so secret_key / session_id never cross IPC
 * to the renderer. The renderer invokes thin methods via preload which land
 * in `admin:*` IPC handlers in main.js and ultimately in the functions here.
 *
 * Every call auto-injects the current session's secret_key + session_id so
 * the renderer only passes the user-facing arguments (email, limits, etc).
 */
const auth = require('./auth');

const BASE = 'https://dat-pro-backend.onrender.com/';

async function post(pathSegment, body) {
  const s = auth.getCurrentSession();
  if (!s || !s.secret_key) {
    return { success: false, message: 'Not logged in.' };
  }
  try {
    const res = await fetch(BASE + pathSegment, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret_key: s.secret_key,
        session_id: s.session_id,
        ...body,
      }),
    });
    if (!res.ok) return { success: false, message: `Server error (${res.status}).` };
    return await res.json();
  } catch (e) {
    return { success: false, message: 'Network error.' };
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────
// type: 'users' | 'admins' | undefined (everything)
async function getUsers(type) { return post('get-users-under-me/', { type }); }
async function getUserSession(email) { return post('get-user-session/', { email }); }
async function updateUserDetails(payload) { return post('update-user-details/', payload); }

// ── User lifecycle ──────────────────────────────────────────────────────────
async function createUser(payload) { return post('create-user/', payload); }
async function revokeUser(email)   { return post('reset-access/',  { email }); } // sets status='revoked'
async function restoreUser(email)  { return post('restore-access/', { email }); }
async function extendSubscription(email) { return post('extend-subscription/', { email }); }
async function deleteUser(email)   { return post('delete-user-under-me/', { email }); }

// ── Super Admin only ────────────────────────────────────────────────────────
async function setUserLimits(email, tab_limit, load_tab_limit) {
  const body = { email };
  if (tab_limit      !== undefined) body.tab_limit      = tab_limit;
  if (load_tab_limit !== undefined) body.load_tab_limit = load_tab_limit;
  return post('set-user-limits/', body);
}
async function grantAdmin(email)        { return post('grant-admin/', { email }); }
async function revokeAdmin(email)       { return post('revoke-admin-access/', { email }); }
async function resetAdminAccess(email)  { return post('reset-admin-access/', { email }); }
async function assignProxy(payload)     { return post('assign-proxy/', payload); }
async function syncMasterSession(cookie_session) {
  return post('sync-master-session/', { cookie_session });
}
async function updateUserSession(email, cookie_session) {
  return post('update-user-session/', { email, cookie_session });
}

// Phase 7 — Activity Log
async function getActivityLog(params)   { return post('activity-log/', params || {}); }
async function exportActivityLog(params) { return post('activity-log-export/', params || {}); }
async function getActivityStats(params)  { return post('activity-log-stats/', params || {}); }

module.exports = {
  getUsers, getUserSession, updateUserDetails,
  createUser, revokeUser, restoreUser, extendSubscription, deleteUser,
  setUserLimits, grantAdmin, revokeAdmin, resetAdminAccess,
  assignProxy, syncMasterSession, updateUserSession,
  getActivityLog, exportActivityLog, getActivityStats,
};
