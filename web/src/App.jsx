import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BootSequence from './components/BootSequence.jsx';
import DetailDrawer from './components/DetailDrawer.jsx';
import Filters from './components/Filters.jsx';
import Header from './components/Header.jsx';
import ListPanel from './components/ListPanel.jsx';
import MapView from './components/MapView.jsx';
import Radar from './components/Radar.jsx';
import { ApiError, getJson } from './lib/api.js';
import {
  activeFilterCount,
  applyFilters,
  dataBounds,
  defaultFilters,
  fromQuery,
  median,
  sortListings,
  toQuery,
} from './lib/filters.js';
import { SHORTLIST_KEY, loadShortlist, parseShortlist, saveShortlist, toggled } from './lib/shortlist.js';
import { applyTheme, loadTheme, saveTheme } from './lib/theme.js';

// Three columns (parameters | map | targets) from this width; same value as tokens.css notes.
const WIDE_QUERY = '(min-width: 1360px)';
// The boot sequence plays once per browser tab; a reload goes straight to the deploy animation.
const BOOT_KEY = 'tcb.boot.v1';
const DEPLOY_MS = 1300;
const NV_SWAP_MS = 190; // the theme flips while the effect is at its brightest
const NV_FX_MS = 720;

function selectedFromUrl() {
  const id = new URLSearchParams(window.location.search).get('listing');
  return id && /^\d+$/.test(id) ? Number(id) : null;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function firstPhase() {
  if (reducedMotion()) return 'ready';
  try {
    return sessionStorage.getItem(BOOT_KEY) === '1' ? 'deploy' : 'boot';
  } catch {
    return 'boot';
  }
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Keys typed into a field are never shortcuts. */
function isTyping(el) {
  return !!el?.closest?.('input, select, textarea, [contenteditable="true"]');
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
  const [phase, setPhase] = useState(firstPhase);
  const wide = useMediaQuery(WIDE_QUERY);
  const [paramsOpen, setParamsOpen] = useState(false);
  const paramsButtonRef = useRef(null);

  // Theme: RECON or night vision, remembered in this browser.
  const [theme, setTheme] = useState(loadTheme);
  const [nvFx, setNvFx] = useState(null); // 'on' | 'off' while the goggles effect plays
  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const fxTimers = useRef([]);
  useEffect(() => () => fxTimers.current.forEach(clearTimeout), []);
  const toggleNv = useCallback(() => {
    if (fxTimers.current.length) return; // one switch at a time
    const next = themeRef.current === 'nv' ? 'recon' : 'nv';
    if (reducedMotion()) {
      setTheme(next);
      return;
    }
    setNvFx(next === 'nv' ? 'on' : 'off');
    fxTimers.current = [
      setTimeout(() => setTheme(next), NV_SWAP_MS),
      setTimeout(() => {
        setNvFx(null);
        fxTimers.current = [];
      }, NV_FX_MS),
    ];
  }, []);

  // N toggles night vision (not while typing, and not during the boot sequence).
  useEffect(() => {
    const onKey = (e) => {
      if (phase === 'boot' || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === 'n' || e.key === 'N') toggleNv();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, toggleNv]);

  // Boot → deploy (the console opens up) → ready.
  const bootDone = useCallback(() => {
    try {
      sessionStorage.setItem(BOOT_KEY, '1');
    } catch {
      /* fine: the intro just plays again next time */
    }
    setPhase(reducedMotion() ? 'ready' : 'deploy');
  }, []);
  useEffect(() => {
    if (phase !== 'deploy') return undefined;
    const t = setTimeout(() => setPhase('ready'), DEPLOY_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Shortlist (priority targets): saved in this browser only; follow changes made in other tabs.
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
  // "N / M targets": M counts removed listings only while they are shown.
  const activeCount = useMemo(() => {
    if (!listings) return 0;
    return filters?.hideRemoved === false ? listings.length : listings.filter((l) => !l.removed).length;
  }, [listings, filters?.hideRemoved]);
  const medianRent = useMemo(() => median(shown.map((l) => l.rent_eur)), [shown]);
  const zipNames = useMemo(() => {
    const names = {};
    for (const f of areas?.features ?? []) names[f.properties.zip] = f.properties.name;
    return names;
  }, [areas]);
  const paramCount = filters && defaults ? activeFilterCount(filters, defaults) : 0;

  // Keep the URL in step with the filters and the open listing (bookmarkable views).
  useEffect(() => {
    if (!filters || !defaults) return;
    const q = new URLSearchParams(toQuery(filters, defaults));
    if (selectedId) q.set('listing', String(selectedId));
    const text = q.toString();
    window.history.replaceState(null, '', text ? `?${text}` : window.location.pathname);
  }, [filters, defaults, selectedId]);

  // The slide-out parameters panel only exists in narrow windows.
  useEffect(() => {
    if (wide) setParamsOpen(false);
  }, [wide]);
  const closeParams = useCallback(() => {
    setParamsOpen(false);
    paramsButtonRef.current?.focus();
  }, []);

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

  const showParams = wide || paramsOpen;

  return (
    <div className={`app phase-${phase} ${nvFx ? `nv-switching nv-switching-${nvFx}` : ''}`}>
      <Header
        meta={meta}
        shown={shown.length}
        total={activeCount}
        filters={filters}
        saved={saved}
        medianRent={medianRent}
        onChange={update}
        nv={theme === 'nv'}
        onToggleNv={toggleNv}
        wide={wide}
        paramsOpen={paramsOpen}
        paramCount={paramCount}
        paramsButtonRef={paramsButtonRef}
        onParams={() => setParamsOpen((o) => !o)}
        onReset={reset}
      />
      <main className="main">
        {showParams && (
          <Filters
            overlay={!wide}
            filters={filters}
            defaults={defaults}
            bounds={bounds}
            zips={meta?.zips ?? []}
            zipNames={zipNames}
            listings={listings}
            saved={saved}
            activeCount={paramCount}
            onChange={update}
            onReset={reset}
            onClose={closeParams}
          />
        )}
        <section className="map-wrap frame" aria-label="Tactical map">
          {!listings && !error && phase !== 'boot' && <Radar />}
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
          {phase === 'deploy' && <div className="map-sweep" aria-hidden="true" />}
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
          animateIn={phase !== 'boot'}
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
      <div className="nv-goggles" aria-hidden="true" />
      {nvFx && <div className={`nv-fx nv-fx-${nvFx}`} aria-hidden="true" />}
      {phase === 'boot' && (
        <BootSequence meta={meta} count={listings ? activeCount : null} error={error} saved={saved} onDone={bootDone} />
      )}
    </div>
  );
}
