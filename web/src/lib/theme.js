// Console theme: RECON (navy, cyan, amber; the default) or NV (night vision, green).
// Remembered per browser in localStorage; index.html applies it before the first paint.

export const THEME_KEY = 'tcb.theme.v1';

/** Anything but "nv" (missing, blocked, garbage) means the default RECON theme. */
export function parseTheme(value) {
  return value === 'nv' ? 'nv' : 'recon';
}

export function loadTheme(storage = globalThis.localStorage) {
  try {
    return parseTheme(storage?.getItem(THEME_KEY));
  } catch {
    return 'recon';
  }
}

export function saveTheme(theme, storage = globalThis.localStorage) {
  try {
    storage?.setItem(THEME_KEY, parseTheme(theme));
  } catch {
    /* storage blocked: the choice just isn't remembered */
  }
}

/** Sets or clears html[data-theme="nv"]; tokens.css swaps every colour on it. */
export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  if (parseTheme(theme) === 'nv') root.dataset.theme = 'nv';
  else delete root.dataset.theme;
}
