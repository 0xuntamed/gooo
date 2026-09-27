"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { CHAPTERS, WIRES, type Rect } from "@/lib/chapters";
import { GLYPHS } from "./glyphs";

export type Layout = "wide" | "tall";
export const DIE: Record<Layout, { W: number; H: number; s: number }> = {
  wide: { W: 1600, H: 1000, s: 1 },
  tall: { W: 1000, H: 1900, s: 1.6 },
};

/** Manhattan route between two blocks, from facing edges. Wires run on the top
    metal layer, so crossing another block is allowed, as on a real die. */
export function route(a: Rect, b: Rect) {
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
  const hOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const vOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (hOverlap > 40) {
    const x = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
    const [y1, y2] = acy < bcy ? [a.y + a.h, b.y] : [a.y, b.y + b.h];
    return { d: `M${x} ${y1} V${y2}`, mid: [x, (y1 + y2) / 2] as const };
  }
  if (vOverlap > 40) {
    const y = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2;
    const [x1, x2] = acx < bcx ? [a.x + a.w, b.x] : [a.x, b.x + b.w];
    return { d: `M${x1} ${y} H${x2}`, mid: [(x1 + x2) / 2, y] as const };
  }
  const x1 = acx < bcx ? a.x + a.w : a.x;
  const x2 = acx < bcx ? b.x : b.x + b.w;
  const mx = (x1 + x2) / 2;
  return { d: `M${x1} ${acy} H${mx} V${bcy} H${x2}`, mid: [mx, (acy + bcy) / 2] as const };
}

type Props = {
  layout: Layout;
  inspect?: string | null;
  onInspect?: (slug: string | null) => void;
  onPick?: (slug: string, el: SVGElement) => void;
  /** extra layer drawn inside a block (the live scheduler) */
  overlay?: (slug: string, r: Rect, s: number) => ReactNode;
  className?: string;
  title?: string;
};

export function Die({ layout, inspect, onInspect, onPick, overlay, className = "", title = "The Go Machine die floorplan" }: Props) {
  const { W, H, s } = DIE[layout];
  const rects = useMemo(() => Object.fromEntries(CHAPTERS.map((c) => [c.slug, c[layout]])), [layout]);
  const lit = inspect ? WIRES.filter((w) => w.a === inspect || w.b === inspect) : [];
  const litSet = new Set(lit.flatMap((w) => [w.a, w.b]));

  const pads: ReactNode[] = [];
  const P = 24, step = 52, ring = 56;
  for (let x = 120; x <= W - 120 - P; x += step) {
    pads.push(<rect key={`t${x}`} x={x} y={ring} width={P} height={P} />, <rect key={`b${x}`} x={x} y={H - ring - P} width={P} height={P} />);
  }
  for (let y = 120; y <= H - 120 - P; y += step) {
    pads.push(<rect key={`l${y}`} x={ring} y={y} width={P} height={P} />, <rect key={`r${y}`} x={W - ring - P} y={y} width={P} height={P} />);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block h-auto w-full select-none ${className}`} role="group" aria-label={title}>
      {/* die surface */}
      <rect width={W} height={H} fill="#151833" />
      <rect x="14" y="14" width={W - 28} height={H - 28} fill="none" stroke="#ece9f5" strokeOpacity=".16" />
      <rect x="24" y="24" width={W - 48} height={H - 48} fill="none" stroke="#ece9f5" strokeOpacity=".1" strokeDasharray="2 4" />
      <g fill="#c4a060" fillOpacity=".18" stroke="#c4a060" strokeOpacity=".55" strokeWidth="1">{pads}</g>
      <rect x="100" y="100" width={W - 200} height={H - 200} fill="url(#p-rows)" />

      {/* alignment mark and marking, as etched on the die */}
      <g stroke="#ece9f5" strokeOpacity=".45" strokeWidth="1.5">
        <path d="M36 44 H60 M48 32 V56" />
      </g>
      <text x={W - 104} y={H - 30} textAnchor="end" fill="#948fb4" fontSize={11 * s} fontFamily="var(--font-martian), monospace" letterSpacing="1">
        GO1.26.2 · AMD64 · 13 BLOCKS
      </text>
      <text x="104" y={H - 30} fill="#948fb4" fillOpacity=".7" fontSize={12 * s} fontFamily="var(--font-encode), sans-serif" fontWeight="800" style={{ fontVariationSettings: '"wdth" 125' }}>
        go
      </text>

      {/* every real relationship, faint; the inspected block's wires, lit */}
      <g fill="none" strokeLinecap="square">
        {WIRES.map((w) => {
          const r = route(rects[w.a], rects[w.b]);
          return <path key={`${w.a}-${w.b}`} d={r.d} stroke="#3fc6b4" strokeOpacity=".13" strokeWidth={1.5 * s} />;
        })}
      </g>

      {CHAPTERS.map((c) => {
        const r = rects[c.slug];
        const on = inspect === c.slug;
        const related = litSet.has(c.slug) && !on;
        const dim = inspect && !on && !related;
        const short = layout === "wide" && r.h < 120;
        const Glyph = GLYPHS[c.slug];
        return (
          <Link
            key={c.slug}
            href={`/${c.slug}/`}
            aria-label={`${String(c.n).padStart(2, "0")} ${c.title}: ${c.sub}`}
            onMouseEnter={() => onInspect?.(c.slug)}
            onFocus={() => onInspect?.(c.slug)}
            onClick={(e) => {
              if (!onPick || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onPick(c.slug, e.currentTarget as unknown as SVGElement);
            }}
            className="outline-none"
          >
            <motion.g
              transform={`translate(${r.x} ${r.y})`}
              animate={{ opacity: dim ? 0.42 : 1 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <rect width={r.w} height={r.h} fill={on ? "#1f2346" : "#171a35"} stroke={on ? "#e78b52" : related ? "#3fc6b4" : "#ece9f5"} strokeOpacity={on ? 1 : related ? 0.8 : 0.22} strokeWidth={on ? 2.5 * s : 1.2 * s} className="transition-[fill] duration-300" />
              <Glyph w={r.w} h={r.h} s={s} short={short} />
              {overlay?.(c.slug, r, s)}
              <BlockLabel n={c.n} name={c.die} pkg={c.pkg} w={r.w} h={r.h} s={s} short={short} on={on} />
              {/* visible keyboard focus: a thick teal frame */}
              <rect width={r.w} height={r.h} fill="none" stroke="#3fc6b4" strokeWidth={3 * s} className="opacity-0 [a:focus-visible_&]:opacity-100" />
            </motion.g>
          </Link>
        );
      })}

      {/* lit wires on top, with the function that connects them */}
      {lit.map((w, i) => {
        const r = route(rects[w.a], rects[w.b]);
        return (
          <g key={`lit-${w.a}-${w.b}`} pointerEvents="none">
            <motion.path
              d={r.d}
              fill="none"
              stroke="#3fc6b4"
              strokeWidth={2.5 * s}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
            <WireTag x={r.mid[0]} y={r.mid[1]} text={w.via} s={s} delay={0.25 + i * 0.05} />
          </g>
        );
      })}
    </svg>
  );
}

export function BlockLabel({ n, name, pkg, w, h, s, short, on }: { n: number; name: string; pkg: string; w: number; h: number; s: number; short: boolean; on: boolean }) {
  const num = String(n).padStart(2, "0");
  const nameStyle = { fontVariationSettings: '"wdth" 125' };
  if (short) {
    return (
      <g pointerEvents="none">
        <text x={14 * s} y={h / 2 - 6 * s} fill={on ? "#e78b52" : "#948fb4"} fontSize={12 * s} fontFamily="var(--font-martian), monospace">{num}</text>
        <text x={14 * s} y={h / 2 + 14 * s} fill="#ece9f5" fontSize={16 * s} fontWeight="800" fontFamily="var(--font-encode), sans-serif" style={nameStyle}>{name}</text>
      </g>
    );
  }
  return (
    <g pointerEvents="none">
      <text x={14 * s} y={29 * s} fill={on ? "#e78b52" : "#948fb4"} fontSize={12 * s} fontFamily="var(--font-martian), monospace">{num}</text>
      <text x={40 * s} y={30 * s} fill="#ece9f5" fontSize={17 * s} fontWeight="800" fontFamily="var(--font-encode), sans-serif" style={nameStyle}>{name}</text>
      {w > 330 * s && (
        <text x={w - 14 * s} y={29 * s} textAnchor="end" fill="#948fb4" fillOpacity=".8" fontSize={10.5 * s} fontFamily="var(--font-martian), monospace">
          {pkg.split(" · ")[0]}
        </text>
      )}
    </g>
  );
}

function WireTag({ x, y, text, s, delay }: { x: number; y: number; text: string; s: number; delay: number }) {
  const fs = 12 * s;
  const w = text.length * fs * 0.62 + 16 * s;
  const h = fs + 12 * s;
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay }}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="#0c0e20" stroke="#3fc6b4" strokeOpacity=".8" strokeWidth={s} />
      <text x={x} y={y + fs * 0.36} textAnchor="middle" fill="#ece9f5" fontSize={fs} fontFamily="var(--font-martian), monospace" style={{ fontVariationSettings: '"wdth" 82' }}>
        {text}
      </text>
    </motion.g>
  );
}

/* A small floorplan for navigation and "you are here" */
export function MiniDie({ active, className = "", onPick }: { active?: string; className?: string; onPick?: () => void }) {
  return (
    <svg viewBox="0 0 1600 1000" className={`block h-auto w-full ${className}`} role="group" aria-label="Floorplan: jump to a block">
      <rect width="1600" height="1000" fill="#151833" />
      <rect x="14" y="14" width="1572" height="972" fill="none" stroke="#ece9f5" strokeOpacity=".16" strokeWidth="3" />
      {CHAPTERS.map((c) => {
        const r = c.wide;
        const on = c.slug === active;
        return (
          <Link key={c.slug} href={`/${c.slug}/`} onClick={onPick} aria-label={`${c.n}. ${c.title}`} aria-current={on ? "page" : undefined} className="group outline-none">
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={on ? "url(#p-copper)" : "#1c1f3e"} stroke={on ? "#e78b52" : "#ece9f5"} strokeOpacity={on ? 1 : 0.3} strokeWidth={on ? 6 : 3} className="transition-[stroke-opacity] group-hover:[stroke-opacity:1] group-focus-visible:[stroke:#3fc6b4] group-focus-visible:[stroke-opacity:1]" />
            <text x={r.x + 18} y={r.y + 48} fill={on ? "#ece9f5" : "#948fb4"} fontSize="38" fontFamily="var(--font-martian), monospace">{String(c.n).padStart(2, "0")}</text>
          </Link>
        );
      })}
    </svg>
  );
}
