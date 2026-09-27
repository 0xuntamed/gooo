"use client";

import { useMemo, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { alloc, allocInit, type AllocState, REQS } from "@/lib/engines/alloc";
import { AllocStage } from "./stage";

const R200 = REQS[3];

function story() {
  const f: { st: AllocState; show: { ruler?: boolean; span?: boolean } }[] = [];
  const a0 = allocInit();
  f.push({ st: a0, show: {} });
  const a1 = alloc(a0, R200).st;
  f.push({ st: a1, show: { ruler: true } });
  f.push({ st: a1, show: { span: true } });
  let a = a1;
  for (let i = 0; i < 5; i++) a = alloc(a, R200).st;
  f.push({ st: a, show: { span: true } });
  for (let i = 0; i < 33; i++) a = alloc(a, R200).st;
  const full = a;
  f.push({ st: full, show: { span: true } });
  a = alloc(full, R200).st;
  f.push({ st: a, show: { span: true } });
  let t = alloc(a, REQS[0]).st;
  t = alloc(t, REQS[1]).st;
  t = alloc(t, REQS[1]).st;
  f.push({ st: t, show: { span: true } });
  f.push({ st: alloc(t, REQS[5]).st, show: { span: true } });
  return f;
}

const STEPS: Step[] = [
  {
    id: "tiers", title: "Three tiers",
    body: (
      <>
        <p>Every heap allocation enters <code>mallocgc</code>, and there are three places it can be served from. The <strong>mcache</strong> belongs to one P and holds one span per size class. The <strong>mcentral</strong> is shared, one per size class. The <strong>mheap</strong> owns the pages themselves.</p>
        <p>An M must hold a P to run Go code, and the mcache lives on the P, so nothing else can touch it. That is how the common path needs <strong>no lock</strong>.</p>
      </>
    ),
  },
  {
    id: "class", title: "Round up to a size class",
    body: (
      <>
        <p><code>make([]byte, 200)</code>. The allocator does not deal in arbitrary sizes. There are 67 size classes from 8 bytes to 32 KB, spaced so that no more than about 12.5% is ever wasted. 200 bytes rounds up to <strong>class 15, 208 bytes</strong>.</p>
        <p>Every object in a span is the same size. That makes finding a free slot a bitmap scan and freeing one a bit clear.</p>
      </>
    ),
  },
  {
    id: "miss", title: "The first one misses",
    body: (
      <>
        <p>This P has never allocated a 208-byte object, so its mcache has no span for class 15. It calls <code>mcentral.cacheSpan()</code>, <strong>takes the class&apos;s lock</strong>, and comes back with a whole 8 KB span: 39 objects of 208 bytes.</p>
        <p>One locked trip buys 39 allocations.</p>
      </>
    ),
  },
  {
    id: "fast", title: "The fast path",
    body: (
      <>
        <p>The next allocations of this class never leave the P. The span keeps 64 bits of its <code>allocBits</code>, inverted, in <code>allocCache</code>, so finding the next free slot is a single count-trailing-zeros instruction. Then add <code>index × 208</code> to the span base.</p>
        <p>There is no lock, no atomic operation, and no search. This is where nearly every Go allocation ends.</p>
      </>
    ),
  },
  {
    id: "dry", title: "The span runs dry",
    body: (
      <>
        <p>39 of 39. The mcache has used up the span. Before you scroll: where does allocation 40 come from?</p>
      </>
    ),
  },
  {
    id: "refill", title: "Refill",
    body: (
      <>
        <p>The full span goes back to mcentral, and the mcache asks for another. If mcentral has a partly free span of this class, perhaps one the sweeper just recovered, it hands that over. If not, it goes to the <strong>mheap</strong> for a fresh page, taking the heap lock.</p>
        <p>The deeper the tier, the rarer the trip, and the more expensive it is.</p>
      </>
    ),
  },
  {
    id: "tiny", title: "Tiny objects share a block",
    body: (
      <>
        <p>Pointer-free objects under 16 bytes get special treatment. The <strong>tiny allocator</strong> bump-allocates them into a shared 16-byte block, aligned to their size: an 8-byte slice, then two 4-byte <code>int32</code>s, all in one block.</p>
        <p>They are freed together, only when none of them is reachable. Small strings, <code>bool</code>s and little structs cost almost nothing this way.</p>
      </>
    ),
  },
  {
    id: "large", title: "Large objects skip the caches",
    body: (
      <>
        <p><code>make([]byte, 64&lt;&lt;10)</code> is over 32 KB. There is no size class for it, so it goes straight to the <strong>mheap</strong>, under the heap lock, and gets a span of 8 pages all to itself.</p>
        <p>Large allocations are the slow path by design. If a hot loop makes them, reuse the buffer, for example with a <code>sync.Pool</code>.</p>
      </>
    ),
  },
];

export default function AllocatorChapter() {
  const frames = useMemo(story, []);
  const [st, setSt] = useState<AllocState>(allocInit);
  const [trace, setTrace] = useState<TraceLine[]>([]);

  const run = (i: number) => {
    const r = alloc(st, REQS[i]);
    setSt(r.st);
    setTrace((t) => pushTrace(t, ...r.trace.map((x) => mkTrace(x.kind, x.text))));
  };

  return (
    <>
      <Scrolly steps={STEPS} block="cache hierarchy" pkg="runtime/malloc.go">
        {(i) => <AllocStage st={frames[i].st} show={frames[i].show} />}
      </Scrolly>

      <Sandbox
        slug="allocator"
        intro={<p>Allocate and watch how far each request has to travel. Do the same size twice: the first may miss, and the second never leaves the P. Mix tiny objects to watch them pack into one block.</p>}
        controls={
          <>
            {REQS.map((r, i) => (
              <Pad key={r.label} code onClick={() => run(i)}>{r.label.split(" · ")[0]}{r.label.includes("·") ? " (ptrs)" : ""}</Pad>
            ))}
            <Pad tone="quiet" onClick={() => { setSt(allocInit()); setTrace((t) => pushTrace(t, mkTrace("info", "allocator reset: empty mcache"))); }}>Reset</Pad>
          </>
        }
        stage={<AllocStage st={st} />}
        readout={<Readout id={st.n}><p><Rich text={st.msg} /></p></Readout>}
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="runtime/malloc.go · GODEBUG=allocfreetrace"
      />

      <ChapterClose
        slug="allocator"
        notes={
          <>
            <p>The size classes are the runtime&apos;s real table. The spans drawn here are single 8 KB pages, which is true for these classes. Some larger classes use spans of several pages so that less of the span is left over.</p>
            <p>Pointer-free objects (<code>noscan</code>) and objects with pointers are kept in separate spans, so the collector can skip whole spans it knows contain no pointers.</p>
          </>
        }
      />
    </>
  );
}
