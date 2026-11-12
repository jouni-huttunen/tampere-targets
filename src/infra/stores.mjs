// Grocery stores from OpenStreetMap (FR-43): only the chains the user chose on 2026-11-12,
// Kesko (K-Citymarket, K-Supermarket, K-Market), S-ryhmä (Prisma, S-market, Sale, Alepa) and Lidl.
// Tier is the store size class the map glyph shows: 3 hypermarket, 2 supermarket, 1 small.

export const CHAINS = [
  { chain: 'K-Citymarket', group: 'kesko', tier: 3 },
  { chain: 'K-Supermarket', group: 'kesko', tier: 2 },
  { chain: 'K-Market', group: 'kesko', tier: 1 },
  { chain: 'Prisma', group: 's', tier: 3 },
  { chain: 'S-market', group: 's', tier: 2 },
  { chain: 'Sale', group: 's', tier: 1 },
  { chain: 'Alepa', group: 's', tier: 1 },
  { chain: 'Lidl', group: 'lidl', tier: 2 },
];
export const GROUPS = { kesko: 'Kesko', s: 'S-ryhmä', lidl: 'Lidl' };

/** The Overpass query: every supermarket and convenience store in the box (filtered here). */
export function overpassQuery([west, south, east, north]) {
  const box = [south, west, north, east].map((v) => v.toFixed(5)).join(',');
  return `[out:json][timeout:60];nwr["shop"~"^(supermarket|convenience)$"](${box});out center tags;`;
}

/** Which chosen chain a shop belongs to: its brand tag, else its name; null for any other shop. */
export function chainOf(tags = {}) {
  const brand = tags.brand?.trim();
  const name = tags.name?.trim() ?? '';
  const byBrand = CHAINS.find((c) => c.chain.toLowerCase() === brand?.toLowerCase());
  if (byBrand) return byBrand;
  if (brand) return null; // another brand (R-kioski, Tokmanni, …)
  const byName = CHAINS.find((c) => name.toLowerCase().startsWith(c.chain.toLowerCase()));
  if (byName) return byName;
  // An unbranded K store ("K-KoskiHerkku"): Kesko, smallest tier.
  if (/^K-\S/.test(name) && !/^K-(Rauta|Auto|Kauppa)\b/i.test(name)) return { chain: 'K-store', group: 'kesko', tier: 1 };
  return null;
}

/** "K-Market Kissanmaa": the chain plus the branch, or the shop's own longer name. */
export function storeName(tags, chain) {
  // "Tampere Lielahti", "Kaukajärvi Tampere" → "Lielahti", "Kaukajärvi" (all are in Tampere).
  const branch = tags.branch?.replace(/\s+/g, ' ').trim().replace(/^Tampere (?=\S)|(?<=\S) Tampere$/i, '');
  if (branch) return `${chain} ${branch}`;
  const name = tags.name?.trim();
  return name && name.toLowerCase() !== chain.toLowerCase() ? name : chain;
}

/** The chosen chains' stores in the box, from Overpass elements, sorted by group, chain, name. */
export function storesFromOsm(elements, [west, south, east, north]) {
  const out = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    const c = chainOf(tags);
    if (!c) continue;
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null || lon < west || lon > east || lat < south || lat > north) continue;
    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
    out.push({
      id: `${e.type[0]}${e.id}`,
      group: c.group,
      chain: c.chain,
      tier: c.tier,
      name: storeName(tags, c.chain === 'K-store' ? tags.name : c.chain),
      addr: street || null,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      hours: tags.opening_hours?.trim() || null,
      checked: tags['check_date:opening_hours'] ?? tags.check_date ?? null,
    });
  }
  const order = Object.keys(GROUPS);
  return out.sort(
    (a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.tier - a.tier || a.name.localeCompare(b.name, 'fi') || a.id.localeCompare(b.id),
  );
}
