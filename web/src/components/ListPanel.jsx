import { useEffect, useRef, useState } from 'react';
import { SORTS } from '../lib/filters.js';
import { Crosshair } from './Icons.jsx';
import ListingCard from './ListingCard.jsx';

const VIEW_KEY = 'tcb.listView.v1';

function loadView() {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'rows';
  } catch {
    return 'rows';
  }
}

export default function ListPanel({
  listings, loading, error, sort, onSort, hover, selectedId, onHover, onSelect, onReset, noPhotos,
  saved, onToggleSaved, onlySaved, onOnlySaved, animateIn = true,
}) {
  const registry = useRef(new Map());
  // Rows (compact, the default) or cards (large photos); remembered in this browser.
  const [view, setView] = useState(loadView);
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(VIEW_KEY, view);
    } catch {
      /* storage blocked: the choice just isn't remembered */
    }
  }, [view]);

  // Hovering a marker scrolls its card into view. Instant on purpose: a smooth scroll across
  // hundreds of cards lags behind the pointer as it moves from marker to marker.
  useEffect(() => {
    if (hover.source !== 'map' || hover.id == null) return;
    registry.current.get(hover.id)?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [hover]);

  // Keep the selected card in view (e.g. when stepping through homes in the drawer).
  useEffect(() => {
    if (selectedId != null) registry.current.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [selectedId]);

  const busy = loading || !!error;

  // First appearance only: the first rows rise in one after another, then the effect is
  // switched off so filtering and sorting stay instant.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    if (loading || !animateIn) return undefined;
    const t = setTimeout(() => setEntering(false), 1400);
    return () => clearTimeout(t);
  }, [loading, animateIn]);

  return (
    <section className="list-panel frame" aria-label="Target list">
      <div className="panel-head">
        <h2 className="panel-title">
          <span className="panel-index">03</span>
          Target list
        </h2>
          <p className="list-count" aria-live="polite">
            {busy ? ' ' : (
              <>
                <span className="list-count-n">{listings.length}</span> {listings.length === 1 ? 'target' : 'targets'}
              </>
            )}
          </p>
      </div>
      <div className="list-bar">
        <div className="list-bar-row">
          <div className="segmented" role="group" aria-label="List layout">
            <button type="button" aria-pressed={view === 'rows'} onClick={() => setView('rows')} title="Compact rows">
              <svg className="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
              </svg>
              <span className="sr-only">Rows</span>
            </button>
            <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')} title="Large photos">
              <svg className="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M3.5 3.5h13v8h-13zM3.5 14.5h13" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <span className="sr-only">Cards</span>
            </button>
          </div>
        </div>
        <div className="list-bar-row">
          <button
            type="button"
            className="chip chip-small chip-star"
            aria-pressed={onlySaved}
            onClick={() => onOnlySaved(!onlySaved)}
            disabled={busy}
            title="Show only your priority targets"
          >
            <span aria-hidden="true">★</span> Priority <span className="chip-count">{saved.size}</span>
          </button>
          <label className="sort">
            <span className="sort-label">Order</span>
            <select value={sort} onChange={(e) => onSort(e.target.value)} disabled={busy}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} />
      ) : loading ? (
        <ul className={`cards cards-${view}`} aria-busy="true" aria-label="Loading targets">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className={`card-item card-item-${view}`}>
              <div className={`card card-${view} skeleton`} aria-hidden="true">
                <span className="card-photo" />
                <span className="card-body">
                  <span className="sk-line sk-year" />
                  <span className="sk-line" />
                  <span className="sk-line sk-short" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : listings.length === 0 ? (
        onlySaved && saved.size === 0 ? (
          <div className="state">
            <Crosshair className="state-icon" />
            <p className="state-title">No priority targets</p>
            <p className="state-text">Mark targets with the star to keep them here. Priority targets are saved in this browser only.</p>
            <button type="button" className="btn btn-primary" onClick={() => onOnlySaved(false)}>
              Show all targets
            </button>
          </div>
        ) : (
          <div className="state">
            <Crosshair className="state-icon" />
            <p className="state-title">No targets in sector</p>
            <p className="state-text">Widen a parameter or switch a flag off.</p>
            <button type="button" className="btn btn-primary" onClick={onReset}>
              Clear params
            </button>
          </div>
        )
      ) : (
        <ul className={`cards cards-${view} ${entering && animateIn ? 'cards-enter' : ''}`} onKeyDown={moveFocus}>
          {listings.map((l, i) => (
            <ListingCard
              key={l.card_id}
              index={i}
              l={l}
              view={view}
              active={hover.id === l.card_id}
              selected={selectedId === l.card_id}
              saved={saved.has(l.card_id)}
              noPhotos={noPhotos}
              registry={registry}
              onHover={onHover}
              onSelect={onSelect}
              onToggleSaved={onToggleSaved}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** ↑/↓ (and Home/End) move between homes when a row has focus; Enter opens it (native button). */
function moveFocus(e) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const item = e.target.closest?.('.card-item');
  if (!item || !e.target.classList.contains('card')) return;
  const list = item.parentElement;
  const next =
    e.key === 'ArrowDown' ? item.nextElementSibling
    : e.key === 'ArrowUp' ? item.previousElementSibling
    : e.key === 'Home' ? list.firstElementChild
    : list.lastElementChild;
  const button = next?.querySelector('.card');
  if (button) {
    e.preventDefault();
    button.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
}

function ErrorState({ error }) {
  const body =
    error.kind === 'no-database' ? (
      <>
        <p className="state-title">No intel yet</p>
        <p className="state-text">Capture listings first, then reload this page:</p>
        <pre className="state-code">npm run capture{'\n'}npm run import</pre>
      </>
    ) : error.kind === 'unreachable' ? (
      <>
        <p className="state-title">Uplink lost</p>
        <p className="state-text">The local server isn’t answering. Start it again, then reload this page:</p>
        <pre className="state-code">npm run ui</pre>
      </>
    ) : (
      <>
        <p className="state-title">System fault</p>
        <p className="state-text">{error.message}</p>
      </>
    );
  return (
    <div className="state" role="alert">
      <Crosshair className="state-icon state-icon-alert" />
      {body}
    </div>
  );
}
