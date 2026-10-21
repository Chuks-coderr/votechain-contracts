// Applies the persisted/system theme before first paint.
// Kept as an external file so the CSP can forbid 'unsafe-inline' (#94).
(function () {
  var persistedTheme = null;
  try { persistedTheme = localStorage.getItem('theme'); } catch (e) {}
  var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (persistedTheme === 'dark' || (!persistedTheme && systemPrefersDark)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
})();
