/* The allocator, after runtime/malloc.go: mcache (per P, no lock) →
   mcentral (per size class, locked) → mheap (pages, locked) → the OS. */

import { SIZE_CLASSES, sizeClassOf } from "./slices";

export { SIZE_CLASSES };
export type Tier = "mallocgc" | "mcache" | "mcentral" | "mheap" | "os";

export type Req = { label: string; size: number; noscan: boolean; align?: number };
export const REQS: Req[] = [
  { label: "make([]byte, 8)", size: 8, noscan: true },
  { label: "new(int32)", size: 4, noscan: true },
  { label: "new(Node) · 24 B, has pointers", size: 24, noscan: false },
  { label: "make([]byte, 200)", size: 200, noscan: true },
  { label: "make([]byte, 1000)", size: 1000, noscan: true },
  { label: "make([]byte, 64<<10)", size: 65536, noscan: true },
];

export type AllocState = {
  req: Req | null;
  kind: "tiny" | "small" | "large" | null;
  path: Tier[];
  cls: number;
  /** the mcache's current span for each class: objects in it and how many are taken */
  spans: Record<number, { nelems: number; used: number; fresh: boolean }>;
  tiny: { off: number; objs: { off: number; size: number; n: number }[]; blocks: number };
  largeSpans: number;
  n: number;
  msg: string;
};

export function allocInit(): AllocState {
  return {
    req: null, kind: null, path: [], cls: 0, spans: {}, tiny: { off: 0, objs: [], blocks: 0 }, largeSpans: 0, n: 0,
    msg: "Go's allocator is TCMalloc rebuilt around the P. The `mcache` hangs off the P, and an M must hold a P to run Go code, so **the common path needs no lock at all**.",
  };
}

/** objects per span: these classes all use one 8 KB page */
const nelems = (cls: number) => Math.floor(8192 / SIZE_CLASSES[cls]);

export function alloc(prev: AllocState, r: Req): { st: AllocState; trace: { kind: "info" | "warn" | "note"; text: string }[] } {
  const st: AllocState = structuredClone(prev);
  st.req = r;
  st.n++;
  const trace: { kind: "info" | "warn" | "note"; text: string }[] = [];
  Object.values(st.spans).forEach((s) => (s.fresh = false));

  if (r.noscan && r.size < 16) {
    const a = r.align ?? (r.size >= 8 ? 8 : r.size >= 4 ? 4 : r.size >= 2 ? 2 : 1);
    let off = Math.ceil(st.tiny.off / a) * a;
    let fresh = false;
    if (off + r.size > 16 || st.tiny.blocks === 0) {
      st.tiny = { off: 0, objs: [], blocks: st.tiny.blocks + 1 };
      off = 0;
      fresh = true;
    }
    st.tiny.objs.push({ off, size: r.size, n: st.n });
    st.tiny.off = off + r.size;
    st.kind = "tiny";
    st.cls = 2;
    st.path = fresh ? ["mallocgc", "mcache"] : ["mallocgc"];
    st.msg = fresh
      ? `**Tiny allocator.** ${r.size} bytes with no pointers is under 16, so it goes into a shared 16-byte block. The old block was full, so a fresh one was taken from the mcache's 16-byte class, and the object sits at offset 0.`
      : `**Tiny allocator.** ${r.size} pointer-free bytes were packed into the *same* 16-byte block at offset ${off}: bump \`tinyoffset\`, return a pointer. Several small objects share one block and are freed together when none are live.`;
    trace.push({ kind: "info", text: `mallocgc(${r.size}, noscan) → tiny block +${off}${fresh ? " (new block)" : ""}` });
    return { st, trace };
  }

  if (r.size > 32768) {
    st.kind = "large";
    st.cls = 0;
    st.largeSpans++;
    st.path = ["mallocgc", "mheap"];
    const pages = Math.ceil(r.size / 8192);
    st.msg = `${r.size / 1024} KB is over the 32 KB limit, so there is no size class and no cache. \`mheap.alloc\` takes the **heap lock** and carves a span of **${pages} pages** for this single object. Large objects are allocated, and later swept, one at a time.`;
    trace.push({ kind: "warn", text: `mallocgc(${r.size}) → large object: mheap.alloc(${pages} pages), heap lock taken` });
    return { st, trace };
  }

  const cls = sizeClassOf(r.size);
  const csize = SIZE_CLASSES[cls];
  st.cls = cls;
  st.kind = "small";
  const waste = csize - r.size;
  const span = st.spans[cls];
  if (!span || span.used >= span.nelems) {
    const n = nelems(cls);
    const refill = !!span;
    st.spans[cls] = { nelems: n, used: 1, fresh: true };
    st.path = refill ? ["mallocgc", "mcache", "mcentral", "mheap"] : ["mallocgc", "mcache", "mcentral"];
    st.msg = `${r.size} B rounds up to size class **${cls}** (${csize} B${waste ? `, ${waste} B wasted, ${((waste / csize) * 100).toFixed(1)}%` : ""}). ` +
      (refill
        ? `The mcache's span for this class was **full**. \`mcentral\` (locked) had no partial span either, so it asked \`mheap\` (locked) for a fresh page, then handed a span of **${n} objects** to the mcache.`
        : `The mcache had no span for this class yet, so it called \`mcentral.cacheSpan()\`, **took a lock**, and got an 8 KB span of **${n} objects**. The next ${n - 1} allocations of this class will not leave the P.`);
    trace.push({ kind: "warn", text: `mallocgc(${r.size}) class ${cls} (${csize} B): mcache ${refill ? "span exhausted" : "empty"} → mcentral.cacheSpan${refill ? " → mheap.alloc" : ""}, ${n} objects` });
  } else {
    span.used++;
    span.fresh = true;
    st.path = ["mallocgc", "mcache"];
    st.msg = `Size class **${cls}** (${csize} B). The mcache span for this class has **${span.nelems - span.used}** free slots left, so this was a scan of the cached \`allocBits\` for a zero bit and a pointer computation. ++No lock was taken.++`;
    trace.push({ kind: "info", text: `mallocgc(${r.size}) class ${cls}: mcache hit, ${span.nelems - span.used} left in span` });
  }
  return { st, trace };
}
