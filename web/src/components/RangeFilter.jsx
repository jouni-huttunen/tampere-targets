import { useEffect, useId, useRef, useState } from 'react';
import { normalizeRange } from '../lib/filters.js';
import { fmtDate } from '../lib/format.js';

// Dual-handle range: two native range inputs over one track (keyboard and screen-reader
// support come from the browser), plus two typed inputs. An end at its data bound means
// "no limit", so an untouched filter stays [null, null].

const DAY = 86400000;
const toDay = (date) => Math.round(Date.parse(date + 'T00:00:00Z') / DAY);
const fromDay = (day) => new Date(day * DAY).toISOString().slice(0, 10);

/**
 * eras (optional): [{ from, cls }] — colour the track by era (cls sets --mk, e.g. "mk-y3")
 * and mark each era boundary with a labelled notch; the unselected part of the track is dimmed.
 */
export default function RangeFilter({ label, hint, bounds, value, onChange, step = 1, kind = 'number', unit = '', prominent = false, eras = null }) {
  const id = useId();
  if (!bounds) {
    return (
      <div className={`range-filter ${prominent ? 'is-prominent' : ''}`}>
        <span className="range-label">{label}</span>
        <span className="range-empty">No data</span>
      </div>
    );
  }
  const isDate = kind === 'date';
  const toNum = isDate ? toDay : (x) => x;
  const fromNum = isDate ? fromDay : (x) => x;
  const lo = toNum(bounds[0]);
  const hi = toNum(bounds[1]);
  const clamp = (n) => Math.min(hi, Math.max(lo, n));
  const a = value[0] == null ? lo : clamp(toNum(value[0]));
  const b = value[1] == null ? hi : clamp(toNum(value[1]));
  const span = hi - lo || 1;
  const pct = (n) => `${((n - lo) / span) * 100}%`;
  const show = (n) => (isDate ? fmtDate(fromNum(n)) : `${n}${unit ? ' ' + unit : ''}`);
  const emit = (na, nb) => onChange(normalizeRange([fromNum(na), fromNum(nb)], bounds));
  const minOnTop = a > lo + span / 2;

  return (
    <div className={`range-filter ${prominent ? 'is-prominent' : ''}`} role="group" aria-labelledby={`${id}-label`}>
      <div className="range-head">
        <span className="range-label" id={`${id}-label`}>
          {label}
        </span>
        {hint && <span className="range-hint">{hint}</span>}
      </div>
      <div className={`range ${eras ? 'range-eras' : ''}`} style={{ '--a': pct(a), '--b': pct(b) }}>
        <div className="range-track" aria-hidden="true">
          {eras ? (
            <>
              {eras.map((era, i) => {
                const from = Math.max(lo, era.from ?? lo);
                const to = Math.min(hi, eras[i + 1]?.from ?? hi);
                if (to <= from) return null;
                return <span key={i} className={`range-era ${era.cls}`} style={{ left: pct(from), width: `${((to - from) / span) * 100}%` }} />;
              })}
              <span className="range-mask range-mask-left" />
              <span className="range-mask range-mask-right" />
            </>
          ) : (
            <div className="range-fill" />
          )}
        </div>
        {eras && (
          <div className="range-notches" aria-hidden="true">
            {eras
              .filter((era) => era.from != null && era.from > lo && era.from < hi)
              .map((era) => (
                <span key={era.from} className="range-notch" style={{ left: pct(era.from) }} title={String(era.from)}>
                  ’{String(era.from).slice(2)}
                </span>
              ))}
          </div>
        )}
        <input
          type="range"
          className={`range-input ${minOnTop ? 'is-top' : ''}`}
          min={lo}
          max={hi}
          step={isDate ? 1 : step}
          value={a}
          aria-label={`${label}, from`}
          aria-valuetext={show(a)}
          onChange={(e) => emit(Math.min(Number(e.target.value), b), b)}
        />
        <input
          type="range"
          className="range-input"
          min={lo}
          max={hi}
          step={isDate ? 1 : step}
          value={b}
          aria-label={`${label}, to`}
          aria-valuetext={show(b)}
          onChange={(e) => emit(a, Math.max(Number(e.target.value), a))}
        />
      </div>
      <div className="range-fields">
        <Field kind={kind} label={`${label}, from`} value={fromNum(a)} bounds={bounds} step={step} unit={unit}
          onCommit={(v) => emit(v == null ? lo : clamp(toNum(v)), b)} />
        <span className="range-dash" aria-hidden="true">–</span>
        <Field kind={kind} label={`${label}, to`} value={fromNum(b)} bounds={bounds} step={step} unit={unit}
          onCommit={(v) => emit(a, v == null ? hi : clamp(toNum(v)))} />
      </div>
    </div>
  );
}

/** A typed end of the range. Numbers commit on Enter or leaving the field; dates when complete. */
function Field({ kind, label, value, bounds, step, unit, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  if (kind === 'date') {
    return (
      <input
        type="date"
        className="range-field"
        aria-label={label}
        min={bounds[0]}
        max={bounds[1]}
        value={value}
        onChange={(e) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onCommit(e.target.value);
        }}
      />
    );
  }

  const commit = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const text = draft.trim().replace(',', '.');
    if (text === '') return onCommit(null);
    const n = Number(text);
    if (Number.isFinite(n)) onCommit(Math.round(n / step) * step);
    else setDraft(String(value));
  };
  return (
    <span className="range-field-wrap">
      <input
        type="text"
        inputMode="numeric"
        className="range-field"
        aria-label={label}
        value={editing ? draft : String(value)}
        onFocus={() => {
          setEditing(true);
          setDraft(String(value));
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            // Only cancel this edit: don't let Esc also close the filters panel or the drawer.
            e.preventDefault();
            e.stopPropagation();
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      {unit && <span className="range-unit">{unit}</span>}
    </span>
  );
}
