// Desktop keys (FR-44, FR-47, FR-50; the user's choice of keys). One table for both the key
// handler in App.jsx and the field manual, so the manual always shows the keys that work.
// Letters go by key position (KeyboardEvent.code), so they sit in the same place on any layout.

/** Key position → action. Q or N switches night vision, E or M the base map; R and T show or hide the parameters and the list; F zooms to the open target (else fits the map), C fits the map to all targets; ← / → step through targets like A / D, ↑ / ↓ zoom like W / S. Esc closes (each panel's own). */
export const KEY_ACTIONS = Object.freeze({
  KeyQ: 'nv',
  KeyW: 'zoomin',
  KeyE: 'basemap',
  KeyR: 'params',
  KeyT: 'list',
  KeyA: 'prev',
  KeyS: 'zoomout',
  KeyD: 'next',
  KeyF: 'focus',
  KeyC: 'fit',
  KeyH: 'manual',
  KeyN: 'nv',
  KeyM: 'basemap',
  ArrowUp: 'zoomin',
  ArrowDown: 'zoomout',
  ArrowLeft: 'prev',
  ArrowRight: 'next',
});

/** Keys the manual draws that are not in the table: Esc is handled by each panel and card. */
export const MANUAL_EXTRA = Object.freeze({ Escape: 'esc' });

/** What each action does, as the field manual says it (short label, then the longer line). */
export const ACTION_TEXT = Object.freeze({
  params: ['Params', 'Show or hide the mission parameters'],
  list: ['List', 'Show or hide the target list'],
  basemap: ['Map', 'Next base map: Night ops → Recon sat → Terrain'],
  prev: ['Prev', 'Previous target (the last one with no profile open)'],
  next: ['Next', 'Next target (the first one with no profile open)'],
  focus: ['Focus', 'Zoom to the open target, centred; with none open, fit the map to the targets'],
  fit: ['Fit', 'Zoom the map to all the targets in the list'],
  zoomin: ['Zoom +', 'Zoom in one level (W or ↑), centred on the open target, else around the map centre'],
  zoomout: ['Zoom −', 'Zoom out one level (S or ↓), centred on the open target, else around the map centre'],
  manual: ['Manual', 'Open or close this field manual'],
  nv: ['NV', 'Night vision on or off'],
  esc: ['Close', 'Close the topmost: this manual, the parameters, an intel card or the profile'],
});

/**
 * The keyboard block as the manual draws it: rows of key positions, each row's offset in key
 * widths (the stagger of a real keyboard), Esc on a row of its own above. Keys without an action
 * are drawn dim.
 */
export const MANUAL_ROWS = Object.freeze([
  { offset: 0, keys: ['Escape'], fn: true },
  { offset: 0, keys: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT'] },
  { offset: 0.25, keys: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH'] },
  { offset: 0.75, keys: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'] },
]);

/** The arrow cluster the manual draws to the right of the letters: ↑ above ← ↓ →. */
export const MANUAL_ARROWS = Object.freeze([['ArrowUp'], ['ArrowLeft', 'ArrowDown', 'ArrowRight']]);

/** The action the manual shows for a drawn key, or undefined for a dim one. */
export const manualAction = (code) => KEY_ACTIONS[code] ?? MANUAL_EXTRA[code];

/** "KeyQ" → "Q", "Escape" → "Esc", "ArrowUp" → "↑" (and the other arrows). */
const CAPS = { Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
export const capOf = (code) => CAPS[code] ?? code.replace(/^Key/, '');

/** The action for a keydown, or null. Ctrl / Alt / Cmd combinations are never shortcuts (Ctrl+C still copies). */
export function keyAction(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  return KEY_ACTIONS[e.code] ?? null;
}
