// Shared by Node and the browser capture script. Keep it pure and ASCII-only.

/** FNV-1a 32-bit over the UTF-8 bytes of a string, as 8 hex digits. */
export function fnv1a32(text) {
  const bytes = new TextEncoder().encode(String(text));
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function orNull(v) {
  return v === undefined ? null : v;
}

/**
 * Hash of the parts of a search card that mean "this listing changed".
 * Visit counters are deliberately left out: they change all the time.
 */
export function cardHash(card) {
  const c = card || {};
  const data = c.data || {};
  const loc = c.location || {};
  const meta = c.meta || {};
  const medias = Array.isArray(c.medias) ? c.medias : [];
  const firstImage = medias.length && medias[0] ? orNull(medias[0].imageLargeJPEG) : null;
  return fnv1a32(JSON.stringify([
    orNull(data.price), orNull(data.size), orNull(data.sizeMin), orNull(data.rooms),
    orNull(data.description), orNull(data.buildYear),
    orNull(loc.address), orNull(loc.zipCode),
    orNull(meta.published), orNull(meta.publishedSort), orNull(meta.priceChanged),
    orNull(c.status), firstImage, medias.length,
  ]));
}
