// Scorched earth (FR-51): wipe everything this app remembers in the browser and start clean.
// Every key the app stores starts with "tcb." (shortlist, theme, panels, list view, the boot
// flag), so only those go: on localhost other apps can share the origin's storage.

export const KEY_PREFIX = 'tcb.';

function defaultStores() {
  const out = [];
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      if (globalThis[name]) out.push(globalThis[name]);
    } catch {
      /* blocked storage: nothing to wipe there */
    }
  }
  return out;
}

/** Removes every app key from the given stores; returns how many went. Never throws. */
export function purgeStorage(stores = defaultStores()) {
  let n = 0;
  for (const store of stores) {
    try {
      const keys = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.startsWith(KEY_PREFIX)) keys.push(key);
      }
      for (const key of keys) {
        store.removeItem(key);
        n++;
      }
    } catch {
      /* a store that fails half-way keeps what it has; the reload still starts clean in memory */
    }
  }
  return n;
}

/** The address with no parameters and no fragment: the app's front door. */
export function cleanUrl(loc) {
  return loc.pathname || '/';
}
