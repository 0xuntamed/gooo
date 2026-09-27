"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { Dial, Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { chanAct, chanInit, type ChanState } from "@/lib/engines/chan";
import { ChanStage } from "./stage";

function story(): ChanState[] {
  const a = (s: ChanState, ...ks: ("send" | "recv" | "close")[]) => ks.reduce((x, k) => chanAct(x, k).st, s);
  const s0 = chanInit(4);
  const s1 = a(s0, "send");
  const s2 = a(s1, "send", "send", "send");
  const s3 = a(s2, "send");
  const s4 = a(s3, "recv");
  const u0 = a(chanInit(0), "recv");
  const u1 = a(u0, "send");
  const u2 = a(u1, "recv", "recv", "close");
  return [s0, s1, s2, s3, s4, u0, u1, u2];
}

const STEPS: Step[] = [
  {
    id: "hchan", title: "A struct behind a lock",
    body: (
      <>
        <p><code>make(chan int, 4)</code> allocates an <code>hchan</code>: a mutex, a ring buffer of 4 slots, a send index and a receive index, and two queues of parked goroutines. Send, receive and close are ordinary functions in <code>runtime/chan.go</code>. Only the syntax is special.</p>
      </>
    ),
  },
  {
    id: "send", title: "Send into the ring",
    body: (
      <>
        <p><code>ch &lt;- 1</code> takes the lock, sees space, copies the value into slot <code>sendx</code>, and moves <code>sendx</code> on. Nobody parks and the scheduler is never involved: a buffered send with room is a copy under a lock.</p>
      </>
    ),
  },
  {
    id: "full", title: "Round the ring",
    body: (
      <>
        <p>Three more sends fill the buffer, and <code>sendx</code> wraps back to 0. It is a ring, not a queue that shifts: receiving moves <code>recvx</code> round behind <code>sendx</code>, and no value is ever moved inside the buffer.</p>
      </>
    ),
  },
  {
    id: "block", title: "Full: the sender parks",
    body: (
      <>
        <p>The fifth send finds no room. The sending goroutine wraps itself in a <strong>sudog</strong>, a small record holding a pointer to the value, joins <code>sendq</code>, and calls <code>gopark</code>. It is off every run queue now (block 08) and costs no thread.</p>
      </>
    ),
  },
  {
    id: "refill", title: "Receive, then refill",
    body: (
      <>
        <p><code>&lt;-ch</code> takes 1 from <code>recvx</code>. A sender is parked, so the receive finishes its job for it: the sender&apos;s value 5 is copied into the slot just freed, and the sender is readied.</p>
        <p>The buffer stays full and in FIFO order. The parked sender never had to wake up and retry.</p>
      </>
    ),
  },
  {
    id: "rendezvous", title: "Unbuffered: a rendezvous",
    body: (
      <>
        <p><code>make(chan int)</code> has <code>dataqsiz = 0</code>. A receiver arrives first and parks on <code>recvq</code>. Its sudog holds <em>the address it wants the value written to</em>, a slot on its own stack.</p>
      </>
    ),
  },
  {
    id: "direct", title: "Direct handoff",
    body: (
      <>
        <p>A sender arrives, finds a receiver waiting, and copies the value <strong>straight into that goroutine&apos;s stack</strong>. The buffer, which does not exist here, is skipped entirely. Then it calls <code>goready</code>.</p>
        <p>This is one goroutine writing into another goroutine&apos;s stack, and one of very few places the runtime allows it. It is safe only because the receiver is parked and cannot move.</p>
      </>
    ),
  },
  {
    id: "close", title: "close wakes everyone",
    body: (
      <>
        <p>Two receivers park, then <code>close(ch)</code>. <code>closechan</code> sets the flag and wakes <strong>every</strong> parked goroutine. Receivers return the zero value with <code>ok == false</code>, which is what ends a <code>for range ch</code> loop.</p>
        <p>A parked sender would panic on waking. So would any later send. Close from the sending side, and only once.</p>
      </>
    ),
  },
  {
    id: "select", title: "select, precisely",
    body: (
      <>
        <p><code>selectgo</code> first <strong>shuffles</strong> the poll order, so no case is favoured. It then locks every channel in <strong>address order</strong>, so two selects can never deadlock each other.</p>
        <p>One pass looks for a case that is ready now. If none is, the goroutine enqueues a sudog on <em>every</em> channel at once and parks. Whichever channel fires first wakes it, and the other sudogs are removed.</p>
      </>
    ),
  },
];

const SEL = [
  { ch: "a", addr: "0xc000014060", poll: 2 },
  { ch: "b", addr: "0xc000014120", poll: 0 },
  { ch: "c", addr: "0xc0000141e0", poll: 1 },
];

function SelectStage() {
  const phases = ["shuffle poll order", "lock in address order", "pass 1: nothing ready", "pass 2: park on all three", "b fires: dequeue from a and c"];
  const [k, setK] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => setK((x) => (x + 1) % phases.length), 1700);
    return () => window.clearTimeout(id);
  }, [k, phases.length]);
  return (
    <div className="@container flex h-full flex-col gap-4">
      <pre className="rounded-[3px] border border-line bg-[#0e1024] p-3 font-mono text-[13px] leading-[1.7] text-ink mono-tight">{`select {\ncase v := <-a:\ncase v := <-b:\ncase c <- x:\n}`}</pre>
      <div className="grid grid-cols-3 gap-3">
        {SEL.map((s) => (
          <div key={s.ch} className={`flex flex-col gap-1.5 rounded-[3px] border p-3 transition-colors duration-500 ${k === 4 && s.ch === "b" ? "border-teal bg-teal/10" : "border-line-2"}`}>
            <span className="font-mono text-[13px] text-ink">chan {s.ch}</span>
            <span className="font-mono text-[11px] text-ink-3">{s.addr}</span>
            <motion.span animate={{ opacity: k >= 0 ? 1 : 0 }} className="font-mono text-[11px] text-copper">poll #{s.poll + 1}</motion.span>
            <motion.span animate={{ opacity: k >= 1 ? 1 : 0.15 }} className="font-mono text-[11px] text-teal">lock #{SEL.indexOf(s) + 1}</motion.span>
            <motion.span animate={{ opacity: k >= 3 && !(k === 4 && s.ch !== "b") ? 1 : k === 4 ? 0.15 : 0 }} className="hatch-violet mt-1 rounded-[2px] border border-violet/70 px-1.5 py-0.5 font-mono text-[11px] text-ink">
              G7 sudog {k === 4 && s.ch === "b" ? "→ woken" : ""}
            </motion.span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {phases.map((p, i) => (
          <button key={p} type="button" onClick={() => setK(i)} className={`rounded-[2px] border px-2 py-1 font-mono text-[11px] transition-colors ${i === k ? "border-copper bg-copper/15 text-ink" : i < k ? "border-teal/50 text-ink-2" : "border-line-2 text-ink-3 hover:text-ink"}`}>
            {i + 1}. {p}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChannelsChapter() {
  const frames = useMemo(story, []);
  const [cap, setCap] = useState(4);
  const [st, setSt] = useState<ChanState>(() => chanInit(4));
  const [trace, setTrace] = useState<TraceLine[]>([]);

  const run = (k: "send" | "recv" | "close") => {
    const r = chanAct(st, k);
    setSt(r.st);
    setTrace((t) => pushTrace(t, ...r.trace.map((x) => mkTrace(x.kind, x.text))));
  };

  return (
    <>
      <Scrolly steps={STEPS} block="FIFO ring + bypass path" pkg="runtime/chan.go">
        {(i) => (i < frames.length ? <ChanStage st={frames[i]} /> : <SelectStage />)}
      </Scrolly>

      <Sandbox
        slug="channels"
        intro={<p>Fill the ring and keep sending until a sender parks, then receive and watch the refill. Set the capacity to 0 and receive first to see a direct handoff. Close with receivers waiting, then try to send.</p>}
        controls={
          <>
            <Pad code onClick={() => run("send")}>ch &lt;- {st.next}</Pad>
            <Pad code onClick={() => run("recv")}>v, ok := &lt;-ch</Pad>
            <Pad code onClick={() => run("close")}>close(ch)</Pad>
            <Dial label="cap" value={cap} min={0} max={6} onChange={(n) => { setCap(n); setSt(chanInit(n)); setTrace((t) => pushTrace(t, mkTrace("note", n ? `ch = make(chan int, ${n})` : "ch = make(chan int): unbuffered"))); }} />
            <Pad tone="quiet" onClick={() => { setSt(chanInit(cap)); setTrace((t) => pushTrace(t, mkTrace("info", "channel reset"))); }}>Reset</Pad>
          </>
        }
        stage={<ChanStage st={st} />}
        readout={<Readout id={st.code + st.sendAbs + st.recvAbs + st.op + st.sendq.length + st.recvq.length}><p><Rich text={st.msg} /></p></Readout>}
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="runtime/chan.go · chansend · chanrecv · closechan"
      />

      <ChapterClose
        slug="channels"
        notes={
          <>
            <p><Fidelity kind="illustrative">channel addresses are illustrative</Fidelity></p>
            <p>Two details are not drawn. A non-blocking operation (a <code>select</code> with a <code>default</code> case) that can already see the channel is not ready returns without taking the lock at all. And when the element type holds no pointers, <code>makechan</code> allocates the <code>hchan</code> and its buffer as a single object that the collector never has to scan.</p>
          </>
        }
      />
    </>
  );
}
