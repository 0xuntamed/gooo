"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { CodePane } from "@/components/code-pane";
import { type Frame, GUARD, type StackState, used } from "@/lib/engines/stack";

const E = [0.16, 1, 0.3, 1] as const;

const ASM = `main.makeCounter:
  CMPQ  SP, 16(R14)     ; R14 = g · 16(R14) = g.stackguard0
  JLS   morestack       ; below the guard? grow first
  PUSHQ BP
  ...
morestack:
  CALL  runtime.morestack_noctxt(SB)
  JMP   0               ; then retry the whole function`;

const LIT: Record<StackState["phase"], number[]> = {
  fresh: [], call: [2, 3, 4], "check-fail": [2, 3], copy: [7], adjust: [7], retry: [8], ret: [], shrink: [], noshrink: [],
};

/* illustrative addresses: a new stack lands somewhere else entirely */
const BASE: Record<number, number> = { 2048: 0xc000038000, 4096: 0xc000080000, 8192: 0xc0000a0000, 16384: 0xc0000c0000 };

export function StackStage({ st, focus }: { st: StackState; focus?: string }) {
  const scope = useId();
  const copying = st.phase === "copy" || st.phase === "adjust";
  return (
    <LayoutGroup id={scope}>
      <div className="@container grid h-full min-h-0 gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
        <div className="flex items-start justify-center gap-8 pt-2 @md:gap-14">
          <AnimatePresence mode="popLayout">
            {st.old && (
              <motion.div key="old" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4 }}>
                <Tower size={st.old.size} frames={st.old.frames} ghost />
              </motion.div>
            )}
          </AnimatePresence>
          <Tower size={st.size} frames={st.frames} pending={st.phase === "check-fail" ? st.pending : null} adjusting={st.phase === "adjust"} stale={st.staleUintptr} focus={focus} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <CodePane code={ASM} lang="asm" lit={LIT[st.phase]} caption="the prologue of every non-leaf function" size="sm" numbers />
          <div className="flex flex-wrap gap-1.5">
            {["_Grunning", "_Gcopystack", "_Gwaiting", "_Gdead"].map((g) => {
              const on = (g === "_Gcopystack" && copying) || (g === "_Grunning" && !copying);
              return (
                <span key={g} className={`rounded-[2px] border px-2 py-0.5 font-mono text-[11px] transition-colors duration-300 ${on ? (g === "_Gcopystack" ? "border-rose bg-rose/20 text-ink" : "border-copper bg-copper/20 text-ink") : "border-line-2 text-ink-3"}`}>
                  {g}
                </span>
              );
            })}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[12px] mono-tight">
            <dt className="text-ink-3">stack</dt><dd className="tnum text-ink">{st.size} B</dd>
            <dt className="text-ink-3">in use</dt><dd className="tnum text-ink">{used(st.frames)} B</dd>
            <dt className="text-ink-3">guard</dt><dd className="tnum text-rose">lo + {GUARD} B</dd>
            <dt className="text-ink-3">headroom</dt><dd className="tnum text-ink">{Math.max(0, st.size - GUARD - used(st.frames))} B</dd>
          </dl>
        </div>
      </div>
    </LayoutGroup>
  );
}

/* A byte scale that stays readable after the stack doubles: frames keep their
   size, and the unused middle is compressed behind a labelled break. */
const K = 0.2;
const GUARD_PX = 58;
const FREE_MAX = 84;

function Tower({ size, frames, ghost, pending, adjusting, stale, focus }: { size: number; frames: Frame[]; ghost?: boolean; pending?: Frame | null; adjusting?: boolean; stale?: boolean; focus?: string }) {
  let off = 0;
  const pos = new Map<string, { top: number; h: number }>();
  for (const f of frames) { pos.set(f.id, { top: off * K, h: f.size * K }); off += f.size; }
  const usedPx = off * K;
  const freeB = Math.max(0, size - GUARD - off);
  const freePx = Math.min(freeB * K, FREE_MAX);
  const broken = freeB * K > FREE_MAX;
  const H = usedPx + freePx + GUARD_PX;
  const guardTop = usedPx + freePx;
  const lo = BASE[size] ?? 0xc0000e0000;
  const held = frames.filter((f) => f.holds && f.holds.to);
  return (
    <motion.div layout transition={{ duration: 0.8, ease: E }} className="flex flex-col items-center">
      <div className="mb-1.5 text-center font-mono text-[11px] mono-tight">
        <div className={ghost ? "text-ink-3" : "text-ink"}>{ghost ? "old stack · freed after the copy" : `stack · ${size / 1024} KB`}</div>
        <div className="text-ink-3">hi 0x{(lo + size).toString(16)}</div>
      </div>
      <div className={`relative w-40 rounded-[2px] border @md:w-52 ${ghost ? "border-dashed border-ink-3/40" : "border-ink/40 bg-[#141731]"}`} style={{ height: H }}>
        {frames.map((f) => {
          const p = pos.get(f.id)!;
          return ghost ? (
            <div key={f.id} className="absolute inset-x-1 rounded-[1px] border border-dashed border-ink-3/30" style={{ top: p.top, height: p.h }} />
          ) : (
            <motion.div
              key={f.id}
              layoutId={`fr-${f.id}`}
              transition={{ layout: { duration: 0.9, ease: E } }}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              className={`absolute inset-x-1 flex items-center justify-between gap-1 overflow-hidden rounded-[1px] border px-2 ${f.id === "entry" ? "border-ink-3/50 bg-substrate-4/60" : "hatch-copper border-copper/70"} ${focus === f.id ? "ring-2 ring-ink" : ""}`}
              style={{ top: p.top, height: p.h }}
            >
              <span className="truncate font-mono text-[11px] text-ink">{f.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-ink-2">{f.size}</span>
            </motion.div>
          );
        })}
        {broken && (
          <div className="absolute inset-x-0 flex items-center justify-center" style={{ top: usedPx + freePx / 2 - 8, height: 16 }}>
            <svg className="absolute inset-x-0 h-4 w-full" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden>
              <path d="M0 8 L10 3 L20 13 L30 3 L40 13 L50 3 L60 13 L70 3 L80 13 L90 3 L100 8" fill="none" stroke="#948fb4" strokeOpacity=".5" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="relative bg-[#141731] px-1.5 font-mono text-[10px] text-ink-3">{freeB} B free</span>
          </div>
        )}
        {!ghost && (
          <svg className="pointer-events-none absolute left-full top-0 w-10 overflow-visible" style={{ height: H }} viewBox={`0 0 40 ${H}`} aria-hidden>
            {held.map((f) => {
              const a = pos.get(f.id), b = pos.get(f.holds!.to);
              if (!a || !b) return null;
              const y1 = a.top + a.h / 2, y2 = b.top + b.h / 2;
              const bad = f.holds!.kind === "uintptr" && stale;
              return (
                <motion.path
                  key={f.id}
                  d={`M0 ${y1} C 34 ${y1}, 34 ${y2}, 2 ${y2}`}
                  fill="none"
                  strokeDasharray={f.holds!.kind === "uintptr" ? "4 3" : undefined}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: bad ? 0.35 : 1, stroke: bad ? "#f0607c" : adjusting && f.holds!.kind === "ptr" ? "#ece9f5" : "#3fc6b4" }}
                  transition={{ duration: 0.8, ease: E }}
                  strokeWidth="1.8"
                />
              );
            })}
          </svg>
        )}
        <motion.div layout className="absolute -inset-x-3 border-t-2 border-dashed border-rose" style={{ top: guardTop }}>
          <span className="absolute -top-4 right-0 font-mono text-[10px] text-rose">stackguard0</span>
        </motion.div>
        <div className="hatch-fill absolute inset-x-0 bottom-0 flex items-end justify-center pb-1 opacity-80" style={{ top: guardTop }}>
          <span className="font-mono text-[9px] text-ink-3">{GUARD} B guard</span>
        </div>
        {!ghost && (
          <motion.div layout transition={{ duration: 0.6, ease: E }} className="absolute -left-12 flex items-center gap-1" style={{ top: usedPx - 7 }}>
            <span className="font-mono text-[10px] text-teal">SP</span>
            <span className="h-px w-5 bg-teal" />
          </motion.div>
        )}
        <AnimatePresence>
          {pending && (
            <motion.div
              key="pend"
              layoutId={`fr-${pending.id}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-1 z-10 flex items-center justify-between rounded-[1px] border-2 border-dashed border-rose bg-rose/20 px-2"
              style={{ top: usedPx, height: pending.size * K }}
            >
              <span className="truncate font-mono text-[11px] text-ink">{pending.name}?</span>
              <span className="font-mono text-[10px] text-rose">{pending.size}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-1.5 text-center font-mono text-[11px] text-ink-3 mono-tight">lo 0x{lo.toString(16)} · grows down</div>
      {!ghost && held.length > 0 && (
        <ul className="mt-2 space-y-0.5 font-mono text-[11px] mono-tight">
          {held.map((f) => {
            const bad = f.holds!.kind === "uintptr" && stale;
            const target = frames.find((x) => x.id === f.holds!.to)?.name;
            return (
              <li key={f.id} className={bad ? "text-rose" : f.holds!.kind === "uintptr" ? "text-ink-3" : "text-teal"}>
                {f.holds!.label} → {target}{bad ? ": stale, old stack" : adjusting && f.holds!.kind === "ptr" ? ": adjusted" : ""}
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}
