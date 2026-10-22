// Light / dark look for the whole page. The look is the data-theme
// attribute on <html> ("light" or "dark"), which style.css switches its
// color tokens on. A small script in index.html's <head> sets it before
// the page draws (so there's no flash of the wrong look): the visitor's
// own choice if they made one (localStorage), otherwise their device's
// light/dark setting. The light-bulb button at the bottom right of the 3D
// view switches it and remembers the choice in this browser.

export const PAGE_THEME_KEY = 'keycapforge.pageTheme';

export function currentPageTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function initPageTheme(onChange = () => {}) {
  const btn = document.getElementById('pageThemeBtn');
  const apply = (theme, remember) => {
    document.documentElement.dataset.theme = theme;
    if (btn) {
      const light = theme === 'light';
      btn.setAttribute('aria-pressed', String(light));
      btn.title = light ? 'Switch to the dark look' : 'Switch to the light look';
      btn.setAttribute('aria-label', btn.title);
    }
    if (remember) { try { localStorage.setItem(PAGE_THEME_KEY, theme); } catch (e) { /* not remembered */ } }
    onChange(theme);
  };
  let saved = null;
  try { saved = localStorage.getItem(PAGE_THEME_KEY); } catch (e) { saved = null; }
  apply(currentPageTheme(), false);
  if (btn) btn.addEventListener('click', () => apply(currentPageTheme() === 'light' ? 'dark' : 'light', true));
  // Follow the device's setting while the visitor hasn't picked one.
  if (!saved && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const follow = () => {
      let picked = null;
      try { picked = localStorage.getItem(PAGE_THEME_KEY); } catch (e) { picked = null; }
      if (!picked) apply(mq.matches ? 'light' : 'dark', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', follow);
  }
}
