/**
 * A hidden side panel (FR-46): a slim rail at its edge of the console with the panel's number,
 * an upright label and a count. Clicking it (or the panel's key) shows the panel again.
 */
export default function PanelRail({ side, index, label, short, count, countLabel, shortcut, onOpen, ref }) {
  return (
    <button
      ref={ref}
      type="button"
      className={`panel-rail panel-rail-${side} frame`}
      onClick={onOpen}
      aria-expanded="false"
      aria-label={`Show ${label}${count != null ? `, ${count} ${countLabel}` : ''}`}
      title={`Show ${label} (${shortcut})`}
    >
      <PanelChevron dir={side === 'left' ? 'right' : 'left'} />
      <span className="panel-index">{index}</span>
      <span className="panel-rail-label">{short}</span>
      {count != null && <span className="panel-rail-count">{count}</span>}
    </button>
  );
}

/** « or » for the hide buttons and the rails: points the way the panel moves. */
export function PanelChevron({ dir }) {
  return (
    <svg viewBox="0 0 20 20" className="icon" aria-hidden="true" focusable="false">
      <path
        d={dir === 'left' ? 'M10 5 5 10l5 5M15 5l-5 5 5 5' : 'M10 5l5 5-5 5M5 5l5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
