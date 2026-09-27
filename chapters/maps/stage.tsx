"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { DELETED, EMPTY, growAt, type MapState, type MatchRows, type Probe } from "@/lib/engines/maps";

const E = [0.16, 1, 0.3, 1] as const;
const hx = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

export type MapView = { hash?: boolean; match?: boolean | number; path?: boolean };

export function MapStage({ st, view = { hash: true, match: true, path: true } }: { st: MapState; view?: MapView }) {
  const scope = useId();
  const p = st.probe;
  const pathGroups = new Map((view.path && p ? p.path : []).map((x, i) => [x.g, { ...x, order: i }]));
  const showMatch = view.match !== undefined && view.match !== false;
  const matchStep = p && showMatch ? p.path[typeof view.match === "number" ? view.match : p.path.length - 1] : null;
  return (
    <LayoutGroup id={scope}>
      <div className="@container flex h-full min-h-0 flex-col [justify-content:safe_center] gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-[3px] border border-line-2 bg-[#0e1024] px-3 py-1.5 font-mono text-[13px] text-ink mono-tight">{st.code}</code>
          <span className="tnum font-mono text-[12px] text-ink-3 mono-tight">
            load {st.used}/{st.groups.length * 8} · tombstones {st.tomb} · grows at {growAt(st)}
          </span>
        </div>

        {view.hash && p && <HashPanel p={p} groups={st.groups.length} />}

        <div className={`grid gap-3 ${st.groups.length > 2 ? "@xl:grid-cols-2" : "@2xl:grid-cols-2"}`}>
          {st.groups.map((g, gi) => {
            const pg = pathGroups.get(gi);
            return (
              <motion.div
                layout
                key={gi}
                initial={st.grew ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: E }}
                className={`relative rounded-[3px] border p-2.5 transition-colors duration-300 ${pg ? "border-teal bg-teal/[0.05] pb-6" : "border-line-2 bg-[#141731]"}`}
              >
                <div className="mb-2 flex items-center gap-2 font-mono text-[11px] mono-tight">
                  <span className="text-ink">group {gi}</span>
                  {pg && (
                    <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="rounded-[2px] bg-teal/20 px-1.5 text-teal">
                      probe {pg.order + 1}
                    </motion.span>
                  )}
                  <span className="ml-auto text-ink-3">{g.ctrl.filter((c) => c !== EMPTY && c !== DELETED).length}/8</span>
                </div>
                <div className="grid grid-cols-8 gap-[3px]">
                  {g.ctrl.map((c, si) => {
                    const hit = pg?.match.hits.includes(si);
                    const full = c !== EMPTY && c !== DELETED;
                    return (
                      <div
                        key={`c${si}`}
                        className={`relative flex h-7 items-center justify-center rounded-[2px] border font-mono text-[11px] mono-tight transition-colors duration-300 @md:text-[12px] ${
                          hit ? "border-ink bg-teal/40 text-ink" : c === DELETED ? "hatch-rose border-rose/80 text-ink" : full ? "hatch-teal border-teal/70 text-ink" : "border-dashed border-ink-3/35 text-ink-3/70"
                        }`}
                      >
                        {hx(c)}
                      </div>
                    );
                  })}
                  {g.keys.map((k, si) => {
                    const dead = g.ctrl[si] === DELETED;
                    const cmp = pg?.cmp.find((x) => x.s === si);
                    const last = st.last && st.last.g === gi && st.last.s === si;
                    return (
                      <div key={`s${si}`} className={`relative h-10 rounded-[2px] border ${k && !dead ? "border-copper/70" : "hatch-fill border-dashed border-ink-3/30"}`}>
                        <AnimatePresence initial={false}>
                          {k && !dead && (
                            <motion.div
                              layoutId={`k-${k}`}
                              key={k}
                              initial={{ opacity: 0, scale: 0.7 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.6, filter: "blur(3px)" }}
                              transition={{ duration: 0.6, ease: E }}
                              className="hatch-copper absolute inset-0 flex items-center justify-center overflow-hidden rounded-[2px] font-mono text-[9px] text-ink [font-variation-settings:'wdth'_75] @md:text-[10px]"
                            >
                              {k}
                            </motion.div>
                          )}
                        </AnimatePresence>
                        {dead && k && <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-rose/80 line-through [font-variation-settings:'wdth'_75]">{k}</span>}
                        {last && (
                          <motion.span
                            key={`${st.code}-${si}`}
                            aria-hidden
                            initial={{ opacity: 1, scale: 1 }}
                            animate={{ opacity: 0, scale: 1.4 }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={`pointer-events-none absolute inset-0 rounded-[2px] border-2 ${st.last?.kind === "delete-tomb" ? "border-rose" : st.last?.kind === "delete-empty" ? "border-ink-3" : "border-copper"}`}
                          />
                        )}
                        {cmp && (
                          <motion.span
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 + (pg?.order ?? 0) * 0.45 }}
                            className={`absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-[2px] px-1 font-mono text-[10px] font-semibold leading-[1.5] ${cmp.eq ? "bg-teal text-substrate" : "bg-rose text-substrate"}`}
                          >
                            {cmp.eq ? "==" : "!="}
                          </motion.span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>

        {matchStep && <MatchPanel m={matchStep.match} group={matchStep.g} />}
      </div>
    </LayoutGroup>
  );
}

function HashPanel({ p, groups }: { p: Probe; groups: number }) {
  const bits = p.hash.toString(2).padStart(32, "0").split("");
  const maskBits = Math.log2(groups);
  return (
    <motion.div key={p.key} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: E }} className="rounded-[3px] border border-line bg-[#0e1024] p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[12px] mono-tight @md:text-[13px]">
        <span className="rounded-[2px] bg-copper/20 px-1.5 text-copper">&quot;{p.key}&quot;</span>
        <span className="text-ink-3">hash</span>
        <span className="text-ink">0x{p.hash.toString(16).padStart(8, "0")}</span>
      </div>
      <div className="mt-2 flex gap-[2px]">
        {bits.map((b, i) => {
          const isH2 = i >= 25;
          const isMask = !isH2 && i >= 25 - maskBits;
          return (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.012, duration: 0.3 }}
              className={`flex h-5 flex-1 items-center justify-center rounded-[1px] font-mono text-[9px] @md:text-[10px] ${
                isH2 ? "bg-teal/35 text-ink" : isMask ? "bg-copper/60 text-ink" : "bg-copper/15 text-ink-2"
              }`}
            >
              {b}
            </motion.span>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] mono-tight @md:text-[12px]">
        <span className="text-copper">
          h1 = hash &gt;&gt; 7 · &amp; {groups - 1} → group {p.seq[0]}
        </span>
        <span className="text-teal">h2 = hash &amp; 0x7F = 0x{hx(p.h2)}</span>
      </div>
    </motion.div>
  );
}

function MatchPanel({ m, group }: { m: MatchRows; group: number }) {
  const rows: { label: string; bytes: number[]; hi: (b: number, i: number) => boolean; tone: string }[] = [
    { label: `group ${group} ctrl`, bytes: m.ctrl, hi: (b) => b === m.h2, tone: "teal" },
    { label: `h2 × 0x0101…01`, bytes: Array(8).fill(m.h2), hi: () => false, tone: "teal" },
    { label: "v = ctrl ^ that", bytes: m.xor, hi: (b) => b === 0, tone: "teal" },
    { label: "(v−lsb) &^ v & msb", bytes: m.bits, hi: (b) => b !== 0, tone: "copper" },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[3px] border border-line bg-[#0e1024] p-3">
      <div className="mb-2 flex items-baseline justify-between font-mono text-[11px] text-ink-3 mono-tight">
        <span>matchH2: one uint64, eight compares, no branches</span>
        <span className="hidden @md:inline">slot 0 is the low byte</span>
      </div>
      <div className="space-y-[3px]">
        {rows.map((r, ri) => (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + ri * 0.28, duration: 0.4, ease: E }}
            className="grid grid-cols-[7.5rem_repeat(8,minmax(0,1fr))] items-center gap-[3px] @md:grid-cols-[9.5rem_repeat(8,minmax(0,1fr))]"
          >
            <span className="truncate font-mono text-[10px] text-ink-2 mono-tight @md:text-[11px]">{r.label}</span>
            {r.bytes.map((b, i) => (
              <span
                key={i}
                className={`tnum flex h-6 items-center justify-center rounded-[2px] font-mono text-[11px] @md:text-[12px] ${
                  r.hi(b, i) ? (r.tone === "copper" ? "bg-copper text-substrate" : "bg-teal/45 text-ink") : "bg-substrate-3 text-ink-3"
                }`}
              >
                {hx(b)}
              </span>
            ))}
          </motion.div>
        ))}
      </div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.35 }} className="mt-2 font-mono text-[11px] text-ink-2 mono-tight">
        candidates → slot{m.hits.length === 1 ? "" : "s"} {m.hits.length ? m.hits.join(", ") : "none"}
      </motion.p>
    </motion.div>
  );
}
