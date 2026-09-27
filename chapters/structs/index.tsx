"use client";

import { useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { CodePane } from "@/components/code-pane";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { type Field, layout, RECORD, sorted, src, TYPES } from "@/lib/engines/structs";
import { StructStage } from "./stage";

const FRAMES: { fields: Field[]; k?: number; final?: boolean; focus?: string | null; scale?: Field[][] }[] = [
  { fields: RECORD, k: 0, final: false, focus: null },
  { fields: RECORD, k: 1, final: false, focus: "a" },
  { fields: RECORD, k: 2, final: false, focus: "b" },
  { fields: RECORD, k: 3, final: false, focus: "c" },
  { fields: RECORD, k: 4, final: false, focus: "d" },
  { fields: RECORD, k: 4, final: true, focus: null },
  { fields: sorted(RECORD), final: true, focus: null },
  { fields: RECORD, scale: [RECORD, sorted(RECORD)] },
];

const STEPS: Step[] = [
  {
    id: "src", title: "Four fields, as written",
    body: (
      <>
        <p>Every type has an <strong>alignment</strong>, and a field&apos;s offset must be a multiple of it. A <code>bool</code> can go anywhere. An <code>int32</code> needs a multiple of 4, and an <code>int64</code> a multiple of 8.</p>
        <p>The compiler lays fields out <em>in the order you wrote them</em>. Go guarantees that order, so any padding it adds is padding you chose.</p>
      </>
    ),
  },
  {
    id: "a", title: "a at offset 0",
    body: <p><code>a bool</code> takes one byte at offset 0. The cursor moves to offset 1.</p>,
  },
  {
    id: "b", title: "b needs a multiple of 8",
    body: (
      <>
        <p>The next free byte is 1, but <code>b int64</code> must start at a multiple of 8. The compiler rounds the offset up to 8, and the <strong>seven bytes</strong> in between become padding that nothing will ever read.</p>
      </>
    ),
  },
  {
    id: "c", title: "c at 16",
    body: <p><code>c bool</code> fits wherever it lands: offset 16. The cursor moves to 17.</p>,
  },
  {
    id: "d", title: "d needs a multiple of 4",
    body: <p><code>d int32</code> must start at a multiple of 4. The next one after 17 is 20, so three more bytes of padding, and <code>d</code> fills 20 to 23.</p>,
  },
  {
    id: "round", title: "Round the whole thing up",
    body: (
      <>
        <p>The struct&apos;s alignment is its largest field&apos;s: 8. Its size must be a multiple of that, so that in an array every element&apos;s <code>b</code> lands on an 8-byte boundary too. 24 already is.</p>
        <p><code>unsafe.Sizeof(Record{})</code> is <strong>24</strong>: 14 bytes of data and 10 of padding. Those are the real values from go1.26.2.</p>
      </>
    ),
  },
  {
    id: "sort", title: "Largest alignment first",
    body: (
      <>
        <p>Same four fields, same types, declared in a different order: <code>b</code>, then <code>d</code>, then the two bools. Now every field starts where the previous one ended. Only 2 bytes of tail padding remain, to keep the size a multiple of 8.</p>
        <p><code>Sizeof</code> is <strong>16</strong>. A third of the struct came back, and the behaviour did not change at all.</p>
      </>
    ),
  },
  {
    id: "scale", title: "When it matters",
    body: (
      <>
        <p>For one struct, never. For a slice of a million, 24 bytes against 16 is <strong>8 MB</strong> of memory, and a third more cache lines to pull through the CPU on every pass.</p>
        <p>Sixteen divides a 64-byte cache line exactly, so no element straddles two lines. At 24 bytes, every third element does.</p>
      </>
    ),
  },
];

let nextName = 0;
const NAMES = "efghijklmnopqrstuvwxyz".split("");

export default function StructsChapter() {
  const [fields, setFields] = useState<Field[]>(RECORD);
  const [msg, setMsg] = useState("The struct as written: **24 bytes**, 10 of them padding. Add fields, move them, or sort them, and watch the layout recompute.");
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [focus, setFocus] = useState<string | null>(null);

  const apply = (next: Field[], why: string, f?: string) => {
    const L = layout(next);
    const pad = L.pads.reduce((a, p) => a + p.n, 0);
    setFields(next);
    setFocus(f ?? null);
    setMsg(`${why} Now \`Sizeof\` is **${L.size}**, \`Alignof\` is ${L.align}: ${L.payload} bytes of data and ${pad ? `!!${pad} of padding!!` : "++no padding++"}.`);
    setTrace((t) => pushTrace(t, mkTrace(pad ? "warn" : "info", `unsafe.Sizeof = ${L.size}, offsets ${L.placed.map((p) => `${p.n}=${p.off}`).join(" ")}, padding ${pad}`)));
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    apply(next, `Moved \`${fields[i].n}\` ${d < 0 ? "up" : "down"}.`, fields[i].n);
  };

  return (
    <>
      <Scrolly steps={STEPS} block="byte rows + filler cells" pkg="cmd/compile/internal/types">
        {(i) => <StructStage {...FRAMES[i]} />}
      </Scrolly>

      <Sandbox
        slug="structs"
        intro={<p>Build your own struct. The layout rule is the compiler&apos;s own, applied as you edit: align each field, place it, then round the whole thing up. Sort to see the minimum.</p>}
        controls={
          <>
            {TYPES.map((t) => (
              <Pad
                key={t.t}
                code
                disabled={fields.length >= 9}
                onClick={() => {
                  const used = new Set(fields.map((x) => x.n));
                  let n = NAMES[nextName++ % NAMES.length];
                  for (let g = 0; used.has(n) && g < NAMES.length; g++) n = NAMES[nextName++ % NAMES.length];
                  apply([...fields, { n, ...t }], `Added \`${n} ${t.t}\` (${t.size} B, align ${t.align}).`, n);
                }}
              >
                + {t.t}
              </Pad>
            ))}
            <Pad tone="primary" onClick={() => apply(sorted(fields), "Sorted by alignment, then size, largest first.")}>Sort fields</Pad>
            <Pad tone="quiet" onClick={() => { nextName = 0; apply(RECORD, "Back to the original four fields."); }}>Reset</Pad>
          </>
        }
        stage={<StructStage fields={fields} focus={focus} />}
        readout={
          <>
            <Readout id={msg}><p><Rich text={msg} /></p></Readout>
            <ul className="mt-4 space-y-1">
              {fields.map((f, i) => (
                <li key={f.n} className="flex items-center gap-2 font-mono text-[12px] mono-tight">
                  <span className="w-24 truncate text-ink">{f.n} <span className="text-teal">{f.t}</span></span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-[2px] border border-line-2 px-1.5 text-ink-3 hover:text-ink disabled:opacity-30" aria-label={`Move ${f.n} up`}>up</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="rounded-[2px] border border-line-2 px-1.5 text-ink-3 hover:text-ink disabled:opacity-30" aria-label={`Move ${f.n} down`}>down</button>
                  <button type="button" onClick={() => fields.length > 1 && apply(fields.filter((x) => x.n !== f.n), `Removed \`${f.n}\`.`)} className="rounded-[2px] border border-line-2 px-1.5 text-ink-3 hover:text-rose" aria-label={`Remove ${f.n}`}>remove</button>
                </li>
              ))}
            </ul>
          </>
        }
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="unsafe.Sizeof · Offsetof · Alignof"
      />

      <section className="mx-auto max-w-[1680px] px-4 pt-16 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
          <div className="prose text-ink-2">
            <h3 className="display text-[1.5rem] text-ink">Your struct, as source</h3>
            <p className="mt-3"><code>go vet</code> does not check this. The <code>fieldalignment</code> analyzer in <code>golang.org/x/tools</code> does, and can rewrite the order for you. Check whether a type is hot before you reorder it for bytes.</p>
            <p className="mt-3"><Fidelity kind="measured">Record&apos;s 24 / 16 bytes and offsets: measured on go1.26.2</Fidelity></p>
          </div>
          <CodePane code={src("Record", fields)} caption="the struct you built" />
        </div>
      </section>

      <ChapterClose
        slug="structs"
        notes={
          <p>The rule shown is gc&apos;s on amd64. One special case is not drawn: if the <em>last</em> field has size zero (<code>struct{}</code> or <code>[0]T</code>), the compiler adds a byte of padding after it, so that a pointer to it cannot point past the end of the object.</p>
        }
      />
    </>
  );
}
