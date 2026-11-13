import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getJson } from '../lib/api.js';
import { cachedDetail, loadDetail } from '../lib/details.js';
import { availabilityText, fmtDate, fmtDay, fmtEur, fmtKm, fmtM2 } from '../lib/format.js';
import Photo, { PhotoLoader } from './Photo.jsx';
import RichText from './RichText.jsx';
import StarButton from './StarButton.jsx';

/** Keys typed into these, or inside the photo strip or map, are not drawer shortcuts. */
function isTypingTarget(el) {
  return !!el?.closest?.('input, select, textarea, [contenteditable="true"], .gallery, .leaflet-container');
}

/** A swipe that starts in these scrolls them (photos, thumbnails, raw JSON); it never changes target. */
const NO_SWIPE = '.gallery, pre, input, select, textarea';
const SLIDE_MS = 200;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Skeleton lines for the Briefing while the details load: just under the 5th percentile of the
// descriptions as RichText renders them at the desktop profile's text width (measured 2026-11-12
// on 380 listings at 455 px, 21 px lines: shortest 96 px, 5th percentile 201 px = 9.6 lines,
// median 612 px; phones wrap to more). So the profile almost always grows, never shrinks, when
// the text arrives.
const BRIEFING_SKELETON_LINES = 9;

/** Placeholder lines with the rhythm of a `.prose` paragraph (one line box each). */
function ProseSkeleton({ lines }) {
  return (
    <div className="sk-prose" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="sk-line" />
      ))}
    </div>
  );
}

/**
 * Phones (full-screen profile): a sideways swipe on the profile steps to the next (swipe left) or
 * previous (swipe right) target, like ‹ ›. The content follows the finger; a quarter of the width
 * or a quick flick slides it out and the next target slides in, anything less springs back. The
 * first few pixels decide between a swipe and a vertical scroll. Passive pointer events and
 * touch-action keep vertical scrolling and pinch zoom native; the gallery scrolls independently.
 */
function useSwipeStep(enabled, rootRef, paneRef, id, canStep, onStep) {
  const latest = useRef({ canStep, onStep });
  latest.current = { canStep, onStep };
  const incoming = useRef(0); // the direction of a step started by a swipe, until the new target renders
  const busy = useRef(false); // a swipe's slide-out and slide-in are running: new swipes wait
  const settle = useRef(null);
  useEffect(() => () => clearTimeout(settle.current), []);

  useEffect(() => {
    const root = rootRef.current;
    const pane = paneRef.current;
    if (!enabled || !root || !pane) return;
    let start = null;
    let mode = null; // 'h' (swipe) or 'v' (scroll), decided on the first moves
    let dx = 0;
    const timers = [];
    const place = (x, animate) => {
      pane.style.transition = animate ? `transform ${SLIDE_MS}ms var(--ease-snap), opacity ${SLIDE_MS}ms var(--ease)` : 'none';
      pane.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
      pane.style.opacity = x ? String(1 - Math.min(0.6, Math.abs(x) / pane.clientWidth)) : '';
    };
    const onStart = (e) => {
      start = null;
      if (e.isPrimary === false) { place(0, false); return; }
      if (busy.current || e.pointerType !== 'touch' || e.target.closest?.(NO_SWIPE)) return;
      start = { x: e.clientX, y: e.clientY, t: e.timeStamp, pointer: e.pointerId };
      mode = null;
      dx = 0;
    };
    const onMove = (e) => {
      if (!start || mode === 'v' || e.pointerId !== start.pointer) return;
      const mx = e.clientX - start.x;
      const my = e.clientY - start.y;
      if (!mode) {
        const ax = Math.abs(mx);
        const ay = Math.abs(my);
        if (ax < 8 && ay < 8) return;
        // The browser's own rule under touch-action pan-y: it scrolls a gesture that is more
        // vertical than sideways and leaves the rest to us. Deciding the same way means every
        // gesture is either a swipe or a scroll (a stricter rule left the ones in between dead).
        mode = ax > ay ? 'h' : 'v';
        if (mode === 'v') return;
      }
      dx = mx;
      // With a single target there is nowhere to go: the content gives a little and springs back.
      if (!reducedMotion()) place(latest.current.canStep ? dx : dx / 4, false);
    };
    const onEnd = (e) => {
      if (start && e.pointerId !== start.pointer) return;
      if (!start || mode !== 'h') {
        start = null;
        return;
      }
      const width = pane.clientWidth;
      const speed = Math.abs(dx) / Math.max(1, e.timeStamp - start.t);
      start = null;
      const { canStep: can, onStep: step } = latest.current;
      const go = can && (Math.abs(dx) > width / 4 || (Math.abs(dx) > 40 && speed > 0.4));
      const still = reducedMotion();
      if (!go) {
        place(0, !still);
        return;
      }
      const delta = dx < 0 ? 1 : -1;
      if (still) {
        place(0, false);
        step(delta);
        return;
      }
      busy.current = true;
      place(-delta * width, true);
      timers.push(
        setTimeout(() => {
          incoming.current = delta;
          step(delta);
          // Safety net: if no new target renders, put the content back.
          timers.push(
            setTimeout(() => {
              if (incoming.current) {
                incoming.current = 0;
                place(0, false);
              }
              busy.current = false;
            }, SLIDE_MS * 2),
          );
        }, SLIDE_MS),
      );
    };
    const onCancel = () => {
      if (start && mode === 'h') place(0, true);
      start = null;
    };
    root.addEventListener('pointerdown', onStart, { passive: true });
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerup', onEnd);
    root.addEventListener('pointercancel', onCancel);
    return () => {
      root.removeEventListener('pointerdown', onStart);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onEnd);
      root.removeEventListener('pointercancel', onCancel);
      timers.forEach(clearTimeout);
      busy.current = false;
      incoming.current = 0;
      place(0, false);
    };
  }, [enabled, rootRef, paneRef]);

  // The new target slides in from the side the finger pushed towards.
  useLayoutEffect(() => {
    const pane = paneRef.current;
    const delta = incoming.current;
    if (!pane || !delta) return;
    incoming.current = 0;
    pane.style.transition = 'none';
    pane.style.transform = `translate3d(${delta * pane.clientWidth}px, 0, 0)`;
    pane.style.opacity = '0.4';
    pane.getBoundingClientRect(); // commit the start position before animating
    pane.style.transition = `transform ${SLIDE_MS}ms var(--ease-snap), opacity ${SLIDE_MS}ms var(--ease)`;
    pane.style.transform = '';
    pane.style.opacity = '';
    // The next swipe can start as soon as this target has slid in, not only when the safety net
    // fires (which made quick swipes in a row feel dead for most of a second).
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      busy.current = false;
    }, SLIDE_MS);
  }, [id, paneRef]);
}

export default function DetailDrawer({
  id, summary, places, noPhotos, zipNames, onClose, position = -1, count = 0, onStep, isSaved = false, onToggleSaved, swipe = false,
}) {
  const [result, setResult] = useState(null);
  // Select by id during render, before effects: never flash the previous target's data.
  const detail = cachedDetail(id) ?? (result?.id === id ? result.detail : null);
  const error = result?.id === id ? result.error : null;
  const closeRef = useRef(null);
  const returnFocus = useRef(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    closeRef.current?.focus();
    // Phones: the page behind the full-screen profile does not scroll (app.css, html.profile-open;
    // the rule applies only in the phone layout, so turning the phone or widening the window
    // needs nothing here). Removed when the profile closes, however it closes.
    const root = document.documentElement;
    root.classList.add('profile-open');
    return () => {
      root.classList.remove('profile-open');
      const el = returnFocus.current;
      if (el && document.contains(el)) el.focus();
    };
  }, []);

  useEffect(() => {
    if (cachedDetail(id)) return;
    const controller = new AbortController();
    loadDetail(id, { signal: controller.signal })
      .then((detail) => !controller.signal.aborted && setResult({ id, detail }))
      .catch((error) => !controller.signal.aborted && setResult({ id, error }));
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // An open filters panel sits above the drawer and takes Esc first.
        if (!e.defaultPrevented && !document.getElementById('filters-panel')) onClose();
      } else if (!e.altKey && !e.ctrlKey && !e.metaKey && !isTypingTarget(e.target)) {
        if (e.key === 'ArrowLeft') onStep?.(-1);
        if (e.key === 'ArrowRight') onStep?.(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onStep]);

  // Start each listing at the top of the drawer.
  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.scrollTo?.(0, 0);
  }, [id]);

  const rootRef = useRef(null);
  useSwipeStep(swipe, rootRef, scrollRef, id, position >= 0 && count >= 2, onStep);

  const l = detail ?? summary;
  const approx = l?.location_approx;

  return (
    <aside ref={rootRef} className="drawer frame" role="dialog" aria-modal="false" aria-labelledby="drawer-title">
      <div className="drawer-top">
        <p className="drawer-kicker">
          <span className="kicker-tag">Target profile</span>
          <span className="kicker-id">TGT {id}</span>
        </p>
        <div className="drawer-nav">
          {position >= 0 && (
            <>
              <button type="button" className="icon-btn" onClick={() => onStep(-1)} disabled={count < 2}
                aria-label="Previous target in the list" title="Previous target (A)">
                <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
                  <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="drawer-pos" aria-live="polite">
                {position + 1} / {count}
              </span>
              <button type="button" className="icon-btn" onClick={() => onStep(1)} disabled={count < 2}
                aria-label="Next target in the list" title="Next target (D)">
                <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
                  <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close target profile" title="Close (C)">
            <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="drawer-scroll" ref={scrollRef}>
        {/* Keyed by target so each one starts fresh. Keys must differ from RawIntel's, its
            neighbour: two children with one key make React leave the old gallery behind. */}
        <Gallery key={`gallery-${id}`} detail={detail} photoCount={summary?.photo_count ?? 0} noPhotos={noPhotos} />

        {/* Everything between the photos and the raw JSON, in one block: on phones it reserves
            sideways drags for the target swipe over its whole area, the gaps and edges included
            (app.css). The photos and the JSON stay outside it, free to scroll sideways. */}
        <div className="drawer-body">
        <header className="drawer-head">
          <p className="eyebrow">
            {[l?.district, l?.zip && `${l.zip}${zipNames[l.zip] ? ' ' + zipNames[l.zip] : ''}`].filter(Boolean).join(' · ')}
          </p>
          <h2 id="drawer-title" className="drawer-title">
            {l?.address ?? (error ? 'Listing' : 'Loading…')}
          </h2>
          {detail?.title && <p className="drawer-subtitle">{detail.title}</p>}
          <div className="drawer-tags">
            {onToggleSaved && <StarButton saved={isSaved} onToggle={onToggleSaved} withLabel />}
            {l?.is_new && <span className="tag tag-new">New contact</span>}
            {approx && <span className="tag tag-approx">Approx. position</span>}
          </div>
        </header>

        {error && (
          <p className="state-text" role="alert">
            Couldn’t load this listing: {error.message}
          </p>
        )}

        {l && (
          <>
            {/* Cost first: the figure the user wants at a glance, also on the phone. The rooms are
                in Layout (2h+kt), so no Rooms box. */}
            <section className="facts-hero" aria-label="Key facts">
              <div className="fact-cost">
                <span className="fact-label">Cost / month</span>
                <span className="fact-hero">{fmtEur(l.rent_eur)}</span>
              </div>
              <div>
                <span className="fact-label">Area</span>
                <span className="fact-hero">{fmtM2(l.size_m2)}</span>
              </div>
              <div>
                <span className="fact-label">Built</span>
                <span className="fact-hero">{l.build_year ?? '—'}</span>
              </div>
            </section>

            <dl className="facts">
              <Fact label="Layout" value={l.room_config} />
              <Fact label="Floor" value={l.floor != null ? `${l.floor}${l.floor_count ? ` / ${l.floor_count}` : ''}` : null} />
              <Fact label="Move-in" value={availabilityText(l)} />
              {l.available_date && l.availability_text && <Fact label="Move-in note" value={l.availability_text} />}
              {l.water_fee != null && String(l.water_fee).trim() !== '' && <Fact label="Water" value={l.water_fee} />}
              {l.deposit_eur != null && <Fact label="Deposit" value={fmtEur(l.deposit_eur)} />}
              {l.furnished === true && <Fact label="Furnished" value="Yes" />}
              {places.map((p) => (
                <Fact key={p.key} label={`Range to ${p.key === 'centre' ? 'HQ' : p.key === 'station' ? 'rail' : p.name} · ${p.name}`} value={fmtKm(l.dist?.[p.key], approx)} />
              ))}
              <Fact label="Landlord / agent" value={l.company_name} />
              <Fact label="Listed" value={l.published_at ? fmtDay(l.published_at) : null} />
            </dl>
            {approx && (
              <p className="note">
                Oikotie gives no exact point for this home, so the map shows the centre of postal area {l.zip}. Distances are
                approximate (≈).
              </p>
            )}

            <section className="drawer-section" aria-busy={!detail}>
              <h3 className="section-title">Lease terms</h3>
              {detail ? (
                detail.lease_text ? (
                  <RichText text={detail.lease_text} />
                ) : (
                  <p className="prose quiet">The listing has no lease text. Check the description and the Oikotie page.</p>
                )
              ) : (
                <ProseSkeleton lines={1} />
              )}
            </section>

            {!detail ? (
              <section className="drawer-section" aria-busy="true">
                <h3 className="section-title">Briefing</h3>
                <ProseSkeleton lines={BRIEFING_SKELETON_LINES} />
              </section>
            ) : (
              detail.description && (
                <section className="drawer-section">
                  <h3 className="section-title">Briefing</h3>
                  <RichText text={detail.description} />
                </section>
              )
            )}

            {l.url && (
              <p className="drawer-link">
                <a className="btn btn-primary" href={l.url} target="_blank" rel="noopener noreferrer">
                  Open on Oikotie
                  <span aria-hidden="true"> ↗</span>
                </a>
                {l.available_date && <span className="quiet">Move-in {fmtDate(l.available_date)}</span>}
              </p>
            )}

          </>
        )}
        </div>

        {l && detail && <RawIntel key={`raw-${id}`} id={id} />}
      </div>
    </aside>
  );
}

/**
 * "Raw intel": the stored search card and detail JSON, fetched and formatted only when opened
 * (GET /api/raw/:id). Keyed by target, so a new target starts closed and empty and never shows
 * the previous one's data; a failed load can be retried by closing and opening it again.
 */
function RawIntel({ id }) {
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | ready | error
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);

  const onToggle = (e) => {
    if (!e.currentTarget.open || state.status === 'loading' || state.status === 'ready') return;
    controller.current = new AbortController();
    setState({ status: 'loading' });
    getJson(`/api/raw/${id}`, { signal: controller.current.signal })
      .then((raw) => setState({ status: 'ready', text: JSON.stringify({ search: raw.search, detail: raw.detail }, null, 2) }))
      .catch((err) => err.name !== 'AbortError' && setState({ status: 'error', message: err.message }));
  };

  return (
    <details className="raw" onToggle={onToggle}>
      <summary>Raw intel (JSON)</summary>
      {state.status === 'ready' && <pre>{state.text}</pre>}
      {state.status === 'loading' && <p className="prose quiet">Loading…</p>}
      {state.status === 'error' && (
        <p className="prose quiet" role="alert">
          Couldn’t load the raw data: {state.message} Close and open this section to try again.
        </p>
      )}
    </details>
  );
}

function Fact({ label, value }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value === null || value === undefined || value === '' ? '—' : value}</dd>
    </div>
  );
}

/**
 * Gallery: a hero carousel that fades into the panel, ‹ › over it, a counter, and a row of
 * thumbnails below. The hero is a scroll-snap track, so a finger (or a trackpad) swipes between
 * photos natively; ‹ ›, the thumbnails and ←/→ inside the gallery jump the track. It loops: a copy
 * of the last photo sits before the first and a copy of the first after the last, and when a
 * swipe comes to rest on a copy the track jumps (invisibly) to the real photo. Each photo links
 * to its full-size image. Only the photos next to the one shown (round the loop) and ones already
 * seen load. The drawer's own ←/→ and its target swipe ignore the gallery.
 */
function Gallery({ detail, photoCount = 0, noPhotos }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef(null);
  const thumbsRef = useRef(null);
  const frame = useRef(0);
  const shown = useRef(0);
  const loaded = useRef(new Set());
  const settleTimer = useRef(0);
  const count = !detail || noPhotos ? 0 : detail.photos.length;
  const looped = count > 1;
  const pad = looped ? 1 : 0; // the copy of the last photo before the first

  // Start on the first real photo (slot 1, after the copy), once the photos are there.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track && looped) track.scrollLeft = (shown.current + pad) * track.clientWidth;
  }, [looped, pad]);

  // When a swipe comes to rest on a copy, jump to the photo it copies. 'scrollend' where the
  // browser has it, else a short pause in scrolling (onScroll).
  const settle = () => {
    const track = trackRef.current;
    if (!track || !looped || !track.clientWidth) return;
    const slot = Math.round(track.scrollLeft / track.clientWidth);
    if (slot === 0) track.scrollLeft = count * track.clientWidth;
    else if (slot === count + 1) track.scrollLeft = track.clientWidth;
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !looped) return undefined;
    const onEnd = () => settleRef.current();
    track.addEventListener('scrollend', onEnd);
    return () => track.removeEventListener('scrollend', onEnd);
  }, [looped]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(settleTimer.current);
    },
    [],
  );

  // While the details load, the gallery already takes its final height (the photo plus the row
  // under it), so nothing below jumps when they arrive, often mid slide-in on a phone. The photo
  // loader starts here and simply carries on while the first photo loads (unless photos are off).
  // The thumbnail strip is reserved too: one placeholder per photo (the list row's photo_count) in
  // the same scrolling row, so when they overflow, the strip's scrollbar shows already and the
  // profile does not jitter when the real thumbnails replace them.
  if (!detail) {
    const strip = !noPhotos && photoCount > 1;
    return (
      <div className="gallery" aria-hidden="true">
        <div className="gallery-hero gallery-loading">{!noPhotos && <PhotoLoader />}</div>
        <div className="gallery-under">
          {strip && (
            <div className="gallery-thumbs">
              {Array.from({ length: photoCount }, (_, k) => (
                <span key={k} className="gallery-thumb gallery-thumb-wait">
                  <PhotoLoader />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  const photos = detail.photos;
  if (noPhotos || photos.length === 0) {
    return (
      <div className="gallery">
        <div className="gallery-hero">
          <Photo className="gallery-photo" noPhotos={noPhotos} />
        </div>
        <div className="gallery-under">
          {noPhotos && detail.photo_count > 0 && <p className="strip-note">{detail.photo_count} visuals hidden in preview mode</p>}
        </div>
      </div>
    );
  }
  const n = photos.length;
  const i = Math.min(index, n - 1);
  for (const k of [i - 1, i, i + 1]) loaded.current.add((k + n) % n);

  const showThumb = (j) => {
    const strip = thumbsRef.current;
    const thumb = strip?.children[j];
    if (!thumb) return;
    // Scroll the strip only (scrollIntoView would also scroll the profile).
    const left = thumb.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (left + thumb.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + thumb.offsetWidth - strip.clientWidth;
  };
  const go = (next) => {
    const j = (next + n) % n;
    const track = trackRef.current;
    if (track) track.scrollLeft = (j + pad) * track.clientWidth;
    shown.current = j;
    setIndex(j);
    showThumb(j);
  };
  const onScroll = () => {
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => settleRef.current(), 150);
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const track = trackRef.current;
      if (!track || !track.clientWidth) return;
      const slot = Math.round(track.scrollLeft / track.clientWidth);
      const j = (((slot - pad) % n) + n) % n; // a copy counts as the photo it shows
      if (j === shown.current) return;
      shown.current = j;
      setIndex(j);
      showThumb(j);
    });
  };

  return (
    <div
      className="gallery"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          go(i - 1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          go(i + 1);
        }
      }}
    >
      <div className="gallery-hero">
        <div className="gallery-track" ref={trackRef} onScroll={onScroll}>
          {(looped ? [n - 1, ...photos.keys(), 0] : [0]).map((k, slot) => {
            const p = photos[k];
            const copy = looped && (slot === 0 || slot === n + 1);
            return (
              <a
                key={copy ? `copy-${slot}` : k}
                href={p.full ?? p.large ?? p.thumb}
                target="_blank"
                rel="noopener noreferrer"
                className="gallery-slide gallery-link"
                title="Open the full-size photo"
                tabIndex={k === i && !copy ? 0 : -1}
                aria-hidden={k === i && !copy ? undefined : true}
              >
                {loaded.current.has(k) ? (
                  <Photo className="gallery-photo" src={p.large ?? p.full ?? p.thumb} alt={`Photo ${k + 1} of ${n}`} eager />
                ) : (
                  <span className="gallery-photo gallery-placeholder" aria-hidden="true" />
                )}
              </a>
            );
          })}
        </div>
        {n > 1 && (
          <>
            <button type="button" className="gallery-nav gallery-prev" onClick={() => go(i - 1)} aria-label="Previous photo">
              <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
                <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className="gallery-nav gallery-next" onClick={() => go(i + 1)} aria-label="Next photo">
              <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
                <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
        <span className="gallery-count" aria-live="polite">
          {i + 1} / {n}
        </span>
      </div>
      <div className="gallery-under">
        {n > 1 && (
          <div className="gallery-thumbs" ref={thumbsRef} role="group" aria-label="Photos">
            {photos.map((p, k) => (
              <button
                key={k}
                type="button"
                className="gallery-thumb"
                aria-pressed={k === i}
                aria-label={`Photo ${k + 1}`}
                onClick={() => go(k)}
              >
                <Photo src={p.thumb ?? p.large} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
