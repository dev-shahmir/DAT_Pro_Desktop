import React, { useState, useEffect } from 'react';
import './OtpScreen.css';

/*
 * First-time login OTP screen. Triggered when /login/ returns
 * { success: true, needsOtp: true }.
 *
 * Props:
 *   email       - string, the email awaiting OTP (shown masked)
 *   onVerified  - (role) => void
 *   onCancel    - () => void  (back to login)
 */
export default function OtpScreen({ email, onVerified, onCancel }) {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [resending, setResending] = useState(false);

  // Mask email for display: s•••••@gmail.com
  const masked = email
    ? email.replace(/^([^@])[^@]*(@.*)$/, (_, a, b) => `${a}${'•'.repeat(5)}${b}`)
    : '';

  useEffect(() => {
    setInfo(`A 6-digit code has been sent to ${masked}`);
  }, [masked]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('Please enter a valid 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const r = await window.datProAPI.verifyOtp({ email, otp: code });
      if (!r || !r.success) {
        setError((r && r.message) || 'Verification failed.');
        return;
      }
      onVerified(r.role);
    } catch (err) {
      setError('Unexpected error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      const r = await window.datProAPI.resendOtp(email);
      if (r && r.success) setInfo('A new code has been sent.');
      else setError((r && r.message) || 'Could not resend code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="otp-container">
      <div className="otp-glow" />
      <div className="otp-card">
        <div className="otp-header">
          <div className="otp-icon">🔐</div>
          <h2>Enter Verification Code</h2>
          <p className="otp-sub">
            First-time login requires a one-time code.
          </p>
          {info && <p className="otp-info">{info}</p>}
        </div>

        <form className="otp-form" onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            placeholder="••••••"
            className="otp-input"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            autoFocus
            required
          />

          {error && <div className="otp-error">{error}</div>}

          <button type="submit" className="otp-btn" disabled={loading || otp.length !== 6}>
            {loading ? 'Verifying…' : 'Verify & Continue'}
          </button>
        </form>

        <div className="otp-footer-row">
          <button
            type="button"
            className="otp-link"
            onClick={onCancel}
            disabled={loading}
          >
            ← Back to login
          </button>
          <button
            type="button"
            className="otp-link"
            onClick={handleResend}
            disabled={loading || resending}
          >
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        </div>
      </div>
    </div>
  );
}
