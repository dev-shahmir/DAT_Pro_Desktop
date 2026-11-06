import React, { useEffect } from 'react';
import './Modal.css';

/*
 * Modal dialog matching the existing Super-Admin extension look:
 *   - Large bold white title
 *   - Rounded-pill close × on the right
 *   - Click backdrop or Esc to dismiss
 */
export default function Modal({ title, onClose, children, width = 520 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dp-modal-backdrop" onClick={onClose}>
      <div
        className="dp-modal"
        style={{ width, maxWidth: '92vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dp-modal-head">
          <h2 className="dp-modal-title">{title}</h2>
          <button
            className="dp-modal-close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >×</button>
        </div>
        <div className="dp-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── Reusable modal primitives (form field + footer buttons) ──────────────

export function Field({ label, children, full }) {
  return (
    <label className={'dp-field' + (full ? ' dp-field-full' : '')}>
      {label && <span className="dp-field-label">{label}</span>}
      {children}
    </label>
  );
}

export function Grid({ children }) {
  return <div className="dp-grid-2">{children}</div>;
}

export function Footer({ children }) {
  return <div className="dp-modal-footer">{children}</div>;
}

export function CancelBtn({ onClick, children = 'Cancel' }) {
  return <button type="button" className="dp-btn-cancel" onClick={onClick}>{children}</button>;
}

export function PrimaryBtn({ children, ...rest }) {
  return <button type="submit" className="dp-btn-primary" {...rest}>{children}</button>;
}
