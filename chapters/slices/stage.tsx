"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { capOf, type SliceState, type View } from "@/lib/engines/slices";

const COLS = 12;
const E = [0.16, 1, 0.3, 1] as const;

export function SliceStage({ st }: { st: SliceState }) {
  const arrays = [...st.arrays].sort((a, b) => a.gen - b.gen);
  const newestGen = arrays[arrays.length - 1]?.gen;
  const cols = Math.max(COLS, ...arrays.map((a) => a.cells.length));
  const scope = useId();
  return (
    <LayoutGroup id={scope}>
      <div className="@container flex h-full min-h-0 flex-col justify-center gap-6 py-2">
        <motion.div layout className="flex items-center gap-3">
          <code className="rounded-[3px] border border-line-2 bg-[#0e1024] px-3 py-1.5 font-mono text-[13px] text-ink mono-tight @md:text-[14px]">
            {st.code}
          </code>
          {st.grew && (
            <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="font-mono text-[12px] text-rose mono-tight">
              growslice · mallocgc({capOf(st[st.grew.who] as View) * 8} B)
            </motion.span>
          )}
        </motion.div>
        <AnimatePresence mode="popLayout" initial={false}>
          {arrays.map((a) => {
            const views = (["s", "t"] as const).filter((k) => st[k] && st[k]!.gen === a.gen);
            const stale = a.gen !== newestGen;
            return (
              <motion.section
                key={a.gen}
                layout
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: stale ? 0.62 : 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, filter: "blur(4px)", transition: { duration: 0.4 } }}
                transition={{ duration: 0.55, ease: E }}
                className="relative"
              >
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px] text-ink-3 mono-tight @md:text-[12px]">
                  <span className="text-ink-2">backing array</span>
                  <span>
                    [{a.cells.length}]int · {a.cells.length * 8} B
                  </span>
                  {stale && <span className="text-violet">earlier array: only {views.join(" and ")} still {views.length > 1 ? "point" : "points"} here</span>}
                </div>
                <div className="grid gap-x-[3px] gap-y-2 [--hh:2.5rem] @md:[--hh:2.75rem]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                  {views.map((k, row) => (
                    <Header key={k} name={k} v={st[k]!} row={row + 1} dropRows={views.length - 1 - row} />
                  ))}
                  {a.cells.map((v, i) => {
                    const w = st.wrote.find((x) => x.gen === a.gen && x.idx === i);
                    const fresh = st.grew?.to === a.gen;
                    return <Cell key={`${a.gen}-${i}`} v={v} i={i} wrote={!!w} clobber={w?.clobber} was={w?.was} fresh={fresh} row={views.length + 1} />;
                  })}
                  {views.map((k, row) => (
                    <Bars key={`b-${k}`} name={k} v={st[k]!} row={views.length + 2 + row} />
                  ))}
                </div>
              </motion.section>
            );
          })}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

function Header({ name, v, row, dropRows }: { name: "s" | "t"; v: View; row: number; dropRows: number }) {
  return (
    <motion.div
      layoutId={`hdr-${name}`}
      transition={{ duration: 0.7, ease: E }}
      className="relative grid grid-cols-3 gap-[3px]"
      style={{ gridColumn: `${v.off + 1} / span 3`, gridRow: row }}
    >
      {[
        [`${name}.ptr`, `&[${v.off}]`],
        ["len", String(v.len)],
        ["cap", String(capOf(v))],
      ].map(([f, val], i) => (
        <div key={f} className="relative flex h-[var(--hh)] flex-col justify-center rounded-[2px] border border-teal/70 bg-teal/[0.13] px-1 text-center">
          <span className="block w-full truncate font-mono text-[9px] leading-none text-teal mono-tight @md:text-[10px]">{f}</span>
          <motion.span key={val} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="tnum mt-0.5 truncate font-mono text-[11px] leading-none text-ink mono-tight @md:text-[13px]">
            {val}
          </motion.span>
          {i === 0 && (
            <span
              aria-hidden
              className="absolute left-1/2 top-full w-[2px] -translate-x-1/2 bg-teal"
              style={{ height: `calc(${dropRows} * (var(--hh) + 0.5rem) + 0.5rem)` }}
            >
              <span className="absolute -bottom-[3px] left-1/2 size-0 -translate-x-1/2 border-x-[4px] border-t-[5px] border-x-transparent border-t-teal" />
            </span>
          )}
        </div>
      ))}
    </motion.div>
  );
}

function Cell({ v, i, wrote, clobber, was, fresh, row }: { v: number | null; i: number; wrote: boolean; clobber?: string; was?: number | null; fresh: boolean; row: number }) {
  return (
    <motion.div
      initial={fresh ? { opacity: 0, y: -34 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: fresh ? 0.25 + i * 0.07 : 0, ease: E }}
      className={`relative flex h-12 flex-col items-center justify-center rounded-[2px] border @md:h-14 ${
        v === null ? "hatch-fill border-dashed border-ink-3/40" : clobber ? "hatch-rose border-rose" : "hatch-copper border-copper/70"
      }`}
      style={{ gridRow: row, gridColumn: i + 1 }}
    >
      {wrote && (
        <motion.span
          aria-hidden
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 1.35 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className={`absolute inset-0 rounded-[2px] border-2 ${clobber ? "border-rose" : "border-copper"}`}
        />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(v)}
          initial={{ opacity: 0, y: -10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.4, ease: E }}
          className="tnum font-mono text-[12px] text-ink mono-tight @md:text-[15px]"
        >
          {v === null ? "" : v}
        </motion.span>
      </AnimatePresence>
      <span className="absolute bottom-0.5 font-mono text-[9px] text-ink-3 @md:text-[10px]">{i}</span>
      {clobber && was != null && (
        <span className="absolute top-0.5 font-mono text-[9px] text-rose line-through mono-tight @md:text-[10px]">{was}</span>
      )}
    </motion.div>
  );
}

function Bars({ name, v, row }: { name: "s" | "t"; v: View; row: number }) {
  const cap = capOf(v);
  return (
    <motion.div
      layoutId={`bars-${name}`}
      transition={{ duration: 0.7, ease: E }}
      className="relative h-4"
      style={{ gridRow: row, gridColumn: `${v.off + 1} / span ${cap}` }}
    >
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-ink-3/60" />
      <motion.div
        layout
        className={`absolute left-0 top-1/2 h-[3px] -translate-y-1/2 ${name === "s" ? "bg-teal" : "bg-teal/60"}`}
        style={{ width: `${(v.len / cap) * 100}%` }}
        transition={{ duration: 0.5, ease: E }}
      />
      <span className="absolute -top-[5px] right-0 whitespace-nowrap bg-substrate-2 pl-1.5 font-mono text-[10px] leading-none text-ink-2 mono-tight @md:text-[11px]">
        {name}: len {v.len} · cap {cap}
      </span>
    </motion.div>
  );
}
