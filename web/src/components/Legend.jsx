import { useState } from 'react';
import { YEAR_BINS } from '../lib/format.js';

/** Build-year colours always; the other marker styles and runes behind "More". */
export default function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`legend ${open ? 'is-open' : ''}`} aria-label="Map legend" role="group">
      <div className="legend-head">
        <p className="legend-title">Build year</p>
        <button type="button" className="legend-toggle" aria-expanded={open} aria-controls="legend-extra" onClick={() => setOpen((o) => !o)}>
          {open ? 'Less' : 'More'}
        </button>
      </div>
      <ul className="legend-list">
        {YEAR_BINS.slice()
          .reverse()
          .map((b) => (
            <li key={b.bin}>
              <span className={`legend-dot mk-y${b.bin}`} aria-hidden="true" />
              {b.label}
            </li>
          ))}
        <li>
          <span className="legend-dot mk-y0" aria-hidden="true" />
          unknown
        </li>
      </ul>
      {open && (
        <ul className="legend-list legend-extra" id="legend-extra">
          <li>
            <span className="legend-dot legend-new mk-y4" aria-hidden="true" />
            new since last crawl
          </li>
          <li>
            <span className="legend-dot legend-saved mk-y2" aria-hidden="true" />
            on your shortlist
          </li>
          <li>
            <span className="legend-dot legend-approx mk-y4" aria-hidden="true" />
            approximate location
          </li>
          <li>
            <span className="legend-dot legend-group" aria-hidden="true" />
            same building, spread out
          </li>
          <li>
            <span className="legend-rune" aria-hidden="true">ᛟ</span>
            Keskustori
          </li>
          <li>
            <span className="legend-rune" aria-hidden="true">ᚱ</span>
            railway station
          </li>
          <li>
            <span className="legend-rune" aria-hidden="true">ᛞ</span>
            available (in the list)
          </li>
        </ul>
      )}
    </div>
  );
}
