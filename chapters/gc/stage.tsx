"use client";

import { AnimatePresence, motion } from "motion/react";
import { type GcState, heapKB, PHASES } from "@/lib/engines/gc";

const E = [0.16, 1, 0.3, 1] as const;
const INK = "#ece9f5";

export function GcStage({ s, focus }: { s: GcState; focus?: "pacing" }) {
  const byId = Object.fromEntries(s.nodes.map((n) => [n.id, n]));
  const stw = PHASES[s.phase].stw;
  const heap = heapKB(s);
  const max = Math.max(s.goal, heap, s.live) * 1.1;
  return (
    <div className="@container flex h-full min-h-0 flex-col [justify-content:safe_center] gap-3">
      {/* phases, and whether your code is running */}
      <div>
        <div className="grid grid-cols-5 gap-[3px]">
          {PHASES.map((p, i) => (
            <div key={p.id} className={`rounded-[2px] border px-1.5 py-1 transition-colors duration-300 ${i === s.phase ? (p.stw ? "border-rose bg-rose/25" : "border-copper bg-copper/15") : "border-line-2"}`}>
              <div className={`truncate font-mono text-[10px] mono-tight @md:text-[11px] ${i === s.phase ? "text-ink" : "text-ink-3"}`}>{p.name}</div>
              <div className="hidden truncate font-mono text-[9px] text-ink-3 @lg:block">{p.sub}</div>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-2 font-mono text-[11px] mono-tight">
          <span className="text-ink-3">your goroutines</span>
          <motion.span animate={{ backgroundColor: stw ? "rgba(240,96,124,.25)" : "rgba(63,198,180,.15)" }} className={`rounded-[2px] px-1.5 ${stw ? "text-rose" : "text-teal"}`}>
            {stw ? "stopped: the world is stopped" : "running"}
          </motion.span>
          {s.phase === 2 && <span className={s.barrier ? "text-teal" : "text-rose"}>write barrier {s.barrier ? "on" : "OFF"}</span>}
        </div>
      </div>

      <div className="grid gap-3 @2xl:grid-cols-[minmax(0,1fr)_15rem] @2xl:items-start">
        <div className="relative aspect-[680/340] rounded-[3px] border border-line bg-[#0e1024]">
          <svg viewBox="0 0 680 320" className="h-full w-full" role="img" aria-label="Heap objects coloured white, grey and black as the collector marks them.">
            {s.edges.map((e, i) => {
              const a = byId[e.from], b = byId[e.to];
              if (!a || !b) return null;
              const freed = a.freed || b.freed;
              const dangling = freed && !a.freed && s.dangling.includes(b.id);
              if (freed && !dangling) return null;
              const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
              const x1 = a.x + (dx / d) * 16, y1 = a.y + (dy / d) * 16, x2 = b.x - (dx / d) * 19, y2 = b.y - (dy / d) * 19;
              const color = dangling ? "#f0607c" : e.kind === "barrier" ? "#3fc6b4" : e.kind === "gone" ? "#948fb4" : INK;
              return (
                <motion.line
                  key={`${e.from}-${e.to}-${i}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={color}
                  strokeOpacity={e.kind === "gone" ? 0.35 : e.kind || dangling ? 1 : 0.3}
                  strokeWidth={e.kind || dangling ? 2 : 1.3}
                  strokeDasharray={e.kind === "gone" || dangling ? "5 4" : undefined}
                  markerEnd={e.kind === "gone" ? undefined : dangling ? "url(#m-rose)" : e.kind === "barrier" ? "url(#m-teal)" : "url(#m-ink)"}
                  initial={{ pathLength: e.kind ? 0 : 1 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.6, ease: E }}
                />
              );
            })}
            <AnimatePresence>
              {s.nodes.filter((n) => !n.freed).map((n) => (
                <motion.g
                  key={n.id}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.2, transition: { duration: 0.6 } }}
                  style={{ originX: `${n.x}px`, originY: `${n.y}px` }}
                  transition={{ duration: 0.4, ease: E }}
                >
                  {(s.scanning === n.id || s.shaded.includes(n.id)) && (
                    <motion.circle key={`${s.scanned}-${s.barrierHits}`} cx={n.x} cy={n.y} r={16} fill="none" stroke={s.scanning === n.id ? "#e78b52" : "#3fc6b4"} strokeWidth="2" initial={{ r: 16, opacity: 1 }} animate={{ r: 28, opacity: 0 }} transition={{ duration: 0.9 }} />
                  )}
                  <circle
                    cx={n.x} cy={n.y} r={15}
                    fill={n.color === "black" ? INK : n.color === "grey" ? "url(#p-ivory)" : "#11132a"}
                    stroke={INK} strokeOpacity={n.color === "white" ? 0.5 : 0.95} strokeWidth={1.5}
                    className="transition-[fill] duration-500"
                  />
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fontFamily="var(--font-martian), monospace" fill={n.color === "black" ? "#11132a" : INK} fontWeight="600">
                    {n.id.replace(/^n/, "")}
                  </text>
                  {n.root && <text x={n.x} y={n.y - 22} textAnchor="middle" fontSize="10" fontFamily="var(--font-martian), monospace" fill="#948fb4">{n.root}</text>}
                </motion.g>
              ))}
            </AnimatePresence>
            {/* freed while still pointed at */}
            {s.nodes.filter((n) => n.freed && s.dangling.includes(n.id)).map((n) => (
              <g key={`d-${n.id}`}>
                <motion.circle cx={n.x} cy={n.y} r={15} fill="none" stroke="#f0607c" strokeDasharray="4 3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} />
                <motion.text x={n.x} y={n.y + 32} textAnchor="middle" fontSize="10.5" fontFamily="var(--font-martian), monospace" fill="#f0607c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
                  {n.id} freed · still referenced
                </motion.text>
              </g>
            ))}
          </svg>
          <div className="absolute bottom-2 left-3 flex gap-3 font-mono text-[10px] text-ink-3">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border border-ink/50" />white</span>
            <span className="flex items-center gap-1"><span className="hatch-ivory size-2.5 rounded-full border border-ink" />grey</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-ink" />black</span>
          </div>
        </div>

        <div className={`flex min-w-0 flex-col gap-3 ${focus === "pacing" ? "@2xl:[&>*:first-child]:opacity-40" : ""}`}>
          <div className="rounded-[3px] border border-line-2 p-2.5">
            <div className="mb-1.5 font-mono text-[11px] text-ink-3">grey set · work buffers</div>
            <div className="flex min-h-6 flex-wrap gap-1">
              <AnimatePresence initial={false}>
                {s.grey.map((id) => (
                  <motion.span key={id} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} className="hatch-ivory rounded-[2px] border border-ink/70 px-1.5 font-mono text-[11px] text-ink">
                    {id.replace(/^n/, "")}
                  </motion.span>
                ))}
              </AnimatePresence>
              {!s.grey.length && <span className="font-mono text-[11px] text-ink-3/60">empty</span>}
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 font-mono text-[11px]">
              <dt className="text-ink-3">scanned</dt><dd className="tnum text-ink">{s.scanned}</dd>
              <dt className="text-ink-3">barrier hits</dt><dd className="tnum text-teal">{s.barrierHits}</dd>
            </dl>
          </div>
          <div className={`rounded-[3px] border p-2.5 transition-colors ${focus === "pacing" ? "border-copper bg-copper/[0.06]" : "border-line-2"}`}>
            <div className="mb-1.5 flex justify-between font-mono text-[11px]"><span className="text-ink-3">pacing · GOGC={s.gogc}</span><span className="tnum text-ink">{heap} / {s.goal} KB</span></div>
            <div className="relative h-5 overflow-hidden rounded-[2px] bg-substrate-4">
              <motion.div className="absolute inset-y-0 left-0 bg-copper/45" animate={{ width: `${(heap / max) * 100}%` }} transition={{ duration: 0.6, ease: E }} />
              <motion.div className="absolute inset-y-0 left-0 bg-teal/70" animate={{ width: `${(s.live / max) * 100}%` }} transition={{ duration: 0.6, ease: E }} />
              <motion.div className="absolute inset-y-[-2px] w-[2px] bg-rose" animate={{ left: `${(s.goal / max) * 100}%` }} transition={{ duration: 0.6, ease: E }} />
            </div>
            <div className="mt-1.5 space-y-0.5 font-mono text-[11px]">
              <div className="flex justify-between"><span className="text-teal">live after last cycle</span><span className="tnum text-ink">{s.live} KB</span></div>
              <div className="flex justify-between"><span className="text-copper">heap now</span><span className="tnum text-ink">{heap} KB</span></div>
              <div className="flex justify-between"><span className="text-rose">next goal</span><span className="tnum text-ink">{s.goal} KB</span></div>
              <div className="pt-1 text-ink-3">goal = live × (1 + {s.gogc}/100)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
