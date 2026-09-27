"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/* ── Pad: a control is a bond pad, where input enters the chip ── */

type PadProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "quiet" | "primary";
  code?: boolean;
  title?: string;
  pressed?: boolean;
  className?: string;
};

export function Pad({ children, onClick, disabled, tone = "default", code, title, pressed, className = "" }: PadProps) {
  const base =
    "group relative inline-flex h-9 select-none items-center gap-2 rounded-[3px] border px-3 text-[13px] leading-none transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-expo)] active:translate-y-px disabled:pointer-events-none disabled:opacity-40";
  const tones = {
    default: "border-line-2 bg-substrate-2 text-ink hover:border-teal/70 hover:bg-substrate-3",
    quiet: "border-transparent bg-transparent text-ink-2 hover:border-line-2 hover:text-ink",
    primary: "border-copper/80 bg-copper/15 text-ink hover:bg-copper/25 hover:border-copper",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      className={`${base} ${tones[tone]} ${code ? "font-mono mono-tight text-[13px]" : "font-sans font-bold"} ${className}`}
    >
      <span
        aria-hidden
        className={`size-[7px] shrink-0 rounded-[1px] border transition-colors duration-150 ${
          pressed
            ? "border-copper bg-copper"
            : tone === "primary"
              ? "border-copper bg-copper/60 group-hover:bg-copper"
              : "border-pad/70 bg-pad/20 group-hover:border-teal group-hover:bg-teal/60"
        }`}
      />
      {children}
    </button>
  );
}

/* ── Dial: a labelled range input ── */

export function Dial({
  label, value, min, max, step = 1, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="inline-flex h-9 items-center gap-3 rounded-[3px] border border-line-2 bg-substrate-2 px-3">
      <span className="label text-ink-3">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="dial h-1 w-24 cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(90deg, var(--color-copper) ${pct}%, var(--color-substrate-4) ${pct}%)` }}
      />
      <output className="tnum min-w-[3ch] text-right font-mono text-[13px] font-semibold text-copper">
        {format ? format(value) : value}
      </output>
    </label>
  );
}

/* ── Fidelity mark: solid = measured, hairline = simulated ── */

export function Fidelity({ kind, children }: { kind: "measured" | "sim" | "illustrative"; children?: ReactNode }) {
  const text = kind === "measured" ? "measured · go1.26.2" : kind === "sim" ? "simulated · scaled down" : "illustrative values";
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] text-ink-3">
      <svg width="22" height="6" aria-hidden>
        <line
          x1="0" y1="3" x2="22" y2="3"
          stroke={kind === "measured" ? "var(--color-copper)" : "var(--color-ink-3)"}
          strokeWidth={kind === "measured" ? 2 : 1}
          strokeDasharray={kind === "measured" ? undefined : "3 3"}
        />
      </svg>
      {children ?? text}
    </span>
  );
}

/* ── Readout: "what just happened", announced politely ── */

export function Readout({ children, id }: { children: ReactNode; id: string | number }) {
  return (
    <div className="prose relative min-h-[7.5em] text-[15px] leading-relaxed text-ink-2" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ── Trace console: real GODEBUG line formats ── */

export type TraceKind = "info" | "warn" | "sched" | "gc" | "note";
export type TraceLine = { id: number; kind: TraceKind; text: string };

const TRACE_COLOR: Record<TraceKind, string> = {
  info: "text-ink-2",
  warn: "text-rose",
  sched: "text-teal",
  gc: "text-violet",
  note: "text-copper",
};

export function TraceConsole({ lines, hint, onClear }: { lines: TraceLine[]; hint: string; onClear?: () => void }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <div className="overflow-hidden rounded-[3px] border border-line-2 bg-[#0c0e20]">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <span className="label text-ink-3">runtime trace</span>
        <span className="truncate font-mono text-[11px] text-ink-3/80 mono-tight">{hint}</span>
        {onClear && (
          <button type="button" onClick={onClear} className="label ml-auto text-ink-3 transition-colors hover:text-ink">
            clear
          </button>
        )}
      </div>
      <pre
        ref={ref}
        aria-live="polite"
        aria-label="Runtime trace output"
        className="h-40 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-[1.6] mono-tight"
      >
        {lines.length === 0 && <span className="text-ink-3">no events yet</span>}
        {lines.map((l) => (
          <div key={l.id} className={TRACE_COLOR[l.kind]}>{l.text}</div>
        ))}
      </pre>
    </div>
  );
}

/** Small helper hook-free factory for trace state in sandboxes */
let traceSeq = 0;
export const mkTrace = (kind: TraceKind, text: string): TraceLine => ({ id: ++traceSeq, kind, text });
export const pushTrace = (prev: TraceLine[], ...add: TraceLine[]) => [...prev, ...add].slice(-160);
