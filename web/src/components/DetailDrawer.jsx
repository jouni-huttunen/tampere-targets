import { useEffect, useRef, useState } from 'react';
import { getJson } from '../lib/api.js';
import { availabilityText, fmtDate, fmtDay, fmtEur, fmtKm, fmtM2, fmtYesNo } from '../lib/format.js';
import Photo from './Photo.jsx';
import StarButton from './StarButton.jsx';

/** Keys typed into these, or inside the photo strip or map, are not drawer shortcuts. */
function isTypingTarget(el) {
  return !!el?.closest?.('input, select, textarea, [contenteditable="true"], .gallery, .leaflet-container');
}

export default function DetailDrawer({
  id, summary, places, noPhotos, zipNames, onClose, position = -1, count = 0, onStep, isSaved = false, onToggleSaved,
}) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const closeRef = useRef(null);
  const returnFocus = useRef(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    closeRef.current?.focus();
    return () => {
      const el = returnFocus.current;
      if (el && document.contains(el)) el.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setError(null);
    getJson(`/api/listings/${id}`, { signal: controller.signal })
      .then(setDetail)
      .catch((err) => err.name !== 'AbortError' && setError(err));
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

  const l = detail ?? summary;
  const approx = l?.location_approx;

  return (
    <aside className="drawer frame" role="dialog" aria-modal="false" aria-labelledby="drawer-title">
      <div className="drawer-top">
        <p className="drawer-kicker">
          <span className="kicker-tag">Target profile</span>
          <span className="kicker-id">TGT {id}</span>
        </p>
        <div className="drawer-nav">
          {position >= 0 && (
            <>
              <button type="button" className="icon-btn" onClick={() => onStep(-1)} disabled={position === 0}
                aria-label="Previous target in the list" title="Previous target (←)">
                <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
                  <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="drawer-pos" aria-live="polite">
                {position + 1} / {count}
              </span>
              <button type="button" className="icon-btn" onClick={() => onStep(1)} disabled={position >= count - 1}
                aria-label="Next target in the list" title="Next target (→)">
                <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
                  <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close target profile" title="Close (Esc)">
            <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="drawer-scroll" ref={scrollRef}>
        <Gallery id={id} detail={detail} noPhotos={noPhotos} />

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
            {l?.removed && <span className="tag tag-removed">Withdrawn {fmtDay(l.removed_at)}</span>}
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
            <section className="facts-hero" aria-label="Key facts">
              <div>
                <span className="fact-label">Built</span>
                <span className="fact-hero">{l.build_year ?? '—'}</span>
              </div>
              <div>
                <span className="fact-label">Area</span>
                <span className="fact-hero">{fmtM2(l.size_m2)}</span>
              </div>
              <div>
                <span className="fact-label">Rooms</span>
                <span className="fact-hero">{l.rooms ?? '—'}</span>
              </div>
            </section>

            <dl className="facts">
              <Fact label="Layout" value={l.room_config} />
              <Fact label="Floor" value={l.floor != null ? `${l.floor}${l.floor_count ? ` / ${l.floor_count}` : ''}` : null} />
              <Fact label="Move-in" value={availabilityText(l)} />
              {l.available_date && l.availability_text && <Fact label="Move-in note" value={l.availability_text} />}
              <Fact label="Cost" value={`${fmtEur(l.rent_eur)} / month`} />
              <Fact label="Water" value={l.water_fee} />
              <Fact label="Electricity" value={l.electric_fee} />
              <Fact label="Deposit" value={l.deposit_eur != null ? fmtEur(l.deposit_eur) : null} />
              <Fact label="Pets allowed" value={fmtYesNo(l.pets_allowed)} />
              <Fact label="Furnished" value={fmtYesNo(l.furnished)} />
              <Fact label="Building type" value={l.building_type != null ? `code ${l.building_type} (mapping unverified)` : 'unknown'} />
              {places.map((p) => (
                <Fact key={p.key} label={`Range to ${p.key === 'centre' ? 'HQ' : p.key === 'station' ? 'rail' : p.name} · ${p.name}`} value={fmtKm(l.dist?.[p.key], approx)} />
              ))}
              <Fact label="Landlord / agent" value={l.company_name} />
              <Fact label="Listed" value={l.published_at ? fmtDay(l.published_at) : null} />
              <Fact label="First seen" value={fmtDay(l.first_seen_at)} />
              <Fact label="Details fetched" value={l.detail_fetched_at ? fmtDay(l.detail_fetched_at) : null} />
            </dl>
            {approx && (
              <p className="note">
                Oikotie gives no exact point for this home, so the map shows the centre of postal area {l.zip}. Distances are
                approximate (≈).
              </p>
            )}

            <section className="drawer-section">
              <h3 className="section-title">Lease terms</h3>
              {detail ? (
                detail.lease_text ? (
                  <p className="prose">{detail.lease_text}</p>
                ) : (
                  <p className="prose quiet">The listing has no lease text. Check the description and the Oikotie page.</p>
                )
              ) : (
                <p className="prose quiet">Loading…</p>
              )}
            </section>

            {detail?.description && (
              <section className="drawer-section">
                <h3 className="section-title">Briefing</h3>
                <p className="prose">{detail.description}</p>
              </section>
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

            {detail && (
              <details className="raw">
                <summary>Raw intel (JSON)</summary>
                <pre>{JSON.stringify(detail.raw, null, 2)}</pre>
              </details>
            )}
          </>
        )}
      </div>
    </aside>
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
 * Gallery: one large hero photo that fades into the panel, ‹ › over it, a counter, and a row
 * of thumbnails below. The hero links to the full-size image. Keys inside the gallery move
 * between photos (the drawer's own ←/→ for homes ignore it).
 */
function Gallery({ id, detail, noPhotos }) {
  const [index, setIndex] = useState(0);
  const thumbsRef = useRef(null);
  useEffect(() => setIndex(0), [id]);

  if (!detail) return <div className="gallery gallery-loading" aria-hidden="true" />;
  const photos = detail.photos;
  if (noPhotos || photos.length === 0) {
    return (
      <div className="gallery">
        <div className="gallery-hero">
          <Photo className="gallery-photo" noPhotos={noPhotos} />
        </div>
        {noPhotos && detail.photo_count > 0 && <p className="strip-note">{detail.photo_count} visuals hidden in preview mode</p>}
      </div>
    );
  }
  const n = photos.length;
  const i = Math.min(index, n - 1);
  const go = (next) => {
    const j = (next + n) % n;
    setIndex(j);
    thumbsRef.current?.children[j]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const hero = photos[i];

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
        <a href={hero.full ?? hero.large ?? hero.thumb} target="_blank" rel="noopener noreferrer" className="gallery-link" title="Open the full-size photo">
          <Photo className="gallery-photo" src={hero.large ?? hero.full ?? hero.thumb} alt={`Photo ${i + 1} of ${n}`} eager />
        </a>
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
      {n > 1 && (
        <div className="gallery-thumbs" ref={thumbsRef} role="group" aria-label="Photos">
          {photos.map((p, k) => (
            <button
              key={k}
              type="button"
              className="gallery-thumb"
              aria-pressed={k === i}
              aria-label={`Photo ${k + 1}`}
              onClick={() => setIndex(k)}
            >
              <Photo src={p.thumb ?? p.large} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
