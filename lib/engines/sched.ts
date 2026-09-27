/* GMP scheduler, following runtime/proc.go.
   Scaled down on purpose: the local run queue holds 6 (256 in the runtime)
   so runqputslow's overflow is visible, and sysmon's thresholds are ticks
   rather than 20 µs / 10 ms. Everything else follows the real algorithm. */

import { rng } from "@/lib/rng";
import type { TraceKind } from "@/components/ui";

export const RUNQ_CAP = 6;
export const SYSCALL_RETAKE = 3;
export const PREEMPT_AFTER = 8;

export type GState = "runnable" | "running" | "waiting" | "syscall";
export type G = { id: number; state: GState; work: number; hog: boolean; run: number; wait: number };
export type P = {
  id: number; m: number | null; runq: number[]; runnext: number | null; running: number | null;
  spinning: boolean; ticks: number; retake: number;
};
export type Sched = {
  gomaxprocs: number; ps: P[]; gs: Record<number, G>;
  globalq: number[]; netpoll: number[]; waiting: number[];
  /** goroutines in a syscall, with the M that is blocked in the kernel for them */
  syscalls: { g: number; m: number; p: number }[];
  nextG: number; nextM: number; threads: number; tick: number; lastTrace: number;
  note: string; seed: number; flash: number[]; scripted: boolean;
};
export type Ev = { kind: TraceKind; text: string };

type Ctx = { s: Sched; ev: Ev[]; r: ReturnType<typeof rng> };

function ctx(prev: Sched): Ctx {
  const s: Sched = structuredClone(prev);
  s.flash = [];
  const r = rng(0);
  r.state = s.seed;
  return { s, ev: [], r };
}
function done(c: Ctx) {
  c.s.seed = c.r.state;
  return { s: c.s, ev: c.ev };
}
const say = (c: Ctx, kind: TraceKind, text: string) => c.ev.push({ kind, text });

export function newSched(gomaxprocs = 4, seed = 20260927, opts: { scripted?: boolean; initial?: number } = {}): Sched {
  const s: Sched = {
    gomaxprocs, ps: [], gs: {}, globalq: [], netpoll: [], waiting: [], syscalls: [],
    nextG: 1, nextM: 0, threads: gomaxprocs, tick: 0, lastTrace: 0,
    note: "idle", seed, flash: [], scripted: !!opts.scripted,
  };
  for (let i = 0; i < gomaxprocs; i++) s.ps.push({ id: i, m: null, runq: [], runnext: null, running: null, spinning: false, ticks: 0, retake: 0 });
  const c: Ctx = { s, ev: [], r: rng(seed) };
  const n = opts.initial ?? gomaxprocs * 2;
  for (let j = 0; j < n; j++) runqput(c, s.ps[j % gomaxprocs], newG(c).id, j < gomaxprocs);
  s.seed = c.r.state;
  return s;
}

function newG(c: Ctx, hog = false): G {
  const id = c.s.nextG++;
  const g: G = { id, state: "runnable", work: hog ? 999 : 3 + c.r.int(5), hog, run: 0, wait: 0 };
  c.s.gs[id] = g;
  return g;
}

/* runqput: runnext first; a displaced runnext goes to the tail; a full local
   queue spills half of itself plus the new G to the global queue. */
function runqput(c: Ctx, p: P, gid: number, next: boolean) {
  const g = c.s.gs[gid];
  if (g) g.state = "runnable";
  if (next) {
    const old = p.runnext;
    p.runnext = gid;
    if (old === null) return;
    gid = old;
  }
  if (p.runq.length < RUNQ_CAP) { p.runq.push(gid); return; }
  const n = RUNQ_CAP / 2;
  const batch = p.runq.splice(0, n);
  batch.push(gid);
  c.s.globalq.push(...batch);
  c.s.flash.push(...batch);
  say(c, "warn", `runqputslow: P${p.id} local runq full → ${batch.length} G moved to the global queue`);
  c.s.note = `P${p.id} overflowed: half its queue went global`;
}

function globalrunqget(c: Ctx, p: P, max = 0) {
  const s = c.s;
  if (!s.globalq.length) return null;
  let n = Math.min(s.globalq.length, Math.floor(s.globalq.length / s.gomaxprocs) + 1);
  if (max) n = Math.min(n, max);
  const gid = s.globalq.shift()!;
  for (let i = 1; i < n && s.globalq.length && p.runq.length < RUNQ_CAP; i++) p.runq.push(s.globalq.shift()!);
  return gid;
}

/* runqsteal: take half of a random victim's queue */
function runqsteal(c: Ctx, p: P, victimId?: number) {
  const victims = c.s.ps.filter((o) => o !== p && o.runq.length > 0);
  if (!victims.length) return null;
  const v = victimId !== undefined ? c.s.ps[victimId] : c.r.pick(victims);
  const n = Math.ceil(v.runq.length / 2);
  const taken = v.runq.splice(0, n);
  const got = taken.shift()!;
  p.runq.push(...taken);
  c.s.flash.push(got, ...taken);
  say(c, "sched", `P${p.id} stole ${n} G from P${v.id} (runqsteal: half the victim's queue)`);
  c.s.note = `work stealing: idle P${p.id} took ${n} from P${v.id}`;
  return got;
}

/* schedule(): the order findRunnable actually checks things in */
function schedule(c: Ctx, p: P, stealFrom?: number) {
  const s = c.s;
  p.ticks++;
  let gid: number | null = null;
  if (p.ticks % 61 === 0 && s.globalq.length) {
    gid = globalrunqget(c, p, 1);
    if (gid !== null) {
      say(c, "sched", `P${p.id} schedtick ${p.ticks} % 61 == 0: global queue checked first, so it can never starve`);
      s.note = `P${p.id}'s 61st tick: global queue first`;
      s.flash.push(gid);
    }
  }
  if (gid === null && p.runnext !== null) { gid = p.runnext; p.runnext = null; }
  if (gid === null && p.runq.length) gid = p.runq.shift()!;
  if (gid === null) gid = globalrunqget(c, p);
  if (gid === null && s.netpoll.length) {
    gid = s.netpoll.shift()!;
    say(c, "sched", `netpoll() returned G${gid}: its socket is ready`);
  }
  if (gid === null) { p.spinning = true; gid = runqsteal(c, p, stealFrom); }
  if (gid === null) { p.running = null; return; }
  p.spinning = false;
  const g = s.gs[gid];
  if (!g) return;
  g.state = "running";
  g.run = 0;
  p.running = gid;
  if (p.m === null) p.m = s.nextM++;
}

function finish(c: Ctx, p: P, how: "exit" | "chan" | "net") {
  const s = c.s;
  const g = s.gs[p.running!];
  if (how === "exit") {
    delete s.gs[g.id];
    say(c, "info", `G${g.id} returned → goexit0, _Gdead, onto the P's gFree list`);
  } else if (how === "chan") {
    g.state = "waiting"; g.wait = 2 + c.r.int(4);
    s.waiting.push(g.id);
    say(c, "info", `G${g.id} gopark(chan receive) → _Gwaiting`);
  } else {
    g.state = "waiting"; g.wait = 2 + c.r.int(3);
    s.netpoll.push(g.id);
    say(c, "info", `G${g.id} parked on the netpoller (epoll_wait)`);
  }
  p.running = null;
}

/* ── one round: sysmon, then every P runs its G for one tick ── */
export function tick(prev: Sched) {
  const c = ctx(prev);
  const s = c.s;
  s.tick++;

  // sysmon: retake Ps stuck in syscalls
  for (const p of s.ps) {
    if (p.retake > 0) {
      p.retake++;
      if (p.retake > SYSCALL_RETAKE) {
        p.retake = 0;
        p.m = s.nextM++;
        s.threads++;
        say(c, "warn", `sysmon: retake(P${p.id}): syscall exceeded 20µs, handoffp → P${p.id} now on M${p.m}`);
        s.note = `sysmon handed P${p.id} to a fresh M${p.m}`;
        schedule(c, p);
      }
    }
  }

  for (const p of s.ps) {
    if (p.retake > 0) continue;
    if (p.running === null) { schedule(c, p); continue; }
    const g = s.gs[p.running];
    if (!g || g.state !== "running") { p.running = null; schedule(c, p); continue; }
    g.run++;
    g.work--;
    if (g.hog && g.run >= PREEMPT_AFTER) {
      say(c, "warn", `sysmon: preemptone(G${g.id}): running ${g.run} ticks, SIGURG → asyncPreempt`);
      s.note = `G${g.id} preempted by signal; it never yielded`;
      g.hog = false; g.work = 4;
      p.running = null;
      runqput(c, p, g.id, false);
      s.flash.push(g.id);
      schedule(c, p);
      continue;
    }
    if (g.work <= 0 && !s.scripted) {
      const roll = c.r.next();
      finish(c, p, roll < 0.16 ? "chan" : roll < 0.26 ? "net" : "exit");
      schedule(c, p);
    }
  }

  // parked goroutines wake
  for (let i = s.waiting.length - 1; i >= 0; i--) {
    const g = s.gs[s.waiting[i]];
    if (!g) { s.waiting.splice(i, 1); continue; }
    if (--g.wait <= 0) {
      s.waiting.splice(i, 1);
      g.work = 2 + c.r.int(4);
      const p = c.r.pick(s.ps);
      runqput(c, p, g.id, true);
      s.flash.push(g.id);
      say(c, "info", `goready(G${g.id}) → P${p.id}.runnext`);
    }
  }

  // syscalls return
  for (let i = s.syscalls.length - 1; i >= 0; i--) {
    const sc = s.syscalls[i];
    const g = s.gs[sc.g];
    if (!g) { s.syscalls.splice(i, 1); continue; }
    if (--g.wait <= 0) {
      s.syscalls.splice(i, 1);
      g.work = 2 + c.r.int(3);
      const old = s.ps[sc.p];
      const idle = s.ps.find((p) => p.running === null && p.retake === 0 && p.runq.length === 0 && p.runnext === null);
      if (old && old.retake > 0) {
        old.retake = 0;
        old.running = g.id; g.state = "running"; g.run = 0; old.m = sc.m;
        say(c, "info", `exitsyscall(G${g.id}): fast path, P${old.id} was never retaken, so M${sc.m} simply continues`);
      } else if (idle) {
        idle.running = g.id; g.state = "running"; g.run = 0; idle.m = sc.m;
        s.threads = Math.max(s.gomaxprocs, s.threads - 1);
        say(c, "info", `exitsyscall(G${g.id}): P${sc.p} was retaken, acquired idle P${idle.id} instead`);
      } else {
        g.state = "runnable";
        s.globalq.push(g.id);
        s.threads = Math.max(s.gomaxprocs, s.threads - 1);
        say(c, "info", `exitsyscall(G${g.id}): no idle P → global run queue, M${sc.m} parks`);
      }
    }
  }

  if (s.tick % 7 === 0 && s.netpoll.length) {
    const ng = s.netpoll.shift()!;
    s.globalq.push(ng);
    if (s.gs[ng]) { s.gs[ng].state = "runnable"; s.gs[ng].work = 2 + c.r.int(3); }
    say(c, "sched", `sysmon: netpoll() returned G${ng} → global run queue`);
  }

  if (s.tick - s.lastTrace >= 9) {
    s.lastTrace = s.tick;
    c.ev.push({ kind: "sched", text: schedtrace(s) });
  }
  return done(c);
}

export function schedtrace(s: Sched) {
  const idle = s.ps.filter((p) => p.running === null).length;
  const spin = s.ps.filter((p) => p.spinning).length;
  const per = s.ps.map((p) => p.runq.length + (p.runnext !== null ? 1 : 0));
  return `SCHED ${s.tick * 120}ms: gomaxprocs=${s.gomaxprocs} idleprocs=${idle} threads=${s.threads} spinningthreads=${spin} needspinning=0 idlethreads=${Math.max(0, s.threads - s.gomaxprocs)} runqueue=${s.globalq.length} [${per.join(" ")}]`;
}

/* ── user actions ── */
export function act(prev: Sched, k: "go1" | "go20" | "block" | "syscall" | "hog") {
  const c = ctx(prev);
  const s = c.s;
  if (k === "go1") {
    const g = newG(c);
    runqput(c, s.ps[0], g.id, true);
    s.flash.push(g.id);
    say(c, "note", `newproc: G${g.id} created (2 KB stack) → P0.runnext`);
    s.note = `go f() puts G${g.id} in P0.runnext`;
  } else if (k === "go20") {
    say(c, "note", "newproc ×20 on P0: watch the local runq overflow");
    for (let i = 0; i < 20; i++) runqput(c, s.ps[0], newG(c).id, true);
    s.note = "20 goroutines spawned from P0";
  } else if (k === "block") {
    const cand = s.ps.filter((p) => p.running !== null && p.retake === 0);
    if (!cand.length) { say(c, "info", "nothing running to block"); return done(c); }
    const p = c.r.pick(cand);
    const g = s.gs[p.running!];
    g.state = "waiting"; g.wait = 3 + c.r.int(3);
    s.waiting.push(g.id);
    p.running = null;
    say(c, "info", `G${g.id} gopark(chan send): sudog on hchan.sendq → _Gwaiting`);
    say(c, "info", `P${p.id} keeps M${p.m}; schedule() picks the next G immediately`);
    s.note = `G${g.id} parked; P${p.id} carried straight on`;
    schedule(c, p);
  } else if (k === "syscall") {
    const cand = s.ps.filter((p) => p.running !== null && p.retake === 0);
    if (!cand.length) { say(c, "info", "nothing running to put in a syscall"); return done(c); }
    const p = c.r.pick(cand);
    enterSyscall(c, p);
  } else if (k === "hog") {
    const h = newG(c, true);
    runqput(c, s.ps[0], h.id, true);
    say(c, "note", `G${h.id}: a tight loop with no function calls; only sysmon can stop it`);
    s.note = `CPU hog G${h.id} spawned`;
  }
  return done(c);
}

function enterSyscall(c: Ctx, p: P) {
  const s = c.s;
  const g = s.gs[p.running!];
  g.state = "syscall"; g.wait = SYSCALL_RETAKE + 3;
  s.syscalls.push({ g: g.id, m: p.m!, p: p.id });
  say(c, "warn", `entersyscall(G${g.id}): M${p.m} blocks in the kernel, P${p.id} → _Psyscall`);
  s.note = `G${g.id} took M${p.m} into the kernel; P${p.id} is stranded`;
  p.running = null;
  p.m = null;
  p.retake = 1;
}

/* ── scripted operations, for the step-by-step story ── */
export const script = {
  schedule(prev: Sched, pid: number, stealFrom?: number) {
    const c = ctx(prev); schedule(c, c.s.ps[pid], stealFrom); return done(c);
  },
  scheduleAll(prev: Sched) {
    const c = ctx(prev); for (const p of c.s.ps) if (p.running === null) schedule(c, p); return done(c);
  },
  spawn(prev: Sched, pid: number, n: number, hog = false) {
    const c = ctx(prev);
    for (let i = 0; i < n; i++) { const g = newG(c, hog); runqput(c, c.s.ps[pid], g.id, true); c.s.flash.push(g.id); }
    return done(c);
  },
  finish(prev: Sched, pid: number, how: "exit" | "chan") {
    const c = ctx(prev); finish(c, c.s.ps[pid], how); return done(c);
  },
  /** empty a P's queue by finishing work elsewhere, to make it idle */
  drain(prev: Sched, pid: number) {
    const c = ctx(prev);
    const p = c.s.ps[pid];
    for (const gid of [...p.runq, ...(p.runnext !== null ? [p.runnext] : []), ...(p.running !== null ? [p.running] : [])]) delete c.s.gs[gid];
    p.runq = []; p.runnext = null; p.running = null;
    return done(c);
  },
  syscall(prev: Sched, pid: number) {
    const c = ctx(prev); enterSyscall(c, c.s.ps[pid]); return done(c);
  },
  retake(prev: Sched, pid: number) {
    const c = ctx(prev);
    const s = c.s, p = s.ps[pid];
    p.retake = 0; p.m = s.nextM++; s.threads++;
    say(c, "warn", `sysmon: retake(P${p.id}): syscall exceeded 20µs, handoffp → P${p.id} now on M${p.m}`);
    s.note = `sysmon handed P${p.id} to a fresh M${p.m}`;
    schedule(c, p);
    return done(c);
  },
  exitSyscall(prev: Sched) {
    const c = ctx(prev);
    const s = c.s;
    const sc = s.syscalls.shift();
    if (sc) {
      const g = s.gs[sc.g];
      g.state = "runnable";
      s.globalq.push(g.id);
      s.flash.push(g.id);
      say(c, "info", `exitsyscall(G${g.id}): its P was taken and none are idle → global run queue; M${sc.m} goes idle`);
      s.note = `G${g.id} came back to find its P gone`;
    }
    return done(c);
  },
  run(prev: Sched, pid: number, ticks: number) {
    const c = ctx(prev);
    const g = c.s.gs[c.s.ps[pid].running!];
    if (g) g.run += ticks;
    return done(c);
  },
  preempt(prev: Sched, pid: number) {
    const c = ctx(prev);
    const s = c.s, p = s.ps[pid];
    const g = s.gs[p.running!];
    say(c, "warn", `sysmon: preemptone(G${g.id}): running for 10ms, SIGURG → asyncPreempt`);
    s.note = `G${g.id} stopped by a signal`;
    g.hog = false; p.running = null;
    runqput(c, p, g.id, false);
    s.flash.push(g.id);
    schedule(c, p);
    return done(c);
  },
  setTicks(prev: Sched, pid: number, t: number) {
    const c = ctx(prev); c.s.ps[pid].ticks = t; return done(c);
  },
  note(prev: Sched, note: string) {
    const c = ctx(prev); c.s.note = note; return done(c);
  },
};
