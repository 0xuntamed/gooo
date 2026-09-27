"use client";

import { useMemo, useRef, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { adjust, call, grow, randomFrame, ret, retry, shrink, stackInit, type StackState, STORY_FRAMES, used } from "@/lib/engines/stack";
import { StackStage } from "./stage";

function story() {
  const f: { st: StackState; focus?: string }[] = [];
  let s = stackInit();
  f.push({ st: s });
  s = call(s, STORY_FRAMES[0]);
  f.push({ st: s, focus: "f1" });
  for (const fr of STORY_FRAMES.slice(1, 5)) s = call(s, fr);
  f.push({ st: s });
  s = call(s, STORY_FRAMES[5]);
  f.push({ st: s });
  s = grow(s);
  f.push({ st: s });
  s = adjust(s);
  f.push({ st: s, focus: "f5" });
  s = retry(s);
  f.push({ st: s, focus: "f6" });
  for (let i = 0; i < 5; i++) s = ret(s);
  f.push({ st: s });
  s = shrink(s);
  f.push({ st: s });
  return f;
}

const STEPS: Step[] = [
  {
    id: "fresh", title: "Two kilobytes",
    body: (
      <>
        <p>On linux/amd64 a new goroutine gets a <strong>2 KB</strong> stack. A thread&apos;s stack is fixed and usually megabytes. A goroutine&apos;s starts tiny because it can grow.</p>
        <p>Growing means it cannot use the operating system&apos;s guard page. So the check is done in software, at the top of nearly every function.</p>
      </>
    ),
  },
  {
    id: "check", title: "Every call checks",
    body: (
      <>
        <p>The compiler opens every function that has a frame with the same two instructions. <code>R14</code> holds the current <code>g</code>, and <code>16(R14)</code> is <code>g.stackguard0</code>, a line <strong>928 bytes</strong> above the bottom of the stack.</p>
        <p>If SP is still above it, the branch is not taken and the function simply runs. That is the whole cost of growable stacks on the fast path.</p>
      </>
    ),
  },
  {
    id: "deep", title: "Deeper",
    body: (
      <>
        <p>A recursive-descent parser goes deep. Each call pushes a frame and moves SP down toward the guard. Two of these frames hold pointers into earlier frames: <code>p := &amp;buf</code> and <code>q := &amp;tok</code>.</p>
        <p>One holds a <code>uintptr</code> made from a stack address. Keep it in mind.</p>
      </>
    ),
  },
  {
    id: "guard", title: "The guard",
    body: (
      <>
        <p><code>parseCall</code> needs 192 bytes, and that would take SP below <code>stackguard0</code>. <code>JLS</code> is taken, and control goes to <code>runtime.morestack</code> before the function has done anything.</p>
        <p>The 928 bytes below the guard are not wasted: they are room for runtime code that is marked <code>NOSPLIT</code> and never checks.</p>
      </>
    ),
  },
  {
    id: "copy", title: "Allocate double, copy",
    body: (
      <>
        <p><code>newstack</code> allocates a stack <strong>twice the size</strong>, somewhere else entirely, and copies the used part across with one <code>memmove</code>. The goroutine is in <code>_Gcopystack</code> while this happens.</p>
      </>
    ),
  },
  {
    id: "adjust", title: "Rewrite every pointer",
    body: (
      <>
        <p>The hard part: <code>p</code> and <code>q</code> still hold addresses in the <em>old</em> stack. <code>adjustpointers</code> walks every frame, uses the compiler&apos;s <strong>stack maps</strong> to find each word that is a pointer, and moves it by the same offset the stack moved. Saved frame pointers are fixed the same way.</p>
        <p><code>u</code> is a <code>uintptr</code>. To the runtime it is just a number, so it is <strong>not</strong> adjusted. It now points into freed memory. This is why converting a stack address to <code>uintptr</code> and back is not safe.</p>
      </>
    ),
  },
  {
    id: "retry", title: "Retry the call",
    body: (
      <>
        <p>The old stack is freed, and <code>parseCall</code> starts again from its first instruction, on the new stack. This time the check passes. Nothing in the program can tell the move happened, which is exactly why the runtime needs precise knowledge of every pointer.</p>
      </>
    ),
  },
  {
    id: "ret", title: "Returning does not shrink",
    body: (
      <>
        <p>The parser unwinds. Frames pop and SP climbs back up, but the stack stays 4 KB. Shrinking on return would make every return expensive, and the goroutine may go deep again in a moment.</p>
      </>
    ),
  },
  {
    id: "shrink", title: "The collector shrinks it",
    body: (
      <>
        <p>Shrinking happens during garbage collection, when stacks are being scanned anyway. If a goroutine is using less than <strong>a quarter</strong> of its stack, <code>shrinkstack</code> copies it into one half the size, by the same copy-and-adjust.</p>
        <p>So a goroutine that went deep once does not hold that memory for ever.</p>
      </>
    ),
  },
];

export default function StacksChapter() {
  const frames = useMemo(story, []);
  const [st, setSt] = useState<StackState>(stackInit);
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const timers = useRef<number[]>([]);
  const log = (kind: TraceLine["kind"], text: string) => setTrace((t) => pushTrace(t, mkTrace(kind, text)));

  const deeper = () => {
    const depth = st.frames.length;
    const f = randomFrame(depth);
    if (f.holds && depth >= 2) f.holds.to = st.frames[depth - 2].id;
    const next = call(st, f);
    setSt(next);
    if (next.phase !== "check-fail") { log("info", `call ${f.name}: ${f.size} B frame, SP above stackguard0`); return; }
    // morestack → newstack → copystack → adjust → retry, animated
    setBusy(true);
    log("warn", `morestack: ${f.name} needs ${f.size} B, stack ${next.size} B exhausted`);
    const g = grow(next);
    const a = adjust(g);
    const r = retry(a);
    timers.current.push(
      window.setTimeout(() => { setSt(g); log("warn", `newstack: copystack ${next.size} → ${g.size} bytes`); }, 900),
      window.setTimeout(() => { setSt(a); log("warn", `adjustpointers: ${a.frames.filter((x) => x.holds?.kind === "ptr").length} pointers + ${a.frames.length - 1} frame pointers moved`); }, 2100),
      window.setTimeout(() => { setSt(r); setBusy(false); log("info", `retry ${f.name} on the new stack`); }, 3300),
    );
  };

  return (
    <>
      <Scrolly steps={STEPS} block="growable stack region" pkg="runtime/stack.go">
        {(i) => <StackStage st={frames[i].st} focus={frames[i].focus} />}
      </Scrolly>

      <Sandbox
        slug="stacks"
        intro={<p>Call deeper until the check fails and watch the whole growth sequence run. Then return, and ask the collector to shrink the stack: it only will once less than a quarter is in use.</p>}
        controls={
          <>
            <Pad tone="primary" onClick={deeper} disabled={busy || used(st.frames) > 12000}>Call deeper</Pad>
            <Pad onClick={() => { setSt(ret(st)); log("info", "return: frame popped, stack size unchanged"); }} disabled={busy}>Return</Pad>
            <Pad onClick={() => { const s2 = shrink(st); setSt(s2); log(s2.phase === "shrink" ? "gc" : "info", s2.phase === "shrink" ? `shrinkstack: ${st.size} → ${s2.size} bytes` : "shrinkstack: over 1/4 in use, skipped"); }} disabled={busy}>GC stack shrink</Pad>
            <Pad tone="quiet" onClick={() => { timers.current.forEach(clearTimeout); setBusy(false); setSt(stackInit()); log("info", "newproc: stack = 2048 bytes"); }}>Reset</Pad>
          </>
        }
        stage={<StackStage st={st} />}
        readout={<Readout id={st.phase + st.frames.length + st.size}><p><Rich text={st.msg} /></p></Readout>}
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="runtime/stack.go · morestack · newstack · copystack"
      />

      <ChapterClose
        slug="stacks"
        notes={
          <>
            <p><Fidelity kind="illustrative">stack addresses are illustrative</Fidelity></p>
            <p>The sizes are linux/amd64&apos;s. On Windows the runtime reserves an extra 4 KB of every stack for the OS (<code>stackSystem</code>), so goroutines there start at 8 KB. Frames larger than 128 bytes use a slightly different prologue: they compare <code>SP − framesize + 128</code> against the guard, so a big frame cannot jump over it.</p>
            <p>A goroutine&apos;s stack can grow to 1 GB on 64-bit systems (<code>debug.SetMaxStack</code>). Past that, the runtime stops with <code>goroutine stack exceeds 1000000000-byte limit</code>.</p>
          </>
        }
      />
    </>
  );
}
