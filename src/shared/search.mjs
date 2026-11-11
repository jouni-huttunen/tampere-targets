// Shared by Node and the browser capture script. Keep it pure and ASCII-only.

/** Search URL for one page. Size and rent are the only content filters ever sent. */
export function searchUrl(cfg, offset, ageFilter) {
  const parts = [
    'cardType=' + cfg.cardType,
    'locations=' + encodeURIComponent(JSON.stringify(cfg.areas)),
    'size[min]=' + cfg.sizeMin,
    'price[max]=' + cfg.priceMax,
    'limit=' + cfg.pageSize,
    'offset=' + offset,
    'sortBy=published_sort_desc',
  ];
  if (ageFilter) parts.push('published=' + ageFilter);
  return '/api/search?' + parts.join('&');
}

export function detailUrl(cardId) {
  return '/api/card/' + encodeURIComponent(String(cardId));
}

/** 2026-11-11T08:15:30.123Z -> 20261111T081530Z (for the capture file name). */
export function fileStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}
