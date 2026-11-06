import React, { useEffect, useState } from 'react';
import Modal, { Field, Footer, CancelBtn, PrimaryBtn } from '../../components/Modal';

/*
 * Super-Admin only. Matches the reference extension's Session modal:
 *   - Title: "Session: <email>"
 *   - COOKIE SESSION JSON label
 *   - Current session is pre-filled; SA edits / replaces and clicks Update.
 *
 * Accepts: raw Cookie-Editor JSON, bundle list [{url, cookies:[]}], or an
 * already-encrypted blob array. Backend normalises + encrypts.
 */
export default function SessionModal({ user, onClose, onSaved, onError, askConfirm }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Prefill with current session (SA only — endpoint requireAdmin)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await window.datProAPI.admin.getUserSession(user.email);
        if (cancelled) return;
        if (r && r.success && r.cookie_session) setText(r.cookie_session);
      } catch (_) {}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user.email]);

  const doUpdate = async (payload) => {
    setBusy(true);
    const r = await window.datProAPI.admin.updateUserSession(user.email, payload);
    setBusy(false);
    if (r && r.success) onSaved(`Session updated for ${user.email}.`);
    else onError((r && r.message) || 'Update failed.');
  };

  const submit = (e) => {
    e.preventDefault();
    const payload = text.trim();
    if (!payload) { onError('Session data is empty.'); return; }
    if (askConfirm) {
      askConfirm({
        title: 'Update DAT session',
        message: `Replace the DAT session for ${user.email}? The user's embedded DAT will pick up the new cookies on next heartbeat.`,
        confirmLabel: 'Update',
        onConfirm: () => doUpdate(payload),
      });
    } else {
      doUpdate(payload);
    }
  };

  return (
    <Modal title={`Session: ${user.email}`} onClose={onClose} width={620}>
      <form onSubmit={submit}>
        <Field label="Cookie Session JSON">
          <div className="dp-hint" style={{ marginBottom: 6 }}>
            Current session data is pre-filled below. Paste the new session JSON array to update.
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={loading ? 'Loading current session…' : 'Paste cookie session JSON or encrypted blob…'}
            rows={12}
            autoFocus
          />
        </Field>
        <Footer>
          <CancelBtn onClick={onClose} />
          <PrimaryBtn disabled={busy || loading}>
            {busy ? 'Saving…' : 'Update Session'}
          </PrimaryBtn>
        </Footer>
      </form>
    </Modal>
  );
}
