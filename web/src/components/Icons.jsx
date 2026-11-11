// Small tactical glyphs drawn in currentColor (colours come from tokens via CSS).

/** Brackets around a ring and a centre dot: the brand mark and the boot screen emblem. */
export function Reticle({ className = '' }) {
  return (
    <svg className={`reticle ${className}`} viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
      <path className="reticle-brackets" d="M-17 -9V-17H-9M9 -17H17V-9M17 9V17H9M-9 17H-17V9" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle className="reticle-ring" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path className="reticle-ticks" d="M0 -13V-10M0 10V13M-13 0H-10M10 0H13" stroke="currentColor" strokeWidth="1.6" />
      <circle className="reticle-dot" r="2.2" />
    </svg>
  );
}

/** A plain crosshair, for empty states and missing photos. */
export function Crosshair({ className = '' }) {
  return (
    <svg className={`crosshair ${className}`} viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
      <circle r="11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 3" />
      <path d="M0 -18V-6M0 6V18M-18 0H-6M6 0H18" stroke="currentColor" strokeWidth="1.4" />
      <circle r="1.6" fill="currentColor" />
    </svg>
  );
}
