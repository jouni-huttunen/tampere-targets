import { useState } from 'react';
import { YEAR_BINS } from '../lib/format.js';

/** Build-year colours always; the other marker styles and reference points behind "More". */
export default function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`legend frame ${open ? 'is-open' : ''}`} aria-label="Map legend" role="group">
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
            new contact
          </li>
          <li>
            <span className="legend-dot legend-saved mk-y2" aria-hidden="true" />
            priority target
          </li>
          <li>
            <span className="legend-dot legend-approx mk-y4" aria-hidden="true" />
            approx. position
          </li>
          <li>
            <span className="legend-dot legend-group" aria-hidden="true" />
            same building, spread out
          </li>
          <li>
            <span className="legend-pin" aria-hidden="true" />
            HQ · Keskustori
          </li>
          <li>
            <span className="legend-pin" aria-hidden="true" />
            RAIL · railway station
          </li>
        </ul>
      )}
    </div>
  );
}
