import React, { useState, useEffect } from 'react';
import './LoginScreen.css';

/*
 * Phase 2 — wired to backend.
 *
 * Props:
 *   onLoginSuccess  (role) => void    // role: 'user' | 'admin' | 'superAdmin'
 *   onNeedsOtp      (email) => void   // first-time login path
 */
export default function LoginScreen({ onLoginSuccess, onNeedsOtp }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Prefill remembered email on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await window.datProAPI.getSavedEmail();
        if (!cancelled && saved) {
          setEmail(saved);
          setRememberEmail(true);
        }
      } catch (e) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const doLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await window.datProAPI.login({ email: email.trim(), password });
      if (!r || !r.success) {
        setError((r && r.message) || 'Login failed.');
        return;
      }

      // Persist (or clear) remembered email per the checkbox.
      if (rememberEmail) {
        await window.datProAPI.saveEmail(email.trim()).catch(() => {});
      } else {
        await window.datProAPI.clearSavedEmail().catch(() => {});
      }

      if (r.needsOtp) {
        onNeedsOtp(r.email || email.trim());
      } else {
        onLoginSuccess(r.role);
      }
    } catch (err) {
      setError('Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); doLogin(); };

  return (
    <div className="login-container">
      <div className="login-glow" />
      <div className="login-card">
        <div className="login-header">
          <div className="dat-logo-wrapper">
            <div className="dat-blocks">
              <span className="dat-block">D</span>
              <span className="dat-block">A</span>
              <span className="dat-block">T</span>
            </div>
            <span className="dat-pro-badge">PRO</span>
          </div>
          <p className="login-subtitle">
            Secure Trucking Load Board Access
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus={!email}
                disabled={loading}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus={!!email}
                disabled={loading}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="login-options">
            <label className="remember-label">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                disabled={loading}
              />
              <span>Remember Email</span>
            </label>
          </div>

          {error && (
            <div className="login-error">
              <div>{error}</div>
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In to DAT Pro'}
          </button>
        </form>

        <div className="login-footer-info">
          <div className="status-badge">
            <span className="status-dot" />
            <span>Encrypted Tunnel &amp; In-Memory Session</span>
          </div>
          <span>DAT Pro Desktop v0.1.0</span>
        </div>
      </div>
    </div>
  );
}
