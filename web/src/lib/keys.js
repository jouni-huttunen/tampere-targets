// Desktop keys (FR-44, FR-47, FR-50; the user's choice of keys). One table for both the key
// handler in App.jsx and the field manual, so the manual always shows the keys that work.
// Letters go by key position (KeyboardEvent.code), so they sit in the same place on any layout.

/** Key position → action. N and M are second keys for night vision and the base map. */
export const KEY_ACTIONS = Object.freeze({
  KeyQ: 'params',
  KeyW: 'prev',
  KeyE: 'list',
  KeyR: 'basemap',
  KeyA: 'prev',
  KeyS: 'next',
  KeyD: 'next',
  KeyF: 'fit',
  KeyH: 'manual',
  KeyZ: 'zoomin',
  KeyX: 'zoomout',
  KeyC: 'close',
  KeyV: 'nv',
  KeyN: 'nv',
  KeyM: 'basemap',
});

/** The usual map zoom keys, by the character typed (where + and − sit differs by layout):
 *  + or = (and numpad +) zoom in, − (and numpad −) out, beside Z and X. */
export const CHAR_ACTIONS = Object.freeze({ '+': 'zoomin', '=': 'zoomin', '-': 'zoomout' });

/** Keys the manual draws that are not in the table: Esc is handled by each panel and card. */
export const MANUAL_EXTRA = Object.freeze({ Escape: 'esc' });

/** What each action does, as the field manual says it (short label, then the longer line). */
export const ACTION_TEXT = Object.freeze({
  params: ['Params', 'Show or hide the mission parameters'],
  list: ['List', 'Show or hide the target list'],
  basemap: ['Map', 'Next base map: Night ops → Recon sat → Terrain'],
  prev: ['Prev', 'Previous target (the last one with no profile open)'],
  next: ['Next', 'Next target (the first one with no profile open)'],
  fit: ['Fit', 'Zoom the map to the targets in the list'],
  zoomin: ['Zoom +', 'Zoom in one level (also +), around the open target, else the map centre'],
  zoomout: ['Zoom −', 'Zoom out one level (also −), around the open target, else the map centre'],
  manual: ['Manual', 'Open or close this field manual'],
  close: ['Close', 'Same as Esc: closes the topmost of this manual, the parameters, an intel card or the profile'],
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

/** The action the manual shows for a drawn key, or undefined for a dim one. */
export const manualAction = (code) => KEY_ACTIONS[code] ?? MANUAL_EXTRA[code];

/** "KeyQ" → "Q", "Escape" → "Esc". */
export const capOf = (code) => (code === 'Escape' ? 'Esc' : code.replace(/^Key/, ''));

/** The action for a keydown, or null. Ctrl / Alt / Cmd combinations are never shortcuts (Ctrl+C still copies). */
export function keyAction(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  return KEY_ACTIONS[e.code] ?? CHAR_ACTIONS[e.key] ?? null;
}
