/** Mark or unmark a priority target (the shortlist, stored in this browser only). */
export default function StarButton({ saved, onToggle, className = '', withLabel = false }) {
  return (
    <button
      type="button"
      className={`star ${saved ? 'is-saved' : ''} ${withLabel ? 'star-labelled' : ''} ${className}`}
      aria-pressed={saved}
      aria-label={withLabel ? undefined : saved ? 'Remove from priority targets' : 'Mark as priority target'}
      title={saved ? 'Priority target (click to remove)' : 'Mark as priority target'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg className="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path
          d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {withLabel && <span>{saved ? 'Priority target' : 'Mark as priority'}</span>}
    </button>
  );
}
