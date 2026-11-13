import { memo, useEffect, useState } from 'react';
import { fmtDateTime, fmtEur } from '../lib/format.js';
import { Reticle } from './Icons.jsx';

const clockFormat = new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * The command bar: wordmark, live readouts (every number is real data), the night-vision
 * switch and, in narrow windows only, the button for the slide-out mission parameters.
 */
export default memo(Header);

function Header({
  meta, shown, total, filters, saved, medianRent, onChange, nv, onToggleNv, wide, paramsOpen, paramCount,
  paramsButtonRef, onParams, onReset, manualOpen, onManual,
}) {
  const run = meta?.lastRun;
  const ready = !!filters;

  return (
    <header className="header">
      <div className="brand">
        <Reticle className="brand-mark" />
        <div className="brand-text">
          <h1 className="brand-title">
            Tampere <span className="brand-sub">Targets</span>
            {/* The running version (package.json, vite.config.mjs), small and quiet: for debugging. */}
            <span className="brand-version">v{__APP_VERSION__}</span>
          </h1>
          <p className="brand-tag">Tactical rental recon · Tampere AO</p>
        </div>
      </div>

      <dl className="readouts">
        <div className="readout readout-main">
          <dt>Targets</dt>
          <dd>
            <span className="readout-n">{ready ? shown : '––'}</span>
            <span className="readout-of">/ {ready ? total : '––'}</span>
          </dd>
        </div>
        {/* Not on upright phones: the list's ★ Priority chip does the same there. */}
        <div className={`readout readout-shortlist ${saved.size ? 'readout-priority' : ''}`}>
          <dt>Priority</dt>
          <dd>
            {ready && saved.size > 0 ? (
              <button
                type="button"
                className="readout-n readout-button"
                aria-pressed={filters.onlySaved}
                onClick={() => onChange({ onlySaved: !filters.onlySaved })}
                title={filters.onlySaved ? 'Show all targets again' : 'Show only your priority targets'}
              >
                {saved.size}
              </button>
            ) : (
              <span className="readout-n">{ready ? saved.size : '––'}</span>
            )}
          </dd>
        </div>
        <div className="readout readout-wide">
          <dt>Median cost</dt>
          <dd>
            <span className="readout-text">{ready && medianRent != null ? fmtEur(Math.round(medianRent)) : '––'}</span>
          </dd>
        </div>
        <div className="readout readout-wide">
          <dt>Last recon</dt>
          <dd>
            <span className="readout-text">{run ? fmtDateTime(run.finishedAt ?? run.startedAt) : '––'}</span>
          </dd>
        </div>
        <div className="readout readout-clock">
          <dt>Local · HEL</dt>
          <dd>
            <Clock />
          </dd>
        </div>
      </dl>

      <div className="header-actions">
        {!wide && (
          <>
            {paramCount > 0 && (
              <button type="button" className="btn btn-link header-clear" onClick={onReset}>
                Clear
              </button>
            )}
            <button
              ref={paramsButtonRef}
              type="button"
              className={`btn btn-ghost params-btn ${paramsOpen ? 'is-on' : ''}`}
              aria-expanded={paramsOpen}
              aria-controls="filters-panel"
              onClick={onParams}
              disabled={!filters}
            >
              <svg className="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M3 5h14M6 10h8M8.5 15h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
              </svg>
              <span className="btn-label">Params</span>
              {paramCount > 0 && <span className="badge" aria-label={`${paramCount} active`}>{paramCount}</span>}
            </button>
          </>
        )}
        <button
          type="button"
          className={`nv-toggle ${nv ? 'is-on' : ''}`}
          aria-pressed={nv}
          onClick={onToggleNv}
          title={`Night vision ${nv ? 'off' : 'on'} (V)`}
        >
          <svg className="nv-icon" viewBox="0 0 32 20" aria-hidden="true" focusable="false">
            <path d="M3 6h26v8a3 3 0 0 1-3 3h-6l-2-3h-4l-2 3H6a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="10" cy="10.5" r="3" fill="currentColor" className="nv-lens" />
            <circle cx="22" cy="10.5" r="3" fill="currentColor" className="nv-lens" />
            <path d="M12 6V3h8v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span className="nv-text">
            <span className="nv-label">NV</span>
            <span className="nv-state">{nv ? 'On' : 'Off'}</span>
          </span>
        </button>
        {/* The field manual (FR-50): desktop only, after NV (CSS hides it on touch screens, which have no keys). */}
        <button
          type="button"
          className={`btn btn-ghost keys-btn ${manualOpen ? 'is-on' : ''}`}
          aria-haspopup="dialog"
          aria-label="Field manual: the keyboard keys"
          title="Field manual (H)"
          onClick={onManual}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="2.5" y="6" width="19" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 9.5h1.5M9.5 9.5H11M13 9.5h1.5M16.5 9.5H18M7.5 12.5H9M11 12.5h1.5M14.5 12.5H16M8 15.2h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
          <span className="keys-btn-q" aria-hidden="true">H</span>
        </button>
      </div>
    </header>
  );
}

/** Helsinki wall clock, 14:32:07. Its own component so only it re-renders every second. */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <time className="readout-text readout-time">{clockFormat.format(now).replace(/\./g, ':')}</time>;
}
