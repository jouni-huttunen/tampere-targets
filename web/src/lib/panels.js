// Side panels shown or hidden (FR-46): Mission parameters and Target list can be folded into a
// slim rail for more map. Both are shown by default; the choice is remembered per browser.

export const PANELS_KEY = 'tcb.panels.v1';
export const DEFAULT_PANELS = Object.freeze({ params: true, list: true });

/** Stored JSON → { params, list }; anything missing or broken means shown. */
export function parsePanels(value) {
  try {
    const v = JSON.parse(value);
    return { params: v?.params !== false, list: v?.list !== false };
  } catch {
    return { ...DEFAULT_PANELS };
  }
}

export function loadPanels(storage = globalThis.localStorage) {
  try {
    return parsePanels(storage?.getItem(PANELS_KEY));
  } catch {
    return { ...DEFAULT_PANELS };
  }
}

export function savePanels(panels, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PANELS_KEY, JSON.stringify({ params: panels.params !== false, list: panels.list !== false }));
  } catch {
    /* storage blocked: the choice just isn't remembered */
  }
}
