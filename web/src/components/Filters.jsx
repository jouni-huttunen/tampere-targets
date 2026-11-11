import { memo, useEffect, useMemo } from 'react';
import RangeFilter from './RangeFilter.jsx';

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
 */
export default memo(Filters);

function Filters({
  overlay, filters, defaults, bounds, zips, zipNames, listings, saved, activeCount, onChange, onReset, onClose,
}) {
  const counts = useMemo(() => {
    const c = { new: 0, removed: 0, noDate: 0, zip: {} };
    for (const l of listings ?? []) {
      if (l.is_new && !l.removed) c.new++;
      if (l.removed) c.removed++;
      if (!l.removed && l.available_date == null) c.noDate++;
      if (!l.removed) c.zip[l.zip] = (c.zip[l.zip] ?? 0) + 1;
    }
    return c;
  }, [listings]);

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
        {overlay && (
          <button type="button" className="icon-btn panel-close" onClick={onClose} aria-label="Close mission parameters" title="Close (Esc)">
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
            />
          </section>

          <section className="param-group" aria-label="Logistics">
            <h3 className="group-title">Logistics</h3>
            <RangeFilter label="Cost / month" unit="€" step={10} bounds={bounds?.rent} value={filters.rent} onChange={(rent) => onChange({ rent })} />
            <RangeFilter label="Area" unit="m²" bounds={bounds?.size} value={filters.size} onChange={(size) => onChange({ size })} />
            <RangeFilter label="Rooms" bounds={bounds?.rooms} value={filters.rooms} onChange={(rooms) => onChange({ rooms })} />
          </section>

          <section className="param-group" aria-label="Timing">
            <h3 className="group-title">Timing</h3>
            <RangeFilter
              label="Move-in window"
              kind="date"
              hint={defaults && filters.avail[1] === defaults.avail[1] ? 'Default: by end of Jan' : null}
              bounds={bounds?.avail}
              value={filters.avail}
              onChange={(avail) => onChange({ avail })}
            />
            <Switch label="Include targets with no move-in date" count={counts.noDate} checked={filters.noDate} onChange={(noDate) => onChange({ noDate })} />
          </section>

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
              <Switch label="New contacts only" count={counts.new} checked={filters.onlyNew} onChange={(onlyNew) => onChange({ onlyNew })} />
              <Switch label="Priority targets only" count={saved?.size ?? 0} checked={filters.onlySaved} onChange={(onlySaved) => onChange({ onlySaved })} />
              <Switch label="Hide withdrawn" count={counts.removed} checked={filters.hideRemoved} onChange={(hideRemoved) => onChange({ hideRemoved })} />
            </div>
          </section>
        </div>
      )}

      <div className="params-foot">
        <button type="button" className="btn btn-ghost" onClick={onReset} disabled={!filters || activeCount === 0}>
          Clear params
        </button>
        {overlay && (
          <button type="button" className="btn btn-primary" onClick={onClose}>
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
