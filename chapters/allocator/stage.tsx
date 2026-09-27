"use client";

import { AnimatePresence, motion } from "motion/react";
import { type AllocState, SIZE_CLASSES, type Tier } from "@/lib/engines/alloc";

const E = [0.16, 1, 0.3, 1] as const;

const TIERS: { id: Tier; name: string; sub: string; lock: boolean }[] = [
  { id: "mallocgc", name: "mallocgc", sub: "rounds, picks a path", lock: false },
  { id: "mcache", name: "mcache", sub: "per P · a span per class", lock: false },
  { id: "mcentral", name: "mcentral", sub: "per size class · shared", lock: true },
  { id: "mheap", name: "mheap", sub: "8 KB pages · arenas", lock: true },
];

export function AllocStage({ st, show = { ruler: true, span: true } }: { st: AllocState; show?: { ruler?: boolean; span?: boolean } }) {
  const depth = st.path.length;
  return (
    <div className="@container flex h-full min-h-0 flex-col [justify-content:safe_center] gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-[3px] border border-line-2 bg-[#0e1024] px-3 py-1.5 font-mono text-[13px] text-ink mono-tight">{st.req ? st.req.label.split(" · ")[0] : "p := new(T)"}</code>
        {st.req && <span className="font-mono text-[12px] text-ink-3 mono-tight">{st.req.size} B · {st.req.noscan ? "no pointers (noscan)" : "has pointers"}</span>}
      </div>

      {/* the tiers, and how far this request had to go */}
      <div className="relative grid grid-cols-4 gap-2">
        {TIERS.map((t, i) => {
          const lit = st.path.includes(t.id);
          return (
            <motion.div
              key={t.id}
              animate={{ opacity: lit || !st.req ? 1 : 0.4 }}
              className={`relative flex min-h-[6.5rem] flex-col gap-1 rounded-[3px] border p-2.5 transition-colors duration-300 ${lit ? (t.lock ? "border-rose bg-rose/[0.08]" : "border-teal bg-teal/[0.08]") : "border-line-2"}`}
            >
              <span className="font-mono text-[13px] font-semibold text-ink @md:text-[14px]">{t.name}</span>
              <span className="text-[12px] leading-snug text-ink-3">{t.sub}</span>
              <span className={`mt-auto flex items-center gap-1.5 font-mono text-[11px] ${t.lock ? "text-rose" : "text-teal"}`}>
                <Lock closed={t.lock && lit} open={!t.lock} />
                {t.lock ? (lit ? "lock held" : "needs a lock") : "no lock"}
              </span>
              {i < 3 && <span aria-hidden className="absolute -right-2 top-1/2 h-px w-2 bg-ink-3/50" />}
            </motion.div>
          );
        })}
        {/* the request travelling down */}
        {st.req && (
          <motion.span
            key={st.n}
            className="pointer-events-none absolute -top-1.5 size-3 rounded-full bg-copper shadow-[0_0_0_3px_#171a35]"
            initial={{ left: "calc(12.5% - 6px)" }}
            animate={{ left: `calc(${((depth - 0.5) / 4) * 100}% - 6px)` }}
            transition={{ duration: 0.25 * depth + 0.3, ease: E }}
          />
        )}
      </div>

      {show.ruler && <Ruler st={st} />}

      <AnimatePresence mode="wait">
        {show.span && st.kind === "tiny" && <Tiny key="tiny" st={st} />}
        {show.span && st.kind === "small" && <Span key={`span-${st.cls}`} st={st} />}
        {show.span && st.kind === "large" && (
          <motion.div key="large" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[3px] border border-rose/60 p-3">
            <div className="mb-2 font-mono text-[11px] text-rose">a dedicated span: 8 pages, one object</div>
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.span key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.06 }} className="hatch-rose h-10 origin-bottom rounded-[1px] border border-rose/70" />
              ))}
            </div>
            <div className="mt-1.5 font-mono text-[10px] text-ink-3">page 0 … page 7 · 8 KB each</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Lock({ closed, open }: { closed: boolean; open: boolean }) {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" aria-hidden>
      <rect x="1" y="5" width="9" height="6.5" rx="1" stroke="currentColor" />
      <motion.path d="M3 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="currentColor" animate={{ y: open ? -1.5 : closed ? 0 : -1 }} />
    </svg>
  );
}

/* 67 size classes on a log axis; the request snaps up to its class */
function Ruler({ st }: { st: AllocState }) {
  const pos = (n: number) => (Math.log2(Math.max(n, 8)) - 3) / (15 - 3);
  const req = st.req && st.kind === "small" ? st.req.size : null;
  const cls = st.kind === "small" ? SIZE_CLASSES[st.cls] : null;
  return (
    <div className="rounded-[3px] border border-line p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 font-mono text-[11px] mono-tight">
        <span className="text-ink-3">67 size classes, 8 B to 32 KB</span>
        {cls && req && (
          <span className="text-ink">
            {req} B → class {st.cls}: <span className="text-copper">{cls} B</span>
            {cls > req && <span className="text-rose"> · {cls - req} B slack</span>}
          </span>
        )}
      </div>
      <div className="relative h-9">
        {SIZE_CLASSES.slice(1).map((s, i) => (
          <span key={s} className={`absolute bottom-0 w-px ${s === cls ? "bg-copper" : "bg-ink-3/45"}`} style={{ left: `${pos(s) * 100}%`, height: s === cls ? "100%" : i % 8 === 0 ? "55%" : "35%" }} />
        ))}
        {req && (
          <motion.div key={st.n} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" initial={{ left: `${pos(req) * 100}%` }} animate={{ left: `${pos(cls!) * 100}%` }} transition={{ duration: 0.7, delay: 0.3, ease: E }}>
            <span className="size-2.5 rotate-45 bg-copper" />
          </motion.div>
        )}
      </div>
      <div className="relative mt-1 h-3 font-mono text-[10px] text-ink-3">
        {[[8, "8 B"], [256, "256 B"], [4096, "4 KB"], [32768, "32 KB"]].map(([n, l], i) => (
          <span key={l} className={`absolute ${i === 0 ? "" : i === 3 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${pos(n as number) * 100}%` }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function Span({ st }: { st: AllocState }) {
  const sp = st.spans[st.cls];
  if (!sp) return null;
  const show = Math.min(sp.nelems, 64);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[3px] border border-line p-3">
      <div className="mb-2 flex flex-wrap justify-between gap-2 font-mono text-[11px] mono-tight">
        <span className="text-ink-3">mcache span · class {st.cls} · {SIZE_CLASSES[st.cls]} B × {sp.nelems} objects in 8 KB</span>
        <span className="text-ink">freeindex {sp.used}</span>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {Array.from({ length: show }).map((_, i) => {
          const used = i < sp.used;
          const now = i === sp.used - 1 && sp.fresh;
          return (
            <motion.span
              key={i}
              animate={{ scale: now ? [1, 1.35, 1] : 1 }}
              transition={{ duration: 0.5 }}
              className={`h-4 rounded-[1px] border @md:h-5 ${now ? "border-ink bg-copper" : used ? "hatch-copper border-copper/70" : "border-dashed border-ink-3/35"}`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 font-mono text-[10px] text-ink-3">
        allocBits: one bit per object{sp.nelems > show ? ` · first ${show} of ${sp.nelems} shown` : ""}
      </div>
    </motion.div>
  );
}

function Tiny({ st }: { st: AllocState }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[3px] border border-line p-3">
      <div className="mb-2 flex justify-between font-mono text-[11px] mono-tight">
        <span className="text-ink-3">tiny block · 16 bytes · block #{st.tiny.blocks}</span>
        <span className="text-ink">tinyoffset {st.tiny.off}</span>
      </div>
      <div className="relative grid grid-cols-16 gap-[2px]" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} className="h-9 rounded-[1px] border border-dashed border-ink-3/30" style={{ gridRow: 1, gridColumn: i + 1 }} />
        ))}
        {st.tiny.objs.map((o) => (
          <motion.span
            key={o.n}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: E }}
            className="hatch-copper z-10 flex h-9 items-center justify-center rounded-[1px] border border-copper font-mono text-[10px] text-ink"
            style={{ gridRow: 1, gridColumn: `${o.off + 1} / span ${o.size}` }}
          >
            {o.size}B
          </motion.span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-3"><span>+0</span><span>+8</span><span>+16</span></div>
    </motion.div>
  );
}
