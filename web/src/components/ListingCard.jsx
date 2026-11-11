import { memo, useCallback } from 'react';
import { rentPerM2 } from '../lib/filters.js';
import { availabilityText, fmtEur, fmtKm, fmtM2, fmtPerM2, roomsText, yearBin } from '../lib/format.js';
import Photo from './Photo.jsx';
import StarButton from './StarButton.jsx';

/**
 * One home in the list. `view` is "rows" (compact, many visible at once; the default) or
 * "cards" (large photo). The coloured edge matches the home's marker on the map.
 */
function ListingCard({ l, index = 0, view, active, selected, saved, noPhotos, registry, onHover, onSelect, onToggleSaved }) {
  const id = l.card_id;
  const ref = useCallback(
    (el) => {
      if (el) registry.current.set(id, el);
      else registry.current.delete(id);
    },
    [id, registry],
  );
  const where = [l.district, l.address].filter(Boolean).join(' · ') || 'Address unknown';
  const cls = ['card', `card-${view}`, `mk-y${yearBin(l.build_year)}`];
  if (active) cls.push('is-hover');
  if (selected) cls.push('is-selected');
  if (l.removed) cls.push('is-removed');

  const tags = (
    <>
      {l.is_new && <span className="tag tag-new">New</span>}
      {l.removed && <span className="tag tag-removed">Removed</span>}
    </>
  );

  return (
    <li className={`card-item card-item-${view}`} ref={ref} style={index < 14 ? { '--i': index } : undefined}>
      <button
        type="button"
        className={cls.join(' ')}
        onMouseEnter={() => onHover(id, 'list')}
        onMouseLeave={() => onHover(null, 'list')}
        onFocus={() => onHover(id, 'list')}
        onBlur={() => onHover(null, 'list')}
        onClick={() => onSelect(id)}
        aria-current={selected ? 'true' : undefined}
      >
        <span className="card-photo">
          <Photo src={view === 'cards' ? (l.thumb_large_url ?? l.thumb_url) : (l.thumb_url ?? l.thumb_large_url)} noPhotos={noPhotos} />
          {view === 'cards' && (
            <>
              <span className="card-tags">{tags}</span>
              {/* In the photo view, the year and place are set over the darkened foot of the photo. */}
              <span className="card-overlay">
                <span className="card-year">{l.build_year ?? <span className="card-year-unknown">Year ?</span>}</span>
                <span className="card-where" title={where}>{where}</span>
              </span>
            </>
          )}
        </span>
        <span className="card-body">
          {view === 'rows' && (
            <span className="card-head">
              <span className="card-year">{l.build_year ?? <span className="card-year-unknown">Year ?</span>}</span>
              <span className="card-where" title={where}>{where}</span>
              <span className="card-tags-inline">{tags}</span>
            </span>
          )}
          <span className="card-facts">
            <span className="fact-strong">{fmtM2(l.size_m2)}</span>
            {l.rooms != null && <span>{roomsText(l)}</span>}
            {l.room_config && <span className="card-quiet">{l.room_config}</span>}
          </span>
          <span className="card-meta">
            <span className="card-avail" title="Available">
              <span className="meta-rune" aria-hidden="true">ᛞ</span>
              {availabilityText(l)}
            </span>
            <span title="Distance to Keskustori">
              <span className="meta-rune" aria-hidden="true">ᛟ</span>
              {fmtKm(l.dist?.centre, l.location_approx)}
            </span>
            <span title="Distance to the railway station">
              <span className="meta-rune" aria-hidden="true">ᚱ</span>
              {fmtKm(l.dist?.station, l.location_approx)}
            </span>
          </span>
          {l.location_approx && <span className="card-approx">Approximate location</span>}
        </span>
        <span className="card-rent">
          {fmtEur(l.rent_eur)}
          <span className="card-rent-unit"> /mo</span>
          <span className="card-perm2" title="Rent per square metre">{fmtPerM2(rentPerM2(l))}</span>
        </span>
      </button>
      <StarButton saved={saved} onToggle={() => onToggleSaved(id)} className="card-star" />
    </li>
  );
}

export default memo(ListingCard);
