"use client";

import { useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { CodePane } from "@/components/code-pane";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { IfaceStage, type IfMode } from "./stage";

const CODE: Record<IfMode, { code: string; lang: "go" | "asm"; lit?: number[]; kind: "measured" | "illustrative"; cap: string }> = {
  empty: {
    lang: "go", kind: "measured", cap: "runtime/runtime2.go",
    code: "type iface struct { // an interface with methods\n\ttab  *itab\n\tdata unsafe.Pointer\n}\n\ntype eface struct { // any, interface{}\n\t_type *_type\n\tdata  unsafe.Pointer\n}",
  },
  assign: {
    lang: "asm", kind: "illustrative", cap: "var s Shape = Rect{3, 4}", lit: [3, 4],
    code: "// both types known here: the itab is a static symbol\n\n  LEAQ  go:itab.main.Rect,main.Shape(SB), AX  ; s.tab\n  LEAQ  <address of the Rect>, BX            ; s.data",
  },
  call: {
    lang: "asm", kind: "illustrative", cap: "s.Area()", lit: [1, 3],
    code: "  MOVQ  24(AX), CX   ; CX = s.tab.fun[0], at offset 24\n  MOVQ  BX, AX       ; receiver = s.data\n  CALL  CX           ; indirect call",
  },
  assert: {
    lang: "asm", kind: "illustrative", cap: "r, ok := s.(Rect)", lit: [2],
    code: "  LEAQ  go:itab.main.Rect,main.Shape(SB), CX\n  CMPQ  AX, CX       ; s.tab == &itab(Rect, Shape) ?\n  JNE   not_rect",
  },
  "assert-iface": {
    lang: "go", kind: "illustrative", cap: "st, ok := s.(fmt.Stringer)",
    code: "// no static answer here: the runtime must check\n// whether Rect has a String method, via getitab,\n// which looks (Stringer, Rect) up in the global\n// itabTable and builds + caches a new itab on a miss.",
  },
  devirt: {
    lang: "go", kind: "measured", cap: "go build -gcflags=-m (captured)",
    code: "./sample.go:26:41: devirtualizing s.Area to Rect\n./sample.go:26:41: inlining call to Rect.Area",
  },
};

const FRAMES: IfMode[] = ["empty", "assign", "assign", "call", "assert", "assert-iface", "devirt"];

const STEPS: Step[] = [
  {
    id: "two", title: "Two words, always",
    body: (
      <>
        <p>An interface value is exactly two pointers wide, 16 bytes, whatever it holds. The empty interface <code>any</code> is an <code>eface</code>: a type pointer and a data pointer. An interface with methods is an <code>iface</code>: an <strong>itab</strong> pointer and a data pointer.</p>
        <p>A nil <code>Shape</code> is both words zero. That is also why an interface holding a nil <code>*T</code> is not <code>== nil</code>: its tab word is set.</p>
      </>
    ),
  },
  {
    id: "assign", title: "Assign: bind a method table",
    body: (
      <>
        <p><code>var s Shape = Rect{"{"}3, 4{"}"}</code>. The <strong>itab</strong> is the join of one interface type and one concrete type: which interface, which type, a hash of the type, and the method addresses in interface order.</p>
        <p>Both types are known right here, so the compiler emits the itab as a static symbol. Nothing is looked up at run time.</p>
      </>
    ),
  },
  {
    id: "box", title: "The data word is a pointer",
    body: (
      <>
        <p>The data word must point at a value. <code>Rect</code> is 16 bytes, too big to fit in a word, so it lives somewhere else and <code>s.data</code> points at it.</p>
        <p>For a computed value that means an allocation, the <em>boxing</em> that makes <code>fmt.Println(x)</code> escape in block 06. For a constant like this one, the compiler can point at read-only data instead.</p>
      </>
    ),
  },
  {
    id: "call", title: "Calling through the itab",
    body: (
      <>
        <p><code>s.Area()</code> loads the method pointer out of the itab, <code>fun[0]</code> at offset 24, moves the data pointer into the receiver register, and makes an indirect <code>CALL</code>.</p>
        <p>Two loads and a call: no hashing, no search. The real cost against a direct call is that the compiler cannot inline through it, and the branch predictor has to guess the target.</p>
      </>
    ),
  },
  {
    id: "assert", title: "Asserting to a concrete type",
    body: (
      <>
        <p><code>s.(Rect)</code> asks: is the itab in <code>s</code> the one for <code>(Rect, Shape)</code>? That itab has a fixed address, so the whole assertion is <strong>one pointer comparison</strong>.</p>
      </>
    ),
  },
  {
    id: "assert-iface", title: "Asserting to another interface",
    body: (
      <>
        <p><code>s.(fmt.Stringer)</code> has no fixed answer. The runtime must find out whether <code>Rect</code> implements <code>Stringer</code>. <code>getitab</code> looks the pair up in a global hash table of itabs, and on a miss it checks the method sets and builds a new itab, which it keeps for next time.</p>
      </>
    ),
  },
  {
    id: "devirt", title: "Devirtualized, then inlined",
    body: (
      <>
        <p>In <code>main</code>, <code>s</code> is assigned once from a known type, and the compiler proves it. The middle-end reports <code>devirtualizing s.Area to Rect</code>: the dynamic call becomes a direct call to <code>Rect.Area</code>.</p>
        <p>A direct call can be inlined, and then it is: <code>inlining call to Rect.Area</code>. The whole call becomes one <code>MULSD</code>. The itab is still emitted, and never read.</p>
      </>
    ),
  },
];

const OPS: { mode: IfMode; label: string; msg: string; tr: string }[] = [
  { mode: "assign", label: "Assign Rect to Shape", msg: "The **tab** word now points at the static itab for `(Rect, Shape)`, and the **data** word points at the Rect.", tr: "iface: assign Rect → Shape, static itab bound" },
  { mode: "call", label: "Call s.Area()", msg: "Load `fun[0]` from the itab (offset 24), put `s.data` in the receiver register, `CALL` indirect. ++No lookup of any kind.++", tr: "iface: dynamic dispatch via itab.fun[0]" },
  { mode: "assert", label: "s.(Rect)", msg: "Asserting to a **concrete** type compares one pointer: is `s.tab` the `(Rect, Shape)` itab?", tr: "iface: type assert → itab pointer compare" },
  { mode: "assert-iface", label: "s.(fmt.Stringer)", msg: "Asserting to **another interface** needs the runtime: `getitab` checks a global hash table and builds an itab on a miss. !!Much slower than the concrete case.!!", tr: "iface: interface assertion → getitab" },
  { mode: "devirt", label: "Devirtualize", msg: "The concrete type is provable, so the call becomes direct, and then inlined into a single `MULSD`.", tr: "iface: devirtualized s.Area → Rect.Area, inlined" },
];

export default function InterfacesChapter() {
  const [mode, setMode] = useState<IfMode>("empty");
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const op = OPS.find((o) => o.mode === mode);
  const c = CODE[mode];

  return (
    <>
      <Scrolly steps={STEPS} block="two-word register + itab table" pkg="runtime/iface.go">
        {(i) => (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="min-h-0 flex-1"><IfaceStage mode={FRAMES[i]} /></div>
            <CodePane code={CODE[FRAMES[i]].code} lang={CODE[FRAMES[i]].lang} lit={CODE[FRAMES[i]].lit} caption={CODE[FRAMES[i]].cap} tag={<Fidelity kind={CODE[FRAMES[i]].kind === "measured" ? "measured" : "illustrative"}>{CODE[FRAMES[i]].kind === "measured" ? undefined : "instruction sketch"}</Fidelity>} size="sm" className="shrink-0" />
          </div>
        )}
      </Scrolly>

      <Sandbox
        slug="interfaces"
        intro={<p>Run each operation against the same interface value and watch which words and tables it touches. The concrete and interface assertions look alike in source and cost very different amounts.</p>}
        controls={
          <>
            {OPS.map((o) => (
              <Pad key={o.mode} code={o.mode.startsWith("assert")} pressed={mode === o.mode} onClick={() => { setMode(o.mode); setTrace((t) => pushTrace(t, mkTrace(o.mode === "assert-iface" ? "warn" : "info", o.tr))); }}>
                {o.label}
              </Pad>
            ))}
            <Pad tone="quiet" onClick={() => setMode("empty")}>Reset</Pad>
          </>
        }
        stage={<IfaceStage mode={mode} />}
        readout={
          <>
            <Readout id={mode}><p><Rich text={op?.msg ?? "A zero `Shape`: both words are nil. Pick an operation."} /></p></Readout>
            <div className="mt-4"><CodePane code={c.code} lang={c.lang} lit={c.lit} caption={c.cap} size="sm" numbers={false} /></div>
          </>
        }
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="go build -gcflags=-m · go tool compile -S"
      />

      <ChapterClose
        slug="interfaces"
        notes={
          <p>The itab field offsets follow the runtime&apos;s layout on 64-bit platforms: <code>inter</code>, <code>_type</code>, a 4-byte hash padded to 8, then the <code>fun</code> array at offset 24. The <code>-m</code> lines are captured. The instruction sequences are sketches of the shape <code>-S</code> produces, not captured listings.</p>
        }
      />
    </>
  );
}
