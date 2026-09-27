"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { Scrolly, type Step } from "@/components/scrolly";
import { Dial, Fidelity, mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { act, newSched, type Sched, schedtrace, script as S, tick } from "@/lib/engines/sched";
import { rng } from "@/lib/rng";

const fresh = (n: number, seed: number) => S.note(newSched(n, seed, { initial: n * 3 }), "running: goroutines arrive, run, park and exit").s;
const arrivals = rng(31337);
import { SchedStage } from "./stage";

function story(): Sched[] {
  const n = (s: Sched, note: string) => S.note(s, note).s;
  const f: Sched[] = [];
  let s = S.scheduleAll(newSched(4, 7, { scripted: true, initial: 8 })).s;
  f.push(n(s, "4 Ps, each running a G on its own M"));
  s = S.spawn(s, 0, 1).s;
  f.push(n(s, "go f() → G9 in P0.runnext"));
  s = S.schedule(S.finish(s, 0, "exit").s, 0).s;
  f.push(n(s, "G1 exited; runnext G9 ran before G5"));
  s = S.drain(S.spawn(s, 0, 5).s, 3).s;
  f.push(n(s, "P3 is out of work; P0 has plenty"));
  s = S.schedule(s, 3, 0).s;
  f.push(n(s, "P3 stole half of P0's queue"));
  s = S.spawn(s, 0, 20).s;
  f.push(n(s, "P0's queue overflowed into the global queue"));
  s = S.schedule(S.finish(s, 1, "chan").s, 1).s;
  f.push(n(s, "G2 parked; P1 carried straight on"));
  s = S.syscall(s, 2).s;
  f.push(n(s, "G3 took M2 into the kernel; P2 is stranded"));
  s = S.retake(s, 2).s;
  f.push(n(s, "sysmon handed P2 to a fresh M4"));
  s = S.exitSyscall(s).s;
  f.push(n(s, "G3 is back, its P gone, so it waits globally"));
  s = S.run(S.schedule(S.finish(S.spawn(s, 3, 1, true).s, 3, "exit").s, 3).s, 3, 8).s;
  f.push(n(s, "a goroutine in a tight loop holds P3"));
  s = S.preempt(s, 3).s;
  f.push(n(s, "SIGURG → asyncPreempt: the loop was stopped"));
  s = S.schedule(S.finish(S.setTicks(s, 1, 60).s, 1, "exit").s, 1).s;
  f.push(n(s, "P1's 61st schedule looked at the global queue first"));
  return f;
}

const STEPS: Step[] = [
  {
    id: "gmp", title: "G, M and P",
    body: (
      <>
        <p><strong>G</strong> is a goroutine: a small stack and some saved registers, cheap enough to make millions. <strong>M</strong> is an OS thread: expensive, and a system call can block it. <strong>P</strong> is the right to run Go code, and there are exactly <code>GOMAXPROCS</code> of them.</p>
        <p>P is the piece people miss. It owns a local run queue and a memory cache, and <em>an M must hold a P to run Go code</em>. That is how parallelism stays at <code>GOMAXPROCS</code> however many threads exist.</p>
      </>
    ),
  },
  {
    id: "go", title: "go f()",
    body: (
      <>
        <p><code>go f()</code> calls <code>newproc</code>, which makes <code>G9</code> and puts it in the current P&apos;s <strong>runnext</strong> slot, not at the back of the queue.</p>
      </>
    ),
  },
  {
    id: "runnext", title: "runnext jumps the queue",
    body: (
      <>
        <p>When <code>G1</code> finishes, <code>schedule()</code> checks runnext before the queue. <code>G9</code> runs ahead of <code>G5</code>, even though G5 has waited longer.</p>
        <p>The reason is locality. A goroutine that was just created, or just woken by a channel send, probably shares cache-hot data with the one that made it. Running it next keeps producer and consumer on one core.</p>
      </>
    ),
  },
  {
    id: "dry", title: "A P runs dry",
    body: (
      <>
        <p>P3&apos;s goroutines have all finished, and meanwhile P0 has five queued. Before P3&apos;s thread goes to sleep, <code>findRunnable</code> looks for work in a fixed order: its own queue, the global queue, the netpoller, and then <em>the other Ps</em>.</p>
      </>
    ),
  },
  {
    id: "steal", title: "Work stealing",
    body: (
      <>
        <p>P3 picks a victim at random and takes <strong>half</strong> of its run queue, three of P0&apos;s five. The first stolen G runs at once, and the rest join P3&apos;s queue.</p>
        <p>Nobody hands work out and there is no central balancer. Idle Ps pull, which keeps the busy ones free of coordination.</p>
      </>
    ),
  },
  {
    id: "overflow", title: "Overflow to the global queue",
    body: (
      <>
        <p>Twenty goroutines spawned from P0. The local queue is a fixed ring, 256 slots in the runtime and 6 here so you can see it fill. When it is full, <code>runqputslow</code> moves <strong>half of it, plus the new G</strong>, to the global queue in one locked operation.</p>
        <p>The global queue is unbounded but needs a lock, which is exactly why each P has its own queue.</p>
      </>
    ),
  },
  {
    id: "park", title: "Blocking costs no thread",
    body: (
      <>
        <p><code>G2</code> blocks on a channel. <code>gopark</code> puts it in <code>_Gwaiting</code>, attached to the channel (block 11), and off every run queue. The P and its M are unaffected: <code>schedule()</code> starts the next G immediately.</p>
        <p>This is why a million blocked goroutines cost a million small stacks and zero threads.</p>
      </>
    ),
  },
  {
    id: "syscall", title: "A system call",
    body: (
      <>
        <p><code>G3</code> calls <code>read()</code>. A syscall is different: the <em>thread</em> goes into the kernel, and M2 cannot run Go code until it comes back. <code>entersyscall</code> marks P2 <code>_Psyscall</code>, and P2 is now stranded with work in its queue.</p>
      </>
    ),
  },
  {
    id: "handoff", title: "sysmon hands off the P",
    body: (
      <>
        <p><strong>sysmon</strong> is a runtime thread that needs no P. When it sees a syscall that has lasted a full sysmon tick (20&nbsp;µs at the fastest), it <strong>retakes</strong> P2 and hands it to another M, a new or idle thread. P2&apos;s queue keeps moving.</p>
        <p>This is why a process running Go can have far more threads than <code>GOMAXPROCS</code>.</p>
      </>
    ),
  },
  {
    id: "return", title: "The syscall returns",
    body: (
      <>
        <p><code>read()</code> returns. <code>exitsyscall</code> first tries to take back P2, but it has been handed off. It then looks for an idle P, and there is none. So <code>G3</code> goes to the global queue and M2 parks, idle, until it is needed.</p>
      </>
    ),
  },
  {
    id: "hog", title: "A goroutine that never yields",
    body: (
      <>
        <p>A tight loop with no function calls has no natural point to stop. The stack check at the top of every function doubles as a preemption check (block 09), and this loop never calls one. It holds P3 for as long as it runs.</p>
      </>
    ),
  },
  {
    id: "preempt", title: "Preempted by a signal",
    body: (
      <>
        <p>After 10&nbsp;ms, sysmon sends <code>SIGURG</code> to the thread. The signal handler rewrites the goroutine&apos;s context to call <code>asyncPreempt</code>, which saves every register and yields. The loop never knew.</p>
        <p>This has been possible since Go 1.14. Before that, a loop like this could hang a garbage collection.</p>
      </>
    ),
  },
  {
    id: "61", title: "The 61st tick",
    body: (
      <>
        <p>Local queues are checked first, so in principle the global queue could wait for ever. It cannot, because on every 61st schedule a P looks at the <strong>global queue first</strong>, even when it has local work. P1 just did: the goroutine that had waited longest in the global queue is running, while P1&apos;s own queue waits one more turn.</p>
      </>
    ),
  },
];

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

export default function SchedulerChapter() {
  const frames = useMemo(story, []);
  const [s, setS] = useState<Sched>(() => fresh(4, 20260927));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(3);
  const [procs, setProcs] = useState(4);
  const [trace, setTrace] = useState<TraceLine[]>([]);
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "0px 0px -20% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cur = useRef(s);
  cur.current = s;
  const step = useCallback(() => {
    const r = tick(cur.current);
    // a server keeps receiving work: new goroutines arrive at a steady trickle
    if (Object.keys(r.s.gs).length < r.s.gomaxprocs * 3 && arrivals.next() < 0.45) {
      const p = arrivals.int(r.s.gomaxprocs);
      r.s = S.spawn(r.s, p, 1).s;
      r.ev.push({ kind: "info", text: `newproc: G${r.s.nextG - 1} arrived on P${p}` });
    }
    cur.current = r.s;
    setS(r.s);
    if (r.ev.length) setTrace((t) => pushTrace(t, ...r.ev.map((e) => mkTrace(e.kind, e.text))));
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    const id = window.setInterval(step, 700 / SPEEDS[speed]);
    return () => window.clearInterval(id);
  }, [playing, visible, speed, step]);

  const doAct = (k: Parameters<typeof act>[1]) => {
    const r = act(s, k);
    setS(r.s);
    setTrace((t) => pushTrace(t, ...r.ev.map((e) => mkTrace(e.kind, e.text))));
  };

  return (
    <>
      <Scrolly steps={STEPS} block="multi-core array" pkg="runtime/proc.go">
        {(i) => <SchedStage s={frames[i]} />}
      </Scrolly>

      <div ref={box}>
        <Sandbox
          slug="scheduler"
          intro={
            <>
              <p>The same scheduler, now running on its own, with new goroutines arriving at a steady trickle the way requests reach a server. They run, finish, park on channels, wait on the network, and get woken. Spawn a burst, force a syscall, start a CPU hog, or change <code>GOMAXPROCS</code> and restart the world.</p>
              <p className="mt-3 text-[14px] text-ink-3">Space plays and pauses while the page is scrolled here.</p>
            </>
          }
          controls={
            <>
              <Pad tone="primary" pressed={playing} onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</Pad>
              <Pad onClick={() => { setPlaying(false); step(); }}>Step</Pad>
              <Dial label="speed" value={speed} min={0} max={SPEEDS.length - 1} onChange={setSpeed} format={(v) => `${SPEEDS[v]}×`} />
              <Pad code onClick={() => doAct("go1")}>go f()</Pad>
              <Pad onClick={() => doAct("go20")}>Spawn 20</Pad>
              <Pad onClick={() => doAct("block")}>Block on a channel</Pad>
              <Pad onClick={() => doAct("syscall")}>Enter a syscall</Pad>
              <Pad onClick={() => doAct("hog")}>CPU hog</Pad>
              <Dial
                label="GOMAXPROCS"
                value={procs}
                min={1}
                max={8}
                onChange={(n) => {
                  setProcs(n);
                  setS(fresh(n, 20260927 + n));
                  setTrace((t) => pushTrace(t, mkTrace("note", `runtime.GOMAXPROCS(${n}): stop the world, ${n} P${n === 1 ? "" : "s"}, start the world`)));
                }}
              />
              <Pad tone="quiet" onClick={() => { setS(fresh(procs, 20260927)); setTrace((t) => pushTrace(t, mkTrace("info", "runtime reset"))); }}>Reset</Pad>
            </>
          }
          stage={<SchedStage s={s} />}
          readout={
            <>
              <Readout id={s.note}><p className="font-mono text-[14px] text-copper mono-tight">{s.note}</p></Readout>
              <p className="mt-3 break-all font-mono text-[12px] leading-relaxed text-ink-3 mono-tight">{schedtrace(s)}</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
                <Legend cls="hatch-copper border-copper" t="running" />
                <Legend cls="hatch-teal border-teal/80" t="runnable" />
                <Legend cls="hatch-violet border-violet/80" t="waiting" />
                <Legend cls="hatch-rose border-rose" t="syscall" />
              </div>
            </>
          }
          trace={trace}
          onClearTrace={() => setTrace([])}
          hint="GODEBUG=schedtrace=120"
        />
      </div>
      <SpaceToggle active={visible} onToggle={() => setPlaying((p) => !p)} />

      <ChapterClose
        slug="scheduler"
        notes={
          <>
            <p><Fidelity kind="sim">run queue: 6 here, 256 in the runtime</Fidelity></p>
            <p>Two things are scaled down so they happen on screen: the local run queue holds 6 (256 in <code>runtime/proc.go</code>), and sysmon counts simulation ticks instead of 20&nbsp;µs and 10&nbsp;ms. Everything else follows the runtime: runnext, <code>runqputslow</code> moving half the queue, stealing half a victim&apos;s queue, the syscall handoff, the fast path back into the old P, and the 61st-tick global check.</p>
            <p>Since Go 1.25, <code>GOMAXPROCS</code> defaults to the container&apos;s CPU limit where a cgroup sets one, not the machine&apos;s core count.</p>
          </>
        }
      />
    </>
  );
}

function Legend({ cls, t }: { cls: string; t: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-5 rounded-[2px] border ${cls}`} />
      {t}
    </span>
  );
}

function SpaceToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== " " || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)) return;
      e.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onToggle]);
  return null;
}
