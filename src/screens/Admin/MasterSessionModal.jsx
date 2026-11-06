import React, { useState } from 'react';
import Modal, { Field, Footer, CancelBtn, PrimaryBtn } from '../../components/Modal';

export default function MasterSessionModal({ onClose, onSaved, onError, askConfirm }) {
  const [blob, setBlob] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSave = () => {
    const trimmed = blob.trim();
    if (!trimmed) { onError('Paste the master cookie session JSON.'); return; }
    askConfirm({
      title: 'Broadcast master session',
      message: 'This will push the cookie session to ALL users. Continue?',
      confirmLabel: 'Broadcast',
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          const r = await window.datProAPI.admin.syncMasterSession(trimmed);
          if (r && r.success) onSaved(r.message || 'Master session broadcast complete.');
          else onError((r && r.message) || 'Broadcast failed.');
        } catch (_) { onError('Network error.'); }
        finally { setBusy(false); }
      },
    });
  };

  return (
    <Modal title="Broadcast Master Session" onClose={onClose}>
      <Field label="Master Cookie Session JSON">
        <textarea
          rows={10}
          value={blob}
          onChange={(e) => setBlob(e.target.value)}
          placeholder='Paste encrypted cookie session array or raw JSON…'
          style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, display: 'block' }}>
          This will be pushed to every user's cookie_session field.
        </span>
      </Field>
      <Footer>
        <CancelBtn onClick={onClose} />
        <PrimaryBtn onClick={handleSave} disabled={busy}>
          {busy ? 'Broadcasting…' : 'Broadcast to All'}
        </PrimaryBtn>
      </Footer>
    </Modal>
  );
}
