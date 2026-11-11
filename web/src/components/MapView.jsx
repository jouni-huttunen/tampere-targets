import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, LayerGroup, LayersControl, MapContainer, Marker, Pane, ScaleControl, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { fmtM2, yearBin } from '../lib/format.js';
import { groupByPosition, ringOffsets, ringRadius } from '../lib/spread.js';
import Legend from './Legend.jsx';

const CENTER = [61.4978, 23.761];
const MAX_ZOOM = 19;
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI_CANVAS = 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community';
const ESRI_IMAGERY = 'Esri, Maxar, Earthstar Geographics, and the GIS user community';
const OPENTOPO = `${OSM}, SRTM | style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`;
const ARC = 'https://server.arcgisonline.com/ArcGIS/rest/services';
// Keyless tile services, tinted in CSS (tokens --tiles-*) to the night-forest palette.
// CARTO was the original pick, but since November 2026 its tiles need an API key.
// nativeZoom: the deepest zoom the server has tiles for; Leaflet upscales beyond it.
const BASE_MAPS = [
  {
    name: 'Night',
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
    name: 'Forest (satellite)',
    url: `${ARC}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ARC}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    nativeZoom: 19,
    tint: 'tiles-forest',
    labelTint: 'labels-forest',
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

export default function MapView({ listings, places, areas, hoverId, selectedId, saved, onHover, onSelect }) {
  const [map, setMap] = useState(null);
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
        <LayersControl position="topright">
          {BASE_MAPS.map((b, i) => (
            <LayersControl.BaseLayer key={b.name} checked={i === 0} name={b.name}>
              <LayerGroup>
                <TileLayer url={b.url} maxZoom={MAX_ZOOM} maxNativeZoom={b.nativeZoom} attribution={b.attribution} className={b.tint} />
                {b.relief && (
                  <TileLayer url={b.relief} maxZoom={MAX_ZOOM} maxNativeZoom={16} className="tiles-relief" />
                )}
                {b.labels && (
                  <TileLayer url={b.labels} pane="labels" maxZoom={MAX_ZOOM} maxNativeZoom={b.nativeZoom} className={b.labelTint} />
                )}
              </LayerGroup>
            </LayersControl.BaseLayer>
          ))}
          {areas && (
            <LayersControl.Overlay name="Postal areas">
              <GeoJSON data={areas} pane="postal" className="postal-area" attribution={PAAVO} onEachFeature={bindAreaTooltip} />
            </LayersControl.Overlay>
          )}
        </LayersControl>
        <ScaleControl position="bottomright" imperial={false} maxWidth={140} />
        <PlacePins places={places} />
        <ListingMarkers listings={located} hoverId={hoverId} selectedId={selectedId} saved={saved} onHover={onHover} onSelect={onSelect} />
      </MapContainer>
      <div className="map-vignette" aria-hidden="true" />
      {located.length > 0 && (
      <button
        type="button"
        className="map-fit"
        onClick={fit}
        disabled={!map || located.length === 0}
        title="Zoom the map to the homes in the list"
      >
        <svg className="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          Fit to {located.length} {located.length === 1 ? 'home' : 'homes'}
        </span>
      </button>
      )}
      <Legend />
    </>
  );
}

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

// Places are marked with runes, the same ones the list uses for their distances:
// ᛟ othala (home, inheritance) for the centre, ᚱ raidho (journey) for the station.
const PLACE_RUNES = { centre: 'ᛟ', station: 'ᚱ' };

function PlacePins({ places }) {
  const icons = useMemo(
    () =>
      Object.fromEntries(
        places.map((p) => [
          p.key,
          L.divIcon({ className: 'place-pin', html: `<span>${PLACE_RUNES[p.key] ?? 'ᛝ'}</span>`, iconSize: [26, 26] }),
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
        {p.key === 'station' ? 'Station' : p.name}
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
 */
function ListingMarkers({ listings, hoverId, selectedId, saved, onHover, onSelect }) {
  const map = useMap();
  const layers = useRef(new Map()); // card_id → { marker, halo, listing }
  const rings = useRef([]); // faint circles marking shared points
  const groups = useRef([]); // [{ center: LatLng, ids: [...] }] with more than one id
  const group = useRef(null);
  const handlers = useRef({ onHover, onSelect });
  handlers.current = { onHover, onSelect };
  const state = useRef({ hoverId, selectedId, saved });
  state.current = { hoverId, selectedId, saved };

  useEffect(() => {
    group.current = L.featureGroup().addTo(map);
    const relayout = () => layout();
    map.on('zoomend', relayout);
    return () => {
      map.off('zoomend', relayout);
      group.current.remove();
      layers.current.clear();
      rings.current = [];
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  function layout() {
    for (const { center, ids } of groups.current) {
      const origin = map.latLngToLayerPoint(center);
      const offsets = ringOffsets(ids.length);
      ids.forEach((id, i) => {
        const entry = layers.current.get(id);
        if (!entry) return;
        const at = map.layerPointToLatLng(origin.add(L.point(offsets[i][0], offsets[i][1])));
        entry.marker.setLatLng(at);
        entry.halo?.setLatLng(at);
      });
    }
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
      const classes = ['mk', `mk-y${yearBin(l.build_year)}`];
      if (l.location_approx) classes.push('is-approx');
      if (l.removed) classes.push('is-removed');
      const halo = l.is_new
        ? L.circleMarker([l.lat, l.lon], { radius: R.halo, className: 'mk-halo', interactive: false, weight: 2, fill: false })
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
      marker.on('mouseover', () => handlers.current.onHover(id, 'map'));
      marker.on('mouseout', () => handlers.current.onHover(null, 'map'));
      marker.on('click', () => handlers.current.onSelect(id));
      if (halo) halo.addTo(g);
      marker.addTo(g);
      layers.current.set(id, { marker, halo, listing: l });
    }

    // Regroup: reset everyone to the true point, then spread groups again.
    for (const ring of rings.current) g.removeLayer(ring);
    rings.current = [];
    groups.current = [];
    for (const [, entry] of layers.current) {
      const at = [entry.listing.lat, entry.listing.lon];
      entry.marker.setLatLng(at);
      entry.halo?.setLatLng(at);
    }
    for (const ids of groupByPosition(listings).values()) {
      if (ids.length < 2) continue;
      const l = wanted.get(ids[0]);
      const center = L.latLng(l.lat, l.lon);
      groups.current.push({ center, ids });
      const ring = L.circleMarker(center, {
        radius: ringRadius(ids.length) + R.base + 3,
        className: 'mk-group',
        interactive: false,
        weight: 1,
      });
      ring.addTo(g);
      ring.bringToBack();
      rings.current.push(ring);
    }
    layout();
    for (const id of layers.current.keys()) paint(id);
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
    entry.marker.setRadius(hot ? R.hover : R.base);
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

  // Selection: highlight and pan it into view if it is off-screen.
  const prevSelected = useRef(null);
  useEffect(() => {
    const prev = prevSelected.current;
    prevSelected.current = selectedId;
    if (prev != null && prev !== selectedId) paint(prev);
    if (selectedId != null) {
      paint(selectedId);
      const entry = layers.current.get(selectedId);
      if (entry) {
        // The drawer overlaps the map's right edge; keep the marker clear of it.
        const drawer = document.querySelector('.drawer')?.getBoundingClientRect();
        const box = map.getContainer().getBoundingClientRect();
        const covered = drawer ? Math.max(0, box.right - drawer.left) : 0;
        if (covered < box.width - 120) {
          map.panInside(entry.marker.getLatLng(), { paddingTopLeft: [60, 60], paddingBottomRight: [covered + 60, 60] });
        }
      }
    }
  }, [selectedId, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
