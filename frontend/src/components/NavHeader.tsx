import React, { useState, useCallback } from 'react';
import { getLocale, setLocale, onLocaleChange, getTranslations } from '../i18n';
import type { Locale } from '../i18n';

/**
 * NavHeader
 *
 * Application navigation bar. Includes the VoteChain brand and an EN / ES
 * language switcher. The selected language is persisted in localStorage via
 * the i18n module and immediately reflected across the UI.
 */
export function NavHeader(): React.ReactElement {
  const [locale, setLocaleState] = useState<Locale>(getLocale);
  const t = getTranslations();

  // Subscribe to external locale changes (e.g. another component switching)
  React.useEffect(() => {
    const unsub = onLocaleChange((next) => {
      setLocaleState(next);
    });
    return unsub;
  }, []);

  const handleLocaleSwitch = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setLocale(next);
      setLocaleState(next);
    },
    [locale],
  );

  return (
    <header className="nav-header" role="banner">
      <div className="nav-header__brand">
        <span className="nav-header__title" aria-label={t.nav.title}>
          {t.nav.title}
        </span>
        <span className="nav-header__subtitle">{t.nav.subtitle}</span>
      </div>

      <nav
        className="nav-header__lang-switcher"
        aria-label={t.nav.switchLanguage}
      >
        <button
          type="button"
          className={`lang-btn${locale === 'en' ? ' lang-btn--active' : ''}`}
          aria-pressed={locale === 'en'}
          aria-label="English"
          onClick={() => handleLocaleSwitch('en')}
        >
          {t.nav.langEN}
        </button>
        <button
          type="button"
          className={`lang-btn${locale === 'es' ? ' lang-btn--active' : ''}`}
          aria-pressed={locale === 'es'}
          aria-label="Español"
          onClick={() => handleLocaleSwitch('es')}
        >
          {t.nav.langES}
        </button>
      </nav>
    </header>
  );
}

export default NavHeader;
