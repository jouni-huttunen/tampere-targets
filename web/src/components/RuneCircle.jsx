// The 24 runes of the Elder Futhark on a slowly turning ring, ᛟ (othala, home) at the centre.
// Shown over the map while the homes load. Turning stops under prefers-reduced-motion.
const FUTHARK = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';

export default function RuneCircle({ label = 'Gathering the homes' }) {
  const runes = [...FUTHARK];
  return (
    <div className="ritual" role="status" aria-live="polite">
      <svg className="ritual-svg" viewBox="-110 -110 220 220" aria-hidden="true" focusable="false">
        <circle className="ritual-ring" r="96" />
        <circle className="ritual-ring ritual-ring-inner" r="62" />
        <g className="ritual-turn">
          {runes.map((rune, i) => {
            const a = (i / runes.length) * 2 * Math.PI - Math.PI / 2;
            const x = Math.cos(a) * 79;
            const y = Math.sin(a) * 79;
            return (
              <text key={i} className="ritual-rune" x={x} y={y} transform={`rotate(${(i / runes.length) * 360 + 90} ${x} ${y})`}>
                {rune}
              </text>
            );
          })}
        </g>
        <text className="ritual-center" x="0" y="0">
          ᛟ
        </text>
      </svg>
      <p className="ritual-label">{label}</p>
    </div>
  );
}
