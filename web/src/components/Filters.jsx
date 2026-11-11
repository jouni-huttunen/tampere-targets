import { useMemo } from 'react';
import RangeFilter from './RangeFilter.jsx';

export default function Filters({ filters, defaults, bounds, zips, zipNames, listings, saved, onChange, onReset, onDone }) {
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

  const toggleZip = (zip) => {
    const set = new Set(filters.zips);
    set.has(zip) ? set.delete(zip) : set.add(zip);
    onChange({ zips: zips.filter((z) => set.has(z)) });
  };

  return (
    <div className="filters">
      <div className="filters-grid">
        <RangeFilter label="Rent" unit="€" step={10} bounds={bounds?.rent} value={filters.rent} onChange={(rent) => onChange({ rent })} />
        <RangeFilter label="Size" unit="m²" bounds={bounds?.size} value={filters.size} onChange={(size) => onChange({ size })} />
        <RangeFilter label="Rooms" bounds={bounds?.rooms} value={filters.rooms} onChange={(rooms) => onChange({ rooms })} />
        <div className="filter-block">
          <RangeFilter
            label="Available"
            kind="date"
            hint={defaults && filters.avail[1] === defaults.avail[1] ? 'default: by end of January' : null}
            bounds={bounds?.avail}
            value={filters.avail}
            onChange={(avail) => onChange({ avail })}
          />
          <Switch
            label="Include homes with no move-in date"
            count={counts.noDate}
            checked={filters.noDate}
            onChange={(noDate) => onChange({ noDate })}
          />
        </div>
      </div>

      <fieldset className="zip-set">
        <legend className="range-label">Postal areas</legend>
        <div className="chips">
          <button
            type="button"
            className="chip"
            aria-pressed={filters.zips.length === 0}
            onClick={() => onChange({ zips: [] })}
          >
            All areas
          </button>
          {zips.map((zip) => (
            <button
              key={zip}
              type="button"
              className="chip"
              aria-pressed={filters.zips.includes(zip)}
              onClick={() => toggleZip(zip)}
            >
              <span className="chip-zip">{zip}</span>
              {zipNames[zip] && <span className="chip-name">{zipNames[zip]}</span>}
              <span className="chip-count">{counts.zip[zip] ?? 0}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="filters-foot">
        <div className="switches">
          <Switch label="Only new since the last crawl" count={counts.new} checked={filters.onlyNew} onChange={(onlyNew) => onChange({ onlyNew })} />
          <Switch label="Only my shortlist" count={saved?.size ?? 0} checked={filters.onlySaved} onChange={(onlySaved) => onChange({ onlySaved })} />
          <Switch label="Hide removed listings" count={counts.removed} checked={filters.hideRemoved} onChange={(hideRemoved) => onChange({ hideRemoved })} />
        </div>
        <div className="filters-buttons">
          <button type="button" className="btn btn-link" onClick={onReset}>
            Reset all
          </button>
          <button type="button" className="btn btn-primary" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Switch({ label, count, checked, onChange }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">
        {label}
        {count != null && <span className="switch-count">{count}</span>}
      </span>
    </label>
  );
}
