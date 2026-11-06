import React from 'react';
import Modal, { Footer, CancelBtn } from './Modal';

/*
 * Reusable confirm dialog. Used everywhere we were calling window.confirm.
 *
 * Props:
 *   title, message            - strings
 *   confirmLabel              - button text (default 'Confirm')
 *   cancelLabel               - button text (default 'Cancel')
 *   danger                    - if true, confirm button is red
 *   onConfirm, onCancel       - callbacks
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} onClose={onCancel} width={440}>
      <div style={{
        color: 'var(--text)',
        fontSize: 14,
        lineHeight: 1.6,
        padding: '4px 0 6px',
      }}>{message}</div>
      <Footer>
        <CancelBtn onClick={onCancel}>{cancelLabel}</CancelBtn>
        <button
          type="button"
          onClick={onConfirm}
          className={danger ? 'dp-btn-danger' : 'dp-btn-primary'}
          autoFocus
        >
          {confirmLabel}
        </button>
      </Footer>
    </Modal>
  );
}
