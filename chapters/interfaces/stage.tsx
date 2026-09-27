"use client";

import { AnimatePresence, motion } from "motion/react";

const E = [0.16, 1, 0.3, 1] as const;
export type IfMode = "empty" | "assign" | "call" | "assert" | "assert-iface" | "devirt";

const C = { teal: "#3fc6b4", copper: "#e78b52", rose: "#f0607c", ink: "#ece9f5", ink3: "#948fb4", violet: "#a493f4" };

/* geometry (viewBox 760 × 360) */
const IF = { x: 20, y: 70, w: 205, h: 34 };
const IT = { x: 300, y: 36, w: 230, rowH: 30 };
const RECT = { x: 590, y: 196, w: 150, h: 76 };
const CODE = { x: 300, y: 268, w: 230, h: 70 };
const itRow = (i: number) => IT.y + 30 + i * IT.rowH;

export function IfaceStage({ mode }: { mode: IfMode }) {
  const bound = mode !== "empty";
  const call = mode === "call";
  const devirt = mode === "devirt";
  const assert = mode === "assert" || mode === "assert-iface";
  return (
    <div className="@container flex h-full min-h-0 flex-col justify-center">
      <svg viewBox="0 0 760 360" className="block h-auto w-full" role="img" aria-label="An interface value is two words: a pointer to an itab and a pointer to the data. The itab holds the method table.">
        {/* the interface value */}
        <text x={IF.x} y={IF.y - 16} fontSize="12" fill={C.ink3} fontFamily="var(--font-martian), monospace">var s Shape · 16 bytes</text>
        {["tab  *itab", "data unsafe.Pointer"].map((t, i) => (
          <g key={t}>
            <motion.rect
              x={IF.x} y={IF.y + i * (IF.h + 4)} width={IF.w} height={IF.h} rx="2"
              fill={bound ? "url(#p-teal)" : "#171a35"}
              stroke={C.teal} strokeOpacity={bound ? 0.9 : 0.35}
              animate={{ strokeWidth: (call && i === 0) || (assert && i === 0) ? 2.5 : 1 }}
            />
            <text x={IF.x + 10} y={IF.y + i * (IF.h + 4) + 22} fontSize="13" fill={C.ink} fontFamily="var(--font-martian), monospace">{t}</text>
          </g>
        ))}

        {/* itab */}
        <motion.g animate={{ opacity: bound ? (devirt ? 0.4 : 1) : 0.35 }} transition={{ duration: 0.5 }}>
          <text x={IT.x} y={IT.y - 8} fontSize="12" fill={C.ink3} fontFamily="var(--font-martian), monospace">runtime.itab · go:itab.main.Rect,main.Shape</text>
          <rect x={IT.x} y={IT.y} width={IT.w} height={30 + 4 * IT.rowH + 8} rx="2" fill="#171a35" stroke={C.copper} strokeOpacity=".8" />
          {[
            ["+0", "inter  *interfacetype"],
            ["+8", "_type  *_type"],
            ["+16", "hash   uint32 (+pad)"],
            ["+24", "fun[0] → Rect.Area"],
          ].map(([o, t], i) => (
            <g key={o}>
              <motion.rect
                x={IT.x + 8} y={itRow(i) - 20} width={IT.w - 16} height={IT.rowH - 4} rx="2"
                fill={i === 3 ? "url(#p-copper)" : "transparent"}
                stroke={i === 3 ? C.copper : C.ink} strokeOpacity={i === 3 ? 0.9 : 0.14}
                animate={{ strokeWidth: call && i === 3 ? 2.5 : 1 }}
              />
              <text x={IT.x + 16} y={itRow(i) - 2} fontSize="11" fill={C.ink3} fontFamily="var(--font-martian), monospace">{o}</text>
              <text x={IT.x + 54} y={itRow(i) - 2} fontSize="12.5" fill={C.ink} fontFamily="var(--font-martian), monospace" style={{ fontVariationSettings: '"wdth" 85' }}>{t}</text>
            </g>
          ))}
        </motion.g>

        {/* the concrete value, boxed */}
        <motion.g animate={{ opacity: bound ? 1 : 0.35 }}>
          <text x={RECT.x} y={RECT.y - 10} fontSize="12" fill={C.ink3} fontFamily="var(--font-martian), monospace">Rect · 16 bytes</text>
          <rect x={RECT.x} y={RECT.y} width={RECT.w} height={RECT.h} rx="2" fill="url(#p-copper)" stroke={C.copper} />
          <text x={RECT.x + 12} y={RECT.y + 30} fontSize="13" fill={C.ink} fontFamily="var(--font-martian), monospace">W float64 = 3</text>
          <text x={RECT.x + 12} y={RECT.y + 56} fontSize="13" fill={C.ink} fontFamily="var(--font-martian), monospace">H float64 = 4</text>
        </motion.g>

        {/* code */}
        <g>
          <text x={CODE.x} y={CODE.y - 10} fontSize="12" fill={C.ink3} fontFamily="var(--font-martian), monospace">text segment</text>
          <motion.rect x={CODE.x} y={CODE.y} width={CODE.w} height={CODE.h} rx="2" fill="#171a35" stroke={C.ink} animate={{ strokeOpacity: call || devirt ? 1 : 0.35, strokeWidth: call || devirt ? 2 : 1 }} />
          <text x={CODE.x + 12} y={CODE.y + 28} fontSize="13" fill={C.ink} fontFamily="var(--font-martian), monospace">main.Rect.Area:</text>
          <text x={CODE.x + 12} y={CODE.y + 52} fontSize="13" fill={C.copper} fontFamily="var(--font-martian), monospace">  MULSD X1, X0</text>
        </g>

        {/* wires */}
        <Wire d={`M${IF.x + IF.w} ${IF.y + IF.h / 2} H${IT.x - 6}`} on={bound} color={C.teal} delay={0} dim={devirt} />
        <Wire d={`M${IF.x + IF.w} ${IF.y + IF.h * 1.5 + 4} H262 V${RECT.y + RECT.h / 2} H${RECT.x - 6}`} on={bound} color={C.teal} delay={0.25} />
        <Wire d={`M${IT.x + IT.w / 2} ${itRow(3) + 6} V${CODE.y - 6}`} on={bound} color={C.copper} delay={0.45} dim={devirt} />

        {/* call: a signal walks tab → itab.fun[0] → code */}
        <AnimatePresence>
          {call && (
            <motion.circle
              key="pulse"
              r="7" fill={C.copper}
              initial={{ cx: IF.x + IF.w, cy: IF.y + IF.h / 2, opacity: 1 }}
              animate={{ cx: [IF.x + IF.w, IT.x + 8, IT.x + IT.w / 2, IT.x + IT.w / 2], cy: [IF.y + IF.h / 2, IF.y + IF.h / 2, itRow(3) - 7, CODE.y + 10], opacity: [1, 1, 1, 0.9] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, times: [0, 0.3, 0.6, 1], ease: "easeInOut", repeat: Infinity, repeatDelay: 0.8 }}
            />
          )}
        </AnimatePresence>

        {/* assertion: compare the tab pointer with the known itab address */}
        <AnimatePresence>
          {assert && (
            <motion.g key="cmp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.rect x={IF.x} y={IF.y - 60} width={IF.w} height={30} rx="2" fill="url(#p-violet)" stroke={C.violet} initial={{ x: IT.x }} animate={{ x: IF.x }} transition={{ duration: 0.9, ease: E }} />
              <text x={IF.x + 10} y={IF.y - 40} fontSize="12" fill={C.ink} fontFamily="var(--font-martian), monospace">
                {mode === "assert" ? "&go:itab.Rect,Shape" : "getitab(Stringer, Rect)"}
              </text>
              <motion.text x={IF.x + IF.w + 12} y={IF.y - 40} fontSize="13" fill={mode === "assert" ? C.teal : C.rose} fontFamily="var(--font-martian), monospace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
                {mode === "assert" ? "CMPQ: one compare" : "hash lookup in itabTable"}
              </motion.text>
            </motion.g>
          )}
        </AnimatePresence>

        {/* devirtualized: a direct edge, then inlined away */}
        <AnimatePresence>
          {devirt && (
            <motion.g key="dv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.path d={`M${IF.x + IF.w / 2} ${IF.y + 2 * IF.h + 10} V${CODE.y + CODE.h / 2} H${CODE.x - 6}`} fill="none" stroke={C.teal} strokeWidth="2.5" strokeDasharray="6 4" markerEnd="url(#m-teal)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: E }} />
              <motion.text x={IF.x + IF.w / 2 + 10} y={CODE.y + CODE.h / 2 - 10} fontSize="12" fill={C.teal} fontFamily="var(--font-martian), monospace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                direct call, then inlined
              </motion.text>
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
    </div>
  );
}

function Wire({ d, on, color, delay, dim }: { d: string; on: boolean; color: string; delay: number; dim?: boolean }) {
  return (
    <motion.path
      d={d} fill="none" stroke={color} strokeWidth="2"
      markerEnd={on ? (color === C.teal ? "url(#m-teal)" : "url(#m-copper)") : undefined}
      initial={{ pathLength: 0 }}
      animate={{ pathLength: on ? 1 : 0, opacity: dim ? 0.25 : 1 }}
      transition={{ duration: 0.7, delay: on ? delay : 0, ease: E }}
    />
  );
}
