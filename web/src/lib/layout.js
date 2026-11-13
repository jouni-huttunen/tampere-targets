// Layout breakpoints used by the JavaScript. The same values are in app.css and tokens.css (see
// "Narrower windows" there); change them together. docs/03-design.md lists the tiers.

/** Three columns (parameters | map | targets) from this width. */
export const WIDE_QUERY = '(min-width: 1360px)';

/** A phone held sideways: short and landscape, whatever its width (some are over 900 px wide). */
export const LANDSCAPE_PHONE_QUERY = '(orientation: landscape) and (max-height: 500px)';

/** Phone behaviour in either orientation: full-screen profile, swipe between targets, legend folded. */
export const PHONE_QUERY = `(max-width: 900px), ${LANDSCAPE_PHONE_QUERY}`;

/** A mouse or trackpad, so most likely a keyboard: the field manual is offered (FR-50). */
export const DESKTOP_POINTER = '(hover: hover) and (pointer: fine)';

/** The stacked layout (the list under the map): a phone held upright, or any narrow tall window. */
export const STACKED_QUERY = '(max-width: 900px) and (orientation: portrait), (max-width: 900px) and (min-height: 501px)';
