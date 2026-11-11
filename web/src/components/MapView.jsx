import L from 'leaflet';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, LayerGroup, LayersControl, MapContainer, Marker, Pane, ScaleControl, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { fmtM2, yearBin } from '../lib/format.js';
import { sameIds } from '../lib/inview.js';
import { groupByPosition, ringOffsets, ringRadius } from '../lib/spread.js';
import Legend from './Legend.jsx';

const CENTER = [61.4978, 23.761];
const MAX_ZOOM = 19;
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI_CANVAS = 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community';
const ESRI_IMAGERY = 'Esri, Maxar, Earthstar Geographics, and the GIS user community';
const OPENTOPO = `${OSM}, SRTM | style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`;
const ARC = 'https://server.arcgisonline.com/ArcGIS/rest/services';
// Keyless tile services, tinted in CSS (tokens --tiles-*) to the console theme (RECON or NV).
// CARTO was the original pick, but since November 2026 its tiles need an API key.
// nativeZoom: the deepest zoom the server has tiles for; Leaflet upscales beyond it.
const BASE_MAPS = [
  {
    name: 'Night ops',
    url: `${ARC}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ARC}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    // Terrain relief (Pyynikki ridge, Pispala slopes) blended softly into the dark canvas.
    relief: `${ARC}/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}`,
    nativeZoom: 16,
    tint: 'tiles-night',
    labelTint: 'labels-night',
    attribution: ESRI_CANVAS,
  },
  {
    name: 'Recon sat',
    url: `${ARC}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ARC}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    nativeZoom: 19,
    tint: 'tiles-sat',
    labelTint: 'labels-sat',
    attribution: ESRI_IMAGERY,
  },
  {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    nativeZoom: 17,
    tint: 'tiles-terrain',
    attribution: OPENTOPO,
  },
];
const PAAVO = 'Postal areas &copy; <a href="https://www.stat.fi/en/">Statistics Finland</a> (CC BY 4.0)';

const R = { base: 6.5, hover: 10, halo: 12 };
// Selecting a target moves the map only if its marker is closer than this to an edge of the visible
// map (or off it), and then only far enough to bring it this far inside: room for the 96 px reticle.
const EDGE_MARGIN = 48;
// The map's own pan to a selection counts as its own (it never releases the lock) for at most this.
const SELF_MOVE_MS = 1500;

export default memo(MapView);

// Touch devices (phones, tablets) skip the blended terrain-shading layer: one tile layer fewer
// per view and no full-map blend, which is costly on phone GPUs. Desktop keeps it.
const LIGHT_GRAPHICS = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

function MapView({ listings, places, areas, hoverId, selectedId, saved, onHover, onSelect, onViewChange, onLockLost }) {
  const [map, setMap] = useState(null);
  const readoutRef = useRef(null);
  const located = useMemo(() => listings.filter((l) => l.lat != null && l.lon != null), [listings]);

  const fit = () => {
    if (!map || located.length === 0) return;
    const bounds = L.latLngBounds(located.map((l) => [l.lat, l.lon]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  };

  return (
    <>
      <MapContainer ref={setMap} center={CENTER} zoom={13} minZoom={10} maxZoom={MAX_ZOOM} className="map" zoomSnap={0.5}>
        <Pane name="postal" style={{ zIndex: 350 }} />
        <Pane name="labels" style={{ zIndex: 380, pointerEvents: 'none' }} />
        <SizeWatcher />
        <MapLayers areas={areas} />
        <ScaleControl position="bottomright" imperial={false} maxWidth={140} />
        <PlacePinsLayer places={places} />
        <ListingMarkers
          listings={located}
          hoverId={hoverId}
          selectedId={selectedId}
          saved={saved}
          onHover={onHover}
          onSelect={onSelect}
          onViewChange={onViewChange}
          onLockLost={onLockLost}
        />
        <ZoomStrike />
        <CursorReadout target={readoutRef} />
      </MapContainer>
      <div className="map-vignette" aria-hidden="true" />
      <p className="map-tag" aria-hidden="true">
        <span className="panel-index">02</span> Tactical map · Tampere AO
      </p>
      <p className="map-readout" ref={readoutRef} aria-hidden="true">
        &nbsp;
      </p>
      {located.length > 0 && (
      <button
        type="button"
        className="map-fit"
        onClick={fit}
        disabled={!map || located.length === 0}
        title="Zoom the map to the targets in the list"
      >
        <svg className="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          Fit {located.length} {located.length === 1 ? 'target' : 'targets'}
        </span>
      </button>
      )}
      <LegendPanel />
    </>
  );
}

// Tiles: load while a finger is still dragging (Leaflet waits for it to stop on phones, which
// leaves blank edges mid-pan) and keep a larger ring of loaded tiles, so panning back is instant.
const TILE_OPTS = { updateWhenIdle: false, keepBuffer: 4 };

/**
 * Base maps and the sectors overlay. Memoised: a marker hover re-renders MapView, and none of
 * this depends on it.
 */
const MapLayers = memo(function MapLayers({ areas }) {
  return (
    <LayersControl position="topright">
      {BASE_MAPS.map((b, i) => (
        <LayersControl.BaseLayer key={b.name} checked={i === 0} name={b.name}>
          <LayerGroup>
            <TileLayer url={b.url} maxZoom={MAX_ZOOM} maxNativeZoom={b.nativeZoom} attribution={b.attribution} className={b.tint} {...TILE_OPTS} />
            {b.relief && !LIGHT_GRAPHICS && (
              <TileLayer url={b.relief} maxZoom={MAX_ZOOM} maxNativeZoom={16} className="tiles-relief" {...TILE_OPTS} />
            )}
            {b.labels && (
              <TileLayer url={b.labels} pane="labels" maxZoom={MAX_ZOOM} maxNativeZoom={b.nativeZoom} className={b.labelTint} {...TILE_OPTS} />
            )}
          </LayerGroup>
        </LayersControl.BaseLayer>
      ))}
      {areas && (
        <LayersControl.Overlay name="Sectors (postal areas)">
          <GeoJSON data={areas} pane="postal" className="postal-area" attribution={PAAVO} onEachFeature={bindAreaTooltip} />
        </LayersControl.Overlay>
      )}
    </LayersControl>
  );
});

/** Leaflet measures its container once; tell it whenever the container's size changes. */
function SizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function textNode(text, className) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function bindAreaTooltip(feature, layer) {
  const { zip, name } = feature.properties;
  layer.bindTooltip(textNode(`${zip} ${name}`, 'tip-text'), { sticky: true, className: 'map-tip', direction: 'top' });
}

// Reference points, with the same short codes the list uses for its ranges:
// HQ for the centre (Keskustori), RAIL for the railway station.
const PLACE_CODES = { centre: 'HQ', station: 'RAIL' };

const PlacePinsLayer = memo(PlacePins);
const LegendPanel = memo(Legend);

function PlacePins({ places }) {
  const icons = useMemo(
    () =>
      Object.fromEntries(
        places.map((p) => [
          p.key,
          L.divIcon({ className: 'place-pin', html: '<span class="place-diamond"></span>', iconSize: [24, 24] }),
        ]),
      ),
    [places],
  );
  return places.map((p) => (
    <Marker key={p.key} position={[p.lat, p.lon]} icon={icons[p.key]} title={p.name} keyboard={false} zIndexOffset={-100}>
      {/* The two places are 700 m apart: label the centre to the left, the station to the right. */}
      <Tooltip
        permanent
        direction={p.key === 'centre' ? 'left' : 'right'}
        offset={[p.key === 'centre' ? -14 : 14, 0]}
        className="place-label"
      >
        <span className="place-code">{PLACE_CODES[p.key] ?? 'REF'}</span> {p.key === 'station' ? 'Station' : p.name}
      </Tooltip>
    </Marker>
  ));
}

/**
 * Listing markers are managed directly in Leaflet (one circle per listing, plus a halo for
 * new ones). Colours come from CSS classes (tokens), so hover and selection only toggle
 * classes and radii instead of re-rendering hundreds of React components.
 *
 * Homes in the same building share one coordinate; such groups are laid out on a ring of
 * pixels around the true point (marked by a faint dashed circle) and re-laid out on zoom.
 *
 * After every pan or zoom (moveend: never during a drag) and every new list it reports which
 * targets have their marker on the visible map (onViewChange, a Set of card ids; changes only).
 * When the operator moves the map (drag, zoom, Fit; not the map's own pans to a selection) so
 * that the locked target leaves the visible map, it calls onLockLost.
 */
function ListingMarkers({ listings, hoverId, selectedId, saved, onHover, onSelect, onViewChange, onLockLost }) {
  const map = useMap();
  const layers = useRef(new Map()); // card_id → { marker, halo, listing }: markers on the map now
  const cache = useRef(new Map()); // every marker ever made, reused when a filter brings it back
  const rings = useRef(new Map()); // "lat,lon,n" → faint circle marking a shared point
  const groups = useRef([]); // [{ center: LatLng, ids: [...] }] with more than one id
  const group = useRef(null);
  const handlers = useRef({ onHover, onSelect, onViewChange, onLockLost });
  handlers.current = { onHover, onSelect, onViewChange, onLockLost };
  // While the map pans to a selection (not the operator's move): when that flag expires, else 0.
  const selfMove = useRef(0);
  const lockLostFor = useRef(null); // the target whose lock was released by a move
  const selectedAt = useRef(0); // when the current target was locked (performance.now())
  const moveStartedAt = useRef(0); // when the last map move began
  const lastView = useRef(null); // the last reported Set of ids on the visible map
  const state = useRef({ hoverId, selectedId, saved });
  state.current = { hoverId, selectedId, saved };
  const lock = useRef(null); // the TARGET LOCKED reticle on the selected marker
  const lockId = useRef(null);
  const dragging = useRef(false);
  const haloRenderer = useRef(null);

  useEffect(() => {
    group.current = L.featureGroup().addTo(map);
    // New-contact halos get their own pane and SVG, under the markers. The pane pulses by fading
    // as a whole (a GPU opacity change); animating the rings inside the marker SVG would repaint
    // every marker on every frame.
    const haloPane = map.getPane('halos') ?? map.createPane('halos');
    haloPane.style.zIndex = '395';
    haloPane.style.pointerEvents = 'none';
    haloRenderer.current = L.svg({ pane: 'halos' });
    const relayout = () => layout();
    // While the map is dragged the pointer sweeps over many markers: no hovers then (each one
    // re-renders the list and opens a tooltip). Hover works again as soon as the drag ends.
    const container = map.getContainer();
    const onDragStart = () => {
      dragging.current = true;
      container.classList.add('is-dragging');
      if (state.current.hoverId != null) handlers.current.onHover(null, 'map');
    };
    const onDragEnd = () => {
      dragging.current = false;
      container.classList.remove('is-dragging');
    };
    map.on('zoomend', relayout);
    map.on('dragstart', onDragStart);
    // moveend as well: it always ends a drag (also after the inertia glide), even if a dragend
    // is missed, so hovers can never stay switched off.
    map.on('dragend moveend', onDragEnd);
    // Leaflet fires zoomend before moveend, so the rings are laid out before the view is read.
    // A container resize ends in moveend too. If the operator's move took the locked target off
    // the visible map (or under the profile), the lock is released (the user's rule, FR-41).
    const onMoveStart = () => {
      moveStartedAt.current = performance.now();
    };
    const onMoveEnd = () => {
      reportView();
      const id = state.current.selectedId;
      const inView = id != null && !!lastView.current?.has(id);
      // The map's own pan to a selection: it ends with the target in view. A moveend before that
      // must not count as the operator's; the flag also expires.
      if (selfMove.current) {
        if (id == null || inView || performance.now() > selfMove.current) selfMove.current = 0;
        return;
      }
      if (id == null || inView || !layers.current.has(id)) return;
      // A move that began before this target was locked (a zoom still finishing when it was
      // picked; it can swallow the pan to the target): bring the target into view instead.
      if (moveStartedAt.current < selectedAt.current) {
        panToSelected();
        return;
      }
      // Once per target: closing goes back in browser history, which completes a moment later,
      // and a wheel burst can end in several moveends before that.
      if (lockLostFor.current === id) return;
      lockLostFor.current = id;
      handlers.current.onLockLost?.();
    };
    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('zoomend', relayout);
      map.off('dragstart', onDragStart);
      map.off('dragend moveend', onDragEnd);
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
      lastView.current = null;
      container.classList.remove('is-dragging');
      group.current.remove();
      lock.current?.remove();
      lock.current = null;
      lockId.current = null;
      layers.current.clear();
      cache.current.clear();
      rings.current.clear();
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Keep the lock reticle on the selected marker. A new selection draws a fresh reticle (so the
   * lock-on animation plays again); a relayout or a new filter only moves the existing one.
   */
  function syncLock(restart = false) {
    const id = state.current.selectedId;
    const entry = id != null ? layers.current.get(id) : null;
    if (!entry) {
      lock.current?.remove();
      lock.current = null;
      lockId.current = null;
      return;
    }
    if (lock.current && lockId.current === id && !restart) {
      lock.current.setLatLng(entry.marker.getLatLng());
      return;
    }
    lock.current?.remove();
    lock.current = L.marker(entry.marker.getLatLng(), {
      icon: lockIcon(entry.listing),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000,
    }).addTo(map);
    lockId.current = id;
  }

  /** Where each spread-out marker goes at the current zoom (shared points only). */
  function ringPositions() {
    const out = new Map();
    for (const { center, ids } of groups.current) {
      const origin = map.latLngToLayerPoint(center);
      const offsets = ringOffsets(ids.length);
      ids.forEach((id, i) => out.set(id, map.layerPointToLatLng(origin.add(L.point(offsets[i][0], offsets[i][1])))));
    }
    return out;
  }

  /** Move a marker (and its halo) only if it is not there already: every move redraws its path. */
  function place(id, at) {
    const entry = layers.current.get(id);
    if (!entry || entry.marker.getLatLng().equals(at)) return;
    entry.marker.setLatLng(at);
    entry.halo?.setLatLng(at);
  }

  /**
   * The part of the map the target profile leaves visible, in container pixels from the left:
   * { width, height, mapWidth, hidden }. The profile docks over the map's right edge (offsetLeft:
   * its resting place, not where its slide-in animation is now). When it would leave less than
   * 120 px (the full-screen profile on phones), the whole map counts and `hidden` is true.
   */
  function visibleArea() {
    const box = map.getContainer().getBoundingClientRect();
    const drawer = document.querySelector('.drawer');
    const covered = drawer ? Math.max(0, box.right - drawer.offsetLeft) : 0;
    const hidden = box.width - covered < 120;
    return { width: hidden ? box.width : box.width - covered, height: box.height, mapWidth: box.width, hidden };
  }

  /**
   * Tell the app which targets have their marker (at its spread position) on the visible map:
   * inside the map and not under the target profile (the user's rule: hidden by the profile is
   * outside the map view).
   */
  function reportView() {
    const { width, height } = visibleArea();
    const ids = new Set();
    for (const [id, entry] of layers.current) {
      const p = map.latLngToContainerPoint(entry.marker.getLatLng());
      if (p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height) ids.add(id);
    }
    if (sameIds(ids, lastView.current)) return;
    lastView.current = ids;
    handlers.current.onViewChange?.(ids);
  }

  function layout() {
    for (const [id, at] of ringPositions()) place(id, at);
    syncLock();
  }

  // Add and remove markers as the filtered list changes, then regroup shared points.
  useEffect(() => {
    const g = group.current;
    const wanted = new Map(listings.map((l) => [l.card_id, l]));
    for (const [id, entry] of layers.current) {
      if (!wanted.has(id)) {
        g.removeLayer(entry.marker);
        if (entry.halo) g.removeLayer(entry.halo);
        layers.current.delete(id);
      }
    }
    for (const [id, l] of wanted) {
      if (layers.current.has(id)) continue;
      let entry = cache.current.get(id);
      if (!entry) {
        const classes = ['mk', `mk-y${yearBin(l.build_year)}`];
        if (l.location_approx) classes.push('is-approx');
        if (l.removed) classes.push('is-removed');
        const halo = l.is_new
          ? L.circleMarker([l.lat, l.lon], {
              radius: R.halo,
              className: 'mk-halo',
              interactive: false,
              weight: 2,
              fill: false,
              pane: 'halos',
              renderer: haloRenderer.current,
            })
          : null;
        const marker = L.circleMarker([l.lat, l.lon], {
          radius: R.base,
          className: classes.join(' '),
          weight: l.location_approx ? 2 : 1.5,
          fillOpacity: 1,
          bubblingMouseEvents: false,
        });
        const tip = `${l.build_year ?? 'Year unknown'} · ${fmtM2(l.size_m2)} · ${l.address ?? l.district ?? ''}${l.location_approx ? ' (approximate location)' : ''}`;
        marker.bindTooltip(textNode(tip, 'tip-text'), { direction: 'top', offset: [0, -8], className: 'map-tip' });
        marker.on('mouseover', () => !dragging.current && handlers.current.onHover(id, 'map'));
        marker.on('mouseout', () => handlers.current.onHover(null, 'map'));
        marker.on('click', () => handlers.current.onSelect(id, 'map'));
        entry = { marker, halo, listing: l };
        cache.current.set(id, entry);
      }
      if (entry.halo) entry.halo.addTo(g);
      entry.marker.addTo(g);
      layers.current.set(id, entry);
    }

    // Regroup shared points. Rings that still describe a group stay; only changed ones are redrawn.
    groups.current = [];
    const keep = new Set();
    for (const ids of groupByPosition(listings).values()) {
      if (ids.length < 2) continue;
      const l = wanted.get(ids[0]);
      const center = L.latLng(l.lat, l.lon);
      groups.current.push({ center, ids });
      const key = `${l.lat},${l.lon},${ids.length}`;
      keep.add(key);
      if (rings.current.has(key)) continue;
      const ring = L.circleMarker(center, {
        radius: ringRadius(ids.length) + R.base + 3,
        className: 'mk-group',
        interactive: false,
        weight: 1,
      });
      ring.addTo(g);
      ring.bringToBack();
      rings.current.set(key, ring);
    }
    for (const [key, ring] of rings.current) {
      if (!keep.has(key)) {
        g.removeLayer(ring);
        rings.current.delete(key);
      }
    }
    // Every marker at its true point, or on its group's ring; only the ones that moved are touched.
    const spread = ringPositions();
    for (const [id, entry] of layers.current) place(id, spread.get(id) ?? L.latLng(entry.listing.lat, entry.listing.lon));
    syncLock();
    for (const id of layers.current.keys()) paint(id);
    reportView();
    // A target opened from the URL: its marker exists only now, so bring it into view now.
    if (state.current.selectedId != null && pannedFor.current !== state.current.selectedId) panToSelected();
  }, [listings]); // eslint-disable-line react-hooks/exhaustive-deps

  function paint(id) {
    const entry = layers.current.get(id);
    if (!entry) return;
    const { hoverId: h, selectedId: s, saved: sv } = state.current;
    const el = entry.marker.getElement();
    const hot = id === h || id === s;
    el?.classList.toggle('is-hover', id === h);
    el?.classList.toggle('is-selected', id === s);
    el?.classList.toggle('is-saved', !!sv?.has(id));
    const radius = hot ? R.hover : R.base;
    if (entry.marker.getRadius() !== radius) entry.marker.setRadius(radius);
    if (hot) {
      entry.halo?.bringToFront();
      entry.marker.bringToFront();
    }
  }

  // Shortlist changes: repaint every marker (cheap: class toggles only).
  useEffect(() => {
    for (const id of layers.current.keys()) paint(id);
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hover: grow, highlight and raise the marker; show its tooltip when the hover came from the list.
  const prevHover = useRef(null);
  useEffect(() => {
    const prev = prevHover.current;
    prevHover.current = hoverId;
    if (prev != null && prev !== hoverId) {
      paint(prev);
      layers.current.get(prev)?.marker.closeTooltip();
    }
    if (hoverId != null) {
      paint(hoverId);
      const entry = layers.current.get(hoverId);
      if (entry && !entry.marker.isTooltipOpen()) entry.marker.openTooltip();
    }
  }, [hoverId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Keep the selected marker on the visible map (the part the target profile does not cover).
   * A target off the map (outside its bounds: one picked under the "outside map view"
   * separator, or from a link) is centred in that part. Otherwise a target at least EDGE_MARGIN
   * px inside it does not move the map at all (the user's choice: every pan reorders the list,
   * FR-41); one nearer an edge or under the profile moves only far enough to sit EDGE_MARGIN px
   * inside.
   */
  const pannedFor = useRef(null);
  /** Returns true if it started moving the map (its moveend then reports the view). */
  function panToSelected() {
    const id = state.current.selectedId;
    const entry = id != null ? layers.current.get(id) : null;
    if (!entry) return false;
    pannedFor.current = id;
    const view = visibleArea();
    if (view.hidden) return false; // nothing sensible to show beside the profile
    const at = entry.marker.getLatLng();
    const p = map.latLngToContainerPoint(at);
    if (p.x < 0 || p.y < 0 || p.x > view.mapWidth || p.y > view.height) {
      // Off the map: centre it in the part the profile leaves visible.
      selfMove.current = performance.now() + SELF_MOVE_MS;
      map.panBy(L.point(p.x - view.width / 2, p.y - view.height / 2));
      return true;
    }
    const inside = p.x >= EDGE_MARGIN && p.x <= view.width - EDGE_MARGIN && p.y >= EDGE_MARGIN && p.y <= view.height - EDGE_MARGIN;
    if (inside) return false;
    // Near an edge or under the profile: move only far enough to sit EDGE_MARGIN px inside.
    selfMove.current = performance.now() + SELF_MOVE_MS;
    map.panInside(at, {
      paddingTopLeft: [EDGE_MARGIN, EDGE_MARGIN],
      paddingBottomRight: [view.mapWidth - view.width + EDGE_MARGIN, EDGE_MARGIN],
    });
    return true;
  }

  // Selection: highlight, lock on (reticle animation) and pan it into view if needed. Opening or
  // closing the profile changes what is visible, so the view is reported again; after a pan its
  // moveend does that (reporting now as well would reorder the list twice).
  const prevSelected = useRef(null);
  useEffect(() => {
    const prev = prevSelected.current;
    prevSelected.current = selectedId;
    if (prev !== selectedId) {
      lockLostFor.current = null; // a reopened target can be released again
      selectedAt.current = performance.now();
    }
    if (prev != null && prev !== selectedId) paint(prev);
    syncLock(prev !== selectedId);
    let moving = false;
    if (selectedId != null) {
      paint(selectedId);
      moving = panToSelected();
    }
    if (!moving) reportView();
  }, [selectedId, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

const fmtLat = (v) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? 'E' : 'W'}`;

/** The lock reticle: brackets snap in, the ring turns, a label shows the true coordinates. */
function lockIcon(l) {
  const where = `${l.location_approx ? '≈ ' : ''}${fmtLat(l.lat)} · ${fmtLon(l.lon)}`;
  return L.divIcon({
    className: 'lock-icon',
    iconSize: [96, 96],
    iconAnchor: [48, 48],
    html: `<svg class="lock-ring-svg" viewBox="-48 -48 96 96" aria-hidden="true" focusable="false"><circle r="27" /></svg>
      <svg class="lock-svg" viewBox="-48 -48 96 96" aria-hidden="true" focusable="false">
        <g class="lock-brackets"><path d="M-21 -11V-21H-11M11 -21H21V-11M21 11V21H11M-11 21H-21V11" /></g>
        <g class="lock-ticks"><path d="M0 -42V-32M0 32V42M-42 0H-32M32 0H42" /></g>
      </svg>
      <span class="lock-label"><span class="lock-title">Target locked</span><span class="lock-coord">${where}</span></span>`,
  });
}

const STRIKE_SVG = `<svg class="strike-svg" viewBox="-60 -60 120 120" aria-hidden="true" focusable="false">
  <g class="strike-ring"><circle r="34" /></g>
  <g class="strike-brackets"><path d="M-24 -12V-24H-12M12 -24H24V-12M24 12V24H12M-12 24H-24V12" /></g>
  <g class="strike-cross"><path d="M0 -56V-38M0 38V56M-56 0H-38M38 0H56" /></g>
  <circle class="strike-dot" r="2.5" />
</svg>`;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Zoom strike: on every zoom, a crosshair snaps onto the point the operator zoomed at (the
 * pointer for the wheel and double-click, the centre for buttons, keys and "Fit"), with
 * brackets closing in (zoom in) or a ring blowing out (zoom out) and a zoom readout. Purely
 * decorative: plain DOM in an overlay that ignores the pointer, removed after ~0.4 s.
 */
function ZoomStrike() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const layer = document.createElement('div');
    layer.className = 'fx-layer';
    container.appendChild(layer);

    let aim = null; // { point, t } of the last wheel or double-click
    let fromZoom = map.getZoom();
    let struck = false;
    let last = 0;
    const record = (e) => {
      aim = { point: map.mouseEventToContainerPoint(e), t: performance.now() };
    };
    // Capture phase: runs before Leaflet's own handlers start the zoom.
    container.addEventListener('wheel', record, { capture: true, passive: true });
    container.addEventListener('dblclick', record, { capture: true });

    const strike = (direction, zoom) => {
      const now = performance.now();
      if (now - last < 200 || prefersReducedMotion()) return; // one strike per wheel burst
      last = now;
      const size = map.getSize();
      const p = aim && now - aim.t < 700 ? aim.point : L.point(size.x / 2, size.y / 2);
      aim = null;
      const el = document.createElement('div');
      el.className = `strike strike-${direction}`;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.innerHTML = `${STRIKE_SVG}<span class="strike-z">Z ${zoom.toFixed(1)}</span>`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 900);
    };
    const onStart = () => {
      fromZoom = map.getZoom();
      struck = false;
    };
    const onAnim = (e) => {
      if (e.zoom === fromZoom) return;
      struck = true;
      strike(e.zoom > fromZoom ? 'in' : 'out', e.zoom);
    };
    const onEnd = () => {
      const z = map.getZoom();
      if (!struck && z !== fromZoom) strike(z > fromZoom ? 'in' : 'out', z);
    };
    map.on('zoomstart', onStart);
    map.on('zoomanim', onAnim);
    map.on('zoomend', onEnd);
    return () => {
      map.off('zoomstart', onStart);
      map.off('zoomanim', onAnim);
      map.off('zoomend', onEnd);
      container.removeEventListener('wheel', record, { capture: true });
      container.removeEventListener('dblclick', record, { capture: true });
      layer.remove();
    };
  }, [map]);
  return null;
}

/** Live pointer coordinates and zoom under the map, written straight to the DOM (no re-render). */
function CursorReadout({ target }) {
  const map = useMap();
  useEffect(() => {
    let latlng = null;
    const write = () => {
      const el = target.current;
      if (!el) return;
      const z = `Zoom ${map.getZoom().toFixed(1)}`;
      el.textContent = latlng ? `Cursor ${fmtLat(latlng.lat)} · ${fmtLon(latlng.lng)}   ${z}` : `Cursor ––   ${z}`;
    };
    let frame = 0;
    const onMove = (e) => {
      latlng = e.latlng;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          write();
        });
      }
    };
    const onOut = () => {
      latlng = null;
      write();
    };
    write();
    map.on('mousemove', onMove);
    map.on('mouseout', onOut);
    map.on('zoomend', write);
    return () => {
      cancelAnimationFrame(frame);
      map.off('mousemove', onMove);
      map.off('mouseout', onOut);
      map.off('zoomend', write);
    };
  }, [map, target]);
  return null;
}
