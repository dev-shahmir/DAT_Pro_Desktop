import React, { createContext, useContext, useEffect, useState } from 'react';

/*
 * Theme = 'light' | 'dark'. Default 'light'.
 * Stored in localStorage (UI-only preference, not sensitive). Applied to
 * <html data-theme="..."> so variables.css can swap tokens in one place.
 */
const STORAGE_KEY = 'dat-theme';
const ThemeContext = createContext({ theme: 'light', toggle: () => {}, set: () => {} });

function readInitial() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch (_) {}
  return 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readInitial);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  const set = (t) => setTheme(t === 'dark' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, toggle, set }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/*
 * Small button that flips the theme. Looks like the existing pill buttons
 * (same border/radius/size as Logout) so it sits next to it naturally.
 */
export function ThemeToggle({ style = {} }) {
  const { theme, toggle } = useTheme();
  const nextLabel = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      onClick={toggle}
      title={`Switch to ${nextLabel} mode`}
      aria-label={`Switch to ${nextLabel} mode`}
      style={{
        background: 'transparent',
        color: 'var(--text-muted)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 10px',
        fontSize: 14,
        cursor: 'pointer',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.15s, border-color 0.15s',
        ...style,
      }}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
