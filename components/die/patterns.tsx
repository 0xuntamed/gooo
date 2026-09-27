/* One set of layer patterns for every SVG on the page. Rendered once in the
   root layout; any inline SVG can fill with url(#p-copper) and friends. */

const L = [
  { id: "p-copper", c: "#e78b52", a: 45, bg: 0.14, fg: 0.72 },
  { id: "p-teal", c: "#3fc6b4", a: -45, bg: 0.12, fg: 0.7 },
  { id: "p-rose", c: "#f0607c", a: 0, bg: 0.13, fg: 0.7 },
  { id: "p-ivory", c: "#ece9f5", a: 45, bg: 0.08, fg: 0.62 },
];

export function LayerPatterns() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        {L.map((p) => (
          <pattern key={p.id} id={p.id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform={`rotate(${p.a})`}>
            <rect width="5" height="5" fill={p.c} fillOpacity={p.bg} />
            <line x1="0" y1="0" x2="0" y2="5" stroke={p.c} strokeOpacity={p.fg} strokeWidth="1.3" />
          </pattern>
        ))}
        <pattern id="p-violet" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="#a493f4" fillOpacity=".12" />
          <circle cx="2.5" cy="2.5" r="0.9" fill="#a493f4" fillOpacity=".8" />
        </pattern>
        <pattern id="p-fill" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 0L7 7M7 0L0 7" stroke="#ece9f5" strokeOpacity=".13" strokeWidth="0.8" />
        </pattern>
        <pattern id="p-rows" width="48" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 0.5H48" stroke="#ece9f5" strokeOpacity=".035" />
          <path d="M0.5 0V12" stroke="#ece9f5" strokeOpacity=".02" />
        </pattern>
        {[
          ["m-teal", "#3fc6b4"],
          ["m-copper", "#e78b52"],
          ["m-rose", "#f0607c"],
          ["m-ink", "#948fb4"],
          ["m-violet", "#a493f4"],
        ].map(([id, c]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9 z" fill={c} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
