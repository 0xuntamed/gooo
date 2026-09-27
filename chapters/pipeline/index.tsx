"use client";

import { useEffect, useRef, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { PHASES, type PhaseId, SOURCE_BYTES } from "@/lib/engines/pipeline";
import { PipelineStage } from "./stage";

const STEPS: Step[] = [
  {
    id: "source", title: "Text, nothing more",
    body: (
      <>
        <p>This is everything the compiler is handed: {SOURCE_BYTES} bytes of UTF-8. Follow one function, <code>sum</code>, through every phase of <code>go build</code>, exactly as go1.26.2 compiles it.</p>
        <p>Keep an eye on individual pieces. The <code>:=</code> on line 4, for instance, will become a tree node, then an SSA value, then half of one instruction.</p>
      </>
    ),
  },
  {
    id: "scan", title: "Scan: bytes to tokens",
    body: (
      <>
        <p>The scanner cuts the text into <strong>37 tokens</strong>. Six of them are not in the source at all. When a line ends after an identifier, a literal, <code>)</code>, <code>]</code>, <code>{"}"}</code> or <code>return</code>, the scanner <strong>inserts a semicolon</strong>.</p>
        <p>That rule is why the opening brace must go on the same line. Put it on the next line and the scanner ends your statement before the brace arrives.</p>
      </>
    ),
  },
  {
    id: "parse", title: "Parse: tokens to a tree",
    body: (
      <>
        <p>A recursive-descent parser turns the tokens into a syntax tree, one per file, with files parsed in parallel. Punctuation is consumed into structure and disappears. The tokens that carry meaning become nodes.</p>
        <p>Nothing is resolved yet. The tree knows <code>xs</code> is an identifier, but not what it refers to. Go&apos;s grammar needs no symbol table to parse, which is why <code>gofmt</code> works on code that does not compile.</p>
      </>
    ),
  },
  {
    id: "types", title: "Type-check: meaning attaches",
    body: (
      <>
        <p><code>types2</code> binds every identifier to an object and gives every expression a type. The literal <code>0</code> is an <em>untyped</em> constant until it lands in <code>total</code>, and only then becomes an <code>int</code>.</p>
        <p>This is the same checker <code>gopls</code> and <code>go vet</code> run, which is why your editor and the compiler agree on errors down to the column.</p>
      </>
    ),
  },
  {
    id: "middle", title: "Middle-end: whole-package decisions",
    body: (
      <>
        <p>Three analyses run over the package&apos;s IR. <strong>Inlining</strong> scores each function against a budget of 80: <code>sum</code> costs 16, so every call to it can be replaced by its body. <strong>Escape analysis</strong> proves <code>xs</code> never outlives the call (block 06). <strong>Devirtualization</strong> turns provable interface calls into direct ones (block 07).</p>
      </>
    ),
  },
  {
    id: "ssa", title: "SSA: every value assigned once",
    body: (
      <>
        <p>The tree is flattened into basic blocks of simple instructions, where every value is assigned <strong>exactly once</strong>. Watch the nodes land: the <code>:=</code> became <code>v7</code>, the range became the <code>Less64</code> test, and <code>+=</code> became <code>Add64</code>.</p>
        <p>Where control flow joins, at the loop header, a <code>Phi</code> picks a value depending on which edge you arrived by. <code>v9</code> is the index, and <code>v28</code> is the running total.</p>
      </>
    ),
  },
  {
    id: "opt", title: "Optimize to a fixed point",
    body: (
      <>
        <p>About fifty passes rewrite the SSA until nothing changes. Most rules are generated from <code>.rules</code> files. The copy <code>v10</code> is gone, the unused stack addresses are gone, and block <code>b3</code> has been folded away.</p>
        <p>The biggest win is invisible: the <strong>prove</strong> pass established <code>0 ≤ i &lt; len(xs)</code> from the loop condition, so no bounds check was ever emitted. There is no <code>IsInBounds</code> and no <code>PanicBounds</code>.</p>
      </>
    ),
  },
  {
    id: "gen", title: "Codegen: values fold into instructions",
    body: (
      <>
        <p>Ops are lowered to amd64, values are assigned to registers, and instruction selection looks for patterns. Six values (the slice pointer, the constant 8, the multiply, the pointer add, the load and the add) fold into <strong>one instruction</strong>: <code>ADDQ (AX)(CX*8), DX</code>. The x86 scaled-index addressing mode does the arithmetic for free.</p>
        <p><code>AX</code> holds the data pointer, <code>BX</code> the length, <code>CX</code> the index and <code>DX</code> the total.</p>
      </>
    ),
  },
  {
    id: "bytes", title: "Twenty-seven bytes",
    body: (
      <>
        <p>That is the whole function: <strong>9 instructions in 27 bytes</strong>. It has no stack frame (<code>NOFRAME</code>), so it never needs the stack-growth check that block 09 is about.</p>
        <p>Build with <code>-gcflags=&apos;-N -l&apos;</code> to switch optimisation and inlining off, and the same function is 136 bytes and 33 instructions.</p>
      </>
    ),
  },
];

const EXPLAIN: Record<PhaseId, string> = {
  source: `${SOURCE_BYTES} bytes of text. Nothing has been understood yet.`,
  scan: "**37 tokens**, 6 of them semicolons the scanner inserted at line ends.",
  parse: "Tokens that carry meaning become **tree nodes**; punctuation is consumed into structure.",
  types: "`types2` binds identifiers and gives every expression a type. `0` goes from untyped to `int`.",
  middle: "`can inline sum with cost 16` (the budget is 80). `xs does not escape`.",
  ssa: "**29 values in 5 blocks**, each assigned once. `Phi` nodes merge the loop's two paths.",
  opt: "**16 values in 4 blocks** after about fifty passes. ++No bounds check survived.++",
  gen: "16 values → **9 instructions**. Six of them fold into a single `ADDQ` with scaled-index addressing.",
  bytes: "**27 bytes** of machine code. With `-N -l` it is 136 bytes and 33 instructions.",
};

export default function PipelineChapter() {
  const [phase, setPhase] = useState<PhaseId>("source");
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [playing, setPlaying] = useState(false);
  const cur = useRef<PhaseId>("source");

  const go = (p: PhaseId) => {
    cur.current = p;
    setPhase(p);
    const ph = PHASES.find((x) => x.id === p)!;
    setTrace((t) => pushTrace(t, mkTrace(p === "opt" || p === "gen" ? "note" : "info", `compile: ${ph.name.toLowerCase()} · ${ph.pkg}`)));
  };

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const i = PHASES.findIndex((x) => x.id === cur.current);
      if (i >= PHASES.length - 1) { setPlaying(false); return; }
      go(PHASES[i + 1].id);
    }, 1900);
    return () => window.clearInterval(id);
  }, [playing]);

  return (
    <>
      <Scrolly steps={STEPS} block="seven-stage pipeline" pkg="cmd/compile">
        {(i) => <PipelineStage phase={PHASES[i].id} />}
      </Scrolly>

      <Sandbox
        slug="pipeline"
        intro={<p>Jump between phases in any order and watch the same pieces of the program move between representations. Or run the whole pipeline end to end.</p>}
        controls={
          <>
            <Pad tone="primary" onClick={() => { go("source"); setPlaying(true); }}>Run the pipeline</Pad>
            {PHASES.map((p) => (
              <Pad key={p.id} pressed={phase === p.id} onClick={() => { setPlaying(false); go(p.id); }}>{p.name}</Pad>
            ))}
          </>
        }
        stage={<PipelineStage phase={phase} />}
        readout={<Readout id={phase}><p><Rich text={EXPLAIN[phase]} /></p></Readout>}
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="go build -gcflags='-m -S' · GOSSAFUNC=sum"
      />

      <ChapterClose
        slug="pipeline"
        notes={
          <>
            <p><Fidelity kind="measured" /></p>
            <p>Every listing is captured output: tokens from <code>go/scanner</code>, the <code>-m</code> lines, the SSA from <code>GOSSAFUNC=sum</code> (the <em>start</em> pass is shown as an excerpt of its first three blocks), and the final <code>-S</code> assembly. The tree is condensed from <code>ast.Fprint</code>. Which tree node became which SSA value, and which values each instruction absorbed, are drawn from reading those listings side by side.</p>
            <p>To see every pass yourself: <code>GOSSAFUNC=sum go build</code> writes <code>ssa.html</code>, with each of the ~50 passes in its own column.</p>
          </>
        }
      />
    </>
  );
}
