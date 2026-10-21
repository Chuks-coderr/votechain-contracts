/**
 * useTheme
 *
 * React hook that:
 *  - Reads the current theme from localStorage (with system-preference fallback).
 *  - Persists the preference to localStorage on every toggle.
 *  - Keeps the <html class="dark"> class in sync so Tailwind / CSS-var styles
 *    react immediately without a page reload.
 *
 * Usage:
 *   const { theme, toggleTheme } = useTheme();
 */

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === 'dark' || saved === 'light') return saved;
    // Fall back to OS preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch (_) {
    // localStorage blocked — silently fall back
  }
  return 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Keep <html> class in sync whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {
      // localStorage blocked — silently ignore
    }
  }, [theme]);

  // Also react to OS preference changes at runtime (no localStorage override)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function handleChange(event: MediaQueryListEvent) {
      // Only follow OS changes when the user has not explicitly saved a preference
      try {
        if (!localStorage.getItem(STORAGE_KEY)) {
          setTheme(event.matches ? 'dark' : 'light');
        }
      } catch (_) {
        setTheme(event.matches ? 'dark' : 'light');
      }
    }
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
