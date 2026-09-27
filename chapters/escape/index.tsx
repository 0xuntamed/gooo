"use client";

import { useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { CodePane } from "@/components/code-pane";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { EXAMPLES, type Example } from "@/lib/engines/escape";
import { EscapeStage } from "./stage";

const FRAMES: { ex: Example["id"]; reveal: 0 | 1 | 2; popped?: boolean }[] = [
  { ex: "heap", reveal: 0 },
  { ex: "stack", reveal: 1 },
  { ex: "stack", reveal: 2 },
  { ex: "heap", reveal: 1 },
  { ex: "heap", reveal: 2 },
  { ex: "iface", reveal: 1 },
  { ex: "iface", reveal: 2 },
  { ex: "heap", reveal: 2, popped: true },
];

const STEPS: Step[] = [
  {
    id: "q", title: "One question",
    body: (
      <>
        <p>Go gives you no <code>new</code>/<code>delete</code> choice about where memory lives. The compiler decides, value by value, and it asks exactly one question: <em>can a pointer to this value outlive the function that made it?</em></p>
        <p>If not, the value lives in the goroutine&apos;s stack frame and is freed at return for nothing. If it can, it goes to the heap.</p>
      </>
    ),
  },
  {
    id: "graph", title: "Build the flow graph",
    body: (
      <>
        <p>Escape analysis builds a directed graph of every place a value or pointer flows: assignments, address-ofs, returns, call arguments. Each edge also records how many times the pointer was dereferenced on the way.</p>
        <p>In <code>sum</code>, <code>xs</code> is only ever read: its elements are copied out, and an <code>int</code> is returned by value.</p>
      </>
    ),
  },
  {
    id: "noesc", title: "No path out",
    body: (
      <>
        <p>The walk from <code>xs</code> reaches the result only through a dereference, so what arrives is a copy of an element, never the slice&apos;s address. The compiler reports <code>xs does not escape</code>.</p>
        <p>The payoff is in the assembly: a zero-byte frame (<code>NOFRAME</code>) and no call to the allocator.</p>
      </>
    ),
  },
  {
    id: "addr", title: "Take its address",
    body: (
      <>
        <p><code>makeCounter</code> takes <code>&amp;n</code> and returns it. There are two edges: address-of at line 21, column 9, and return at 21:2.</p>
        <p>The result, <code>~r0</code>, is a location that <strong>outlives the frame</strong>: whoever called <code>makeCounter</code> will hold it after the frame is gone.</p>
      </>
    ),
  },
  {
    id: "esc", title: "A path is a proof",
    body: (
      <>
        <p>A path from <code>n</code>&apos;s address to an outliving location is all it takes. The compiler prints the path as its reasoning, <code>flow: ~r0 ← &amp;n</code>, and then its verdict: <code>moved to heap: n</code>.</p>
        <p><code>n := 0</code> now compiles to <code>CALL runtime.newobject</code>. The escape changed the code, not just where a variable lives.</p>
      </>
    ),
  },
  {
    id: "fmt", title: "Everything you print",
    body: (
      <>
        <p><code>fmt.Println(v)</code> takes <code>...any</code>. Converting the int to an interface needs a pointer to it (block 07), so the int is <strong>boxed</strong>, and the box goes into the variadic slice.</p>
        <p>That slice becomes the <code>a</code> parameter of <code>Fprintln</code>.</p>
      </>
    ),
  },
  {
    id: "call", title: "A call it cannot see into",
    body: (
      <>
        <p><code>Fprintln</code> is far too big to inline, so escape analysis cannot look inside it, and it must assume the callee keeps the pointer. The chain ends at a call parameter, and the box escapes.</p>
        <p>This is why the hot path of a server should not log with <code>fmt</code>. And a twist: for ints under 256, <code>convT64</code> points into a static table, so the escape costs no allocation at all.</p>
      </>
    ),
  },
  {
    id: "pop", title: "The frame pops",
    body: (
      <>
        <p>When <code>makeCounter</code> returns, its whole frame is released by moving the stack pointer: one instruction, whatever was in it.</p>
        <p>The heap copy of <code>n</code> stays, because someone still holds <code>&amp;n</code>. It lives until the garbage collector (block 13) finds nothing pointing at it. That deferred cost is what escape analysis exists to avoid.</p>
      </>
    ),
  },
];

export default function EscapeChapter() {
  const [ex, setEx] = useState<Example["id"]>("heap");
  const [reveal, setReveal] = useState<0 | 1 | 2>(0);
  const [popped, setPopped] = useState(false);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const e = EXAMPLES.find((x) => x.id === ex)!;

  const msg = popped
    ? e.escapes
      ? `The frame is gone. **${e.obj}** survives on the heap until the collector proves it unreachable.`
      : "The frame is gone, and so is everything in it, freed for the cost of one instruction."
    : reveal === 0
      ? `Nodes first: every location in \`${e.src.match(/func (\w+)/)?.[1]}\` that can hold a value or a pointer.`
      : reveal === 1
        ? `Edges: how values flow between those locations. ${e.escapes ? "One of them reaches a location that !!outlives the frame!!." : "None of them carries an address out."}`
        : e.verdict;

  const step = () => {
    const nx = ((reveal + 1) % 3) as 0 | 1 | 2;
    setReveal(nx);
    setPopped(false);
    if (nx === 2) setTrace((t) => pushTrace(t, ...e.out.map((l) => mkTrace(/moved|escapes to heap/.test(l) ? "warn" : "info", l))));
  };

  return (
    <>
      <Scrolly steps={STEPS} block="stack / heap router" pkg="cmd/compile/internal/escape">
        {(i) => <EscapeStage {...FRAMES[i]} />}
      </Scrolly>

      <Sandbox
        slug="escape"
        intro={<p>Pick a function and step the analysis through nodes, edges and verdict. Then return from the function and see what outlives it.</p>}
        controls={
          <>
            {EXAMPLES.map((x) => (
              <Pad key={x.id} pressed={ex === x.id} onClick={() => { setEx(x.id); setReveal(0); setPopped(false); }}>{x.tab}</Pad>
            ))}
            <Pad tone="primary" onClick={step}>{reveal === 2 ? "Start over" : "Step the analysis"}</Pad>
            <Pad onClick={() => { setReveal(2); setPopped(true); setTrace((t) => pushTrace(t, mkTrace("info", `return from ${e.src.match(/func (\w+)/)?.[1]}: frame released`))); }}>Return from the function</Pad>
          </>
        }
        stage={<EscapeStage ex={ex} reveal={reveal} popped={popped} />}
        readout={
          <>
            <Readout id={ex + reveal + popped}><p><Rich text={msg} /></p></Readout>
            <div className="mt-4"><CodePane code={e.code.text} lang={e.code.lang} caption={e.code.caption} size="sm" numbers={false} /></div>
          </>
        }
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="go build -gcflags='-m -m'"
      />

      <ChapterClose
        slug="escape"
        notes={
          <>
            <p><Fidelity kind="measured" /></p>
            <p>The compiler messages and the <code>makeCounter</code> assembly are captured output. The graph draws the flow those messages describe. The real analysis also tracks dereference counts on every edge, which is how it can tell &ldquo;a copy of the element&rdquo; from &ldquo;the address of the slice&rdquo;.</p>
            <p>Some values go to the heap whatever the graph says. Explicit variables larger than 10 MB, and implicit allocations (<code>new</code>, <code>&amp;T{"{}"}</code>, constant-size <code>make</code>) larger than 64 KB, always do. An allocation whose size is only known at run time gets at most a small stack buffer (block 01&apos;s 32 bytes) before falling back to the heap.</p>
          </>
        }
      />
    </>
  );
}
