"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useId } from "react";
const mb = (n: number) => `${(n / 1e6).toLocaleString("en-US")} MB`;
import { type Field, layout, type Layout } from "@/lib/engines/structs";

const E = [0.16, 1, 0.3, 1] as const;

export function StructStage({ fields, k, final, focus, scale }: { fields: Field[]; k?: number; final?: boolean; focus?: string | null; scale?: Field[][] }) {
  const scope = useId();
  const L = layout(fields, k ?? fields.length, final ?? (k === undefined || k === fields.length));
  if (scale) return <Scale sets={scale} />;
  const rows = Math.max(3, Math.ceil(Math.max(L.size, L.cursor) / 8));
  return (
    <LayoutGroup id={scope}>
      <div className="@container flex h-full min-h-0 flex-col justify-center gap-5">
        <div className="grid gap-5 @2xl:grid-cols-[minmax(0,1fr)_13rem]">
          <Grid L={L} rows={rows} focus={focus} />
          <FieldList fields={fields} L={L} k={k ?? fields.length} focus={focus} />
        </div>
        <Metrics L={L} done={final ?? true} />
      </div>
    </LayoutGroup>
  );
}

function Grid({ L, rows, focus }: { L: Layout; rows: number; focus?: string | null }) {
  const segs = L.placed.flatMap((p) => {
    const out: { key: string; row: number; col: number; span: number; p: typeof p; first: boolean }[] = [];
    let o = p.off;
    let left = p.size;
    let i = 0;
    while (left > 0) {
      const col = o % 8;
      const span = Math.min(8 - col, left);
      out.push({ key: `${p.n}-${i}`, row: Math.floor(o / 8), col, span, p, first: i === 0 });
      o += span; left -= span; i++;
    }
    return out;
  });
  const padCells = L.pads.flatMap((pd) => Array.from({ length: pd.n }, (_, j) => ({ off: pd.off + j, tail: pd.tail })));
  return (
    <div className="grid grid-cols-[2.6rem_minmax(0,1fr)] gap-x-2">
      <div className="grid gap-[3px]" style={{ gridTemplateRows: `repeat(${rows}, 3rem)` }}>
        {Array.from({ length: rows }, (_, r) => (
          <span key={r} className="tnum flex items-center justify-end font-mono text-[11px] text-ink-3">+{r * 8}</span>
        ))}
      </div>
      <div className="relative grid grid-cols-8 gap-[3px]" style={{ gridTemplateRows: `repeat(${rows}, 3rem)` }}>
        {Array.from({ length: rows * 8 }, (_, i) => (
          <div key={`bg${i}`} className="rounded-[2px] border border-dashed border-ink-3/20" style={{ gridRow: Math.floor(i / 8) + 1, gridColumn: (i % 8) + 1 }} />
        ))}
        <AnimatePresence>
          {padCells.map((c) => (
            <motion.div
              key={`pad-${c.off}-${c.tail}`}
              initial={{ opacity: 0, scaleX: 0.2 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, delay: 0.25 + (c.off % 8) * 0.04, ease: E }}
              className={`hatch-fill flex origin-left items-center justify-center rounded-[2px] border ${c.tail ? "border-violet/50" : "border-rose/45"}`}
              style={{ gridRow: Math.floor(c.off / 8) + 1, gridColumn: (c.off % 8) + 1 }}
            >
              <span className="font-mono text-[9px] text-ink-3 @md:text-[10px]">{c.tail ? "tail" : "pad"}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {segs.map((s) => (
          <motion.div
            key={s.key}
            layoutId={`f-${s.key}`}
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: E }}
            className={`hatch-copper relative z-10 flex items-center gap-2 overflow-hidden rounded-[2px] border px-2 ${focus === s.p.n ? "border-ink" : "border-copper/80"}`}
            style={{ gridRow: s.row + 1, gridColumn: `${s.col + 1} / span ${s.span}` }}
          >
            {s.first && (
              <>
                <span className="font-mono text-[13px] font-semibold text-ink">{s.p.n}</span>
                {s.span > 1 && <span className="truncate font-mono text-[10px] text-ink-2 mono-tight">{s.p.t} @{s.p.off}</span>}
              </>
            )}
          </motion.div>
        ))}
        {/* the offset cursor */}
        {L.cursor < rows * 8 && (
          <motion.div
            layoutId="cursor"
            transition={{ duration: 0.5, ease: E }}
            className="pointer-events-none relative z-20"
            style={{ gridRow: Math.floor(L.cursor / 8) + 1, gridColumn: (L.cursor % 8) + 1 }}
          >
            <span className="absolute -left-[2.5px] -top-1 bottom-[-4px] w-[2px] bg-teal" />
          </motion.div>
        )}
      </div>
    </div>
  );
}

function FieldList({ fields, L, k, focus }: { fields: Field[]; L: Layout; k: number; focus?: string | null }) {
  return (
    <ul className="grid grid-cols-2 gap-1.5 self-start @2xl:grid-cols-1">
      {fields.map((f, i) => {
        const p = L.placed.find((x) => x.n === f.n);
        const pad = L.pads.find((x) => x.before === f.n);
        const on = focus === f.n;
        return (
          <motion.li
            key={f.n}
            layout
            transition={{ duration: 0.5, ease: E }}
            className={`rounded-[3px] border px-2.5 py-1.5 font-mono text-[12px] mono-tight transition-colors ${on ? "border-copper bg-copper/10" : i < k ? "border-line-2" : "border-line opacity-45"}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink">{f.n} <span className="text-teal">{f.t}</span></span>
              <span className="text-ink-3">{f.size}B</span>
            </div>
            <div className="text-[11px] text-ink-3">
              align {f.align}
              {p && <> · @{p.off}</>}
              {pad && <span className="text-rose"> · +{pad.n} pad</span>}
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

function Metrics({ L, done }: { L: Layout; done: boolean }) {
  const pad = L.pads.reduce((a, p) => a + p.n, 0);
  const items = [
    [done ? "Sizeof" : "next offset", done ? `${L.size} B` : `${L.cursor}`],
    ["Alignof", `${L.align}`],
    ["payload", `${L.payload} B`],
    ["padding", `${pad} B`],
    ["× 1,000,000", done ? mb(L.size * 1e6) : "…"],
  ];
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[3px] border border-line-2 bg-line @md:grid-cols-5">
      {items.map(([l, v], i) => (
        <div key={l} className="bg-substrate-2 px-3 py-2">
          <dt className="font-mono text-[10px] text-ink-3">{l}</dt>
          <motion.dd key={v} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`tnum font-mono text-[15px] ${i === 3 && pad > 0 ? "text-rose" : i === 0 ? (done ? "text-copper" : "text-teal") : "text-ink"}`}>
            {v}
          </motion.dd>
        </div>
      ))}
    </dl>
  );
}

/* a slice of structs, laid over 64-byte cache lines */
function Scale({ sets }: { sets: Field[][] }) {
  return (
    <div className="@container flex h-full flex-col justify-center gap-7">
      {sets.map((fs, si) => {
        const L = layout(fs);
        const per = 64 / L.size;
        const cells = Array.from({ length: 128 }, (_, i) => {
          const rec = Math.floor(i / L.size);
          const within = i % L.size;
          const isPad = L.pads.some((p) => within >= p.off && within < p.off + p.n);
          return { rec, isPad };
        });
        return (
          <div key={si}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 font-mono text-[12px] mono-tight">
              <span className="text-ink">[]Record · {L.size}-byte elements</span>
              <span className={per % 1 === 0 ? "text-teal" : "text-rose"}>
                {per % 1 === 0 ? `${per} per cache line` : `${per.toFixed(2)} per line, one straddles`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((line) => (
                <div key={line}>
                  <div className="grid grid-cols-16 gap-[2px]" style={{ gridTemplateColumns: "repeat(16, minmax(0,1fr))" }}>
                    {cells.slice(line * 64, line * 64 + 64).map((c, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: (line * 64 + i) * 0.006 }}
                        className={`h-3.5 rounded-[1px] @md:h-4 ${c.isPad ? "hatch-fill border border-rose/40" : c.rec % 2 ? "bg-copper/70" : "bg-copper/35"}`}
                      />
                    ))}
                  </div>
                  <span className="mt-1 block font-mono text-[10px] text-ink-3">cache line {line} · 64 B</span>
                </div>
              ))}
            </div>
            <p className="mt-2 font-mono text-[12px] text-ink-2 mono-tight">
              1,000,000 elements = <span className={si === 0 ? "text-rose" : "text-teal"}>{mb(L.size * 1e6)}</span>, {Math.ceil((L.size * 1e6) / 64).toLocaleString("en-US")} cache lines to scan
            </p>
          </div>
        );
      })}
    </div>
  );
}
