"use client";

import { motion } from "motion/react";
import { growthChain, MEASURED } from "@/lib/engines/slices";

const E = [0.16, 1, 0.3, 1] as const;

/** growslice's whole chain, computed, and checked against what go1.26.2 measured */
export function GrowthLadder({ which = 1, upto }: { which?: number; upto?: number }) {
  const m = MEASURED[which];
  const chain = growthChain(m.elem, m.caps[0], m.caps.length - 1);
  const shown = upto ?? chain.length;
  const max = Math.log2(m.caps[m.caps.length - 1]);
  return (
    <div className="@container flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[12px] text-ink-2 mono-tight">
          append one {m.label === "[]byte" ? "byte" : "element"} at a time to a <span className="text-ink">{m.label}</span>
        </span>
        <span className="font-mono text-[11px] text-ink-3 mono-tight">starts at {m.caps[0]}: the 32-byte stack buffer</span>
      </div>
      <div className="min-h-0 flex-1 space-y-[5px] overflow-auto pr-1">
        {chain.map((c, i) => {
          const measured = m.caps[i + 1];
          const ok = measured === c.cap;
          const turned = c.rule === "1.25x";
          const rounded = c.rounded !== c.bytes;
          return (
            <motion.div
              key={`${which}-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: i < shown ? 1 : 0.14, x: 0 }}
              transition={{ duration: 0.45, delay: i < shown ? i * 0.06 : 0, ease: E }}
              className="grid grid-cols-[3.2rem_minmax(0,1fr)] items-center gap-3 @lg:grid-cols-[3.6rem_minmax(0,1fr)_minmax(0,21rem)]"
            >
              <span className="tnum text-right font-mono text-[12px] text-ink-3 mono-tight">{c.from}</span>
              <div className="relative h-6">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: i < shown ? `${(Math.log2(c.cap) / max) * 100}%` : 0 }}
                  transition={{ duration: 0.6, delay: i * 0.06, ease: E }}
                  className={`absolute inset-y-0 left-0 rounded-[2px] border ${turned ? "hatch-copper border-copper/80" : "hatch-teal border-teal/70"}`}
                />
                <span className="tnum absolute inset-y-0 left-2 flex items-center font-mono text-[12px] font-semibold text-ink mono-tight">
                  {c.cap}
                </span>
              </div>
              <span className="col-span-2 flex flex-wrap items-center gap-x-2 pl-[3.95rem] font-mono text-[11px] text-ink-3 mono-tight @lg:col-span-1 @lg:pl-0 @lg:text-[12px]">
                {turned ? (
                  <span className="text-copper">+({c.from}+768)/4 = {c.want}</span>
                ) : (
                  <span className="text-teal">×2 = {c.want}</span>
                )}
                <span>
                  {c.bytes} B{rounded ? <span className="text-ink-2"> → class {c.rounded}</span> : ""}
                </span>
                <span className={ok ? "text-teal" : "text-rose"}>{ok ? "= measured" : `measured ${measured}`}</span>
              </span>
            </motion.div>
          );
        })}
      </div>
      <p className="font-mono text-[11px] text-ink-3 mono-tight">
        <span className="text-teal">teal: doubling</span> below 256 · <span className="text-copper">copper: ≈1.25×</span> above it · then rounded up to a size class
      </p>
    </div>
  );
}
