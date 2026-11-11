// Shown over the map while the targets load (when the boot sequence is not playing, e.g. on a
// reload). A radar sweep; it stops turning under prefers-reduced-motion.
export default function Radar({ label = 'Acquiring targets' }) {
  return (
    <div className="radar" role="status" aria-live="polite">
      <svg className="radar-svg" viewBox="-110 -110 220 220" aria-hidden="true" focusable="false">
        <circle className="radar-ring" r="100" />
        <circle className="radar-ring radar-ring-dash" r="66" />
        <circle className="radar-ring" r="33" />
        <path className="radar-axis" d="M0 -106V106M-106 0H106" />
        <path className="radar-sweep" d="M0 0L0 -100A100 100 0 0 1 70.7 -70.7Z" />
        <circle className="radar-dot" r="3" />
      </svg>
      <p className="radar-label">{label}</p>
    </div>
  );
}
