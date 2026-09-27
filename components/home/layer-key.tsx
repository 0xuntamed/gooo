/* The key to every drawing on the site. Each layer means one thing,
   and each carries its own hatch so meaning never depends on hue alone. */

export const LAYERS = [
  { cls: "hatch-copper border-copper/80", name: "Copper", means: "values and data; the goroutine that is running" },
  { cls: "hatch-teal border-teal/80", name: "Teal", means: "pointers, headers, wires; a goroutine waiting its turn" },
  { cls: "hatch-rose border-rose/80", name: "Rose", means: "the heap, an escape, a syscall, a panic" },
  { cls: "hatch-violet border-violet/80", name: "Violet", means: "parked: blocked on a channel, lock or timer" },
  { cls: "hatch-fill border-ink-3/50", name: "Cross-hatch", means: "padding, free space, nothing live" },
];

export function LayerKey({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={className}>
      <ul className={compact ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-5" : "space-y-2.5"}>
        {LAYERS.map((l) => (
          <li key={l.name} className="flex items-start gap-3">
            <span aria-hidden className={`mt-0.5 h-4 w-7 shrink-0 rounded-[2px] border ${l.cls}`} />
            <span className="text-[14px] leading-snug text-ink-2">
              <span className="font-bold text-ink">{l.name}</span> {l.means}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3.5 text-[13px] text-ink-3">
        <span className="flex items-center gap-2.5">
          <svg width="26" height="6" aria-hidden><line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-copper)" strokeWidth="2" /></svg>
          solid line: measured on go1.26.2
        </span>
        <span className="flex items-center gap-2.5">
          <svg width="26" height="6" aria-hidden><line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-ink-3)" strokeDasharray="3 3" /></svg>
          dashed line: simulated or scaled down, real value given
        </span>
      </div>
    </div>
  );
}
