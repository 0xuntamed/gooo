"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { anatomy, type Encoded, U } from "@/lib/engines/strings";

const E = [0.16, 1, 0.3, 1] as const;
const hx = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

export type StrMode = "bytes" | "index" | "decode" | "range" | "slice" | "tobytes" | "torunes";

export function StringStage({ enc, mode, decode = 1, code, playKey = 0 }: { enc: Encoded; mode: StrMode; decode?: number; code: string; playKey?: number }) {
  const scope = useId();
  const n = enc.bytes.length;
  const sliceAt = enc.runes[Math.min(7, enc.runes.length - 1)]?.off ?? 0;
  const cursor = useRangeCursor(mode === "range", enc.runes.length, playKey);
  const litRune = mode === "range" ? cursor : mode === "decode" ? decode : -1;

  return (
    <LayoutGroup id={scope}>
      <div className="@container flex h-full min-h-0 flex-col justify-center gap-5">
        <code className="self-start rounded-[3px] border border-line-2 bg-[#0e1024] px-3 py-1.5 font-mono text-[13px] text-ink mono-tight">{code}</code>

        {/* headers */}
        <div className="flex flex-wrap gap-3">
          <Header name="s" ptr="rodata+0" len={n} />
          <AnimatePresence>
            {mode === "slice" && <Header key="t" name={`t := s[${sliceAt}:]`} ptr={`rodata+${sliceAt}`} len={n - sliceAt} fresh />}
          </AnimatePresence>
        </div>

        {/* the read-only bytes */}
        <div>
          <div className="mb-1.5 flex items-baseline gap-3 font-mono text-[11px] text-ink-3 mono-tight">
            <span className="text-ink-2">read-only data</span>
            <span>{n} bytes · {enc.runes.length} runes · immutable</span>
          </div>
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {enc.bytes.map((b, i) => {
              const inLit = litRune >= 0 && b.rune === litRune;
              const idx = mode === "index" && i === 1;
              const cut = mode === "slice" && i >= sliceAt;
              return (
                <motion.div
                  key={i}
                  animate={{ y: idx || inLit ? -4 : 0 }}
                  transition={{ duration: 0.35, ease: E }}
                  className={`relative flex h-12 flex-col items-center justify-center rounded-[2px] border transition-colors duration-300 @md:h-14 ${
                    idx ? "border-ink bg-copper/40" : b.kind === "cont" ? "hatch-ivory border-ink-3/60" : "hatch-copper border-copper/70"
                  } ${inLit ? "ring-2 ring-teal ring-offset-1 ring-offset-substrate-2" : ""} ${cut ? "outline outline-1 outline-offset-2 outline-teal" : ""}`}
                >
                  <span className="font-mono text-[10px] text-ink mono-tight @md:text-[13px]">{hx(b.v)}</span>
                  <span className="absolute bottom-0.5 font-mono text-[9px] text-ink-3 @md:text-[10px]">{i}</span>
                </motion.div>
              );
            })}
            {/* runes: brackets under their bytes */}
            {enc.runes.map((r, ri) => (
              <div key={`r${ri}`} className="relative pt-2" style={{ gridColumn: `${r.off + 1} / span ${r.n}`, gridRow: 2 }}>
                <div className={`h-1.5 rounded-b-[2px] border-x border-b transition-colors duration-300 ${ri === litRune ? "border-teal" : "border-ink-3/50"}`} />
                <div className="mt-1 flex flex-col items-center">
                  <span className={`text-[15px] leading-none transition-colors @md:text-[17px] ${ri === litRune ? "text-teal" : "text-ink"}`}>{r.ch === " " ? "␣" : r.ch}</span>
                  <span className={`mt-1 font-mono text-[9px] mono-tight @md:text-[10px] ${mode === "range" ? (ri <= cursor ? "text-copper" : "text-ink-3/50") : "text-ink-3"}`}>i={r.off}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {mode === "index" && (
            <Panel key="index">
              <p className="font-mono text-[13px] text-ink mono-tight">
                s[1] <span className="text-ink-3">=</span> <span className="text-copper">0xC3</span> <span className="text-ink-3">=</span> 195 <span className="text-ink-3">· type byte</span>
              </p>
              <p className="mt-1.5 text-[14px] text-ink-2">The first half of <span className="text-ink">é</span>. There is no index that returns the character.</p>
            </Panel>
          )}
          {mode === "decode" && <Decoder key={`d${decode}`} enc={enc} ri={decode} />}
          {mode === "range" && (
            <Panel key="range">
              <p className="font-mono text-[13px] text-ink-2 mono-tight">
                for i, r := range s → i ={" "}
                {enc.runes.map((r, ri) => (
                  <span key={ri} className={ri === cursor ? "text-copper" : ri < cursor ? "text-ink" : "text-ink-3/50"}>{r.off}{ri < enc.runes.length - 1 ? " " : ""}</span>
                ))}
              </p>
              <p className="mt-1.5 font-mono text-[13px] text-ink-2 mono-tight">
                r = <span className="text-teal">{U(enc.runes[cursor]?.cp ?? 0)}</span> &apos;{enc.runes[cursor]?.ch}&apos; <span className="text-ink-3">· {enc.runes[cursor]?.n} byte{enc.runes[cursor]?.n === 1 ? "" : "s"} consumed</span>
              </p>
            </Panel>
          )}
          {mode === "tobytes" && <Copy key="b" enc={enc} kind="bytes" />}
          {mode === "torunes" && <Copy key="r" enc={enc} kind="runes" />}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

function useRangeCursor(on: boolean, n: number, key: number) {
  const [c, setC] = useState(0);
  useEffect(() => {
    if (!on) return;
    setC(0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setC(n - 1); return; }
    let i = 0;
    const id = window.setInterval(() => { i = (i + 1) % (n + 3); setC(Math.min(i, n - 1)); }, 650);
    return () => window.clearInterval(id);
  }, [on, n, key]);
  return c;
}

function Header({ name, ptr, len, fresh }: { name: string; ptr: string; len: number; fresh?: boolean }) {
  return (
    <motion.div
      initial={fresh ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: E }}
      className="flex items-stretch gap-[3px]"
    >
      <span className="flex items-center pr-2 font-mono text-[12px] text-teal mono-tight">{name}</span>
      {[
        ["ptr", ptr],
        ["len", String(len)],
      ].map(([f, v]) => (
        <div key={f} className="flex min-w-[4.5rem] flex-col justify-center rounded-[2px] border border-teal/70 bg-teal/[0.13] px-2 py-1">
          <span className="font-mono text-[9px] text-teal">{f}</span>
          <span className="tnum font-mono text-[12px] text-ink mono-tight">{v}</span>
        </div>
      ))}
      <span className="flex items-center pl-2 font-mono text-[11px] text-ink-3 mono-tight">16 B</span>
    </motion.div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.35, ease: E }} className="rounded-[3px] border border-line bg-[#0e1024] p-3">
      {children}
    </motion.div>
  );
}

/** the bits of one rune: prefix dimmed, payload lifted out and joined */
function Decoder({ enc, ri }: { enc: Encoded; ri: number }) {
  const r = enc.runes[ri];
  const a = anatomy(r, enc.bytes);
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {a.parts.map((p, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.25 }} className="flex flex-col items-center gap-1">
            <span className="font-mono text-[10px] text-ink-3">0x{hx(p.v)}</span>
            <span className="font-mono text-[13px] tracking-wider mono-tight @md:text-[15px]">
              <span className="text-ink-3/60">{p.prefix}</span>
              <span className="text-copper">{p.payload}</span>
            </span>
            <span className="font-mono text-[10px] text-ink-3">{a.parts.length === 1 ? "ascii" : i === 0 ? `lead: ${a.parts.length} bytes` : "continuation"}</span>
          </motion.div>
        ))}
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: a.parts.length * 0.25 + 0.1 }} className="text-ink-3">→</motion.span>
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: a.parts.length * 0.25 + 0.2, ease: E }} className="flex flex-col gap-1">
          <span className="font-mono text-[13px] tracking-wider text-copper mono-tight @md:text-[15px]">{a.payload.replace(/^0+(?=.)/, "")}</span>
          <span className="font-mono text-[13px] text-ink mono-tight">
            = <span className="text-teal">{U(a.cp)}</span> = {a.cp} = <span className="text-[16px]">{r.ch}</span>
          </span>
        </motion.div>
      </div>
    </Panel>
  );
}

/** a conversion allocates: the bytes are copied out of read-only memory */
function Copy({ enc, kind }: { enc: Encoded; kind: "bytes" | "runes" }) {
  const cells = kind === "bytes" ? enc.bytes.map((b) => hx(b.v)) : enc.runes.map((r) => r.cp.toString(16).toUpperCase().padStart(8, "0"));
  const size = kind === "bytes" ? enc.bytes.length : enc.runes.length * 4;
  return (
    <Panel>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 font-mono text-[11px] mono-tight">
        <span className="text-rose">heap · {kind === "bytes" ? "[]byte" : "[]rune"} · {size} B · mutable</span>
        <span className="text-ink-3">{kind === "bytes" ? "runtime.stringtoslicebyte" : "runtime.stringtoslicerune"}</span>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${kind === "bytes" ? cells.length : Math.min(cells.length, 9)}, minmax(0, 1fr))` }}>
        {cells.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: -28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.05, duration: 0.45, ease: E }}
            className="hatch-rose flex h-9 items-center justify-center overflow-hidden rounded-[2px] border border-rose/70 font-mono text-[9px] text-ink mono-tight @md:text-[11px]"
          >
            {kind === "runes" ? <span className="@md:hidden">{enc.runes[i].ch}</span> : null}
            <span className={kind === "runes" ? "hidden @md:inline [font-variation-settings:'wdth'_75]" : ""}>{c}</span>
          </motion.div>
        ))}
      </div>
    </Panel>
  );
}
