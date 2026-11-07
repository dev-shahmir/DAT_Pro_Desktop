import React, { useState } from 'react';
import Modal, { Field, Grid, Footer, CancelBtn, PrimaryBtn } from '../../components/Modal';

/*
 * Super-Admin only. Mirrors the reference extension's Edit modal
 * (2-column proxy grid + country/tab-limit/role) and adds our new
 * "DAT SEARCH TAB LIMIT" field.
 *
 * Single backend call: /update-user-details/ now accepts load_tab_limit too.
 */
export default function EditUserModal({ user, onClose, onSaved, onError, askConfirm }) {
  const [proxyHost, setProxyHost]       = useState(user.proxy_host || '');
  const [proxyPort, setProxyPort]       = useState(String(user.proxy_port || ''));
  const [proxyUser, setProxyUser]       = useState(user.proxy_user || '');
  const [proxyPass, setProxyPass]       = useState(user.proxy_pass || '');
  const [proxyCountry, setProxyCountry] = useState(user.proxy_country || 'USA');
  const [tabLimit, setTabLimit]         = useState(String(user.tab_limit || 1));
  const [loadTabLimit, setLoadTabLimit] = useState(String(user.load_tab_limit ?? 0));
  const [role, setRole]                 = useState(user.is_admin ? 'admin' : 'user');
  const [platform, setPlatform]         = useState(user.platform || 'both');
  const [busy, setBusy] = useState(false);

  const doSave = async () => {
    const tl = parseInt(tabLimit, 10);
    const ll = parseInt(loadTabLimit, 10);
    setBusy(true);
    const payload = {
      email: user.email,
      proxy_host: proxyHost,
      proxy_port: proxyPort ? parseInt(proxyPort, 10) : undefined,
      proxy_user: proxyUser,
      proxy_pass: proxyPass,
      proxy_country: proxyCountry,
      tab_limit: tl,
      load_tab_limit: ll,
      is_admin: role === 'admin',
      platform,
    };
    console.log('[EditUser] submitting', payload);
    let r;
    try {
      r = await window.datProAPI.admin.updateUserDetails(payload);
      console.log('[EditUser] response:', r);
    } catch (err) {
      console.error('[EditUser] threw:', err);
      setBusy(false);
      onError('Call failed: ' + (err && err.message) + ' — restart Electron (Ctrl+C then npm run dev)');
      return;
    }
    setBusy(false);
    if (r && r.success) onSaved(`${user.email} updated.`);
    else onError((r && r.message) || 'Update failed.');
  };

  const submit = (e) => {
    e.preventDefault();
    const tl = parseInt(tabLimit, 10);
    const ll = parseInt(loadTabLimit, 10);
    if (!Number.isFinite(tl) || tl < 0 || !Number.isFinite(ll) || ll < 0) {
      onError('Limits must be non-negative integers.'); return;
    }
    const roleChanging = ((user.is_admin && role !== 'admin') ||
                          (!user.is_admin && role === 'admin'));
    const msg = roleChanging
      ? `Save changes to ${user.email}? Role will change to ${role === 'admin' ? 'Administrator' : 'Regular User'}.`
      : `Save changes to ${user.email}?`;
    if (askConfirm) {
      askConfirm({
        title: 'Save changes',
        message: msg,
        confirmLabel: 'Save',
        onConfirm: doSave,
      });
    } else {
      doSave();
    }
  };

  return (
    <Modal title={`Edit ${user.email}`} onClose={onClose} width={600}>
      <form onSubmit={submit}>
        <Grid>
          <Field label="Proxy Host">
            <input type="text" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} placeholder="127.0.0.1" autoFocus />
          </Field>
          <Field label="Proxy Port">
            <input type="number" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} placeholder="8080" />
          </Field>

          <Field label="Proxy Username">
            <input type="text" value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} />
          </Field>
          <Field label="Proxy Password">
            <input type="text" value={proxyPass} onChange={(e) => setProxyPass(e.target.value)} />
          </Field>

          <Field label="Country Code">
            <input type="text" value={proxyCountry} onChange={(e) => setProxyCountry(e.target.value)} placeholder="USA" />
          </Field>
          <Field label="Browser Tabs Limit">
            <input type="number" min="0" value={tabLimit} onChange={(e) => setTabLimit(e.target.value)} />
          </Field>

          <Field label="DAT Search Tab Limit (0 = ∞)" full>
            <input type="number" min="0" value={loadTabLimit} onChange={(e) => setLoadTabLimit(e.target.value)} />
          </Field>

          <Field label="Role" full>
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
        </Grid>

        <Footer>
          <CancelBtn onClick={onClose} />
          <PrimaryBtn disabled={busy}>
            {busy ? 'Saving…' : 'Save Changes'}
          </PrimaryBtn>
        </Footer>
      </form>
    </Modal>
  );
}
