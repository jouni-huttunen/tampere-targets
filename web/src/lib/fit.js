// "Fit N targets" (FR-41): the zoom at which every target, as drawn, fits the visible map.
// Homes in one building are spread on a ring of fixed screen size round their shared point
// (lib/spread.js), so a point's drawn extent is its ring plus a marker, in pixels at any zoom,
// while the distances between points double with each zoom level. Fitting the bare points
// (Leaflet's fitBounds) let a big ring at the edge hang off the map.

/**
 * points: [{ x, y, r }]: each point projected at zoom 0 (Web Mercator pixels; at zoom z they are
 * x · 2^z) and its drawn radius r in screen pixels. width, height: the room for them, in pixels.
 * Returns { zoom, x, y }: the largest zoom in [minZoom, maxZoom] (to 0.001, not snapped) at which
 * their drawn extents fit, and the centre of those extents in pixels at that zoom.
 */
export function fitZoom(points, width, height, { minZoom = 0, maxZoom = 16 } = {}) {
  const extent = (z) => {
    const s = 2 ** z;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x * s - p.r);
      x1 = Math.max(x1, p.x * s + p.r);
      y0 = Math.min(y0, p.y * s - p.r);
      y1 = Math.max(y1, p.y * s + p.r);
    }
    return { x0, y0, x1, y1 };
  };
  const fits = (z) => {
    const e = extent(z);
    return e.x1 - e.x0 <= width && e.y1 - e.y0 <= height;
  };
  let zoom = minZoom;
  if (fits(maxZoom)) zoom = maxZoom;
  else if (fits(minZoom)) {
    // The extents only grow with the zoom: halve the interval until it is 0.001 wide.
    let lo = minZoom;
    let hi = maxZoom;
    while (hi - lo > 0.001) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    zoom = Math.floor(lo * 1000) / 1000;
  }
  const e = extent(zoom);
  return { zoom, x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2 };
}
