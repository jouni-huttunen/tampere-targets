import { useCallback, useEffect, useMemo, useState } from 'react';
import DetailDrawer from './components/DetailDrawer.jsx';
import Header from './components/Header.jsx';
import ListPanel from './components/ListPanel.jsx';
import MapView from './components/MapView.jsx';
import RuneCircle from './components/RuneCircle.jsx';
import { ApiError, getJson } from './lib/api.js';
import {
  activeFilterCount,
  applyFilters,
  dataBounds,
  defaultFilters,
  fromQuery,
  sortListings,
  toQuery,
} from './lib/filters.js';
import { SHORTLIST_KEY, loadShortlist, parseShortlist, saveShortlist, toggled } from './lib/shortlist.js';

function selectedFromUrl() {
  const id = new URLSearchParams(window.location.search).get('listing');
  return id && /^\d+$/.test(id) ? Number(id) : null;
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [listings, setListings] = useState(null);
  const [error, setError] = useState(null);
  const [areas, setAreas] = useState(null);
  const [filters, setFilters] = useState(null);
  const [hover, setHover] = useState({ id: null, source: null });
  const [selectedId, setSelectedId] = useState(selectedFromUrl);
  const [saved, setSaved] = useState(() => loadShortlist());

  // Shortlist: saved in this browser only; follow changes made in other tabs.
  const toggleSaved = useCallback((id) => setSaved((s) => toggled(s, id)), []);
  useEffect(() => {
    saveShortlist(saved);
  }, [saved]);
  useEffect(() => {
    const onStorage = (e) => e.key === SHORTLIST_KEY && setSaved(parseShortlist(e.newValue));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getJson('/api/meta'), getJson('/api/listings')])
      .then(([m, rows]) => {
        if (cancelled) return;
        setMeta(m);
        setListings(rows);
        setFilters(fromQuery(window.location.search, defaultFilters(m), m.zips));
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err : new ApiError('http', String(err))));
    fetch('/postal-areas.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => !cancelled && setAreas(g))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const defaults = useMemo(() => (meta ? defaultFilters(meta) : null), [meta]);
  const bounds = useMemo(() => (listings ? dataBounds(listings) : null), [listings]);
  const shown = useMemo(
    () => (listings && filters ? sortListings(applyFilters(listings, filters, saved), filters.sort) : []),
    [listings, filters, saved],
  );
  // "N of M homes": M counts removed listings only while they are shown.
  const activeCount = useMemo(() => {
    if (!listings) return 0;
    return filters?.hideRemoved === false ? listings.length : listings.filter((l) => !l.removed).length;
  }, [listings, filters?.hideRemoved]);
  const zipNames = useMemo(() => {
    const names = {};
    for (const f of areas?.features ?? []) names[f.properties.zip] = f.properties.name;
    return names;
  }, [areas]);

  // Keep the URL in step with the filters and the open listing (bookmarkable views).
  useEffect(() => {
    if (!filters || !defaults) return;
    const q = new URLSearchParams(toQuery(filters, defaults));
    if (selectedId) q.set('listing', String(selectedId));
    const text = q.toString();
    window.history.replaceState(null, '', text ? `?${text}` : window.location.pathname);
  }, [filters, defaults, selectedId]);

  const update = useCallback((patch) => setFilters((f) => ({ ...f, ...patch })), []);
  const reset = useCallback(() => setFilters((f) => ({ ...defaults, sort: f.sort })), [defaults]);
  const onHover = useCallback(
    (id, source) => setHover((h) => (h.id === id && h.source === source ? h : { id, source })),
    [],
  );
  const onSelect = useCallback((id) => setSelectedId(id), []);
  const onClose = useCallback(() => setSelectedId(null), []);

  const selectedSummary = useMemo(
    () => listings?.find((l) => l.card_id === selectedId) ?? null,
    [listings, selectedId],
  );
  // Previous / next in the current (filtered, sorted) list.
  const position = useMemo(() => shown.findIndex((l) => l.card_id === selectedId), [shown, selectedId]);
  const step = useCallback(
    (delta) => {
      if (position < 0) return;
      const next = shown[position + delta];
      if (next) setSelectedId(next.card_id);
    },
    [shown, position],
  );

  return (
    <div className="app">
      <Header
        meta={meta}
        shown={shown.length}
        total={activeCount}
        filters={filters}
        defaults={defaults}
        bounds={bounds}
        zipNames={zipNames}
        listings={listings}
        saved={saved}
        activeCount={filters && defaults ? activeFilterCount(filters, defaults) : 0}
        onChange={update}
        onReset={reset}
      />
      <main className="main">
        <section className="map-wrap" aria-label="Map">
          {!listings && !error && <RuneCircle />}
          <MapView
            listings={shown}
            places={meta?.places ?? []}
            areas={areas}
            hoverId={hover.id}
            selectedId={selectedId}
            saved={saved}
            onHover={onHover}
            onSelect={onSelect}
          />
        </section>
        <ListPanel
          listings={shown}
          loading={!error && !listings}
          error={error}
          sort={filters?.sort ?? 'year'}
          onSort={(sort) => update({ sort })}
          hover={hover}
          selectedId={selectedId}
          onHover={onHover}
          onSelect={onSelect}
          onReset={reset}
          noPhotos={meta?.noPhotos ?? false}
          saved={saved}
          onToggleSaved={toggleSaved}
          onlySaved={filters?.onlySaved ?? false}
          onOnlySaved={(onlySaved) => update({ onlySaved })}
        />
      </main>
      {selectedId != null && (
        <DetailDrawer
          id={selectedId}
          summary={selectedSummary}
          places={meta?.places ?? []}
          noPhotos={meta?.noPhotos ?? false}
          zipNames={zipNames}
          onClose={onClose}
          position={position}
          count={shown.length}
          onStep={step}
          isSaved={saved.has(selectedId)}
          onToggleSaved={() => toggleSaved(selectedId)}
        />
      )}
    </div>
  );
}
