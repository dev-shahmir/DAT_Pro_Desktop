import React, { useState, useEffect } from 'react';
import { ThemeToggle } from '../../theme/ThemeProvider';
import './LoginScreen.css';

export default function LoginScreen({ onLoginSuccess, onNeedsOtp, updateAvailable }) {
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'forgot-otp' | 'forgot-success'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');

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

  const doForgotPassword = async () => {
    setError(null);
    const em = forgotEmail.trim();
    if (!em) { setError('Please enter your email.'); return; }
    setLoading(true);
    try {
      const r = await window.datProAPI.forgotPassword(em);
      if (!r || !r.success) {
        setError((r && r.message) || 'Could not send OTP.');
        return;
      }
      setView('forgot-otp');
    } catch (err) {
      setError('Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const doVerifyForgotOtp = async () => {
    setError(null);
    const code = forgotOtp.trim();
    if (!/^\d{6}$/.test(code)) { setError('Please enter a valid 6-digit code.'); return; }
    setLoading(true);
    try {
      const r = await window.datProAPI.verifyForgotOtp({ email: forgotEmail.trim(), otp: code });
      if (!r || !r.success) {
        setError((r && r.message) || 'Verification failed.');
        return;
      }
      setView('forgot-success');
    } catch (err) {
      setError('Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    setView('login');
    setError(null);
    setForgotEmail('');
    setForgotOtp('');
  };

  const handleSubmit = (e) => { e.preventDefault(); doLogin(); };
  const handleForgotSubmit = (e) => { e.preventDefault(); doForgotPassword(); };
  const handleForgotOtpSubmit = (e) => { e.preventDefault(); doVerifyForgotOtp(); };

  return (
    <div className="login-container">
      <div className="login-glow" />

      {/* ── Header bar ── */}
      <div className="login-topbar">
        <div className="topbar-left">
          <div className="dat-blocks">
            <span className="dat-block">D</span>
            <span className="dat-block">A</span>
            <span className="dat-block">T</span>
          </div>
          <span className="dat-pro-badge">PRO</span>
        </div>
        <span className="topbar-title">SIGN IN</span>
        <div className="topbar-right">
          <ThemeToggle />
        </div>
      </div>

      {/* ── Login view ── */}
      {view === 'login' && (
        <div className="login-card">
          <div className="login-header">
            <p className="login-welcome">Welcome to</p>
            <h2 className="login-brand">DAT Pro</h2>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="email">EMAIL</label>
              <div className="input-wrapper">
                <input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus={!email}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="password">PASSWORD</label>
              <div className="input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
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
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && <div className="login-error"><div>{error}</div></div>}

            <button type="submit" className="login-btn" disabled={loading || updateAvailable}>
              {loading ? 'Authenticating...' : updateAvailable ? 'Update Required — Please Update First' : 'Sign In'}
            </button>

            <button type="button" className="forgot-btn" onClick={() => { setError(null); setForgotEmail(email); setView('forgot'); }} disabled={loading}>
              Forgot Password
            </button>
          </form>

          <div className="login-footer">
            <span>Contact Administrator: <strong>simon.adam.dean@gmail.com</strong></span>
            <span>Developed by <strong>Shahmir Ahmad</strong></span>
          </div>
        </div>
      )}

      {/* ── Forgot Password: enter email ── */}
      {view === 'forgot' && (
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">🔑</div>
            <p className="login-welcome">Password Recovery</p>
            <h2 className="login-brand">Forgot Password</h2>
            <p className="login-subtitle">Enter your email to receive a verification code</p>
          </div>

          <form className="login-form" onSubmit={handleForgotSubmit}>
            <div className="input-group">
              <label htmlFor="forgot-email">EMAIL</label>
              <div className="input-wrapper">
                <input
                  id="forgot-email"
                  type="email"
                  placeholder="you@company.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>
            </div>

            {error && <div className="login-error"><div>{error}</div></div>}

            <button type="submit" className="login-btn" disabled={loading || !forgotEmail.trim()}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
            <button type="button" className="forgot-btn" onClick={goBackToLogin} disabled={loading}>
              ← Back
            </button>
          </form>

          <div className="login-footer">
            <span>Contact Administrator: <strong>simon.adam.dean@gmail.com</strong></span>
            <span>Developed by <strong>Shahmir Ahmad</strong></span>
          </div>
        </div>
      )}

      {/* ── Forgot Password: enter OTP ── */}
      {view === 'forgot-otp' && (
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">🛡️</div>
            <p className="login-welcome">Verification Required</p>
            <h2 className="login-brand">Enter OTP</h2>
            <p className="login-subtitle">
              A 6-digit OTP has been sent to <strong>{forgotEmail}</strong>. Enter it below to recover your password.
            </p>
          </div>

          <form className="login-form" onSubmit={handleForgotOtpSubmit}>
            <div className="input-group">
              <label htmlFor="forgot-otp">ONE-TIME PASSWORD</label>
              <div className="input-wrapper">
                <input
                  id="forgot-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  className="otp-style-input"
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {error && <div className="login-error"><div>{error}</div></div>}

            <button type="submit" className="login-btn" disabled={loading || forgotOtp.length !== 6}>
              {loading ? 'Verifying...' : 'Verify & Send Password'}
            </button>
            <button type="button" className="forgot-btn" onClick={goBackToLogin} disabled={loading}>
              ← Back
            </button>
          </form>

          <div className="login-footer">
            <span>Contact Administrator: <strong>simon.adam.dean@gmail.com</strong></span>
            <span>Developed by <strong>Shahmir Ahmad</strong></span>
          </div>
        </div>
      )}

      {/* ── Forgot Password: success ── */}
      {view === 'forgot-success' && (
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon success-icon">✓</div>
            <h2 className="login-brand">Password Sent!</h2>
            <p className="login-subtitle">
              Your password has been sent to your registered email address. Please check your inbox.
            </p>
          </div>

          <button type="button" className="login-btn" onClick={goBackToLogin}>
            Back to Sign In
          </button>

          <div className="login-footer">
            <span>Contact Administrator: <strong>simon.adam.dean@gmail.com</strong></span>
            <span>Developed by <strong>Shahmir Ahmad</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
