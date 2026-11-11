import { useEffect, useRef, useState } from 'react';
import { fmtDateTime } from '../lib/format.js';

// Same bins as the map markers and the legend (format.js YEAR_BINS).
const YEAR_ERAS = [
  { from: null, cls: 'mk-y1' },
  { from: 1960, cls: 'mk-y2' },
  { from: 1990, cls: 'mk-y3' },
  { from: 2010, cls: 'mk-y4' },
  { from: 2020, cls: 'mk-y5' },
];
import Filters from './Filters.jsx';
import RangeFilter from './RangeFilter.jsx';

export default function Header({ meta, shown, total, filters, defaults, bounds, zipNames, listings, saved, activeCount, onChange, onReset }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault(); // the panel is on top: Esc closes it, not the drawer below
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const run = meta?.lastRun;
  const newCount = meta?.counts?.isNew ?? 0;

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">ᛟ</span>
        <div className="brand-text">
          <h1 className="brand-title">
            Tampere <span className="brand-sub">homes</span>
          </h1>
          <p className="brand-runes" aria-hidden="true">ᛏᚨᛗᛈᛖᚱᛖ · ᚺᛟᛗᛖᛋ</p>
        </div>
      </div>

      <dl className="stats">
        <div className="stat">
          <dt>Shown</dt>
          <dd>
            <span className="stat-n">{filters ? shown : '–'}</span>
            <span className="stat-of">/ {filters ? total : '–'}</span>
          </dd>
        </div>
        <div className={`stat ${newCount ? 'stat-hot' : ''}`}>
          <dt>{run?.isInitial ? 'First crawl' : 'New'}</dt>
          <dd>
            {filters && newCount > 0 ? (
              <button
                type="button"
                className="stat-n stat-button"
                aria-pressed={filters.onlyNew}
                onClick={() => onChange({ onlyNew: !filters.onlyNew })}
                title={filters.onlyNew ? 'Show all homes again' : 'Show only the new homes'}
              >
                {newCount}
              </button>
            ) : (
              <span className="stat-n">{!meta || run?.isInitial ? '–' : newCount}</span>
            )}
          </dd>
        </div>
        <div className="stat stat-time">
          <dt>Crawled</dt>
          <dd>{run ? fmtDateTime(run.finishedAt ?? run.startedAt) : '–'}</dd>
        </div>
      </dl>

      <div className="header-year">
        {filters && (
          <RangeFilter
            prominent
            label="Build year"
            hint={filters.year[0] == null && filters.year[1] == null ? 'All eras' : 'Unknown years hidden'}
            bounds={bounds?.year}
            value={filters.year}
            onChange={(year) => onChange({ year })}
            eras={YEAR_ERAS}
          />
        )}
      </div>

      <div className="header-actions">
        <button
          ref={buttonRef}
          type="button"
          className={`btn btn-ghost ${open ? 'is-on' : ''}`}
          aria-expanded={open}
          aria-controls="filters-panel"
          onClick={() => setOpen((o) => !o)}
          disabled={!filters}
        >
          <FilterIcon />
          Filters
          {activeCount > 0 && <span className="badge" aria-label={`${activeCount} active`}>{activeCount}</span>}
        </button>
        {activeCount > 0 && (
          <button type="button" className="btn btn-link" onClick={onReset}>
            Reset
          </button>
        )}
      </div>

      {open && filters && (
        <div className="filters-panel" id="filters-panel" ref={panelRef} role="region" aria-label="Filters">
          <Filters
            filters={filters}
            defaults={defaults}
            bounds={bounds}
            zips={meta?.zips ?? []}
            zipNames={zipNames}
            listings={listings}
            saved={saved}
            onChange={onChange}
            onReset={onReset}
            onDone={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
          />
        </div>
      )}
    </header>
  );
}

function FilterIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3 5h14M6 10h8M8.5 15h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
