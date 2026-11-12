import { useEffect, useRef, useState } from 'react';
import { YEAR_BINS } from '../lib/format.js';

// Phones (the stacked layout, same value as App.jsx STACKED_QUERY) start with the legend hidden.
const startHidden = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;

/**
 * Build-year colours always; the other marker styles and reference points behind "More".
 * "Hide" folds it into a small chip with the colour strip; the chip opens it again.
 * In night vision (`intel`) "More" also explains the ground-intel glyphs (FR-43).
 */
export default function Legend({ intel = false }) {
  const [hidden, setHidden] = useState(startHidden);
  const [open, setOpen] = useState(false);
  const bins = YEAR_BINS.slice().reverse();
  // Folding swaps the element under the pointer: keep keyboard focus on its counterpart.
  const focusRef = useRef(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else focusRef.current?.focus();
  }, [hidden]);

  if (hidden) {
    return (
      <button ref={focusRef} type="button" className="legend-chip frame" aria-expanded="false" onClick={() => setHidden(false)} title="Show the map legend">
        <span className="legend-strip" aria-hidden="true">
          {bins.map((b) => (
            <span key={b.bin} className={`legend-dot mk-y${b.bin}`} />
          ))}
          <span className="legend-dot mk-y0" />
        </span>
        Legend
      </button>
    );
  }

  return (
    <div className={`legend frame ${open ? 'is-open' : ''}`} aria-label="Map legend" role="group">
      <div className="legend-head">
        <p className="legend-title">Build year</p>
        <span className="legend-actions">
          <button type="button" className="legend-toggle" aria-expanded={open} aria-controls="legend-extra" onClick={() => setOpen((o) => !o)}>
            {open ? 'Less' : 'More'}
          </button>
          <button ref={focusRef} type="button" className="legend-toggle" aria-expanded="true" onClick={() => setHidden(true)} aria-label="Hide the map legend">
            Hide
          </button>
        </span>
      </div>
      <ul className="legend-list">
        {bins.map((b) => (
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
          {intel && (
            <>
              <li className="legend-section legend-wide">Ground intel · NV</li>
              <li className="legend-wide">
                <span className="legend-poi poi poi-store poi-t2" aria-hidden="true">
                  <svg className="poi-hex" viewBox="-12 -12 24 24" focusable="false">
                    <path d="M-11 0L-5.5 -9.5H5.5L11 0L5.5 9.5H-5.5Z" />
                  </svg>
                  <span className="poi-letter">K</span>
                </span>
                grocery: K Kesko · S S-ryhmä · L Lidl (larger = bigger store)
              </li>
              <li>
                <span className="legend-poi poi poi-tram" aria-hidden="true">
                  <span className="poi-letter">T</span>
                </span>
                tram stop
              </li>
              <li>
                <span className="legend-poi legend-bus" aria-hidden="true" />
                bus stop (zoom in)
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
