"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { newSched, script, tick, type Sched } from "@/lib/engines/sched";
import type { Rect } from "@/lib/chapters";
import { schedCores } from "./glyphs";
import { rng } from "@/lib/rng";

/** The scheduler block on the die runs the real engine, at a slow clock. */
export function LiveSched({ r, s }: { r: Rect; s: number }) {
  const reduce = useReducedMotion();
  const [st, setSt] = useState<Sched>(() => stepN(newSched(4, 424242, { initial: 11 }), 2));
  const ref = useRef<SVGGElement>(null);
  const spawn = useRef(rng(99));

  useEffect(() => {
    if (reduce) return;
    let visible = true;
    const el = ref.current?.ownerSVGElement;
    const io = el ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
    if (el && io) io.observe(el);
    const id = window.setInterval(() => {
      if (!visible || document.hidden) return;
      setSt((prev) => {
        let next = tick(prev).s;
        const count = Object.keys(next.gs).length;
        if (count < 12 && spawn.current.next() < 0.6) next = script.spawn(next, spawn.current.int(4), 1 + spawn.current.int(2)).s;
        return next;
      });
    }, 950);
    return () => { window.clearInterval(id); io?.disconnect(); };
  }, [reduce]);

  const { b, gq, cw, gap, cy, chH } = schedCores(r.w, r.h, s);
  const cellH = (chH - 64 * s) / 6;
  const chipW = Math.min(cw - 12 * s, 58 * s);
  const pos: { id: number; x: number; y: number; w: number; h: number; running: boolean; flash: boolean }[] = [];

  st.ps.forEach((p, i) => {
    const x0 = b.x + i * (cw + gap);
    if (p.running !== null) pos.push({ id: p.running, x: x0 + (cw - chipW) / 2, y: cy + 22 * s, w: chipW, h: 22 * s, running: true, flash: false });
    const q = [...(p.runnext !== null ? [p.runnext] : []), ...p.runq].slice(0, 6);
    q.forEach((gid, k) => {
      pos.push({ id: gid, x: x0 + 6 * s, y: cy + chH - (k + 1) * cellH - 4 * s, w: cw - 12 * s, h: cellH - 3 * s, running: false, flash: st.flash.includes(gid) });
    });
  });
  const gw = 40 * s;
  st.globalq.slice(0, Math.max(0, Math.floor((b.w - 150 * s) / (gw + 4 * s)))).forEach((gid, k) => {
    pos.push({ id: gid, x: b.x + 140 * s + k * (gw + 4 * s), y: b.y + 3 * s, w: gw, h: gq - 6 * s, running: false, flash: st.flash.includes(gid) });
  });

  return (
    <g ref={ref} pointerEvents="none">
      <AnimatePresence initial={false}>
        {pos.map((c) => (
          <motion.g
            key={c.id}
            initial={{ opacity: 0, x: c.x, y: c.y - 8 * s }}
            animate={{ opacity: 1, x: c.x, y: c.y }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 140, damping: 22 }}
          >
            <rect
              width={c.w}
              height={c.h}
              fill={c.running ? "url(#p-copper)" : "url(#p-teal)"}
              stroke={c.flash ? "#ece9f5" : c.running ? "#e78b52" : "#3fc6b4"}
              strokeWidth={(c.flash ? 2 : 1.2) * s}
            />
            <text x={c.w / 2} y={c.h / 2 + 4 * s} textAnchor="middle" fill="#ece9f5" fontSize={Math.min(11 * s, c.h * 0.62)} fontFamily="var(--font-martian), monospace">
              G{c.id}
            </text>
          </motion.g>
        ))}
      </AnimatePresence>
    </g>
  );
}

function stepN(s: Sched, n: number) {
  let x = s;
  for (let i = 0; i < n; i++) x = tick(x).s;
  return x;
}
