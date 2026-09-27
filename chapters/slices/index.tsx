"use client";

import { useMemo, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { MEASURED, sliceAct, sliceInit, type SliceState } from "@/lib/engines/slices";
import { GrowthLadder } from "./growth";
import { SliceStage } from "./stage";

function story() {
  const s0 = sliceInit();
  const s1 = sliceAct(s0, "alias").st;
  const s2 = sliceAct(s1, "append-t", 99).st;
  const s3 = sliceAct(s2, "alias3").st;
  const s4 = sliceAct(s3, "append-t", 77).st;
  const s5 = sliceAct(s4, "append-s", 60).st;
  const s6 = sliceAct(s5, "append-s", 70).st;
  return [s0, s1, s2, s3, s4, s5, s6];
}

const STEPS: Step[] = [
  {
    id: "view", title: "A slice is a view",
    body: (
      <>
        <p><code>[6]int</code> is 48 bytes of data, and it is a value: assign it and all 48 bytes are copied. <code>[]int</code> is a 24-byte <strong>header</strong> holding a pointer, a length and a capacity. Assign that and you copy the header. Both copies then point at the same array.</p>
        <p>Here, <code>s := make([]int, 5, 6)</code>: five elements in use and one spare slot. Keep an eye on that spare slot.</p>
      </>
    ),
  },
  {
    id: "alias", title: "Slicing copies nothing",
    body: (
      <>
        <p><code>t := s[1:3]</code> builds a second header. Its pointer is <code>&amp;arr[1]</code> and its length is 2. Its capacity is <strong>5</strong>, because capacity runs to the end of the <em>array</em>, not to the end of <code>s</code>.</p>
        <p>Nothing was allocated. <code>t</code> and <code>s</code> are two windows onto the same 48 bytes.</p>
      </>
    ),
  },
  {
    id: "clobber", title: "append writes through",
    body: (
      <>
        <p><code>t = append(t, 99)</code>. <code>t</code> has length 2 and capacity 5, so there is room, and <code>append</code> writes 99 into the next slot, <code>arr[3]</code>. That slot is also <code>s[3]</code>.</p>
        <p><code>s</code> never appears in that line, yet its fourth element just changed from 40 to 99, and nothing warned you. Handing out a sub-slice that someone later appends to is one of the most common slice bugs in real Go code.</p>
      </>
    ),
  },
  {
    id: "three", title: "Cap the capacity",
    body: (
      <>
        <p><code>t := s[1:3:3]</code> is the three-index form: <code>low:high:max</code>. Now <code>cap(t)</code> is 3 − 1 = 2, the same as its length.</p>
        <p>It is still a view, over the same array, with no copy. The difference only shows on the next append.</p>
      </>
    ),
  },
  {
    id: "grow-t", title: "Full means copy",
    body: (
      <>
        <p><code>t = append(t, 77)</code>. Now <code>len == cap</code>, so <code>append</code> calls <code>growslice</code>. <code>nextslicecap</code> doubles 2 to 4, and 4 × 8 bytes is 32 B, which is exactly a size class, so the new array holds 4.</p>
        <p>The two live elements are copied across, 77 lands after them, and <code>t</code>&apos;s header moves to the new array. <code>s</code> is untouched: the bug from T02 can no longer happen through this <code>t</code>.</p>
      </>
    ),
  },
  {
    id: "last", title: "The last spare slot",
    body: (
      <>
        <p><code>s = append(s, 60)</code> fills slot 5 in place. Now <code>len(s) == cap(s) == 6</code>.</p>
        <p>Before you scroll: what happens on the next append, and where does <code>s</code> end up?</p>
      </>
    ),
  },
  {
    id: "grow-s", title: "Growing s",
    body: (
      <>
        <p><code>s = append(s, 70)</code>. It is full, so <code>growslice</code> runs again. <code>nextslicecap(7, 6)</code>: 6 is under 256, so it doubles to 12. 12 × 8 = 96 bytes, a size class. Six elements are copied and 70 is appended.</p>
        <p>No header points at the original array any more, so it is garbage now, and the collector will reclaim it (block 13). <code>t</code> still lives on the array it moved to in T04.</p>
      </>
    ),
  },
  {
    id: "ladder", title: "How much it grows",
    body: (
      <>
        <p>Doubling stops at 256. Above that, <code>nextslicecap</code> adds <code>(cap + 768) / 4</code>, easing from 2× toward 1.25× as slices get large. Then <code>mallocgc</code> rounds the byte count up to a <strong>size class</strong>, and the leftover bytes become extra capacity.</p>
        <p>That is why the numbers stop being round: 512 → 832 → 6,656 B → the 6,784-byte class → cap 848. Every row here is computed by that rule and checked against the capacity measured on go1.26.2.</p>
      </>
    ),
  },
];

export default function SlicesChapter() {
  const states = useMemo(story, []);
  const [st, setSt] = useState<SliceState>(sliceInit);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [which, setWhich] = useState(1);
  const [n, setN] = useState(100);

  const run = (k: Parameters<typeof sliceAct>[1]) => {
    const r = sliceAct(st, k, n);
    setN((x) => x + 1);
    setSt(r.st);
    setTrace((t) => pushTrace(t, ...r.trace.map((x) => mkTrace(x.kind, x.text))));
  };

  return (
    <>
      <Scrolly steps={STEPS} block="SRAM row + header register" pkg="runtime/slice.go">
        {(i) => (i < states.length ? <SliceStage st={states[i]} /> : <GrowthLadder which={1} />)}
      </Scrolly>

      <Sandbox
        slug="slices"
        intro={
          <p>Every pad below is a line of Go, run against the same memory model. Try this: slice <code>t</code>, append to it twice, and watch <code>s[3]</code> and <code>s[4]</code>. Then reset and do it again with the three-index form.</p>
        }
        controls={
          <>
            <Pad code onClick={() => run("alias")}>t := s[1:3]</Pad>
            <Pad code onClick={() => run("alias3")}>t := s[1:3:3]</Pad>
            <Pad code onClick={() => run("append-t")} disabled={!st.t}>t = append(t, {n})</Pad>
            <Pad code onClick={() => run("append-s")}>s = append(s, {n})</Pad>
            <Pad code onClick={() => run("copy")} disabled={!st.t}>copy(t, s)</Pad>
            <Pad tone="quiet" onClick={() => { setSt(sliceInit()); setN(100); setTrace((t) => pushTrace(t, mkTrace("info", "reset: s := make([]int, 5, 6)"))); }}>Reset</Pad>
          </>
        }
        stage={<SliceStage st={st} />}
        readout={<Readout id={st.code + st.msg.length}><p><Rich text={st.msg} /></p></Readout>}
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="runtime/slice.go · growslice · nextslicecap"
      />

      <section className="mx-auto max-w-[1680px] px-4 pt-16 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
          <div>
            <h3 className="display text-[1.5rem] text-ink">Predict the next capacity</h3>
            <p className="mt-3 max-w-[34rem] text-ink-2">
              Pick an element type and read the chain down. Each row is the rule applied to the row above. The
              result is compared with the capacity actually measured, one append at a time.
            </p>
            <div className="mt-5 flex flex-wrap gap-2" role="tablist">
              {MEASURED.map((m, i) => (
                <Pad key={m.label} code pressed={which === i} onClick={() => setWhich(i)}>{m.label}</Pad>
              ))}
            </div>
            <div className="mt-5"><Fidelity kind="measured" /></div>
          </div>
          <div className="h-[460px] rounded-[4px] border border-line-2 bg-substrate-2 p-4 md:p-5">
            <GrowthLadder which={which} />
          </div>
        </div>
      </section>

      <ChapterClose
        slug="slices"
        notes={
          <>
            <p>The growth sequences were measured on go1.26.2 with a slice that does not escape. Such a slice starts in a <strong>32-byte stack buffer</strong>: 32 elements of <code>[]byte</code>, 4 of <code>[]int</code>, 1 of a 32-byte struct. Make the slice escape and <code>[]int</code> starts at 1 instead.</p>
            <p>The memory stage stops drawing at 12 cells. The ladder above uses the real rule with no cap.</p>
          </>
        }
      />
    </>
  );
}
