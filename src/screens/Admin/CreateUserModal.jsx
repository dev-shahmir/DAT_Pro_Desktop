import React, { useState } from 'react';
import Modal, { Field, Grid, Footer, CancelBtn, PrimaryBtn } from '../../components/Modal';

/*
 * Super-Admin only. Styled to match EditUserModal (blue labels, 2-col grid).
 */
export default function CreateUserModal({ onClose, onCreated, onError }) {
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [username, setUsername]       = useState('');
  const [role, setRole]               = useState('user');
  const [platform, setPlatform]       = useState('both');
  const [proxyHost, setProxyHost]     = useState('');
  const [proxyPort, setProxyPort]     = useState('');
  const [proxyUser, setProxyUser]     = useState('');
  const [proxyPass, setProxyPass]     = useState('');
  const [proxyCountry, setProxyCountry] = useState('USA');
  const [tabLimit, setTabLimit]       = useState('1');
  const [loadTabLimit, setLoadTabLimit] = useState('0');
  const [cookieSession, setCookieSession] = useState('');
  const [busy, setBusy] = useState(false);

  const isAdmin = role === 'admin';

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) { onError('Email and password required.'); return; }
    if (password.length < 6)  { onError('Password must be at least 6 characters.'); return; }

    const payload = {
      email: email.trim().toLowerCase(),
      password,
      username: username.trim() || undefined,
      is_admin: isAdmin,
      platform,
    };
    if (!isAdmin) {
      payload.tab_limit = parseInt(tabLimit, 10) || 1;
      if (proxyHost) {
        payload.proxy_host    = proxyHost;
        payload.proxy_port    = parseInt(proxyPort, 10);
        payload.proxy_user    = proxyUser;
        payload.proxy_pass    = proxyPass;
        payload.proxy_country = proxyCountry;
      }
      if (cookieSession.trim()) payload.cookie_session = cookieSession.trim();
    }

    setBusy(true);
    console.log('[CreateUser] submitting', { ...payload, password: '***' });
    let r;
    try {
      r = await window.datProAPI.admin.createUser(payload);
      console.log('[CreateUser] response:', r);
    } catch (err) {
      console.error('[CreateUser] threw:', err);
      setBusy(false);
      onError('Call failed: ' + (err && err.message) + ' — restart Electron (Ctrl+C then npm run dev)');
      return;
    }
    if (r && r.success) {
      // Apply load_tab_limit via follow-up call (since /create-user/ doesn't persist it yet)
      if (!isAdmin) {
        const ll = parseInt(loadTabLimit, 10);
        if (Number.isFinite(ll) && ll !== 0) {
          try { await window.datProAPI.admin.setUserLimits(email.trim().toLowerCase(), undefined, ll); }
          catch (e) { console.error('[CreateUser] setUserLimits threw:', e); }
        }
      }
      setBusy(false);
      onCreated(`User ${email} created.`);
    } else {
      setBusy(false);
      onError((r && r.message) || 'Create failed.');
    }
  };

  return (
    <Modal title="Create User" onClose={onClose} width={600}>
      <form onSubmit={submit}>
        <Grid>
          <Field label="Email *">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Field label="Username">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>

          <Field label="Password *">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">Regular User</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>

          <Field label="Allowed Platform" full>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="both">App + Extension (both)</option>
              <option value="app">App only</option>
              <option value="extension">Extension only</option>
            </select>
          </Field>

          {!isAdmin && (
            <>
              <Field label="Proxy Host">
                <input type="text" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} placeholder="optional" />
              </Field>
              <Field label="Proxy Port">
                <input type="number" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} />
              </Field>
              <Field label="Proxy Username">
                <input type="text" value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} />
              </Field>
              <Field label="Proxy Password">
                <input type="text" value={proxyPass} onChange={(e) => setProxyPass(e.target.value)} />
              </Field>
              <Field label="Country Code">
                <input type="text" value={proxyCountry} onChange={(e) => setProxyCountry(e.target.value)} />
              </Field>
              <Field label="Browser Tabs Limit">
                <input type="number" min="1" value={tabLimit} onChange={(e) => setTabLimit(e.target.value)} />
              </Field>
              <Field label="DAT Search Tab Limit (0 = ∞)" full>
                <input type="number" min="0" value={loadTabLimit} onChange={(e) => setLoadTabLimit(e.target.value)} />
              </Field>
              <Field label="Initial DAT Cookie Session (optional)" full>
                <textarea value={cookieSession} onChange={(e) => setCookieSession(e.target.value)} rows={6}
                  placeholder="Paste cookie-editor JSON, bundle list, or encrypted blob (leave empty to assign later)" />
              </Field>
            </>
          )}
        </Grid>

        <Footer>
          <CancelBtn onClick={onClose} />
          <PrimaryBtn disabled={busy}>
            {busy ? 'Creating…' : 'Create User'}
          </PrimaryBtn>
        </Footer>
      </form>
    </Modal>
  );
}
