/**
 * Minimal i18n module for VoteChain frontend.
 *
 * Supports English (en) and Spanish (es) locales.
 * Language preference is persisted in localStorage under the key "votechain-lang".
 */

import en from './locales/en.json';
import es from './locales/es.json';

export type Locale = 'en' | 'es';

export type Translations = typeof en;

const STORAGE_KEY = 'votechain-lang';

const locales: Record<Locale, Translations> = { en, es };

const SUPPORTED_LOCALES: Locale[] = ['en', 'es'];

function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as string[]).includes(value);
}

/** Resolve the initial locale from localStorage or browser preference. */
function resolveInitialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isSupportedLocale(stored)) return stored;

  const browserLang = navigator.language.slice(0, 2).toLowerCase();
  if (isSupportedLocale(browserLang)) return browserLang;

  return 'en';
}

let currentLocale: Locale = resolveInitialLocale();

const listeners: Array<(locale: Locale) => void> = [];

/**
 * Get the currently active locale.
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Get the full translations object for the current locale.
 */
export function getTranslations(): Translations {
  return locales[currentLocale];
}

/**
 * Set the active locale, persist to localStorage, and notify subscribers.
 */
export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.setAttribute('lang', locale);
  listeners.forEach((cb) => cb(locale));
}

/**
 * Subscribe to locale changes. Returns an unsubscribe function.
 */
export function onLocaleChange(
  callback: (locale: Locale) => void,
): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

/**
 * Convenience hook-style translation helper.
 * Returns the translations for the current locale.
 *
 * Usage (in a React component that re-renders on locale change):
 *   const t = useTranslations();
 *   t.proposals.heading
 */
export function useTranslations(): Translations {
  return locales[currentLocale];
}
