/* Each block on the die is drawn in its own layout grammar, parametric in
   (w, h) so the same block works on the landscape die, the portrait die,
   and enlarged at the head of its chapter. Coordinates are block-local. */

import type { ReactNode } from "react";

const COPPER = "#e78b52", TEAL = "#3fc6b4", ROSE = "#f0607c", VIOLET = "#a493f4", INK = "#ece9f5", INK3 = "#948fb4";

type G = { w: number; h: number; s: number; short?: boolean };
/** inner box below/right of the label */
function inner(w: number, h: number, s: number, short = false) {
  const pad = 14 * s;
  return short
    ? { x: Math.min(w * 0.36, 190 * s), y: pad, w: w - Math.min(w * 0.36, 190 * s) - pad, h: h - pad * 2, short }
    : { x: pad, y: 46 * s, w: w - pad * 2, h: h - 46 * s - pad, short };
}

const txt = (s: number, size: number) => ({ fontFamily: "var(--font-martian), monospace", fontSize: size * s });

/* ── 01 slices: header register → SRAM row ── */
function Slices({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const hw = Math.min(46 * s, b.w / 7), hh = 20 * s;
  const n = 6, gap = 4 * s;
  const cw = (b.w - gap * (n - 1)) / n;
  const ay = b.y + hh + 30 * s;
  const ch = Math.max(14 * s, Math.min(40 * s, b.h - hh - 60 * s));
  const vals = [10, 20, 30, 40, 50, null];
  return (
    <g>
      {["ptr", "len", "cap"].map((f, i) => (
        <g key={f} transform={`translate(${b.x + i * (hw + 2 * s)} ${b.y})`}>
          <rect width={hw} height={hh} fill="url(#p-teal)" stroke={TEAL} strokeOpacity=".7" strokeWidth={s} />
          <text x={hw / 2} y={hh * 0.68} textAnchor="middle" fill={INK} {...txt(s, 9)}>{f === "ptr" ? "ptr" : f === "len" ? "5" : "6"}</text>
        </g>
      ))}
      <path d={`M${b.x + hw / 2} ${b.y + hh} V${ay - 12 * s} H${b.x + cw / 2} V${ay - 2 * s}`} fill="none" stroke={TEAL} strokeWidth={1.6 * s} markerEnd="url(#m-teal)" />
      {vals.map((v, i) => (
        <g key={i} transform={`translate(${b.x + i * (cw + gap)} ${ay})`}>
          <rect width={cw} height={ch} fill={v === null ? "none" : "url(#p-copper)"} stroke={v === null ? INK3 : COPPER} strokeOpacity={v === null ? 0.5 : 0.8} strokeDasharray={v === null ? `${3 * s} ${3 * s}` : undefined} strokeWidth={s} />
          {v !== null && <text x={cw / 2} y={ch / 2 + 4 * s} textAnchor="middle" fill={INK} {...txt(s, 11)}>{v}</text>}
        </g>
      ))}
      <path d={`M${b.x} ${ay + ch + 8 * s} H${b.x + 5 * cw + 4 * gap}`} stroke={COPPER} strokeWidth={2 * s} />
      <path d={`M${b.x} ${ay + ch + 15 * s} H${b.x + 6 * cw + 5 * gap}`} stroke={INK3} strokeWidth={s} strokeDasharray={`${3 * s} ${3 * s}`} />
    </g>
  );
}

/* ── 02 maps: two groups, control word over eight slots ── */
function Maps({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const gh = (b.h - 12 * s) / 2;
  const cw = b.w / 8;
  const full = [[1, 0, 1, 1, 0, 0, 1, 0], [0, 1, 2, 0, 1, 1, 0, 0]];
  return (
    <g>
      {full.map((row, g) => {
        const y = b.y + g * (gh + 12 * s);
        const ctrlH = Math.min(15 * s, gh * 0.35);
        return (
          <g key={g}>
            {row.map((f, i) => (
              <g key={i} transform={`translate(${b.x + i * cw} ${y})`}>
                <rect x={s} width={cw - 2 * s} height={ctrlH} fill={f === 1 ? "url(#p-teal)" : f === 2 ? "url(#p-rose)" : "none"} stroke={f === 2 ? ROSE : TEAL} strokeOpacity={f ? 0.8 : 0.3} strokeWidth={s} />
                <rect x={s} y={ctrlH + 3 * s} width={cw - 2 * s} height={gh - ctrlH - 3 * s} fill={f === 1 ? "url(#p-copper)" : "url(#p-fill)"} stroke={f === 1 ? COPPER : INK3} strokeOpacity={f === 1 ? 0.75 : 0.3} strokeWidth={s} />
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}

/* ── 03 strings: fourteen read-only bytes ── */
const STR_BYTES = [0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0xe4, 0xb8, 0x96, 0xe7, 0x95, 0x8c];
function Strings({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const cols = 7, rows = 2, gap = 3 * s;
  const cw = (b.w - gap * (cols - 1)) / cols;
  const ch = Math.min(34 * s, (b.h - gap - 16 * s) / rows);
  return (
    <g>
      {STR_BYTES.map((v, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const multi = v >= 0x80;
        return (
          <g key={i} transform={`translate(${b.x + c * (cw + gap)} ${b.y + r * (ch + gap)})`}>
            <rect width={cw} height={ch} fill={multi ? "url(#p-violet)" : "url(#p-copper)"} stroke={multi ? VIOLET : COPPER} strokeOpacity=".7" strokeWidth={s} />
            <text x={cw / 2} y={ch / 2 + 3.5 * s} textAnchor="middle" fill={INK} {...txt(s, 9.5)}>{v.toString(16).toUpperCase().padStart(2, "0")}</text>
          </g>
        );
      })}
      <text x={b.x} y={b.y + rows * (ch + gap) + 12 * s} fill={INK3} {...txt(s, 9)}>ROM · len 14 · 9 runes</text>
    </g>
  );
}

/* ── 04 structs: 24 bytes, eight of them padding ── */
function Structs({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const rows = [["a", 0, 0, 0, 0, 0, 0, 0], ["b", "b", "b", "b", "b", "b", "b", "b"], ["c", 0, 0, 0, "d", "d", "d", "d"]];
  const gap = 2 * s;
  const cw = (b.w - 7 * gap) / 8;
  const ch = Math.min(30 * s, (b.h - 2 * gap) / 3);
  return (
    <g>
      {rows.map((r, ri) =>
        r.map((f, ci) => (
          <g key={`${ri}-${ci}`} transform={`translate(${b.x + ci * (cw + gap)} ${b.y + ri * (ch + gap)})`}>
            <rect width={cw} height={ch} fill={f ? "url(#p-copper)" : "url(#p-fill)"} stroke={f ? COPPER : INK3} strokeOpacity={f ? 0.75 : 0.3} strokeWidth={s} />
            {f ? <text x={cw / 2} y={ch / 2 + 3.5 * s} textAnchor="middle" fill={INK} {...txt(s, 10)}>{f}</text> : null}
          </g>
        )),
      )}
    </g>
  );
}

/* ── 05 pipeline: seven stages ── */
function Pipeline({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const st = ["scan", "parse", "types", "mid", "ssa", "opt", "gen"];
  const gap = 8 * s;
  const cw = (b.w - gap * 6) / 7;
  const ch = Math.min(34 * s, b.h);
  const y = b.y + (b.h - ch) / 2;
  return (
    <g>
      {st.map((n, i) => (
        <g key={n} transform={`translate(${b.x + i * (cw + gap)} ${y})`}>
          <rect width={cw} height={ch} fill={i === 6 ? "url(#p-copper)" : "url(#p-teal)"} stroke={i === 6 ? COPPER : TEAL} strokeOpacity=".7" strokeWidth={s} />
          {cw > 34 * s && <text x={cw / 2} y={ch / 2 + 3.5 * s} textAnchor="middle" fill={INK} {...txt(s, 9)}>{n}</text>}
          {i < 6 && <path d={`M${cw + 1 * s} ${ch / 2} h${gap - 2 * s}`} stroke={INK3} strokeWidth={s} />}
        </g>
      ))}
    </g>
  );
}

/* ── 06 escape: stack frame or heap ── */
function Escape({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const half = (b.w - 30 * s) / 2;
  const ch = Math.min(40 * s, b.h);
  const y = b.y + (b.h - ch) / 2;
  return (
    <g>
      <rect x={b.x} y={y} width={half} height={ch} fill="url(#p-teal)" stroke={TEAL} strokeOpacity=".7" strokeWidth={s} />
      <text x={b.x + 8 * s} y={y + ch / 2 + 3.5 * s} fill={INK} {...txt(s, 9.5)}>stack</text>
      <rect x={b.x + half + 30 * s} y={y} width={half} height={ch} fill="url(#p-rose)" stroke={ROSE} strokeOpacity=".7" strokeWidth={s} />
      <text x={b.x + half + 38 * s} y={y + ch / 2 + 3.5 * s} fill={INK} {...txt(s, 9.5)}>heap</text>
      <path d={`M${b.x + half + 3 * s} ${y + ch / 2} h${24 * s}`} stroke={ROSE} strokeWidth={1.6 * s} markerEnd="url(#m-rose)" />
    </g>
  );
}

/* ── 07 interfaces: two words → itab → code ── */
function Interfaces({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const ch = Math.min(18 * s, b.h / 2 - 2 * s);
  const rw = Math.min(70 * s, b.w * 0.28);
  const y = b.y + (b.h - 2 * ch - 3 * s) / 2;
  const tx = b.x + rw + 34 * s, tw = Math.min(90 * s, b.w * 0.38);
  return (
    <g>
      <rect x={b.x} y={y} width={rw} height={ch} fill="url(#p-teal)" stroke={TEAL} strokeOpacity=".75" strokeWidth={s} />
      <rect x={b.x} y={y + ch + 3 * s} width={rw} height={ch} fill="url(#p-teal)" stroke={TEAL} strokeOpacity=".75" strokeWidth={s} />
      <text x={b.x + 6 * s} y={y + ch * 0.7} fill={INK} {...txt(s, 9)}>tab</text>
      <text x={b.x + 6 * s} y={y + ch * 1.7 + 3 * s} fill={INK} {...txt(s, 9)}>data</text>
      <rect x={tx} y={y} width={tw} height={2 * ch + 3 * s} fill="url(#p-copper)" stroke={COPPER} strokeOpacity=".75" strokeWidth={s} />
      <text x={tx + 6 * s} y={y + ch * 0.7} fill={INK} {...txt(s, 9)}>itab</text>
      <text x={tx + 6 * s} y={y + ch * 1.7 + 3 * s} fill={INK} {...txt(s, 9)}>fun[0]</text>
      <path d={`M${b.x + rw} ${y + ch / 2} H${tx - 2 * s}`} stroke={TEAL} strokeWidth={1.4 * s} markerEnd="url(#m-teal)" />
    </g>
  );
}

/* ── 08 scheduler: cores; live chips are layered on by the die ── */
export function schedCores(w: number, h: number, s: number, procs = 4) {
  const b = inner(w, h, s, false);
  const gq = 22 * s;
  const gap = 10 * s;
  const cw = (b.w - gap * (procs - 1)) / procs;
  const cy = b.y + gq + 10 * s;
  const chH = b.h - gq - 10 * s;
  return { b, gq, cw, gap, cy, chH };
}
function Scheduler({ w, h, s, short }: G) {
  const { b, gq, cw, gap, cy, chH } = schedCores(w, h, s);
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={gq} fill="none" stroke={TEAL} strokeOpacity=".4" strokeWidth={s} strokeDasharray={`${4 * s} ${3 * s}`} />
      <text x={b.x + 6 * s} y={b.y + gq * 0.68} fill={INK3} {...txt(s, 9)}>global run queue</text>
      {[0, 1, 2, 3].map((p) => (
        <g key={p} transform={`translate(${b.x + p * (cw + gap)} ${cy})`}>
          <rect width={cw} height={chH} fill="#11132a" stroke={INK} strokeOpacity=".28" strokeWidth={s} />
          <text x={6 * s} y={14 * s} fill={INK} {...txt(s, 10)}>P{p}</text>
          <text x={cw - 6 * s} y={14 * s} textAnchor="end" fill={INK3} {...txt(s, 9)}>M{p}</text>
          {Array.from({ length: 6 }).map((_, i) => (
            <rect key={i} x={6 * s} y={chH - (i + 1) * ((chH - 64 * s) / 6) - 4 * s} width={cw - 12 * s} height={(chH - 64 * s) / 6 - 3 * s} fill="none" stroke={INK3} strokeOpacity=".22" strokeWidth={s} />
          ))}
        </g>
      ))}
    </g>
  );
}

/* ── 09 stacks: frames grow down toward the guard ── */
function Stacks({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const tw = Math.min(b.w, 150 * s);
  const x = b.x + (b.w - tw) / 2;
  const frames = [0.14, 0.12, 0.17, 0.1, 0.13];
  let y = b.y;
  const guardY = b.y + b.h * 0.8;
  return (
    <g>
      <rect x={x} y={b.y} width={tw} height={b.h} fill="none" stroke={INK} strokeOpacity=".3" strokeWidth={s} />
      {frames.map((f, i) => {
        const fh = b.h * f;
        const r = <rect key={i} x={x + 3 * s} y={y + 2 * s} width={tw - 6 * s} height={fh - 3 * s} fill="url(#p-copper)" stroke={COPPER} strokeOpacity=".7" strokeWidth={s} />;
        y += fh;
        return r;
      })}
      <path d={`M${x - 6 * s} ${guardY} H${x + tw + 6 * s}`} stroke={ROSE} strokeWidth={1.5 * s} strokeDasharray={`${4 * s} ${3 * s}`} />
      <text x={x + tw / 2} y={guardY + 14 * s} textAnchor="middle" fill={ROSE} {...txt(s, 9)}>stackguard0</text>
    </g>
  );
}

/* ── 10 defer: the 8-bit register and a _defer chain ── */
function Defer({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const cw = b.w / 8;
  const ch = Math.min(22 * s, b.h * 0.4);
  return (
    <g>
      {Array.from({ length: 8 }).map((_, i) => {
        const on = i >= 5;
        return (
          <g key={i} transform={`translate(${b.x + i * cw} ${b.y})`}>
            <rect x={s} width={cw - 2 * s} height={ch} fill={on ? "url(#p-copper)" : "none"} stroke={on ? COPPER : INK3} strokeOpacity={on ? 0.85 : 0.35} strokeWidth={s} />
            <text x={cw / 2} y={ch * 0.7} textAnchor="middle" fill={on ? INK : INK3} {...txt(s, 10)}>{on ? 1 : 0}</text>
          </g>
        );
      })}
      {b.h > 50 * s &&
        [0, 1, 2].map((i) => {
          const nw = (b.w - 24 * s) / 3;
          const x = b.x + i * (nw + 12 * s);
          const y = b.y + ch + 14 * s;
          const nh = Math.min(18 * s, b.h - ch - 16 * s);
          return (
            <g key={i}>
              <rect x={x} y={y} width={nw} height={nh} fill="url(#p-teal)" stroke={TEAL} strokeOpacity=".6" strokeWidth={s} />
              {i < 2 && <path d={`M${x + nw} ${y + nh / 2} h${11 * s}`} stroke={TEAL} strokeWidth={s} markerEnd="url(#m-teal)" />}
            </g>
          );
        })}
    </g>
  );
}

/* ── 11 channels: a literal ring buffer ── */
function arcCell(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return `M${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}
function Channels({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const r1 = Math.min(b.w / 2 - 28 * s, b.h / 2);
  const r0 = r1 * 0.55;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const n = 6, gapA = 0.06;
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n + gapA;
        const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n - gapA;
        const full = i < 3;
        return <path key={i} d={arcCell(cx, cy, r0, r1, a0, a1)} fill={full ? "url(#p-copper)" : "none"} stroke={full ? COPPER : INK3} strokeOpacity={full ? 0.8 : 0.35} strokeWidth={s} />;
      })}
      <path d={`M${b.x} ${cy} h${Math.max(8 * s, cx - r1 - b.x - 6 * s)}`} stroke={TEAL} strokeWidth={1.4 * s} markerEnd="url(#m-teal)" />
      <path d={`M${cx + r1 + 6 * s} ${cy} H${b.x + b.w}`} stroke={TEAL} strokeWidth={1.4 * s} markerEnd="url(#m-teal)" />
    </g>
  );
}

/* ── 12 allocator: mcache → mcentral → mheap ── */
function Allocator({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const tiers = [
    { n: "mcache", c: 4, r: 3, col: TEAL, pat: "url(#p-teal)" },
    { n: "mcentral", c: 4, r: 3, col: COPPER, pat: "url(#p-copper)" },
    { n: "mheap", c: 6, r: 4, col: ROSE, pat: "url(#p-rose)" },
  ];
  const tall = b.h > b.w * 0.8;
  const gap = 18 * s;
  const tw = tall ? b.w : (b.w - gap * 2) / 3;
  const th = tall ? (b.h - gap * 2) / 3 : b.h;
  return (
    <g>
      {tiers.map((t, i) => {
        const x = tall ? b.x : b.x + i * (tw + gap);
        const y = tall ? b.y + i * (th + gap) : b.y;
        const lh = 14 * s;
        const rows = tall ? Math.min(t.r, 2) : t.r;
        const gw = (tw - 8 * s) / t.c, gh = (th - lh - 8 * s) / rows;
        return (
          <g key={t.n}>
            <text x={x} y={y + 10 * s} fill={INK3} {...txt(s, 9)}>{t.n}</text>
            {Array.from({ length: t.c * rows }).map((_, k) => {
              const cx = k % t.c, cy = Math.floor(k / t.c);
              const used = (k * 7 + i * 3) % 5 !== 0;
              return <rect key={k} x={x + 4 * s + cx * gw} y={y + lh + 4 * s + cy * gh} width={Math.max(s, gw - 3 * s)} height={Math.max(s, gh - 3 * s)} fill={used ? t.pat : "none"} stroke={t.col} strokeOpacity={used ? 0.7 : 0.25} strokeWidth={s} />;
            })}
            {i < 2 && (tall
              ? <path d={`M${x + tw / 2} ${y + th + 2 * s} v${gap - 4 * s}`} stroke={INK3} strokeWidth={s} markerEnd="url(#m-ink)" />
              : <path d={`M${x + tw + 2 * s} ${y + th / 2} h${gap - 4 * s}`} stroke={INK3} strokeWidth={s} markerEnd="url(#m-ink)" />)}
          </g>
        );
      })}
    </g>
  );
}

/* ── 13 gc: a heap of objects in three colours ── */
function Gc({ w, h, s, short }: G) {
  const b = inner(w, h, s, short);
  const cols = Math.max(6, Math.round(b.w / (34 * s)));
  const rows = Math.max(3, Math.round(b.h / (34 * s)));
  const dx = b.w / cols, dy = b.h / rows;
  const r = Math.min(dx, dy) * 0.26;
  const cells: ReactNode[] = [];
  const lines: ReactNode[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const k = (x * 13 + y * 7) % 11;
      const state = x < cols * 0.42 ? "black" : x < cols * 0.62 ? (k % 3 === 0 ? "white" : "grey") : k % 4 === 0 ? "grey" : "white";
      const px = b.x + dx * (x + 0.5) + ((k % 3) - 1) * dx * 0.12;
      const py = b.y + dy * (y + 0.5) + ((k % 2) - 0.5) * dy * 0.14;
      if (x < cols - 1 && k % 3 !== 1) {
        lines.push(<path key={`l${x}-${y}`} d={`M${px + r} ${py} L${px + dx - r} ${py + ((k % 5) - 2) * dy * 0.15}`} stroke={INK} strokeOpacity=".16" strokeWidth={s} />);
      }
      cells.push(
        <circle key={`${x}-${y}`} cx={px} cy={py} r={r} fill={state === "black" ? INK : state === "grey" ? "url(#p-ivory)" : "#11132a"} stroke={INK} strokeOpacity={state === "white" ? 0.45 : 0.9} strokeWidth={s} />,
      );
    }
  }
  return <g>{lines}{cells}</g>;
}

export const GLYPHS: Record<string, (g: G) => ReactNode> = {
  slices: Slices, maps: Maps, strings: Strings, structs: Structs,
  pipeline: Pipeline, escape: Escape, interfaces: Interfaces,
  scheduler: Scheduler, stacks: Stacks, defer: Defer,
  channels: Channels, allocator: Allocator, gc: Gc,
};

export { inner as glyphInner };
