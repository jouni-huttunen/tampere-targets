import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { fmtDate } from '../lib/format.js';
import { helsinkiClock, openState, parseOpeningHours, statusText, weekRows } from '../lib/hours.js';
import { CAN_HOVER } from '../lib/pointer.js'; // tooltips only with a real hover; a tap opens the card

// Ground intel (FR-43), shown only in night vision: tram and bus stops (Nysse GTFS) and grocery
// stores (OpenStreetMap) from web/public/infra.json. Stores and tram stops from zoom 13, bus
// stops (about 950) only from zoom 15. Hover (mouse) shows a one-line tooltip; a click or tap
// opens an intel card on the point. Everything lives in its own pane under the target markers,
// so a target is never covered. Managed directly in Leaflet, like the target markers.

export const INFRA_MIN_ZOOM = 13;
export const BUS_MIN_ZOOM = 15;
// Short: the base map's line already credits OpenStreetMap contributors.
const ATTRIBUTION =
  'Stops <a href="https://data.itsfactory.fi/journeys/files/gtfs/">Nysse</a> CC BY 4.0 · Stores <a href="https://www.openstreetmap.org/copyright">&copy; OSM</a> ODbL';
const LETTER = { kesko: 'K', s: 'S', lidl: 'L' };
const GROUP = { kesko: 'Kesko', s: 'S-ryhmä', lidl: 'Lidl' };
const STORE_PX = { 1: 18, 2: 22, 3: 26 }; // glyph size by store size class
const TRAM_PX = 16;
const COARSE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
// A card near an edge pans the map so it clears the map controls (zoom, Fit, layers: ~64 px at
// the top) and the attribution line at the bottom.
const POPUP = {
  className: 'intel-pop',
  maxWidth: 280,
  minWidth: 210,
  autoPanPaddingTopLeft: [16, 72],
  autoPanPaddingBottomRight: [16, 40],
};
const TIP = { direction: 'top', className: 'map-tip' };

// A flat-topped hexagon, r = 11, in a 24 × 24 box.
const HEX = 'M-11 0L-5.5 -9.5H5.5L11 0L5.5 9.5H-5.5Z';

const iconCache = new Map();
function storeIcon(s) {
  const key = `${s.group}-${s.tier}`;
  if (!iconCache.has(key)) {
    const px = STORE_PX[s.tier] ?? 18;
    iconCache.set(
      key,
      L.divIcon({
        className: `poi poi-store poi-t${s.tier}`,
        iconSize: [px, px],
        popupAnchor: [0, -px / 2],
        tooltipAnchor: [0, -px / 2],
        html: `<svg class="poi-hex" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false"><path d="${HEX}" /></svg><span class="poi-letter">${LETTER[s.group]}</span>`,
      }),
    );
  }
  return iconCache.get(key);
}

const tramIcon = () =>
  iconCache.get('tram') ??
  iconCache
    .set(
      'tram',
      L.divIcon({
        className: 'poi poi-tram',
        iconSize: [TRAM_PX, TRAM_PX],
        popupAnchor: [0, -TRAM_PX / 2],
        tooltipAnchor: [0, -TRAM_PX / 2],
        html: '<span class="poi-letter">T</span>',
      }),
    )
    .get('tram');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** The store's week, parsed once (null when missing or not understood). */
const weekCache = new WeakMap();
function weekOf(s) {
  if (!weekCache.has(s)) weekCache.set(s, parseOpeningHours(s.hours));
  return weekCache.get(s);
}

function storeStatus(s, clock) {
  const week = weekOf(s);
  if (!s.hours) return { text: 'Hours unknown', open: null };
  if (!week) return { text: s.hours, open: null };
  return { text: statusText(week, clock), open: openState(week, clock).open };
}

function storeTip(s) {
  const st = storeStatus(s, helsinkiClock());
  return el('span', 'tip-text', `${s.name} · ${st.text}`);
}

function stopTip(stop) {
  return el('span', 'tip-text', `${stop.mode === 'tram' ? 'Tram' : 'Bus'} ${stop.code} · ${stop.name}`);
}

/** The intel card for a store: chain, name, address, open now, the week, the source. */
function storeCard(s) {
  const clock = helsinkiClock();
  const card = el('div', 'intel');
  const kicker = el('p', 'intel-kicker');
  kicker.append(el('span', `intel-badge intel-badge-${s.group}`, LETTER[s.group]), `${GROUP[s.group]} · ${s.chain === 'K-store' ? 'K store' : s.chain}`);
  card.append(kicker, el('p', 'intel-title', s.name));
  if (s.addr) card.append(el('p', 'intel-sub', s.addr));
  const st = storeStatus(s, clock);
  const week = weekOf(s);
  // Hours the parser does not understand get no status line, only their text below.
  if (week || !s.hours) {
    card.append(el('p', `intel-status ${st.open === true ? 'is-open' : st.open === false ? 'is-closed' : ''}`, st.text));
  }
  if (week) {
    const table = el('table', 'intel-hours');
    const body = el('tbody');
    for (const r of weekRows(week)) {
      const today = clock.day >= r.from && clock.day <= r.to;
      const row = el('tr', today ? 'is-today' : '');
      row.append(el('th', null, r.days), el('td', null, r.hours));
      body.append(row);
    }
    table.append(body);
    card.append(table);
  } else if (s.hours) {
    card.append(el('p', 'intel-raw', s.hours));
  }
  const note = s.checked ? `Hours: OpenStreetMap, checked ${fmtDate(s.checked)}` : 'Hours: OpenStreetMap';
  card.append(el('p', 'intel-note', s.hours ? note : 'No hours in OpenStreetMap'));
  return card;
}

function stopCard(stop) {
  const card = el('div', 'intel');
  card.append(
    el('p', 'intel-kicker', stop.mode === 'tram' ? 'Tram stop' : 'Bus stop'),
    el('p', 'intel-title', stop.name),
    el('p', 'intel-code', `Stop ${stop.code}`),
  );
  return card;
}

export default function InfraLayer({ data }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return undefined;
    const pane = map.getPane('infra') ?? map.createPane('infra');
    pane.style.zIndex = '390'; // above the sectors and labels, under the halos and target markers
    const renderer = L.svg({ pane: 'infra' });
    const stores = L.layerGroup();
    const trams = L.layerGroup();
    const buses = L.layerGroup();
    const common = { pane: 'infra', keyboard: false, bubblingMouseEvents: false };

    for (const s of data.stores ?? []) {
      const m = L.marker([s.lat, s.lon], { ...common, icon: storeIcon(s) });
      m.bindPopup(() => storeCard(s), POPUP);
      if (CAN_HOVER) m.bindTooltip(() => storeTip(s), TIP);
      m.addTo(stores);
    }
    for (const stop of data.stops ?? []) {
      let m;
      if (stop.mode === 'tram') {
        m = L.marker([stop.lat, stop.lon], { ...common, icon: tramIcon() });
      } else {
        m = L.circleMarker([stop.lat, stop.lon], {
          ...common,
          renderer,
          radius: COARSE ? 6 : 4,
          weight: 1.5,
          className: 'poi-bus',
        });
      }
      // Tram icons place the card with their popupAnchor; a bus ring needs an offset. (Never pass
      // `offset: undefined`: it overrides Leaflet's default and the card fails to open.)
      m.bindPopup(() => stopCard(stop), stop.mode === 'tram' ? POPUP : { ...POPUP, offset: [0, -4] });
      if (CAN_HOVER) m.bindTooltip(() => stopTip(stop), stop.mode === 'tram' ? TIP : { ...TIP, offset: [0, -6] });
      m.addTo(stop.mode === 'tram' ? trams : buses);
    }

    // With its card open, a point shows no hover tooltip (it would sit behind the card).
    const quietTip = (e) => e.target.isPopupOpen?.() && e.target.closeTooltip();
    for (const group of [stores, trams, buses]) {
      group.eachLayer((m) => {
        m.on('popupopen', () => m.closeTooltip());
        m.on('tooltipopen', quietTip);
      });
    }

    // Show each kind only from its zoom level up.
    const sync = () => {
      const z = map.getZoom();
      for (const [layer, min] of [
        [stores, INFRA_MIN_ZOOM],
        [trams, INFRA_MIN_ZOOM],
        [buses, BUS_MIN_ZOOM],
      ]) {
        const on = z >= min;
        if (on && !map.hasLayer(layer)) layer.addTo(map);
        else if (!on && map.hasLayer(layer)) layer.remove();
      }
    };
    sync();
    map.on('zoomend', sync);
    map.attributionControl?.addAttribution(ATTRIBUTION);
    // Esc closes an open card first (capture phase, before the profile's own Esc handler, which
    // leaves a handled key alone), so one Esc never closes both.
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const open = [stores, trams, buses].some((g) => g.getLayers().some((m) => m.isPopupOpen()));
      if (!open) return;
      map.closePopup();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      map.off('zoomend', sync);
      for (const layer of [stores, trams, buses]) layer.remove();
      map.attributionControl?.removeAttribution(ATTRIBUTION);
    };
  }, [map, data]);
  return null;
}
