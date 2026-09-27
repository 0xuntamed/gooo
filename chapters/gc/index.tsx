"use client";

import { useMemo, useRef, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { Dial, Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { allocate, gcInit, type GcState, heapKB, markAll, mutate, randomGraph, roots, setGogc, start, step, storyGraph, sweep, terminate } from "@/lib/engines/gc";
import { rng } from "@/lib/rng";
import { GcStage } from "./stage";

function story() {
  const g0 = gcInit(storyGraph());
  const g1 = start(g0);
  const g2 = roots(g1);
  let g3 = g2;
  for (let i = 0; i < 4; i++) g3 = step(g3);
  const g4 = step(g3);
  const nb = mutate({ ...g4, barrier: false }, "A", "W", "F");
  const nbEnd = sweep(terminate(markAll(nb)));
  const g7 = mutate(g4, "A", "W", "F");
  const g8 = markAll(g7);
  const g9 = terminate(g8);
  const g10 = sweep(g9);
  return [g0, g1, g2, g3, g4, nb, nbEnd, g7, g8, g9, g10, g10];
}

const STEPS: Step[] = [
  {
    id: "graph", title: "The heap is a graph",
    body: (
      <>
        <p>To the collector, the heap is objects and the pointers between them. Some objects are <strong>roots</strong>: pointed to from a goroutine stack or a global. Anything reachable from a root is live. Everything else is garbage.</p>
        <p>Go&apos;s collector marks what is reachable, then frees the rest, <em>while your program keeps running</em>. Everything below exists to make that safe.</p>
      </>
    ),
  },
  {
    id: "stw1", title: "Stop the world, briefly",
    body: (
      <>
        <p>A cycle starts with a short <strong>stop-the-world</strong>: finish any sweeping left over from last time, and switch the <strong>write barrier</strong> on in every P. This is one of only two pauses, and both are measured in microseconds.</p>
      </>
    ),
  },
  {
    id: "roots", title: "Roots go grey",
    body: (
      <>
        <p>The world restarts. Everything starts <strong>white</strong>, meaning not yet known to be reachable. The roots turn <strong>grey</strong>, meaning reachable but not yet scanned.</p>
        <p>From now on, a quarter of the Ps run dedicated mark workers (block 08), and goroutines that allocate heavily are made to help, which is called a mark assist.</p>
      </>
    ),
  },
  {
    id: "scan", title: "Scan: grey becomes black",
    body: (
      <>
        <p>A mark worker takes a grey object, greys every white object it points to, and turns it <strong>black</strong>: reachable and done. The grey set is a wavefront moving outward from the roots.</p>
      </>
    ),
  },
  {
    id: "invariant", title: "The invariant",
    body: (
      <>
        <p>Everything rests on one rule: <strong>no black object may point to a white one.</strong> Black objects are never looked at again, so a white object reachable only from black ones would never be found.</p>
        <p>Right now it holds. <code>W</code> is white, but grey <code>F</code> still points to it, so <code>W</code> will be reached when <code>F</code> is scanned.</p>
      </>
    ),
  },
  {
    id: "write", title: "Your code keeps running",
    body: (
      <>
        <p>The mutator, your program, does two ordinary things: <code>A.f = W</code>, then <code>F.f = nil</code>. Now the only pointer to <code>W</code> lives in <code>A</code>, which is <strong>black</strong>. The invariant is broken.</p>
        <p>For a moment, imagine there were no write barrier.</p>
      </>
    ),
  },
  {
    id: "bug", title: "What would go wrong",
    body: (
      <>
        <p>Marking finishes. <code>F</code> is scanned but no longer points at <code>W</code>, and <code>A</code> is never scanned again. <code>W</code> stays white and is swept: <strong>freed while <code>A</code> still points to it</strong>. The next <code>A.f.x</code> reads freed memory, or memory that now belongs to something else.</p>
        <p>This is the bug a concurrent collector must make impossible.</p>
      </>
    ),
  },
  {
    id: "barrier", title: "The hybrid write barrier",
    body: (
      <>
        <p>Back to the real runtime. While marking, every pointer write to the heap goes through a <strong>write barrier</strong>. Go&apos;s is a hybrid: it shades the pointer being <em>stored</em> (Dijkstra&apos;s insertion barrier) <em>and</em> the pointer being <em>overwritten</em> (Yuasa&apos;s deletion barrier).</p>
        <p>Either half catches this case. <code>W</code> turns grey the moment it is stored, and cannot be missed.</p>
      </>
    ),
  },
  {
    id: "drain", title: "Mark to the end",
    body: (
      <>
        <p>The workers drain the grey set. <code>W</code> is scanned, and through it <code>J</code>. When grey is empty, everything reachable is black. <code>I</code> and <code>K</code> are still white: nothing reachable points to them.</p>
        <p>Objects <em>allocated</em> during marking are born black, since a new object is reachable by definition.</p>
      </>
    ),
  },
  {
    id: "stw2", title: "Mark termination",
    body: (
      <>
        <p>The second stop-the-world confirms that every work buffer is truly empty, and turns the barrier off. Because the hybrid barrier also shades overwritten pointers, a stack that has been scanned can never hide a white pointer, so stacks do not have to be scanned again here.</p>
        <p>Removing that rescan, in Go 1.8, is what took these pauses from tens of milliseconds to well under one.</p>
      </>
    ),
  },
  {
    id: "sweep", title: "Sweep",
    body: (
      <>
        <p>White objects are garbage. Sweeping frees them by clearing their bits in each span&apos;s bitmap (block 12). Nothing is copied and nothing moves: Go&apos;s collector is <strong>non-compacting</strong>, which is why a pointer handed to C code stays valid.</p>
        <p>Sweeping is lazy. Spans are swept in the background, or on demand just before they are allocated from.</p>
      </>
    ),
  },
  {
    id: "pace", title: "When the next cycle starts",
    body: (
      <>
        <p>The pacer schedules the next cycle from how much survived this one: <strong>goal = live × (1 + GOGC/100)</strong>. With the default <code>GOGC=100</code>, the heap may grow to twice its live size before the next collection. Since Go 1.18, stacks and globals count toward it too.</p>
        <p><code>GOMEMLIMIT</code> adds a ceiling: as the total approaches the limit, collections come sooner, whatever <code>GOGC</code> says.</p>
      </>
    ),
  },
];

export default function GcChapter() {
  const frames = useMemo(story, []);
  const [s, setS] = useState<GcState>(() => gcInit(randomGraph()));
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const r = useRef(rng(7));
  const timers = useRef<number[]>([]);
  const log = (kind: TraceLine["kind"], text: string) => setTrace((t) => pushTrace(t, mkTrace(kind, text)));

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const trigger = (from: GcState, why: string) => {
    const a = start(from);
    setS(a);
    log("gc", `GC ${a.cycle} forced: ${why}`);
    later(() => { setS((x) => roots(x)); log("gc", `GC ${a.cycle}: mark phase, write barrier on, roots greyed, 25% of Ps marking`); }, 700);
  };

  const finish = (from: GcState) => {
    const t = terminate(from);
    setS(t);
    log("gc", `GC ${t.cycle}: mark termination, stop the world, barrier off`);
    later(() => {
      const sw = sweep(t);
      setS(sw);
      if (sw.trace) log(sw.dangling.length ? "warn" : "gc", sw.trace);
      if (sw.dangling.length) log("warn", `use-after-free: ${sw.dangling.join(", ")} freed while referenced (barrier was off)`);
    }, 700);
  };

  const doStep = () => {
    if (s.phase === 0 || s.phase === 4) return trigger(s, "runtime.GC()");
    if (s.phase !== 2) return;
    if (!s.grey.length) return finish(s);
    const n = step(s);
    setS(n);
    log("info", `scan ${n.scanning}: black, ${n.shaded.length ? `shaded ${n.shaded.join(" ")}` : "no new greys"}`);
  };

  const doMutate = () => {
    if (s.phase !== 2) { setS({ ...s, msg: "The barrier only matters while marking. Outside the mark phase a pointer write is a plain `MOV`. Trigger a GC first." }); return; }
    const blacks = s.nodes.filter((n) => !n.freed && n.color === "black");
    const whites = s.nodes.filter((n) => !n.freed && n.color === "white");
    if (!blacks.length || !whites.length) { setS({ ...s, msg: "The dangerous write needs a black object and a white one. Step the mark a few times first." }); return; }
    const b = blacks[r.current.int(blacks.length)];
    const w = whites[r.current.int(whites.length)];
    const parent = s.edges.find((e) => e.to === w.id && e.kind !== "gone" && s.nodes.find((n) => n.id === e.from)?.color === "grey");
    const n = mutate(s, b.id, w.id, parent?.from);
    setS(n);
    log(s.barrier ? "note" : "warn", s.barrier ? `gcWriteBarrier: ${b.id}.f = ${w.id}${parent ? `, ${parent.from}.f = nil` : ""}: shaded ${w.id}` : `write ${b.id}.f = ${w.id} with the barrier OFF`);
  };

  const doAlloc = () => {
    const n = allocate(s, r.current);
    setS(n);
    log("info", n.msg.replace(/\*\*/g, ""));
    if ((n.phase === 0 || n.phase === 4) && heapKB(n) >= n.goal) later(() => trigger(n, `heap ${heapKB(n)} KB reached the ${n.goal} KB goal`), 500);
  };

  return (
    <>
      <Scrolly steps={STEPS} block="heap arena" pkg="runtime/mgc.go">
        {(i) => <GcStage s={frames[i]} focus={i === 11 ? "pacing" : undefined} />}
      </Scrolly>

      <Sandbox
        slug="gc"
        intro={
          <p>Allocate until the heap reaches its goal and the pacer starts a cycle, or trigger one yourself. Step the mark, and write pointers mid-cycle to watch the barrier fire. Then switch the barrier <strong>off</strong> and do it again.</p>
        }
        controls={
          <>
            <Pad tone="primary" onClick={() => trigger(s, "runtime.GC()")} disabled={s.phase === 1 || s.phase === 2 || s.phase === 3}>Trigger GC</Pad>
            <Pad onClick={doStep} disabled={s.phase === 1 || s.phase === 3}>{s.phase === 2 && !s.grey.length ? "Finish mark" : "Step mark"}</Pad>
            <Pad onClick={() => { if (s.phase === 2) { const m = markAll(s); setS(m); log("info", `mark: drained, ${m.scanned} objects scanned`); } }} disabled={s.phase !== 2}>Mark all</Pad>
            <Pad onClick={doMutate}>Mutator writes a pointer</Pad>
            <Pad onClick={doAlloc} disabled={s.phase === 1 || s.phase === 3}>Allocate</Pad>
            <Pad pressed={!s.barrier} onClick={() => { setS({ ...s, barrier: !s.barrier }); log("warn", `write barrier ${s.barrier ? "disabled (a thought experiment)" : "restored"}`); }}>
              {s.barrier ? "Disable the barrier" : "Barrier is off"}
            </Pad>
            <Dial label="GOGC" value={s.gogc} min={25} max={400} step={25} onChange={(v) => setS(setGogc(s, v))} />
            <Pad tone="quiet" onClick={() => { timers.current.forEach(clearTimeout); setS(gcInit(randomGraph(), s.gogc)); log("info", "heap reset"); }}>Reset</Pad>
          </>
        }
        stage={<GcStage s={s} />}
        readout={<Readout id={s.msg}><p><Rich text={s.msg} /></p></Readout>}
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="GODEBUG=gctrace=1 · GOGC · GOMEMLIMIT"
      />

      <ChapterClose
        slug="gc"
        notes={
          <>
            <p><Fidelity kind="illustrative">object sizes and gctrace timings are illustrative</Fidelity></p>
            <p>The phases, the colours, the hybrid barrier and the pacing rule follow <code>runtime/mgc.go</code>, <code>mbarrier.go</code> and <code>mgcpacer.go</code>. The <code>gctrace</code> line uses the real format, but its numbers come from this simulation. Real marking runs on several workers at once, from per-P work buffers, not one object at a time.</p>
            <p>The pacer&apos;s full rule since Go 1.18 is heap goal = live heap + (live heap + GC roots) × GOGC/100, where roots are goroutine stacks and globals. This page draws the heap-only form.</p>
          </>
        }
      />
    </>
  );
}
