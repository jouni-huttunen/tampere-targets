import { useEffect, useState } from 'react';
import { cleanUrl, purgeStorage } from '../lib/purge.js';

const LINES = [
  'Shredding priority targets',
  'Wiping mission parameters',
  'Erasing console settings',
  'Scrubbing the address',
  'Rebooting from zero',
];
const LINE_MS = 280;
const HOLD_MS = 450;

/**
 * Scorched earth in progress (FR-51): a full-screen burn log over everything, then a full reload
 * of the bare address, which plays the boot sequence again (its once-per-tab flag is gone too).
 * The storage is wiped at once and again just before the reload, so nothing the console still
 * holds in memory can write it back. Under reduced motion the log shows whole and the reload
 * follows almost at once.
 */
export default function Purge() {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [step, setStep] = useState(calm ? LINES.length : 0);

  useEffect(() => {
    purgeStorage();
    const timers = [];
    if (!calm) for (let i = 1; i <= LINES.length; i++) timers.push(setTimeout(() => setStep(i), i * LINE_MS));
    const total = calm ? 250 : LINES.length * LINE_MS + HOLD_MS;
    timers.push(
      setTimeout(() => {
        purgeStorage();
        window.location.replace(cleanUrl(window.location));
      }, total),
    );
    return () => timers.forEach(clearTimeout);
  }, [calm]);

  return (
    <div className="purge" role="alert" aria-busy="true" style={{ '--purge-ms': `${LINES.length * LINE_MS}ms` }}>
      <div className="purge-hazard" aria-hidden="true" />
      <div className="purge-inner">
        <p className="purge-kicker">Abort sequence · authorized</p>
        <h2 className="purge-title">Scorched earth</h2>
        <ol className="purge-log">
          {LINES.map((text, i) => (
            <li key={text} className={`purge-line ${i < step ? 'is-done' : i === step ? 'is-now' : ''}`}>
              <span className="purge-prompt" aria-hidden="true">
                &gt;
              </span>
              <span className="purge-text">{text}</span>
              <span className="purge-status">{i < step ? 'BURNED' : i === step ? '···' : ''}</span>
            </li>
          ))}
        </ol>
        <div className="purge-bar" aria-hidden="true">
          <span />
        </div>
      </div>
      <div className="purge-hazard purge-hazard-bottom" aria-hidden="true" />
    </div>
  );
}
