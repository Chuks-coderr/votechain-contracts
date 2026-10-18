/**
 * theme-init.js
 *
 * Runs synchronously before first paint to apply the correct theme class,
 * preventing a flash of unstyled / wrong-themed content.
 *
 * Priority order:
 *   1. Saved preference in localStorage ('dark' | 'light')
 *   2. OS / browser prefers-color-scheme media query
 *   3. Fall back to light mode
 *
 * On every toggle the click handler in proposals.js calls
 *   localStorage.setItem('theme', 'dark' | 'light')
 * so this script will pick it up on the next page load.
 */
(function () {
  try {
    var saved = localStorage.getItem('theme');
    var prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    var useDark = saved === 'dark' || (saved === null && prefersDark);

    if (useDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (_) {
    // localStorage may be blocked in privacy-strict browsers; silently ignore.
  }
})();
