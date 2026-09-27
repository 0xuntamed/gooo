/* Slices: views over a backing array, and growslice's real capacity rule. */

/** runtime/sizeclasses.go class_to_size (class 0 is "large object") */
export const SIZE_CLASSES = [0, 8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208,
  224, 240, 256, 288, 320, 352, 384, 416, 448, 480, 512, 576, 640, 704, 768, 896, 1024,
  1152, 1280, 1408, 1536, 1792, 2048, 2304, 2688, 3072, 3200, 3456, 4096, 4864, 5376,
  6144, 6528, 6784, 6912, 8192, 9472, 9728, 10240, 10880, 12288, 13568, 14336, 16384,
  18432, 19072, 20480, 21760, 24576, 27264, 28672, 32768];

export const MAX_SMALL = 32768;
export const PAGE = 8192;

export function sizeClassOf(n: number) {
  for (let i = 1; i < SIZE_CLASSES.length; i++) if (SIZE_CLASSES[i] >= n) return i;
  return 0;
}

/** runtime/msize.go roundupsize: small → its size class, large → whole pages */
export function roundupsize(n: number) {
  if (n <= MAX_SMALL) return SIZE_CLASSES[sizeClassOf(n)];
  return Math.ceil(n / PAGE) * PAGE;
}

/** runtime/slice.go nextslicecap */
export function nextslicecap(newLen: number, oldCap: number) {
  let newcap = oldCap;
  const doublecap = newcap + newcap;
  if (newLen > doublecap) return newLen;
  const threshold = 256;
  if (oldCap < threshold) return doublecap;
  for (;;) {
    newcap += (newcap + 3 * threshold) >> 2;
    if (newcap >= newLen) break;
  }
  return newcap;
}

export type GrowStep = { from: number; want: number; bytes: number; rounded: number; cap: number; rule: "double" | "1.25x" };

/** the whole chain growslice walks as you append one element at a time */
export function growthChain(elem: number, start: number, n: number): GrowStep[] {
  const out: GrowStep[] = [];
  let cap = start;
  for (let i = 0; i < n; i++) {
    const want = nextslicecap(cap + 1, cap);
    const bytes = want * elem;
    const rounded = roundupsize(bytes);
    const next = Math.floor(rounded / elem);
    out.push({ from: cap, want, bytes, rounded, cap: next, rule: cap < 256 ? "double" : "1.25x" });
    cap = next;
  }
  return out;
}

/** measured on go1.26.2 (cap after each reallocation, non-escaping slice) */
export const MEASURED = [
  { label: "[]byte", elem: 1, caps: [32, 64, 128, 256, 512, 896, 1408, 2048, 3072] },
  { label: "[]int", elem: 8, caps: [4, 8, 16, 32, 64, 128, 256, 512, 848, 1280, 1792, 2560] },
  { label: "[]Big (32 B)", elem: 32, caps: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 852, 1280, 1792] },
];

/* ── the memory model the stage draws ── */

export type View = { off: number; len: number; capEnd: number; gen: number };
export type Arr = { gen: number; cells: (number | null)[] };
export type SliceState = {
  arrays: Arr[];
  s: View;
  t: View | null;
  /** cells touched in this step, per generation */
  wrote: { gen: number; idx: number; clobber?: string; was?: number | null }[];
  /** set when growslice just ran: which array was copied into which */
  grew: { from: number; to: number; n: number; who: "s" | "t" } | null;
  next: number;
  msg: string;
  code: string;
};

export const capOf = (v: View) => v.capEnd - v.off;

export function sliceInit(): SliceState {
  return {
    arrays: [{ gen: 1, cells: [10, 20, 30, 40, 50, null] }],
    s: { off: 0, len: 5, capEnd: 6, gen: 1 },
    t: null,
    wrote: [],
    grew: null,
    next: 60,
    msg: "A slice of length 5 over an array of 6. That one spare slot is the whole story: `append` can use it without allocating, and anything else viewing this array will see the write.",
    code: "s := make([]int, 5, 6)",
  };
}

const arrOf = (st: SliceState, gen: number) => st.arrays.find((a) => a.gen === gen)!;
const newest = (st: SliceState) => Math.max(...st.arrays.map((a) => a.gen));

/** drop arrays nothing points at any more */
function collect(st: SliceState) {
  const live = new Set([st.s.gen, st.t?.gen].filter((g): g is number => g !== undefined));
  st.arrays = st.arrays.filter((a) => live.has(a.gen));
}

export function sliceAct(prev: SliceState, k: "append-s" | "append-t" | "alias" | "alias3" | "copy", val?: number): { st: SliceState; trace: { kind: "info" | "warn"; text: string }[] } {
  const st: SliceState = structuredClone(prev);
  st.wrote = [];
  st.grew = null;
  const trace: { kind: "info" | "warn"; text: string }[] = [];

  if (k === "alias" || k === "alias3") {
    const three = k === "alias3";
    st.t = { off: st.s.off + 1, len: 2, capEnd: three ? st.s.off + 3 : st.s.capEnd, gen: st.s.gen };
    st.code = three ? "t := s[1:3:3]" : "t := s[1:3]";
    st.msg = three
      ? "`t := s[1:3:3]`, the **three-index** form, sets the capacity as well as the bounds, so `cap(t) == len(t) == 2`. It is still a view over the same array; nothing was copied. But with no spare capacity, the next `append(t, …)` is ++forced to allocate++ instead of writing over `s`."
      : `\`t := s[1:3]\` is a second header over the **same** array. It costs 24 bytes and nothing else: no copy, no allocation. And \`cap(t) == ${capOf(st.t)}\`, not 2, because capacity runs from t's start to the **end of the array**. So t can append straight over the top of s.`;
    trace.push({ kind: "info", text: `${st.code}  →  len(t)=2 cap(t)=${capOf(st.t)}, shares s's array` });
    collect(st);
    return { st, trace };
  }

  if (k === "copy") {
    if (!st.t) { st.msg = "Make a `t` first."; return { st, trace }; }
    const n = Math.min(st.t.len, st.s.len);
    const src = arrOf(st, st.s.gen).cells.slice(st.s.off, st.s.off + n);
    const dst = arrOf(st, st.t.gen);
    src.forEach((v, i) => { dst.cells[st.t!.off + i] = v; st.wrote.push({ gen: st.t!.gen, idx: st.t!.off + i }); });
    st.code = "n := copy(t, s)";
    st.msg = `\`copy(t, s)\` returned **${n}**: it copies \`min(len(dst), len(src))\` elements and never grows anything. Allocating the destination yourself and copying into it is the honest way to detach a slice.`;
    trace.push({ kind: "info", text: `copy(t, s) = ${n}  (memmove, overlap-safe)` });
    return { st, trace };
  }

  const who = k === "append-s" ? "s" : "t";
  const v = who === "s" ? st.s : st.t;
  if (!v) { st.msg = "There is no `t` yet. Slice one first."; return { st, trace }; }
  const value = val ?? st.next;
  st.next = Math.max(st.next, value) + 10;
  const other = who === "s" ? st.t : st.s;

  if (v.len < capOf(v)) {
    const idx = v.off + v.len;
    const arr = arrOf(st, v.gen);
    const clob = other && other.gen === v.gen && idx >= other.off && idx < other.off + other.len;
    const was = arr.cells[idx];
    arr.cells[idx] = value;
    v.len++;
    st.wrote.push({ gen: v.gen, idx, clobber: clob ? `${who === "s" ? "t" : "s"}[${idx - other!.off}]` : undefined, was });
    st.code = `${who} = append(${who}, ${value})`;
    st.msg =
      `**Room to spare** (\`len ${v.len - 1} < cap ${capOf(v)}\`), so \`append\` wrote ${value} into slot ${idx} of the existing array and returned a header with len ${v.len}. No allocation.` +
      (clob ? ` !!It also overwrote ${who === "s" ? "t" : "s"}[${idx - other!.off}]!!, which held ${was}: both headers point at the same array, and neither was told.` : "");
    trace.push(clob
      ? { kind: "warn", text: `append(${who}, ${value}) in place at [${idx}], overwrote ${who === "s" ? "t" : "s"}[${idx - other!.off}] (${was} → ${value})` }
      : { kind: "info", text: `append(${who}, ${value}) in place at [${idx}], no allocation` });
    return { st, trace };
  }

  // growslice
  const oldCap = capOf(v);
  if (oldCap >= 24) {
    st.msg = `This append would grow the array to ${nextslicecap(v.len + 1, oldCap)} cells, which is past what this drawing shows. The ladder below carries the real sequence on from here.`;
    return { st, trace };
  }
  const want = nextslicecap(v.len + 1, oldCap);
  const cap = Math.floor(roundupsize(want * 8) / 8);
  const src = arrOf(st, v.gen).cells.slice(v.off, v.off + v.len);
  const gen = newest(st) + 1;
  const cells: (number | null)[] = Array(cap).fill(null);
  src.forEach((x, i) => { cells[i] = x; });
  cells[src.length] = value;
  st.arrays.push({ gen, cells });
  st.grew = { from: v.gen, to: gen, n: src.length, who };
  const nv: View = { off: 0, len: src.length + 1, capEnd: cap, gen };
  if (who === "s") st.s = nv; else st.t = nv;
  st.wrote.push({ gen, idx: src.length });
  st.code = `${who} = append(${who}, ${value})`;
  const rounded = roundupsize(want * 8);
  st.msg =
    `**Full** (\`len == cap == ${oldCap}\`), so \`growslice\` ran. \`nextslicecap(${v.len + 1}, ${oldCap})\` asked for ${want}; ${want} × 8 = ${want * 8} bytes, ${rounded === want * 8 ? "which is exactly a size class" : `rounded up to the ${rounded}-byte size class`}, so cap ${cap}. The ${src.length} old elements were **copied** into the new array. ` +
    (other ? `!!${who === "s" ? "t" : "s"} was not updated!!: it still points at the old array, and from now on the two are independent.` : "Nothing else referenced the old array, so it is now garbage.");
  trace.push({ kind: "warn", text: `growslice: cap ${oldCap} → ${cap} (nextslicecap=${want}, roundupsize(${want * 8})=${cap * 8}), memmove ${src.length} elems` });
  collect(st);
  return { st, trace };
}
