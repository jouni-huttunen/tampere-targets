import { useEffect, useId, useRef, useState } from 'react';

const ARM_GRACE_MS = 500; // "Burn it all" ignores presses this soon after the cover lifts

/**
 * Scorched earth (FR-51, the user's design): the reset of last resort. It burns everything this
 * browser remembers and reboots the console (App shows Purge.jsx). Behind a safety cover: the
 * first press only arms it, the second fires; "Stand down" (or the panel closing) puts it back.
 *
 * Two forms, same sequence:
 * - full (the field manual's last section): the brief is always shown, a cover button below it;
 * - compact (the bottom of the mission parameters, desktop and phone): one slim hazard bar, a
 *   warning label and "Lift the safety cover"; lifting it opens the brief and the controls: the
 *   full brief on phones, a terse one (`terse`, "Disarm" / "Burn") on desktop, where the
 *   column is narrow and the field manual has the long version.
 */
export default function ScorchedEarth({ onFire, compact = false, terse = false }) {
  const [armed, setArmed] = useState(false);
  const armRef = useRef(null);
  const standRef = useRef(null);
  const moved = useRef(false);
  const armedAt = useRef(0);
  const titleId = useId();

  // Focus follows the cover: to "Stand down" when it lifts (the safe default; in the parameters
  // this also scrolls the opened brief into view), back to the cover when it closes. Not on the
  // first render: the panel opens with focus where it already was.
  useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    (armed ? standRef : armRef).current?.focus();
  }, [armed]);

  const arm = () => {
    armedAt.current = Date.now();
    setArmed(true);
  };
  const fire = () => Date.now() - armedAt.current > ARM_GRACE_MS && onFire();

  const live = (
    <p className="sr-only" aria-live="assertive">
      {armed
        ? terse
          ? 'Armed. Burn wipes everything this browser remembers. Disarm to cancel.'
          : 'Armed. Burn it all wipes everything this browser remembers. Stand down to cancel.'
        : ''}
    </p>
  );

  if (compact && !armed) {
    return (
      <section className="abort abort-compact" aria-labelledby={titleId}>
        <div className="abort-hazard" aria-hidden="true" />
        <button type="button" ref={armRef} className="abort-cover" onClick={arm} aria-describedby={`${titleId}-tag`}>
          <WarningGlyph />
          <span className="abort-cover-text">
            <span className="abort-tag" id={`${titleId}-tag`}>
              Last resort · scorched earth
            </span>
            <span className="abort-cover-title" id={titleId}>
              Lift the safety cover
            </span>
          </span>
        </button>
        {live}
      </section>
    );
  }

  // Desktop parameters (the user's design): operators there have the field manual, so a clear
  // title, one line of what burns, the warning, and short controls that fit the 320 px column.
  if (compact && terse) {
    return (
      <section className="abort abort-compact abort-terse is-armed" aria-labelledby={titleId}>
        <div className="abort-hazard" aria-hidden="true" />
        <h3 id={titleId} className="abort-title">
          <WarningGlyph />
          Scorched earth
        </h3>
        <p className="abort-text">Burns stars, params, settings and the address, then reboots from zero.</p>
        <p className="abort-warn">
          <strong>No undo.</strong>
        </p>
        <div className="abort-actions">
          <span className="abort-state">Armed</span>
          <button type="button" ref={standRef} className="abort-stand" onClick={() => setArmed(false)} title="Put the safety cover back">
            Disarm
          </button>
          <button type="button" className="abort-fire" onClick={fire} title="Burn it all: wipe this browser's settings and reboot">
            Burn
          </button>
        </div>
        {live}
      </section>
    );
  }

  return (
    <section className={`abort ${compact ? 'abort-compact' : ''} ${armed ? 'is-armed' : ''}`} aria-labelledby={titleId}>
      <div className="abort-hazard" aria-hidden="true" />
      <div className="abort-head">
        <h3 id={titleId} className="abort-title">
          {compact && <WarningGlyph />}
          Scorched earth
        </h3>
        <span className="abort-tag">Last resort</span>
      </div>
      <p className="abort-text">
        For when the mission has failed and there are no choices left to make. Burns everything this browser
        remembers: priority targets, mission parameters, night vision, panel layout and list view. Wipes the address
        and reboots the console from zero.
      </p>
      <p className="abort-warn">
        <strong>No undo.</strong>
      </p>
      {armed ? (
        <div className="abort-actions">
          {/* "Stand down" comes first, near where the cover was, so a double-click never fires. */}
          <button type="button" ref={standRef} className="abort-stand" onClick={() => setArmed(false)}>
            Stand down
          </button>
          <button type="button" className="abort-fire" onClick={fire}>
            Burn it all
          </button>
          <span className="abort-state">Armed</span>
        </div>
      ) : (
        <div className="abort-actions">
          <button type="button" ref={armRef} className="abort-arm" onClick={arm}>
            Lift the safety cover
          </button>
        </div>
      )}
      {live}
    </section>
  );
}

function WarningGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="abort-glyph" aria-hidden="true" focusable="false">
      <path d="M10 2.5 18.5 17h-17z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" />
      <path d="M10 7.5v4.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9.1" y="13.4" width="1.8" height="1.8" fill="currentColor" />
    </svg>
  );
}
