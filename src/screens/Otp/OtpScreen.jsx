import React, { useState, useEffect } from 'react';
import { ThemeToggle } from '../../theme/ThemeProvider';
import './OtpScreen.css';

export default function OtpScreen({ email, onVerified, onCancel }) {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [resending, setResending] = useState(false);

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

      <div className="otp-topbar">
        <div className="otp-topbar-left">
          <div className="otp-dat-blocks">
            <span className="otp-dat-block">D</span>
            <span className="otp-dat-block">A</span>
            <span className="otp-dat-block">T</span>
          </div>
          <span className="otp-dat-pro-badge">PRO</span>
        </div>
        <span className="otp-topbar-title">SIGN IN</span>
        <div className="otp-topbar-right">
          <ThemeToggle />
        </div>
      </div>

      <div className="otp-card">
        <div className="otp-header">
          <div className="otp-icon">🛡️</div>
          <p className="otp-welcome">First-Time Verification</p>
          <h2 className="otp-brand">Enter OTP</h2>
          {info && <p className="otp-sub">{info}</p>}
        </div>

        <form className="otp-form" onSubmit={handleSubmit}>
          <div className="otp-input-group">
            <label htmlFor="otp-code">ONE-TIME PASSWORD</label>
            <div className="otp-input-wrapper">
              <input
                id="otp-code"
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
            </div>
          </div>

          {error && <div className="otp-error">{error}</div>}

          <button type="submit" className="otp-btn" disabled={loading || otp.length !== 6}>
            {loading ? 'Verifying…' : 'Verify & Continue'}
          </button>

          <div className="otp-actions">
            <button type="button" className="otp-outline-btn" onClick={onCancel} disabled={loading}>
              ← Back
            </button>
            <button type="button" className="otp-outline-btn" onClick={handleResend} disabled={loading || resending}>
              {resending ? 'Sending…' : 'Resend Code'}
            </button>
          </div>
        </form>

        <div className="otp-footer">
          <span>Contact Administrator: <strong>simon.adam.dean@gmail.com</strong></span>
          <span>Developed by <strong>Shahmir Ahmad</strong></span>
        </div>
      </div>
    </div>
  );
}
