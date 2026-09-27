/* Concurrent tricolour mark-sweep with Go's hybrid write barrier
   (runtime/mgc.go, mbarrier.go, mgcpacer.go). Object sizes are in KB and
   illustrative; phases, colours, the barrier and the pacing rule are real. */

import { rng } from "@/lib/rng";

export type Color = "white" | "grey" | "black";
export type GNode = { id: string; x: number; y: number; root?: string; size: number; color: Color; freed?: boolean; fresh?: boolean };
export type GEdge = { from: string; to: string; kind?: "barrier" | "gone" };
export const PHASES = [
  { id: "off", name: "Off", sub: "mutator only", stw: false },
  { id: "sweepterm", name: "Sweep termination", sub: "stop the world", stw: true },
  { id: "mark", name: "Mark", sub: "concurrent · barrier on", stw: false },
  { id: "markterm", name: "Mark termination", sub: "stop the world", stw: true },
  { id: "sweep", name: "Sweep", sub: "concurrent · lazy", stw: false },
] as const;

export type GcState = {
  nodes: GNode[];
  edges: GEdge[];
  phase: number;
  grey: string[];
  scanning: string | null;
  scanned: number;
  barrier: boolean;
  barrierHits: number;
  shaded: string[];
  dangling: string[];
  gogc: number;
  live: number;
  goal: number;
  cycle: number;
  lastFreed: number;
  msg: string;
  trace: string | null;
};

export const heapKB = (s: GcState) => s.nodes.filter((n) => !n.freed).reduce((a, n) => a + n.size, 0);
const blackKB = (s: GcState) => s.nodes.filter((n) => !n.freed && n.color === "black").reduce((a, n) => a + n.size, 0);

/* ── the story's heap, laid out by hand so the dangerous write is guaranteed ── */
export function storyGraph(): Pick<GcState, "nodes" | "edges"> {
  const N = (id: string, x: number, y: number, size: number, root?: string): GNode => ({ id, x, y, size, color: "white", root });
  return {
    nodes: [
      N("R1", 70, 90, 64, "stack"), N("R2", 70, 225, 48, "globals"),
      N("A", 205, 55, 96), N("B", 205, 150, 128), N("C", 205, 250, 64),
      N("D", 345, 40, 256), N("E", 345, 130, 96), N("F", 345, 210, 128), N("G", 345, 285, 48),
      N("H", 480, 80, 160), N("W", 480, 190, 192), N("I", 480, 280, 96),
      N("J", 605, 130, 128), N("K", 605, 250, 224),
    ],
    edges: [
      { from: "R1", to: "A" }, { from: "R1", to: "B" }, { from: "R2", to: "C" },
      { from: "A", to: "D" }, { from: "B", to: "E" }, { from: "C", to: "F" }, { from: "C", to: "G" },
      { from: "D", to: "H" }, { from: "E", to: "H" }, { from: "F", to: "W" }, { from: "W", to: "J" },
      { from: "I", to: "K" },
    ],
  };
}

/* ── a seeded heap for the sandbox ── */
export function randomGraph(seed = 20260909): Pick<GcState, "nodes" | "edges"> {
  const r = rng(seed);
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const cols = [2, 4, 5, 5, 3];
  let k = 0;
  cols.forEach((count, c) => {
    for (let i = 0; i < count; i++) {
      nodes.push({
        id: String(k++), color: "white",
        x: 70 + c * 134, y: (count > 1 ? 48 + i * (214 / (count - 1)) : 160) + (c % 2 ? 14 : 0),
        size: [32, 48, 64, 96, 128, 192][r.int(6)], root: c === 0 ? (i === 0 ? "stack" : "globals") : undefined,
      });
    }
  });
  nodes.forEach((n, i) => {
    const col = cols.findIndex((_, c) => i < cols.slice(0, c + 1).reduce((a, b) => a + b, 0));
    if (col === 0) return;
    const prevStart = cols.slice(0, col - 1).reduce((a, b) => a + b, 0);
    const prev = nodes.slice(prevStart, prevStart + cols[col - 1]);
    if (r.next() < 0.8) edges.push({ from: prev[r.int(prev.length)].id, to: n.id });
    if (r.next() < 0.3) edges.push({ from: prev[r.int(prev.length)].id, to: n.id });
  });
  return { nodes, edges };
}

export function gcInit(g: Pick<GcState, "nodes" | "edges">, gogc = 100): GcState {
  const s: GcState = {
    ...structuredClone(g), phase: 0, grey: [], scanning: null, scanned: 0, barrier: true, barrierHits: 0, shaded: [], dangling: [],
    gogc, live: 0, goal: 0, cycle: 0, lastFreed: 0, trace: null,
    msg: "Nothing is collected until a cycle starts. Every object is **white**, which means not yet known to be reachable.",
  };
  // before any cycle has run, pretend the last cycle found this much live
  s.live = Math.round(heapKB(s) * 0.62);
  s.goal = Math.round(s.live * (1 + gogc / 100));
  return s;
}

const cl = (s: GcState) => { const n: GcState = structuredClone(s); n.shaded = []; n.trace = null; return n; };
const node = (s: GcState, id: string) => s.nodes.find((n) => n.id === id)!;

export function start(prev: GcState): GcState {
  const s = cl(prev);
  s.cycle++;
  s.phase = 1;
  s.scanned = 0; s.barrierHits = 0; s.dangling = [];
  s.nodes.forEach((n) => { if (!n.freed) { n.color = "white"; n.fresh = false; } });
  s.edges = s.edges.filter((e) => e.kind !== "gone").map((e) => ({ from: e.from, to: e.to }));
  s.msg = "**Stop the world**, briefly. Finish any sweeping left from the last cycle, and turn the **write barrier on** in every P. This pause is measured in microseconds.";
  return s;
}

export function roots(prev: GcState): GcState {
  const s = cl(prev);
  s.phase = 2;
  s.nodes.filter((n) => n.root && !n.freed).forEach((n) => { n.color = "grey"; s.grey.push(n.id); });
  s.shaded = [...s.grey];
  s.msg = "The world restarts with the barrier on. **Roots** turn grey: every goroutine stack and every global. From here the collector runs *beside* your code, on a quarter of the Ps.";
  return s;
}

export function step(prev: GcState): GcState {
  const s = cl(prev);
  if (s.phase !== 2 || !s.grey.length) return s;
  const id = s.grey.shift()!;
  const n = node(s, id);
  n.color = "black";
  s.scanning = id;
  s.scanned++;
  const kids = s.edges.filter((e) => e.from === id && e.kind !== "gone").map((e) => node(s, e.to)).filter((c) => !c.freed);
  const newly = kids.filter((c) => c.color === "white");
  newly.forEach((c) => { c.color = "grey"; s.grey.push(c.id); });
  s.shaded = newly.map((c) => c.id);
  s.msg = `Scanned **${id}**: it turns black. ${newly.length ? `It pointed at ${newly.map((c) => c.id).join(", ")}, now grey.` : "It pointed at nothing new."} The invariant holds: **no black object points at a white one.**`;
  return s;
}

export function markAll(prev: GcState) {
  let s = prev;
  let guard = 0;
  while (s.phase === 2 && s.grey.length && guard++ < 200) s = step(s);
  return s;
}

/** the dangerous pair of writes: store white into black, delete the other path */
export function mutate(prev: GcState, into: string, target: string, deleteFrom?: string): GcState {
  const s = cl(prev);
  s.edges.push({ from: into, to: target, kind: s.barrier ? "barrier" : undefined });
  if (deleteFrom) s.edges = s.edges.map((e) => (e.from === deleteFrom && e.to === target ? { ...e, kind: "gone" as const } : e));
  const t = node(s, target);
  if (s.barrier && s.phase === 2) {
    if (t.color === "white") { t.color = "grey"; s.grey.push(t.id); }
    s.barrierHits += deleteFrom ? 2 : 1;
    s.shaded = [t.id];
    s.msg = `\`${into}.f = ${target}\`${deleteFrom ? ` and \`${deleteFrom}.f = nil\`` : ""}. The **hybrid write barrier** shades the pointer being stored (Dijkstra) *and* the one being overwritten (Yuasa). ${target} turns grey and cannot be missed.`;
  } else {
    s.msg = `\`${into}.f = ${target}\`${deleteFrom ? ` and \`${deleteFrom}.f = nil\`` : ""}. With **no barrier**, nothing tells the collector. ${target} is white, and the only pointer to it now lives in **black** ${into}, which has already been scanned and will never be scanned again.`;
  }
  return s;
}

export function terminate(prev: GcState): GcState {
  const s = cl(prev);
  s.phase = 3;
  s.scanning = null;
  s.msg = "Grey is empty. **Stop the world** a second time to confirm every work buffer is really drained, then turn the barrier off. Thanks to the hybrid barrier, stacks never need re-scanning here, so this pause stays tiny.";
  return s;
}

export function sweep(prev: GcState): GcState {
  const s = cl(prev);
  s.phase = 4;
  const garbage = s.nodes.filter((n) => !n.freed && n.color === "white");
  const freedKB = garbage.reduce((a, n) => a + n.size, 0);
  const before = heapKB(s);
  // an object freed while a black object still points at it is the bug a barrier prevents
  s.dangling = s.edges.filter((e) => e.kind !== "gone" && garbage.some((g) => g.id === e.to) && node(s, e.from).color === "black").map((e) => e.to);
  garbage.forEach((n) => { n.freed = true; });
  s.lastFreed = freedKB;
  s.live = blackKB(s);
  s.goal = Math.round(s.live * (1 + s.gogc / 100));
  const mb = (kb: number) => Math.max(1, Math.round(kb / 1024));
  s.trace = `gc ${s.cycle} @${(s.cycle * 0.412).toFixed(3)}s 1%: 0.018+1.1+0.012 ms clock, 0.072+0.31/0.98/0+0.048 ms cpu, ${mb(before)}->${mb(before)}->${mb(s.live)} MB, ${mb(s.goal)} MB goal, 0 MB stacks, 0 MB globals, 4 P`;
  s.msg = s.dangling.length
    ? `!!Swept ${s.dangling.join(", ")} while a black object still points at ${s.dangling.length > 1 ? "them" : "it"}.!! The next read through that pointer reads freed memory. This is the bug the write barrier exists to prevent.`
    : `**Sweep.** ${garbage.length} white object${garbage.length === 1 ? "" : "s"} (${freedKB} KB) were never reached, so their bits in the span bitmaps are cleared. Nothing moves: Go's collector is **non-compacting**. The next goal is live × (1 + GOGC/100) = **${s.goal} KB**.`;
  return s;
}

export function setGogc(prev: GcState, gogc: number): GcState {
  const s = cl(prev);
  s.gogc = gogc;
  s.goal = Math.round(s.live * (1 + gogc / 100));
  s.msg = `\`GOGC=${gogc}\`: the next cycle starts when the heap reaches live × ${(1 + gogc / 100).toFixed(2)} = **${s.goal} KB**. ${gogc > 100 ? "Fewer cycles, more memory." : gogc < 100 ? "More cycles, less memory." : "The default."}`;
  return s;
}

/** the program allocates: new objects hang off something reachable */
export function allocate(prev: GcState, r: ReturnType<typeof rng>): GcState {
  const s = cl(prev);
  const live = s.nodes.filter((n) => !n.freed && (n.color !== "white" || s.phase === 0 || s.phase === 4));
  const parent = live.length ? live[r.int(live.length)] : s.nodes[0];
  const id = `n${s.nodes.length}`;
  // reuse a freed object's slot if there is one: that is what sweeping made room for
  const freed = s.nodes.find((n) => n.freed && n.x > 0);
  let spot = freed ? { x: freed.x, y: freed.y } : null;
  if (freed) freed.x = -999;
  for (let t = 0; !spot && t < 40; t++) {
    const c = { x: 110 + r.int(500), y: 40 + r.int(240) };
    if (s.nodes.every((n) => n.freed || Math.hypot(n.x - c.x, n.y - c.y) > 44)) spot = c;
  }
  if (!spot) return { ...s, msg: "The drawing is full. Run a GC cycle to free some room." };
  // during mark, new objects are allocated black: they are live by definition
  const color: Color = s.phase === 2 ? "black" : "white";
  s.nodes.push({ id, x: spot.x, y: spot.y, size: [32, 48, 64, 96, 128][r.int(5)], color, fresh: true });
  s.edges.push({ from: parent.id, to: id });
  s.msg = s.phase === 2
    ? `Allocated **${id}** during the mark phase. New objects are born **black**: they are reachable by construction, so they need no scan.`
    : `Allocated **${id}** (${s.nodes[s.nodes.length - 1].size} KB). The heap is now ${heapKB(s)} KB of a ${s.goal} KB goal.`;
  return s;
}
