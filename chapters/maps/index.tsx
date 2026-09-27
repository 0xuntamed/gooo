"use client";

import { useMemo, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { CodePane } from "@/components/code-pane";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { mapAct, mapInit, type MapState } from "@/lib/engines/maps";
import { MapStage, type MapView } from "./stage";

function story() {
  const s0 = mapInit();
  const s1 = mapAct(s0, "insert", "alice").st;
  const s2 = mapAct(s1, "fill", 5).st;
  const s3 = mapAct(s2, "fill", 5).st;
  const s4 = mapAct(s3, "insert", "sybil").st;
  const s5 = mapAct(s4, "lookup", "sybil").st;
  const s7 = mapAct(s5, "delete", "carol").st;
  const s8 = mapAct(s7, "delete", "bob").st;
  const s9 = mapAct({ ...s8, pool: s8.pool.filter((k) => k !== "sybil") }, "fill", 4).st;
  const frames: { st: MapState; view: MapView }[] = [
    { st: { ...s0, probe: s1.probe }, view: { hash: true } },
    { st: s1, view: { hash: true, path: true } },
    { st: s2, view: {} },
    { st: s3, view: {} },
    { st: s4, view: { hash: true, path: true } },
    { st: s5, view: { match: 0 } },
    { st: s5, view: { path: true, match: 1 } },
    { st: s7, view: {} },
    { st: s8, view: {} },
    { st: s9, view: {} },
  ];
  return frames;
}

const STEPS: Step[] = [
  {
    id: "split", title: "One hash, two halves",
    body: (
      <>
        <p>Since Go 1.24, a map is a <strong>Swiss table</strong>. Slots come in groups of eight, and every group carries a <em>control word</em>: one byte per slot.</p>
        <p>A key&apos;s hash is split in two. <strong>h1</strong>, the high bits, chooses a group. <strong>h2</strong>, the low 7 bits, is what gets stored in the control byte. For <code>&quot;alice&quot;</code>, h1 picks group 1 and h2 is <code>0x67</code>.</p>
      </>
    ),
  },
  {
    id: "insert", title: "Insert: a byte and a slot",
    body: (
      <>
        <p>The first free slot in group 1 is slot 0. Its control byte becomes <code>0x67</code> and the key and value go in the slot beside it.</p>
        <p>An empty control byte is <code>0x80</code>: the high bit set. A real h2 never has its high bit set, so no hash can ever be mistaken for &ldquo;empty&rdquo;.</p>
      </>
    ),
  },
  {
    id: "scatter", title: "Keys scatter",
    body: (
      <>
        <p>Five more inserts. Four hash to group 1 and one to group 0. The pattern has nothing to do with insertion order, which is exactly what a hash table is for.</p>
      </>
    ),
  },
  {
    id: "full", title: "A full group",
    body: (
      <>
        <p>Five more, and group 1 now holds eight keys. It is full, even though the table as a whole is only 11/16 used.</p>
        <p>Before you scroll: <code>&quot;sybil&quot;</code> also hashes to group 1. Where will it go?</p>
      </>
    ),
  },
  {
    id: "probe", title: "Full group, probe on",
    body: (
      <>
        <p>Group 1 has no free slot, so the insert follows the <strong>probe sequence</strong> to the next group. The sequence is quadratic: offsets 1, 3, 6… from the start, wrapping at the table size. <code>&quot;sybil&quot;</code> lands in group 0, slot 3.</p>
        <p>Note its h2: <code>0x54</code>. That is the same as <code>&quot;bob&quot;</code>&apos;s, and bob is sitting in group 1.</p>
      </>
    ),
  },
  {
    id: "match", title: "matchH2: eight compares at once",
    body: (
      <>
        <p>Now look <code>&quot;sybil&quot;</code> up. The eight control bytes of group 1 are read as one <code>uint64</code>. XOR with h2 copied into every byte turns a matching byte into <code>00</code>. Then <code>(v − 0x01…01) &amp;^ v &amp; 0x80…80</code> lights the high bit of exactly those zero bytes.</p>
        <p>The result is a bitmask of candidate slots, computed with no loop and no branch. On amd64 the compiler goes further and swaps this for SSE2 instructions that do the same comparison.</p>
      </>
    ),
  },
  {
    id: "false", title: "A false match, and a probe",
    body: (
      <>
        <p>The candidate in group 1 is <code>&quot;bob&quot;</code>, whose 7 bits happen to match. The full key compare says no. Seven bits cannot tell 128 keys apart, which is why h2 only <em>filters</em> and never decides.</p>
        <p>Group 1 has no empty slot, so sybil could have been pushed further along, and the probe moves on. Group 0 matches at slot 3, the key compares equal, and the value is found.</p>
      </>
    ),
  },
  {
    id: "del-empty", title: "Delete: back to empty",
    body: (
      <>
        <p><code>delete(m, &quot;carol&quot;)</code>. Group 0 still has empty slots, and a lookup always stops at the first group that has one. So no key can ever have probed <em>past</em> group 0 while it had room, and carol&apos;s slot goes straight back to <code>0x80</code>.</p>
      </>
    ),
  },
  {
    id: "del-tomb", title: "Delete: a tombstone",
    body: (
      <>
        <p><code>delete(m, &quot;bob&quot;)</code>. This time the group is full. If bob&apos;s slot went back to empty, the next lookup of <code>&quot;sybil&quot;</code> would stop at group 1, see an empty slot, and report <em>not found</em>, even though sybil is sitting in group 0.</p>
        <p>So the slot becomes a <strong>tombstone</strong>, <code>0xFE</code>: not a key, but not a reason to stop probing either. Tombstones count toward the load, and are cleared on the next grow.</p>
      </>
    ),
  },
  {
    id: "grow", title: "Grow at seven eighths",
    body: (
      <>
        <p>A group holds 8, but the table only fills to an average of 7 per group. Keys plus tombstones reach 14 of 16, and the next insert doubles the table to 4 groups and <strong>rehashes every key</strong>. One more bit of h1 now chooses the group, so most keys move, and the tombstone is left behind.</p>
        <p>This is the work <code>make(map[K]V, n)</code> saves you when you know <code>n</code> in advance.</p>
      </>
    ),
  },
];

const PROBE_SRC = `// internal/runtime/maps/group.go (portable version)
// On amd64 the compiler replaces this with SIMD.

func ctrlGroupMatchH2(g ctrlGroup, h uintptr) bitset {
	v := uint64(g) ^ (bitsetLSB * uint64(h))
	return bitset(((v - bitsetLSB) &^ v) & bitsetMSB)
}

const (
	ctrlEmpty   ctrl = 0b10000000 // 0x80
	ctrlDeleted ctrl = 0b11111110 // 0xFE
)`;

export default function MapsChapter() {
  const frames = useMemo(story, []);
  const [st, setSt] = useState<MapState>(mapInit);
  const [trace, setTrace] = useState<TraceLine[]>([]);

  const run = (k: Parameters<typeof mapAct>[1]) => {
    const r = mapAct(st, k);
    setSt(r.st);
    setTrace((t) => pushTrace(t, ...r.trace.map((x) => mkTrace(x.kind, x.text))));
  };

  return (
    <>
      <Scrolly steps={STEPS} block="control-word SRAM banks" pkg="internal/runtime/maps">
        {(i) => <MapStage st={frames[i].st} view={frames[i].view} />}
      </Scrolly>

      <Sandbox
        slug="maps"
        intro={
          <p>Insert until a group fills and watch the probe spill into the next one. Then delete from a full group and from one with room, and compare what each delete leaves behind.</p>
        }
        controls={
          <>
            <Pad onClick={() => run("insert")} disabled={!st.pool.length}>Insert a key</Pad>
            <Pad onClick={() => run("insert5")} disabled={!st.pool.length}>Insert 5</Pad>
            <Pad onClick={() => run("lookup")} disabled={!st.used}>Look one up</Pad>
            <Pad onClick={() => run("delete")} disabled={!st.used}>Delete one</Pad>
            <Pad tone="quiet" onClick={() => { setSt(mapInit()); setTrace((t) => pushTrace(t, mkTrace("info", "map reset"))); }}>Reset</Pad>
          </>
        }
        stage={<MapStage st={st} view={{ hash: true, match: true, path: true }} />}
        readout={<Readout id={st.code + st.used + st.tomb}><p><Rich text={st.msg} /></p></Readout>}
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="internal/runtime/maps · Go 1.24+"
      />

      <section className="mx-auto max-w-[1680px] px-4 pt-16 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
          <div className="prose text-ink-2">
            <h3 className="display text-[1.5rem] text-ink">The whole probe, in the source</h3>
            <p className="mt-3">Three lines do the work. The comment in the runtime also admits a quirk: when h2 is a power of two, the borrow in the subtraction can flag the <em>next</em> byte as a false candidate. That is harmless, because every candidate is confirmed by a full key compare.</p>
          </div>
          <CodePane code={PROBE_SRC} caption="internal/runtime/maps/group.go" />
        </div>
      </section>

      <ChapterClose
        slug="maps"
        notes={
          <>
            <p><Fidelity kind="illustrative">hash values are illustrative</Fidelity></p>
            <p>The hashes here are FNV-1a so every visit gives the same picture. The runtime hashes with a random per-map seed (aeshash where the CPU supports it), so real h1 and h2 differ on every run, and so does iteration order. That is by design.</p>
            <p>Maps with 8 or fewer entries skip the table entirely: they are a single group, searched with <code>matchH2</code> and no h1. This chapter starts at the first real table, 2 groups and 16 slots. Very large tables split into several tables behind a directory, each capped at 1,024 slots.</p>
          </>
        }
      />
    </>
  );
}
