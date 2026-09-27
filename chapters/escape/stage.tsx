"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { CodePane } from "@/components/code-pane";
import { EXAMPLES, type Example } from "@/lib/engines/escape";

const E = [0.16, 1, 0.3, 1] as const;
const NW = 150, NH = 46;

export function EscapeStage({ ex, reveal, popped = false, compact = false }: { ex: Example["id"]; reveal: 0 | 1 | 2; popped?: boolean; compact?: boolean }) {
  const scope = useId();
  const e = EXAMPLES.find((x) => x.id === ex)!;
  const moved = e.escapes && reveal >= 2;
  const fn = e.src.match(/func (\w+)/)?.[1] ?? "f";
  return (
    <LayoutGroup id={scope}>
      <div className="@container flex h-full min-h-0 flex-col gap-4">
        {!compact && (
          <div className="grid gap-3 @2xl:grid-cols-2">
            <CodePane code={e.src} lit={e.lit[reveal]} caption="source" size="sm" />
            <figure className="flex min-h-0 flex-col overflow-hidden rounded-[3px] border border-line bg-[#0e1024]">
              <figcaption className="border-b border-line px-3 py-2 font-mono text-[11px] text-ink-3 mono-tight">go build -gcflags=&apos;-m -m&apos;</figcaption>
              <pre className="overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-[1.6] mono-tight">
                {e.out.map((l, i) => (
                  <motion.div key={`${ex}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: reveal >= 1 || i === 0 ? 1 : 0.25 }} transition={{ delay: i * 0.12 }} className={/moved to heap|escapes/.test(l) ? "text-rose" : /does not escape/.test(l) ? "text-teal" : "text-ink-2"}>
                    {l}
                  </motion.div>
                ))}
              </pre>
            </figure>
          </div>
        )}

        <Graph e={e} reveal={reveal} />

        <div className="grid grid-cols-2 gap-3">
          <Zone title={`goroutine stack · frame of ${fn}`} note={popped ? "popped: freed by one SP adjustment" : "free, and gone at return"} tone="teal" popped={popped}>
            {!moved && !popped && <Chip id={`o-${ex}`} label={e.obj} tone="teal" />}
          </Zone>
          <Zone title="heap" note={moved ? (popped ? "still here until the GC finds it unreachable" : "runtime.newobject · costs a GC scan later") : "nothing allocated"} tone="rose">
            {moved && <Chip id={`o-${ex}`} label={e.obj} tone="rose" />}
          </Zone>
        </div>
      </div>
    </LayoutGroup>
  );
}

function Chip({ id, label, tone }: { id: string; label: string; tone: "teal" | "rose" }) {
  return (
    <motion.span
      layoutId={id}
      transition={{ layout: { duration: 0.9, ease: E } }}
      className={`inline-flex items-center rounded-[2px] border px-2.5 py-1.5 font-mono text-[13px] text-ink ${tone === "teal" ? "hatch-teal border-teal" : "hatch-rose border-rose"}`}
    >
      {label}
    </motion.span>
  );
}

function Zone({ title, note, tone, popped, children }: { title: string; note: string; tone: "teal" | "rose"; popped?: boolean; children?: React.ReactNode }) {
  return (
    <motion.div
      animate={{ opacity: popped ? 0.35 : 1 }}
      className={`flex min-h-[7rem] flex-col gap-2 rounded-[3px] border p-3 ${tone === "teal" ? "border-teal/60 bg-teal/[0.04]" : "border-rose/60 bg-rose/[0.04]"} ${popped ? "border-dashed" : ""}`}
    >
      <span className={`font-mono text-[11px] mono-tight ${tone === "teal" ? "text-teal" : "text-rose"}`}>{title}</span>
      <div className="flex min-h-[2.4rem] flex-1 items-center">{children}</div>
      <AnimatePresence mode="wait">
        <motion.span key={note} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-mono text-[11px] text-ink-3 mono-tight">
          {note}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

function Graph({ e, reveal }: { e: Example; reveal: number }) {
  const byId = Object.fromEntries(e.nodes.map((n) => [n.id, n]));
  const H = Math.max(...e.nodes.map((n) => n.y)) + 50;
  const pts = e.path.map((id) => byId[id]);
  const edgePath = (a: typeof pts[0], b: typeof pts[0]) => {
    if (a.y === b.y) return `M${a.x + NW / 2} ${a.y} H${b.x - NW / 2}`;
    return `M${a.x + NW / 2} ${a.y} H${b.x} V${b.y - NH / 2}`;
  };
  const target = pts[pts.length - 1];
  const way: { x: number; y: number }[] = [];
  pts.forEach((p, i) => {
    if (i && p.y !== pts[i - 1].y) way.push({ x: p.x, y: pts[i - 1].y });
    way.push({ x: p.x, y: p.y });
  });
  const hit = reveal >= 2 && e.escapes;
  return (
    <div className="rounded-[3px] border border-line bg-[#0e1024] p-2">
      <svg viewBox={`0 0 640 ${H}`} className="block h-auto w-full" role="img" aria-label={`Pointer flow graph: ${e.verdict.replace(/\*/g, "")}`}>
        {e.edges.map((ed, i) => {
          const a = byId[ed.a], b = byId[ed.b];
          const d = edgePath(a, b);
          const mx = a.y === b.y ? (a.x + b.x) / 2 : b.x + 6;
          const my = a.y === b.y ? a.y - 30 : (a.y + b.y) / 2 + 4;
          return (
            <g key={i}>
              <motion.path
                d={d}
                fill="none"
                stroke={e.escapes ? "#f0607c" : "#3fc6b4"}
                strokeWidth="1.8"
                markerEnd={reveal >= 1 ? (e.escapes ? "url(#m-rose)" : "url(#m-teal)") : undefined}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: reveal >= 1 ? 1 : 0 }}
                transition={{ duration: 0.6, delay: reveal >= 1 ? i * 0.3 : 0, ease: E }}
              />
              <motion.text
                x={mx} y={my} textAnchor={a.y === b.y ? "middle" : "start"} fontSize="11" fill="#948fb4" fontFamily="var(--font-martian), monospace"
                initial={{ opacity: 0 }} animate={{ opacity: reveal >= 1 ? 1 : 0 }} transition={{ delay: 0.3 + i * 0.3 }}
              >
                {ed.label}
              </motion.text>
            </g>
          );
        })}
        {e.nodes.map((n, i) => (
          <motion.g key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1, ease: E }}>
            <rect
              x={n.x - NW / 2} y={n.y - NH / 2} width={NW} height={NH} rx="2"
              fill={n.outlives && e.escapes ? "#3a1d33" : n.outlives ? "#173236" : "#171a35"}
              stroke={n.outlives && e.escapes ? "#f0607c" : n.outlives ? "#3fc6b4" : "#ece9f5"} strokeOpacity={n.outlives ? 1 : 0.35}
              strokeDasharray={n.outlives ? "4 3" : undefined}
            />
            <text x={n.x} y={n.y - 3} textAnchor="middle" fontSize="13" fill="#ece9f5" fontFamily="var(--font-martian), monospace" style={{ fontVariationSettings: '"wdth" 82' }}>{n.label}</text>
            <text x={n.x} y={n.y + 13} textAnchor="middle" fontSize="10" fill="#948fb4" fontFamily="var(--font-martian), monospace">{n.sub}</text>
          </motion.g>
        ))}
        {reveal >= 2 && (
          <motion.circle
            r="6"
            fill={e.escapes ? "#f0607c" : "#3fc6b4"}
            initial={{ cx: way[0].x, cy: way[0].y, opacity: 1 }}
            animate={{ cx: way.map((w) => w.x), cy: way.map((w) => w.y), opacity: way.map((_, i) => (i === way.length - 1 ? 0 : 1)) }}
            transition={{ duration: 0.45 * way.length, ease: "easeInOut" }}
          />
        )}
        <motion.text
          x={target.x} y={target.y + NH / 2 + 18} textAnchor="middle" fontSize="11" fontFamily="var(--font-martian), monospace"
          fill={hit ? "#f0607c" : "#948fb4"}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        >
          {target.outlives ? (hit ? "outlives the frame → escape" : e.escapes ? "outlives the frame" : "result, returned by value") : ""}
        </motion.text>
      </svg>
    </div>
  );
}
