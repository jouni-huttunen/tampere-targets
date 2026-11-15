import { memo, useEffect, useMemo } from 'react';
import { isTopFloor } from '../lib/filters.js';
import { FINANCING, HOUSING_TYPES, housingCounts } from '../lib/housing.js';
import { LATER, UNKNOWN, monthLabel, moveInChips } from '../lib/movein.js';
import { YEAR_DECADES } from '../lib/stops.js';

/** "2027-02-01" → "February 2027". */
const fmtMonth = (date) => `${monthLabel(date.slice(0, 7))} ${date.slice(0, 4)}`;
import { PanelChevron } from './PanelRail.jsx';
import RangeFilter from './RangeFilter.jsx';
import ScorchedEarth from './ScorchedEarth.jsx';

// Same bins as the map markers and the legend (format.js YEAR_BINS).
const YEAR_ERAS = [
  { from: null, cls: 'mk-y1' },
  { from: 1960, cls: 'mk-y2' },
  { from: 1990, cls: 'mk-y3' },
  { from: 2010, cls: 'mk-y4' },
  { from: 2020, cls: 'mk-y5' },
];

/**
 * MISSION PARAMETERS: every filter in one column on the left, always open in a wide window.
 * In narrow windows it slides out over the console (overlay) and Esc or Done closes it.
 * In a wide window `onHide` (the « button) folds it into a rail for more map (FR-46).
 */
export default memo(Filters);

function Filters({
  overlay, filters, bounds, zips, zipNames, listings, windowCutoff, saved, activeCount, onChange, onReset, onClose, onDone, onHide, hideRef,
  onPurge, phone,
}) {
  const counts = useMemo(() => {
    const c = { top: 0, zip: {} };
    for (const l of listings ?? []) {
      if (isTopFloor(l) && !l.removed) c.top++;
      if (!l.removed) c.zip[l.zip] = (c.zip[l.zip] ?? 0) + 1;
    }
    return c;
  }, [listings]);
  const moveChips = useMemo(() => moveInChips(listings ?? [], windowCutoff), [listings, windowCutoff]);
  const housing = useMemo(() => housingCounts(listings ?? []), [listings]);

  // The overlay sits on top of the target profile: Esc closes the overlay first.
  useEffect(() => {
    if (!overlay) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, onClose]);

  const toggleMove = (key) => {
    const off = new Set(filters.moveOff);
    off.has(key) ? off.delete(key) : off.add(key);
    onChange({ moveOff: [...off] });
  };

  const toggleFinance = (key) => {
    const off = new Set(filters.financeOff);
    off.has(key) ? off.delete(key) : off.add(key);
    onChange({ financeOff: [...off] });
  };

  const toggleType = (code) => {
    const set = new Set(filters.types);
    set.has(code) ? set.delete(code) : set.add(code);
    onChange({ types: HOUSING_TYPES.map((t) => t.code).filter((c) => set.has(c)) });
  };

  const toggleZip = (zip) => {
    const set = new Set(filters.zips);
    set.has(zip) ? set.delete(zip) : set.add(zip);
    onChange({ zips: zips.filter((z) => set.has(z)) });
  };

  return (
    <aside
      className={`params frame ${overlay ? 'params-overlay' : ''}`}
      id={overlay ? 'filters-panel' : undefined}
      aria-label="Mission parameters"
    >
      <div className="panel-head">
        <h2 className="panel-title">
          <span className="panel-index">01</span>
          Mission parameters
        </h2>
        {activeCount > 0 && (
          <span className="badge" aria-label={`${activeCount} active`}>
            {activeCount}
          </span>
        )}
        {onHide && (
          <button ref={hideRef} type="button" className="icon-btn panel-hide" onClick={onHide} aria-expanded="true" aria-label="Hide mission parameters" title="Hide for more map (R)">
            <PanelChevron dir="left" />
          </button>
        )}
        {overlay && (
          <button type="button" className="icon-btn panel-close" onClick={onClose} aria-label="Close mission parameters" title="Close (R)">
            <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
            </svg>
          </button>
        )}
      </div>

      {!filters ? (
        <div className="params-scroll">
          <p className="panel-wait">Awaiting intel…</p>
        </div>
      ) : (
        <div className="params-scroll">
          <section className="param-group" aria-label="Structure">
            <h3 className="group-title">Structure</h3>
            <RangeFilter
              prominent
              label="Build year"
              hint={filters.year[0] == null && filters.year[1] == null ? 'All eras' : 'Unknown years hidden'}
              bounds={bounds?.year}
              value={filters.year}
              onChange={(year) => onChange({ year })}
              eras={YEAR_ERAS}
              stops={YEAR_DECADES}
            />
          </section>

          <section className="param-group" aria-label="Logistics">
            <h3 className="group-title">Logistics</h3>
            <RangeFilter label="Cost / month" unit="€" step={10} bounds={bounds?.rent} value={filters.rent} onChange={(rent) => onChange({ rent })} />
            <RangeFilter label="Area" unit="m²" bounds={bounds?.size} value={filters.size} onChange={(size) => onChange({ size })} />
            <RangeFilter label="Rooms" bounds={bounds?.rooms} value={filters.rooms} onChange={(rooms) => onChange({ rooms })} />
          </section>

          <fieldset className="param-group move-set">
            <legend className="group-title">Move-in</legend>
            <div className="chips">
              {moveChips.map((c) => (
                <button key={c.key} type="button" className="chip chip-move" aria-pressed={!filters.moveOff.includes(c.key)} onClick={() => toggleMove(c.key)}
                  title={c.key === LATER ? `Move-in from ${windowCutoff ? fmtMonth(windowCutoff) : 'later'} on` : c.key === UNKNOWN ? 'No move-in date in the listing' : `${c.label} ${c.year}`}>
                  <span className="chip-month">{c.label}</span>
                  <span className="chip-count">{c.count}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="param-group move-set">
            <legend className="group-title">Financing</legend>
            <div className="chips">
              {FINANCING.map((c) => (
                <button key={c.key} type="button" className="chip chip-move" aria-pressed={!filters.financeOff.includes(c.key)} onClick={() => toggleFinance(c.key)} title={c.title}>
                  <span className="chip-month">{c.label}</span>
                  <span className="chip-count">{housing.financing[c.key]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="param-group move-set" aria-describedby="type-note">
            <legend className="group-title">Housing type</legend>
            <p className="group-note" id="type-note">Select to show only those types</p>
            <div className="chips">
              {HOUSING_TYPES.map((t) => (
                <button key={t.code} type="button" className="chip chip-move" aria-pressed={filters.types.includes(t.code)} onClick={() => toggleType(t.code)} title={t.title}>
                  <span className="chip-month">{t.label}</span>
                  <span className="chip-count">{housing.types[t.code]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="param-group zip-set">
            <legend className="group-title">Sectors</legend>
            <div className="chips">
              <button type="button" className="chip chip-all" aria-pressed={filters.zips.length === 0} onClick={() => onChange({ zips: [] })}>
                All sectors
              </button>
              {zips.map((zip) => (
                <button key={zip} type="button" className="chip" aria-pressed={filters.zips.includes(zip)} onClick={() => toggleZip(zip)}
                  title={zipNames[zip] ? `${zip} ${zipNames[zip]}` : zip}>
                  <span className="chip-zip">{zip}</span>
                  {zipNames[zip] && <span className="chip-name">{zipNames[zip]}</span>}
                  <span className="chip-count">{counts.zip[zip] ?? 0}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <section className="param-group" aria-label="Flags">
            <h3 className="group-title">Flags</h3>
            <div className="switches">
              <Switch label="Priority targets only" count={saved?.size ?? 0} checked={filters.onlySaved} onChange={(onlySaved) => onChange({ onlySaved })} />
              <Switch label="Top floor only" count={counts.top} checked={filters.topFloor} onChange={(topFloor) => onChange({ topFloor })} />
            </div>
          </section>

          {/* The very bottom: the reset of last resort, folded to one slim bar (FR-51). */}
          {onPurge && <ScorchedEarth compact terse={!phone} onFire={onPurge} />}
        </div>
      )}

      <div className="params-foot">
        <button type="button" className="btn btn-ghost" onClick={onReset} disabled={!filters || activeCount === 0}>
          Clear params
        </button>
        {overlay && (
          <button type="button" className="btn btn-primary" onClick={onDone ?? onClose}>
            Done
          </button>
        )}
      </div>
    </aside>
  );
}

function Switch({ label, count, checked, onChange }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
      {count != null && <span className="switch-count">{count}</span>}
    </label>
  );
}
