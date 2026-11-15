import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtDateTime } from '../lib/format.js';
import { DESKTOP_POINTER } from '../lib/layout.js';
import { Reticle } from './Icons.jsx';

// Fallback for the GPS line when /api/meta has no centre place: Keskustori (the map centre).
const KESKUSTORI = { lat: 61.4978, lon: 23.761 };
const LINE_MS = 230; // one log line every ~0.23 s: the whole sequence takes about 3 s
const HOLD_MS = 650; // "ALL SYSTEMS ARMED" stays up for a moment
const EXIT_MS = 460; // must match .boot-out in app.css

const coord = (v, pos, neg) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

/**
 * The intro: a short tactical boot log typed line by line while the targets actually load.
 * Every value shown is real (the map centre, the database counts, the last capture time).
 * Plays once per tab; any key or click skips it. App skips it entirely under reduced motion.
 */
export default function BootSequence({ meta, count, error, saved, onDone }) {
  const ready = count != null || !!error;
  const [step, setStep] = useState(0); // lines fully done; lines[step] is the one being typed
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);

  const lines = useMemo(() => {
    const centre = meta?.places?.find((p) => p.key === 'centre') ?? KESKUSTORI;
    const run = meta?.lastRun;
    const out = [
      { text: `Tampere Targets · tactical console v${__APP_VERSION__}`, kind: 'head' }, // from package.json (vite.config.mjs)
      { text: 'Initializing tactical uplink', status: 'OK' },
      { text: `Establishing secure channel · ${window.location.hostname || '127.0.0.1'}`, status: 'OK' },
      { text: 'Encrypting session', status: 'OK' },
      { text: `Acquiring GPS coordinates · ${coord(centre.lat, 'N', 'S')} ${coord(centre.lon, 'E', 'W')}`, status: 'LOCK' },
      error
        ? { text: 'Decrypting target database', status: 'FAIL', tone: 'alert', wait: true }
        : { text: `Decrypting target database${count != null ? ` · ${count} targets` : ''}`, status: 'OK', wait: true },
    ];
    if (error) {
      out.push({ text: 'Uplink lost · switching to local console', status: 'FAIL', tone: 'alert' });
    } else {
      out.push({ text: `Loading sector grid · ${meta?.zips?.length ?? 0} sectors`, status: 'OK' });
      if (run) out.push({ text: `Last recon · ${fmtDateTime(run.finishedAt ?? run.startedAt)}`, status: 'OK' });
      out.push({ text: `Priority targets · ${saved.size}`, status: 'OK' });
      // Where there is a keyboard (a mouse or trackpad), point to the field manual (FR-50).
      if (window.matchMedia?.(DESKTOP_POINTER).matches) out.push({ text: 'Field manual · press H', status: 'READY' });
    }
    out.push({ text: error ? 'Standing by' : 'All systems armed', kind: 'final', tone: error ? 'alert' : null });
    return out;
  }, [meta, count, error, saved]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    setTimeout(onDone, EXIT_MS);
  }, [onDone]);

  // Advance one line at a time; the database line waits until the data has arrived.
  useEffect(() => {
    if (leaving) return undefined;
    if (step >= lines.length) {
      const t = setTimeout(finish, HOLD_MS);
      return () => clearTimeout(t);
    }
    if (lines[step].wait && !ready) return undefined;
    const t = setTimeout(() => setStep((s) => s + 1), LINE_MS);
    return () => clearTimeout(t);
  }, [step, ready, lines, leaving, finish]);

  // Any key or click skips the intro.
  useEffect(() => {
    const skip = (e) => {
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      finish();
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [finish]);

  const visible = lines.slice(0, Math.min(step + 1, lines.length));
  const progress = Math.round((Math.min(step, lines.length) / lines.length) * 100);

  return (
    <div className={`boot ${leaving ? 'boot-out' : ''}`} role="status" aria-live="polite" aria-label="Starting the tactical console">
      <div className="boot-grid" aria-hidden="true" />
      <div className="boot-inner">
        <div className="boot-brand">
          <div className="boot-emblem" aria-hidden="true">
            <svg className="boot-radar" viewBox="-60 -60 120 120" focusable="false">
              <circle r="56" className="boot-radar-ring" />
              <circle r="38" className="boot-radar-ring boot-radar-ring-dash" />
              <circle r="20" className="boot-radar-ring" />
              <path d="M0 -58V58M-58 0H58" className="boot-radar-axis" />
              <path d="M0 0L0 -56A56 56 0 0 1 39.6 -39.6Z" className="boot-radar-sweep" />
            </svg>
            <Reticle className="boot-reticle" />
          </div>
          <div>
            <p className="boot-title">
              Tampere <span>Targets</span>
            </p>
            <p className="boot-sub">Secure boot // operator console</p>
          </div>
        </div>

        <ol className="boot-log">
          {visible.map((line, i) => {
            const done = i < step;
            const text = line.text.toUpperCase();
            return (
              <li key={i} className={`boot-line boot-${line.kind ?? 'line'} ${line.tone ? `tone-${line.tone}` : ''}`}>
                <span className="boot-prompt" aria-hidden="true">{line.kind === 'final' ? '>>' : '>'}</span>
                <span className="boot-text" style={{ '--n': text.length }}>
                  {text}
                </span>
                {line.status && (
                  <span className={`boot-status ${done ? 'is-done' : 'is-busy'}`}>
                    {done ? `[ ${line.status} ]` : <span className="boot-dots" aria-hidden="true">...</span>}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <div className="boot-progress" aria-hidden="true">
          <div className="boot-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="boot-pct">{String(progress).padStart(3, '0')}%</span>
        </div>
        <p className="boot-skip">Press any key to skip</p>
      </div>
    </div>
  );
}
