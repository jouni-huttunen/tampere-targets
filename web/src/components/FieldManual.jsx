import { useEffect, useRef, useState } from 'react';
import { ACTION_TEXT, KEY_ACTIONS, MANUAL_ROWS, capOf, manualAction } from '../lib/keys.js';

const IDLE_TEXT = 'Press a key or point at one to see what it does';

/**
 * The field manual (FR-50): the desktop keys on a drawn keyboard block, opened by H or the keys
 * button in the header. A modal <dialog>: the page behind is inert, and while it is open the keys
 * only light up their key cap here (practice) instead of acting. Esc, C, H, × or a click outside
 * closes it and focus goes back where it was.
 */
export default function FieldManual({ onClose }) {
  const ref = useRef(null);
  const [lit, setLit] = useState(null);

  useEffect(() => {
    const dialog = ref.current;
    const back = document.activeElement;
    if (!dialog.open) dialog.showModal?.();
    return () => {
      if (dialog.open) dialog.close?.();
      back?.focus?.({ preventScroll: true });
    };
  }, []);

  // Capture phase, before every other key handler: the manual takes all keys while it is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Tab') return; // focus moves inside the dialog as usual
      e.stopPropagation();
      const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
      // Esc, H and C (a second Esc) close the manual.
      if (e.key === 'Escape' || (plain && ['manual', 'close'].includes(KEY_ACTIONS[e.code]))) {
        e.preventDefault();
        onClose();
        return;
      }
      if (plain && KEY_ACTIONS[e.code]) {
        e.preventDefault();
        setLit(e.code);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const litAction = lit && manualAction(lit);

  return (
    <dialog
      ref={ref}
      className="manual"
      aria-labelledby="manual-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="manual-body frame">
        <div className="manual-top">
          <h2 id="manual-title" className="panel-title">
            <span className="panel-index">KEYS</span> Field manual
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the field manual" title="Close (Esc)">
            <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="manual-pad" role="list" aria-label="Keys">
          {MANUAL_ROWS.map((row) => (
            <div key={row.keys[0]} className={`manual-row ${row.fn ? 'manual-row-fn' : ''}`} style={{ '--row-offset': row.offset }}>
              {row.keys.map((code) => {
                const action = manualAction(code);
                const [short, long] = action ? ACTION_TEXT[action] : [];
                return (
                  <div
                    key={code}
                    role="listitem"
                    className={`keycap ${action ? `is-live keycap-${action}` : 'is-idle'} ${lit === code ? 'is-lit' : ''}`}
                    aria-label={action ? `${capOf(code)}: ${long}` : undefined}
                    aria-hidden={action ? undefined : 'true'}
                    onPointerEnter={action ? () => setLit(code) : undefined}
                  >
                    <span className="keycap-char">{capOf(code)}</span>
                    {short && <span className="keycap-label">{short}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <p className={`manual-readout ${litAction ? 'is-on' : ''}`} aria-live="polite">
          {litAction ? (
            <>
              <kbd className="kbd">{capOf(lit)}</kbd> {ACTION_TEXT[litAction][1]}
            </>
          ) : (
            IDLE_TEXT
          )}
        </p>
      </div>
    </dialog>
  );
}
