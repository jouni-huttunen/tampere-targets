import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import BootSequence from './components/BootSequence.jsx';
import DetailDrawer from './components/DetailDrawer.jsx';
import FieldManual from './components/FieldManual.jsx';
import Filters from './components/Filters.jsx';
import Header from './components/Header.jsx';
import ListPanel from './components/ListPanel.jsx';
import MapView from './components/MapView.jsx';
import PanelRail from './components/PanelRail.jsx';
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
import { splitByView, stepIndex } from './lib/inview.js';
import { SHORTLIST_KEY, loadShortlist, parseShortlist, saveShortlist, toggled } from './lib/shortlist.js';
import { listingFromSearch, profileState, searchWithListing, stepsToMain } from './lib/history.js';
import { applyTheme, loadTheme, saveTheme } from './lib/theme.js';
import { loadPanels, savePanels } from './lib/panels.js';
import { PHONE_QUERY, STACKED_QUERY, WIDE_QUERY } from './lib/layout.js';
import { moveInBucket } from './lib/movein.js';
import { keyAction } from './lib/keys.js';

// The boot sequence plays once per browser tab; a reload goes straight to the deploy animation.
const BOOT_KEY = 'tcb.boot.v1';
const DEPLOY_MS = 1300;
const NV_SWAP_MS = 190; // the theme flips while the effect is at its brightest
const NV_FX_MS = 720;

const NO_PLACES = [];
const NO_ZIPS = [];

function selectedFromUrl() {
  return listingFromSearch(window.location.search);
}

const urlWith = (id) => `${window.location.pathname}${searchWithListing(window.location.search, id)}`;

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
  const [infra, setInfra] = useState(null); // ground intel for NV (FR-43), loaded on first use
  const [filters, setFilters] = useState(null);
  const [hover, setHover] = useState({ id: null, source: null });
  const [selectedId, setSelectedId] = useState(selectedFromUrl);
  const [saved, setSaved] = useState(() => loadShortlist());
  const [phase, setPhase] = useState(firstPhase);
  const wide = useMediaQuery(WIDE_QUERY);
  const stacked = useMediaQuery(STACKED_QUERY);
  const phone = useMediaQuery(PHONE_QUERY);
  // Where the open target was picked: 'map', 'list' or null (from the URL).
  const [selectSource, setSelectSource] = useState(null);
  // Card ids with a marker on the visible map, reported by the map after each pan or zoom (FR-41).
  const [mapView, setMapView] = useState(null);
  const mapRef = useRef(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const paramsButtonRef = useRef(null);
  // The field manual (FR-50): ? or the keys button in the header.
  const [manualOpen, setManualOpen] = useState(false);
  const toggleManual = useCallback(() => setManualOpen((o) => !o), []);
  const closeManual = useCallback(() => setManualOpen(false), []);

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

  // The ground intel (stops and stores) is only shown in NV: fetch it the first time NV is on.
  const nv = theme === 'nv';
  useEffect(() => {
    if (!nv || infra) return undefined;
    let cancelled = false;
    fetch('/infra.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setInfra(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nv, infra]);

  // Keys (lib/keys.js; not while typing, not with Ctrl / Alt / Cmd, not during the boot sequence):
  // V or N toggles night vision; D or S opens the next target and A or W the previous one (FR-44),
  // like › and ‹ in the profile; with no profile open, D/S opens the first target in the list and
  // A/W the last. Q / E show or hide the side panels, F fits the map to the targets, R or M
  // switches the base map and C works like Esc: it closes the topmost intel card, slide-out
  // parameters or profile (FR-47). H opens the field manual (FR-50), which then takes the keys
  // itself.
  const keyState = useRef(null);
  const mapCommands = useRef(null); // { fit, nextBaseMap } from MapView, for F and R / M
  useEffect(() => {
    const onKey = (e) => {
      if (phase === 'boot' || isTyping(e.target)) return;
      const action = keyAction(e);
      if (!action) return;
      const k = keyState.current;
      if (action === 'manual') {
        e.preventDefault();
        k.toggleManual();
        return;
      }
      if (k.manualOpen) return;
      e.preventDefault();
      if (action === 'close') {
        // C is a second Esc (the user's choice): send an Esc from where the key was pressed, so
        // the same handlers close the same topmost thing (intel card, slide-out parameters,
        // profile) in the same order. App itself ignores Esc, so this does not loop.
        (e.target ?? window).dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
        );
        return;
      }
      if (action === 'nv') toggleNv();
      else if (action === 'params' || action === 'list') k.togglePanel(action);
      else if (action === 'fit') mapCommands.current?.fit();
      else if (action === 'basemap') mapCommands.current?.nextBaseMap();
      else {
        const dir = action === 'next' ? 1 : -1;
        if (k.selectedId != null) k.step(dir);
        else {
          const target = dir > 0 ? k.stepList[0] : k.stepList[k.stepList.length - 1];
          if (target) k.openTarget(target.card_id, 'list');
        }
      }
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
        // The inferred move-in month (or "later" / "unknown") once per listing, for the chips.
        setListings(rows.map((l) => ({ ...l, move_in: moveInBucket(l, m.windowCutoff) })));
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
  // The list and the map follow a deferred copy of the filters: a slider thumb moves at once and
  // the expensive part (filter, sort, ~400 rows, the markers) catches up when there is time,
  // skipping in-between values while the thumb is dragged.
  const deferredFilters = useDeferredValue(filters);
  const shown = useMemo(
    () =>
      listings && deferredFilters
        ? sortListings(applyFilters(listings, deferredFilters, saved), deferredFilters.sort)
        : [],
    [listings, deferredFilters, saved],
  );
  // "N / M targets": M counts the listings still on Oikotie (withdrawn ones are never shown).
  const activeCount = useMemo(() => (listings ? listings.filter((l) => !l.removed).length : 0), [listings]);
  const medianRent = useMemo(() => median(shown.map((l) => l.rent_eur)), [shown]);
  const zipNames = useMemo(() => {
    const names = {};
    for (const f of areas?.features ?? []) names[f.properties.zip] = f.properties.name;
    return names;
  }, [areas]);
  const paramCount = filters && defaults ? activeFilterCount(filters, defaults) : 0;

  // Keep the address in step with the filters and the open target (bookmarkable views). Filter
  // changes rewrite the current history entry (keeping its state), never add one. Deferred, so a
  // dragged slider does not rewrite the address on every pixel.
  useEffect(() => {
    if (!deferredFilters || !defaults) return;
    const q = new URLSearchParams(toQuery(deferredFilters, defaults));
    if (selectedId) q.set('listing', String(selectedId));
    const text = q.toString();
    window.history.replaceState(window.history.state, '', text ? `?${text}` : window.location.pathname);
  }, [deferredFilters, defaults, selectedId]);

  // Browser history (FR-40). A target opened from a link gets a main-view entry under it, so
  // Back closes the profile instead of leaving the site (once per tab: a reload keeps the stack).
  useEffect(() => {
    const id = selectedFromUrl();
    if (id == null || window.history.state?.tcb) return;
    window.history.replaceState({ tcb: 'main' }, '', urlWith(null));
    window.history.pushState(profileState(null, id), '', urlWith(id));
  }, []);
  // Back / Forward: the address decides which profile is open (or none).
  useEffect(() => {
    const onPop = () => setSelectedId(selectedFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // The slide-out parameters panel only exists in narrow windows.
  useEffect(() => {
    if (wide) setParamsOpen(false);
  }, [wide]);
  const toggleParams = useCallback(() => setParamsOpen((o) => !o), []);

  // Side panels shown or folded into a rail (FR-46), remembered in this browser. They fold only
  // where they are a column beside the map: the parameters in a wide window, the list above the
  // stacked (phone) layout. A button click moves focus to its counterpart (rail ↔ hide button).
  const [panels, setPanels] = useState(loadPanels);
  useEffect(() => savePanels(panels), [panels]);
  const paramsFolded = wide && !panels.params;
  const listFolded = !stacked && !panels.list;
  const paramsHideRef = useRef(null);
  const paramsRailRef = useRef(null);
  const listHideRef = useRef(null);
  const listRailRef = useRef(null);
  const focusNext = useRef(null);
  useEffect(() => {
    focusNext.current?.current?.focus();
    focusNext.current = null;
  }, [panels]);
  const setPanel = useCallback((which, shown, focusRef) => {
    focusNext.current = focusRef ?? null;
    setPanels((p) => (p[which] === shown ? p : { ...p, [which]: shown }));
  }, []);
  const hideParams = useCallback(() => setPanel('params', false, paramsRailRef), [setPanel]);
  const unfoldParams = useCallback(() => setPanel('params', true, paramsHideRef), [setPanel]);
  const hideList = useCallback(() => setPanel('list', false, listRailRef), [setPanel]);
  const unfoldList = useCallback(() => setPanel('list', true, listHideRef), [setPanel]);
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
  // Opening a target (from the list, the map or ‹ ›) adds one history entry.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const openTarget = useCallback((id, source) => {
    if (source) setSelectSource(source);
    if (id === selectedRef.current) return;
    window.history.pushState(profileState(window.history.state, id), '', urlWith(id));
    setSelectedId(id);
  }, []);
  const onSelect = useCallback((id, source = 'list') => openTarget(id, source), [openTarget]);
  // × and Esc go straight back to the main view: as many entries back as profiles were opened.
  const onClose = useCallback(() => {
    const steps = stepsToMain(window.history.state);
    if (steps > 0) {
      window.history.go(-steps); // popstate then closes the profile
    } else {
      window.history.replaceState(window.history.state, '', urlWith(null));
      setSelectedId(null);
    }
  }, []);
  // Phone layout: a target picked on the map goes back to the map when its profile closes (by ×,
  // Esc or Back, after the profile has handed focus back), not to wherever the page happened to be.
  const stackedRef = useRef(stacked);
  stackedRef.current = stacked;
  const sourceRef = useRef(selectSource);
  sourceRef.current = selectSource;
  const prevSelected = useRef(selectedId);
  useEffect(() => {
    const was = prevSelected.current;
    prevSelected.current = selectedId;
    if (was == null || selectedId != null || !stackedRef.current || sourceRef.current !== 'map') return;
    setHover({ id: null, source: null }); // a tap never sends "pointer left": drop the marker tooltip
    requestAnimationFrame(() => mapRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }));
  }, [selectedId]);
  const onSort = useCallback((sort) => update({ sort }), [update]);
  const onOnlySaved = useCallback((onlySaved) => update({ onlySaved }), [update]);

  const selectedSummary = useMemo(
    () => listings?.find((l) => l.card_id === selectedId) ?? null,
    [listings, selectedId],
  );
  // The list: targets on the visible map first, then the rest (FR-41). It follows the map also
  // while a profile is open (the user's choice: a live list over a locked one); the map pans for a
  // selection only near its edge, which keeps the reshuffles rare.
  const { ordered, inViewCount } = useMemo(() => splitByView(shown, mapView), [shown, mapView]);
  // Previous / next (‹ › in the profile): only the targets on the visible map, in list order (the
  // user's choice); all of them when every target is in view. A target off the map has no ‹ ›
  // (position -1) until the map has centred it and it is in view.
  const stepList = useMemo(
    () => (inViewCount == null ? ordered : ordered.slice(0, inViewCount)),
    [ordered, inViewCount],
  );
  const position = useMemo(() => stepList.findIndex((l) => l.card_id === selectedId), [stepList, selectedId]);
  const step = useCallback(
    (delta) => {
      // Wraps round: › on the last target goes to the first, ‹ on the first to the last.
      const next = stepList[stepIndex(position, delta, stepList.length)];
      if (next) openTarget(next.card_id); // ‹ › adds a history entry too (the user's choice)
    },
    [stepList, position, openTarget],
  );
  // Q in a narrower window opens or closes the slide-out parameters instead; E does nothing in
  // the stacked layout, where the list is not a column.
  const togglePanel = (which) => {
    if (which === 'params') {
      if (wide) setPanel('params', !panels.params);
      else toggleParams();
    } else if (!stacked) setPanel('list', !panels.list);
  };
  keyState.current = { selectedId, step, stepList, openTarget, togglePanel, manualOpen, toggleManual };

  const showParams = wide || paramsOpen;

  return (
    <div
      className={`app phase-${phase} ${nvFx ? `nv-switching nv-switching-${nvFx}` : ''} ${paramsFolded ? 'params-folded' : ''} ${listFolded ? 'list-folded' : ''}`}
    >
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
        onParams={toggleParams}
        onReset={reset}
        manualOpen={manualOpen}
        onManual={toggleManual}
      />
      <main className="main">
        {paramsFolded && (
          <PanelRail
            ref={paramsRailRef}
            side="left"
            index="01"
            label="mission parameters"
            short="Params"
            count={paramCount || null}
            countLabel="active"
            shortcut="Q"
            onOpen={unfoldParams}
          />
        )}
        {showParams && !paramsFolded && (
          <Filters
            overlay={!wide}
            filters={filters}
            bounds={bounds}
            zips={meta?.zips ?? NO_ZIPS}
            zipNames={zipNames}
            listings={listings}
            windowCutoff={meta?.windowCutoff}
            saved={saved}
            activeCount={paramCount}
            onChange={update}
            onReset={reset}
            onClose={closeParams}
            onHide={wide ? hideParams : undefined}
            hideRef={paramsHideRef}
          />
        )}
        <section className="map-wrap frame" aria-label="Tactical map" ref={mapRef}>
          {!listings && !error && phase !== 'boot' && <Radar />}
          <MapView
            listings={shown}
            places={meta?.places ?? NO_PLACES}
            areas={areas}
            infra={infra}
            nv={nv}
            hoverId={hover.id}
            selectedId={selectedId}
            saved={saved}
            onHover={onHover}
            onSelect={onSelect}
            onViewChange={setMapView}
            onLockLost={onClose}
            commandsRef={mapCommands}
          />
          {phase === 'deploy' && <div className="map-sweep" aria-hidden="true" />}
        </section>
        {listFolded ? (
          <PanelRail
            ref={listRailRef}
            side="right"
            index="03"
            label="the target list"
            short="Targets"
            count={inViewCount ?? ordered.length}
            countLabel={inViewCount != null ? 'in view' : 'targets'}
            shortcut="E"
            onOpen={unfoldList}
          />
        ) : (
        <ListPanel
          listings={ordered}
          inViewCount={inViewCount}
          loading={!error && !listings}
          error={error}
          sort={filters?.sort ?? 'year'}
          onSort={onSort}
          hover={hover}
          selectedId={selectedId}
          onHover={onHover}
          onSelect={onSelect}
          onReset={reset}
          noPhotos={meta?.noPhotos ?? false}
          saved={saved}
          onToggleSaved={toggleSaved}
          onlySaved={filters?.onlySaved ?? false}
          onOnlySaved={onOnlySaved}
          animateIn={phase !== 'boot'}
          stacked={stacked}
          selectSource={selectSource}
          onHide={stacked ? undefined : hideList}
          hideRef={listHideRef}
        />
        )}
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
          count={stepList.length}
          onStep={step}
          swipe={phone}
          isSaved={saved.has(selectedId)}
          onToggleSaved={() => toggleSaved(selectedId)}
        />
      )}
      {manualOpen && <FieldManual onClose={closeManual} />}
      <div className="nv-goggles" aria-hidden="true" />
      {nvFx && <div className={`nv-fx nv-fx-${nvFx}`} aria-hidden="true" />}
      {phase === 'boot' && (
        <BootSequence meta={meta} count={listings ? activeCount : null} error={error} saved={saved} onDone={bootDone} />
      )}
    </div>
  );
}
