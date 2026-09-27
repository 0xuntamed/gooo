"use client";

import { useEffect, useMemo, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { scenario } from "@/lib/engines/defer";
import { DeferStage } from "./stage";

const STEPS: Step[] = [
  {
    id: "three", title: "Three defers, three costs",
    body: (
      <>
        <p><code>defer</code> has three implementations, and the compiler picks one per function from its <em>shape</em>. This function has three defers, all in straight-line code. That is the cheapest case of all.</p>
      </>
    ),
  },
  {
    id: "bit", title: "defer arms a bit",
    body: (
      <>
        <p>Since Go 1.14, defers like these are <strong>open-coded</strong>. Executing a <code>defer</code> statement just sets a bit in a byte on the stack, <code>deferBits</code>, and stores the call&apos;s arguments in the frame. It needs no record, no allocation, and no runtime call.</p>
      </>
    ),
  },
  {
    id: "mask", title: "The mask records what ran",
    body: (
      <>
        <p>Three statements later, <code>deferBits</code> is <code>0b00000111</code>. The bits matter because a <code>defer</code> can sit behind an <code>if</code>: the return path has to know which ones actually executed.</p>
        <p>This is also why open-coding needs a fixed maximum. There are 8 bits, so at most 8 defers per function.</p>
      </>
    ),
  },
  {
    id: "ret", title: "Return runs them backwards",
    body: (
      <>
        <p>At every return, the compiler has inlined the calls: test bit 2 and call the closure, test bit 1 and unlock, test bit 0 and close. Last deferred runs first.</p>
        <p>The cost is a few byte tests and three direct calls, close to writing the calls out by hand.</p>
      </>
    ),
  },
  {
    id: "loop", title: "One defer in a loop",
    body: (
      <>
        <p>Put one <code>defer</code> inside a loop and the count is no longer known at compile time. Open-coding is switched off <strong>for the whole function</strong>, not just that line.</p>
        <p>Straight-line defers now become <code>_defer</code> records built in the frame (<code>deferprocStack</code>). The ones in the loop are <strong>allocated on the heap</strong> (<code>deferproc</code>), one per iteration. All of them are linked onto <code>g._defer</code>.</p>
      </>
    ),
  },
  {
    id: "panic", title: "panic walks the defers",
    body: (
      <>
        <p>Back to the open-coded version, and <code>doWork</code> panics. <code>gopanic</code> stops normal execution and walks up the goroutine&apos;s frames, running each frame&apos;s deferred calls, newest first.</p>
        <p>Open-coded defers have no records to walk. Instead, each function&apos;s metadata says where its <code>deferBits</code> byte and saved arguments live, and the runtime reads them from there.</p>
      </>
    ),
  },
  {
    id: "recover", title: "recover() stops the panic",
    body: (
      <>
        <p>The closure calls <code>recover()</code> while a panic is in flight, from a function the panic itself called. So <code>recover</code> marks the panic <strong>recovered</strong> and returns its value, <code>&quot;boom&quot;</code>.</p>
        <p><code>recover</code> is not control flow. It only sets a flag. Called anywhere else, it returns nil.</p>
      </>
    ),
  },
  {
    id: "resume", title: "Resume at the return",
    body: (
      <>
        <p>When that deferred call returns, the runtime sees the flag and calls <code>mcall(recovery)</code>. That resets the stack pointer and program counter to <code>process</code>&apos;s <strong>deferreturn point</strong>, the code that runs defers on a normal return.</p>
        <p><code>doWork</code>&apos;s frame is simply abandoned. <code>process</code> carries on as if it were returning, with <code>err</code> already set by the closure.</p>
      </>
    ),
  },
  {
    id: "rest", title: "The rest still run",
    body: (
      <>
        <p>On that normal return path, the remaining defers run: unlock, then close. <code>process</code> returns <code>recovered: boom</code>. It never finished its body, and the lock and the file were still released.</p>
      </>
    ),
  },
  {
    id: "crash", title: "No recover: the crash",
    body: (
      <>
        <p>The loop version has no <code>recover</code>. <code>gopanic</code> runs all five records, heap ones and stack ones, and none stops the panic. When it runs out of frames, the runtime prints the panic value and every goroutine&apos;s traceback, and exits with status 2.</p>
        <p>A panic in any goroutine ends the whole program. <code>recover</code> only works inside the goroutine that panicked.</p>
      </>
    ),
  },
];

export default function DeferChapter() {
  const frames = useMemo(() => {
    const oR = scenario("open", "return");
    const oP = scenario("open", "panic");
    const lR = scenario("loop", "return");
    const lP = scenario("loop", "panic");
    return [oR[0], oR[1], oR[3], oR[7], lR[5], oP[5], oP[6], oP[7], oP[oP.length - 1], lP[lP.length - 1]];
  }, []);

  const [variant, setVariant] = useState<"open" | "loop">("open");
  const [tape, setTape] = useState(() => scenario("open", "return"));
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [trace, setTrace] = useState<TraceLine[]>([]);

  const load = (v: "open" | "loop", how: "return" | "panic", play: boolean) => {
    setVariant(v);
    setTape(scenario(v, how));
    setI(0);
    setPlaying(play);
    setTrace((t) => pushTrace(t, mkTrace(how === "panic" ? "warn" : "info", `${v === "open" ? "open-coded" : "_defer records"}: ${how === "panic" ? 'panic("boom")' : "return normally"}`)));
  };

  useEffect(() => {
    if (!playing) return;
    if (i >= tape.length - 1) { setPlaying(false); return; }
    const id = window.setTimeout(() => setI((x) => x + 1), 1150);
    return () => window.clearTimeout(id);
  }, [playing, i, tape.length]);

  const s = tape[Math.min(i, tape.length - 1)];

  return (
    <>
      <Scrolly steps={STEPS} block="8-bit defer register" pkg="runtime/panic.go">
        {(k) => <DeferStage s={frames[k]} />}
      </Scrolly>

      <Sandbox
        slug="defer"
        intro={<p>Pick a shape, then return normally or panic. The run plays at reading speed. Pause it and step through by hand to watch each record or bit fire.</p>}
        controls={
          <>
            <Pad pressed={variant === "open"} onClick={() => load("open", "return", false)}>Open-coded</Pad>
            <Pad pressed={variant === "loop"} onClick={() => load("loop", "return", false)}>Defer in a loop</Pad>
            <Pad tone="primary" onClick={() => load(variant, "return", true)}>Run to return</Pad>
            <Pad code onClick={() => load(variant, "panic", true)}>panic(&quot;boom&quot;)</Pad>
            <Pad onClick={() => { setPlaying(false); setI((x) => Math.min(x + 1, tape.length - 1)); }} disabled={i >= tape.length - 1}>Step</Pad>
            <Pad tone="quiet" onClick={() => { setPlaying(false); setI(0); }}>Reset</Pad>
          </>
        }
        stage={<DeferStage s={s} />}
        readout={
          <>
            <Readout id={`${variant}-${i}-${tape.length}`}><p><Rich text={s.msg} /></p></Readout>
            <p className="mt-3 font-mono text-[12px] text-ink-3">step {i + 1} / {tape.length}</p>
          </>
        }
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="go build -gcflags=-d=defer"
      />

      <ChapterClose
        slug="defer"
        notes={
          <>
            <p><code>go build -gcflags=-d=defer</code> prints which kind the compiler chose for each <code>defer</code>: open-coded, stack-allocated or heap-allocated. Open-coding needs at most 8 defers, none in a loop, and returns × defers no more than 15, so the code inlined at every exit stays small.</p>
            <p>How the runtime walks frames during a panic has been reworked over the years. What it does has not changed: find deferred calls newest first, run them, and after a recover resume at the recovering frame&apos;s <code>deferreturn</code>.</p>
          </>
        }
      />
    </>
  );
}
