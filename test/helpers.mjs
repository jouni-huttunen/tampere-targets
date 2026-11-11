// Test helpers. All listing data here is SYNTHETIC: made up to match the documented
// shape of Oikotie's JSON. Never put real Oikotie responses in this repository.
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { buildCaptureScript } from '../src/capture/build.mjs';
import { captureConfig, validateConfig } from '../src/config.mjs';
import { openDb } from '../src/db.mjs';
import { CAPTURE_FORMAT } from '../src/import.mjs';

export function testConfig(overrides = {}) {
  return validateConfig({
    areas: [
      { zip: '33100', id: 154182 },
      { zip: '33200', id: 154198 },
    ],
    filters: { cardType: 101, sizeMin: 40, priceMax: 1400 },
    places: [
      { key: 'centre', name: 'Keskustori', lat: 61.4978, lon: 23.761 },
      { key: 'station', name: 'Railway station', lat: 61.4983, lon: 23.7737 },
    ],
    windowCutoff: '2027-02-01',
    capture: { delayMs: 2000, jitterMs: 800, pageSize: 100, maxDetails: 600 },
    refresh: { fullSweepEveryDays: 1, maxGapDays: 7, windowDays: 2, otherDays: 14 },
    ...overrides,
  });
}

export function memoryDb(config = testConfig()) {
  return openDb(':memory:', { config });
}

function merge(base, overrides = {}) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const isPlain = value && typeof value === 'object' && !Array.isArray(value);
    out[key] = isPlain && base[key] && typeof base[key] === 'object' ? merge(base[key], value) : value;
  }
  return out;
}

export function makeCard(id, overrides = {}) {
  return merge(
    {
      cardId: id,
      cardType: 101,
      url: `https://asunnot.oikotie.fi/vuokra-asunnot/tampere/${id}`,
      status: 1,
      data: {
        description: `Synthetic home ${id}`,
        rooms: 2,
        roomConfiguration: '2h+kk',
        price: '1 170 € / kk',
        size: '42 m²',
        sizeMin: 42,
        sizeMax: 42,
        buildYear: 2015,
        visits: 100,
        visitsWeekly: 10,
      },
      location: {
        address: `Testikatu ${id}`,
        district: 'Kaleva',
        city: 'Tampere',
        zipCode: '33100',
        latitude: 61.4978,
        longitude: 23.761,
      },
      meta: {
        published: '2026-11-01T10:00:00Z',
        publishedSort: '2026-11-05T10:00:00Z',
        priceChanged: null,
        contractType: 1,
        listingType: 1,
        vendorAdId: `v${id}`,
      },
      medias: [{ imageSmallJPEG: `https://img.example/${id}-s.jpg`, imageLargeJPEG: `https://img.example/${id}-l.jpg` }],
      company: { companyName: 'Synthetic Oy' },
    },
    overrides,
  );
}

export function makeDetail(id, overrides = {}) {
  return merge(
    {
      cardId: id,
      status: 1,
      published: '2026-11-01 12:00:00',
      meta: { created: '2026-11-01 12:00:00', lastModified: '2026-11-05 12:00:00' },
      building: {},
      adData: {
        title: `Synthetic home ${id}`,
        description: 'Valoisa kaksio.',
        availabilityDate: '2026-12-01',
        availabilityInfo: 'Vapautuu 1.12.2026',
        rentTermInfo: 'Toistaiseksi voimassa oleva',
        fixedTerm: false,
        size: 42,
        rooms: 2,
        roomConfiguration: '2h+kk',
        securityDeposit: 2340,
        waterFee: '20 €/hlö/kk',
        electricFee: null,
        petsAllowed: true,
        rentFurnished: false,
        buildingOverrideBuildYear: 2015,
        buildingOverrideBuildingType: 1,
        floor: 3,
        floorCount: 5,
        habitationRentType: 9,
      },
      address: { zipCode: { cardId: 154182, name: '33100' }, districts: [{ name: 'Kaleva' }], street: `Testikatu ${id}` },
      coordinates: { latitude: 61.4978, longitude: 23.761 },
      company: { name: 'Synthetic Oy' },
      priceData: { price: 1170 },
    },
    overrides,
  );
}

/** Hand-made capture file, for importer tests. */
export function makeCapture({
  startedAt = '2026-11-11T08:00:00.000Z',
  mode = 'full',
  ageFilter = null,
  cards = [],
  details = {},
  sweepComplete = true,
  found = cards.length,
  stoppedReason = null,
  detailsDue,
} = {}) {
  const detailMap = {};
  for (const [id, value] of Object.entries(details)) {
    detailMap[id] =
      value === 404
        ? { fetchedAt: startedAt, status: 404, json: null }
        : { fetchedAt: startedAt, status: 200, json: value };
  }
  return {
    format: CAPTURE_FORMAT,
    captureId: randomUUID(),
    startedAt,
    finishedAt: startedAt,
    mode,
    ageFilter,
    sweepComplete,
    found,
    detailsDue: detailsDue ?? Object.keys(detailMap).length,
    detailsPlanned: Object.keys(detailMap).length,
    stoppedReason,
    config: {},
    searchCards: cards.map((card) => ({ fetchedAt: startedAt, card })),
    details: detailMap,
    requests: [],
    errors: [],
  };
}

/**
 * A fake Oikotie API as a fetch function.
 * world: { cards: [...], details: { id: json }, freshIds: Set (what a published= search returns) }
 * respond(url, n): optional hook returning an HTTP status to force for request number n (1-based).
 */
export function fakeOikotie(world, respond = () => null) {
  const log = { urls: [], headers: [], inFlight: 0, maxInFlight: 0 };
  const fetch = async (url, init = {}) => {
    log.urls.push(url);
    log.headers.push(init.headers ?? {});
    log.inFlight++;
    log.maxInFlight = Math.max(log.maxInFlight, log.inFlight);
    await new Promise((resolve) => setImmediate(resolve));
    log.inFlight--;
    const forced = respond(url, log.urls.length);
    if (forced && forced !== 200) return { status: forced, json: async () => ({}) };
    const u = new URL(url, 'https://asunnot.oikotie.fi');
    if (u.pathname === '/api/search') {
      const offset = Number(u.searchParams.get('offset'));
      const limit = Number(u.searchParams.get('limit'));
      const all = u.searchParams.get('published')
        ? world.cards.filter((c) => world.freshIds && world.freshIds.has(c.cardId))
        : world.cards;
      const body = { found: all.length, start: offset, cards: all.slice(offset, offset + limit) };
      return { status: 200, json: async () => structuredClone(body) };
    }
    const m = /^\/api\/card\/(\d+)$/.exec(u.pathname);
    if (m && world.details[m[1]]) return { status: 200, json: async () => structuredClone(world.details[m[1]]) };
    return { status: 404, json: async () => ({}) };
  };
  return { fetch, log };
}

/**
 * Run the BUILT capture script the way a browser would, with a fake page.
 * Timers fire immediately; every requested delay is recorded in `timers`.
 * Returns { file (parsed from the "downloaded" blob), downloads, timers, events, panelText }.
 */
export async function runCaptureScript({
  state,
  config,
  fetch,
  hostname = 'asunnot.oikotie.fi',
  metas = { 'api-token': 'tok-1', cuid: 'cuid-1', loaded: '1700000000' },
  onTimer = null,
}) {
  const script = buildCaptureScript({ state, config });
  const downloads = [];
  const blobs = new Map();
  const timers = [];
  const events = [];
  const elements = [];

  const makeElement = (tag) => {
    const el = {
      tag,
      style: {},
      children: [],
      textContent: '',
      listeners: {},
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      },
      remove() {
        this.removed = true;
      },
      click() {
        if (tag === 'a') downloads.push({ name: this.download, blob: blobs.get(this.href) });
        else if (this.listeners.click) this.listeners.click();
      },
    };
    elements.push(el);
    return el;
  };
  const body = makeElement('body');
  const sandbox = {
    document: {
      body,
      documentElement: body,
      createElement: makeElement,
      querySelector(selector) {
        const m = /meta\[name="([^"]+)"\]/.exec(selector);
        const value = m ? metas[m[1]] : null;
        return value ? { getAttribute: () => value } : null;
      },
    },
    location: { hostname },
    fetch: async (url, init) => {
      events.push('fetch');
      return fetch(url, init);
    },
    console: { log() {}, warn() {}, error: console.error },
    Blob,
    TextEncoder,
    URL: {
      createObjectURL(blob) {
        const url = `blob:fake-${blobs.size}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL() {},
    },
    crypto: { randomUUID },
    setTimeout(fn, ms) {
      timers.push(ms);
      events.push(`timer:${ms}`);
      if (onTimer) onTimer(ms, sandbox, timers.length);
      setImmediate(fn);
      return timers.length;
    },
    clearTimeout() {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  if (sandbox.__tcbCapture) await sandbox.__tcbCapture.promise;
  const file = downloads.length ? JSON.parse(await downloads.at(-1).blob.text()) : null;
  const panelText = elements.map((el) => el.textContent).filter(Boolean).join('\n');
  return { file, downloads, timers, events, panelText, sandbox };
}

export function emptyState(extra = {}) {
  return { generatedAt: '2026-11-11T08:00:00.000Z', lastRunStartedAt: null, lastFullSweepAt: null, forceFull: false, known: {}, ...extra };
}

export function flatConfig(overrides = {}) {
  return captureConfig(testConfig(), overrides);
}
