"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { RUNQ_CAP, type Sched } from "@/lib/engines/sched";

const E = [0.16, 1, 0.3, 1] as const;
const FLY = { layout: { type: "spring" as const, stiffness: 260, damping: 30 } };

const STATE_CLS: Record<string, string> = {
  runnable: "hatch-teal border-teal/80",
  running: "hatch-copper border-copper",
  waiting: "hatch-violet border-violet/80",
  syscall: "hatch-rose border-rose",
};

function Chip({ id, s }: { id: number; s: Sched }) {
  const g = s.gs[id];
  if (!g) return null;
  const flash = s.flash.includes(id);
  return (
    <motion.div
      layoutId={`g-${id}`}
      transition={FLY}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.4, filter: "blur(2px)" }}
      title={`G${id}: _G${g.state}${g.hog ? " · tight loop" : ""}`}
      className={`relative flex h-[22px] min-w-[2.6rem] items-center justify-center gap-1 rounded-[2px] border px-1 font-mono text-[11px] text-ink @md:h-6 @md:text-[12px] ${STATE_CLS[g.state]}`}
    >
      G{id}
      {g.hog && <span className="text-[9px] text-rose">loop</span>}
      {flash && (
        <motion.span aria-hidden initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 1.5 }} transition={{ duration: 1.1 }} className="absolute inset-0 rounded-[2px] border-2 border-ink" />
      )}
    </motion.div>
  );
}

function MBadge({ m, blocked }: { m: number; blocked?: boolean }) {
  return (
    <motion.span
      layoutId={`m-${m}`}
      transition={FLY}
      className={`inline-flex items-center rounded-[2px] px-1.5 font-mono text-[10px] leading-[1.6] @md:text-[11px] ${blocked ? "bg-rose text-substrate" : "bg-ink/90 text-substrate"}`}
    >
      M{m}
    </motion.span>
  );
}

function Bay({ title, sub, count, tone, children }: { title: string; sub: string; count: number; tone: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-[3px] border p-2.5 ${tone}`}>
      <div className="flex items-baseline gap-2 font-mono text-[11px] mono-tight">
        <span className="text-ink">{title}</span>
        <span className="hidden truncate text-ink-3 @lg:inline">{sub}</span>
        <span className="tnum ml-auto text-ink-2">{count}</span>
      </div>
      <div className="flex min-h-6 flex-wrap gap-1">{children}</div>
    </div>
  );
}

export function SchedStage({ s }: { s: Sched }) {
  const scope = useId();
  return (
    <LayoutGroup id={scope}>
      <div className="@container flex h-full min-h-0 flex-col gap-3">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
          <Bay title="global run queue" sub="schedt.runq · unbounded, locked" count={s.globalq.length} tone="border-teal/40 border-dashed">
            <AnimatePresence initial={false}>{s.globalq.map((id) => <Chip key={id} id={id} s={s} />)}</AnimatePresence>
          </Bay>
          <Bay title="netpoller" sub="epoll / kqueue / IOCP" count={s.netpoll.length} tone="border-line-2">
            <AnimatePresence initial={false}>{s.netpoll.map((id) => <Chip key={id} id={id} s={s} />)}</AnimatePresence>
          </Bay>
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${s.gomaxprocs}, minmax(0, 1fr))` }}>
          {s.ps.map((p) => {
            const idle = p.running === null && p.retake === 0;
            const full = p.runq.length >= RUNQ_CAP;
            return (
              <div key={p.id} className={`flex min-w-0 flex-col gap-1.5 rounded-[3px] border p-2 transition-colors duration-300 ${p.retake ? "border-rose/70 border-dashed" : idle ? "border-line-2 bg-transparent" : "border-ink/30 bg-[#141731]"}`}>
                <div className="flex min-h-5 items-center gap-1.5">
                  <span className="font-mono text-[12px] font-semibold text-ink @md:text-[13px]">P{p.id}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {p.spinning && <span className="font-mono text-[9px] text-teal">spin</span>}
                    {p.retake > 0 && <span className="font-mono text-[9px] text-rose">_Psyscall</span>}
                    {p.m !== null && <MBadge m={p.m} />}
                  </span>
                </div>
                <Slot label="running" h="h-9">{p.running !== null && <Chip key={p.running} id={p.running} s={s} />}</Slot>
                <Slot label="runnext" h="h-8">{p.runnext !== null && <Chip key={p.runnext} id={p.runnext} s={s} />}</Slot>
                <div className="flex items-baseline justify-between font-mono text-[10px] text-ink-3">
                  <span>local runq</span>
                  <span className={`tnum ${full ? "text-rose" : ""}`}>{p.runq.length}/{RUNQ_CAP}</span>
                </div>
                <div className={`flex min-h-[9.5rem] flex-col gap-1 rounded-[2px] border border-dashed p-1 fidelity-sim ${full ? "border-rose/60" : "border-ink-3/30"}`}>
                  <AnimatePresence initial={false}>{p.runq.map((id) => <Chip key={id} id={id} s={s} />)}</AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Bay title="in syscall" sub="the M is blocked in the kernel" count={s.syscalls.length} tone="border-rose/40">
            <AnimatePresence initial={false}>
              {s.syscalls.map((sc) => (
                <motion.div key={sc.g} layout className="flex items-center gap-1">
                  <Chip id={sc.g} s={s} />
                  <MBadge m={sc.m} blocked />
                </motion.div>
              ))}
            </AnimatePresence>
          </Bay>
          <Bay title="waiting" sub="_Gwaiting · chan, mutex, timer" count={s.waiting.length} tone="border-violet/40">
            <AnimatePresence initial={false}>{s.waiting.map((id) => <Chip key={id} id={id} s={s} />)}</AnimatePresence>
          </Bay>
        </div>

        <div className="flex items-center gap-3 rounded-[3px] border border-line-2 bg-[#0e1024] px-3 py-2">
          <span className="relative flex size-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-teal/50 motion-reduce:hidden" />
            <span className="relative size-2.5 rounded-full bg-teal" />
          </span>
          <span className="font-mono text-[11px] text-ink mono-tight">sysmon</span>
          <span className="hidden font-mono text-[11px] text-ink-3 mono-tight @lg:inline">no P, no G, watches everything</span>
          <AnimatePresence mode="wait">
            <motion.span key={s.note} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: E }} className="ml-auto truncate font-mono text-[11px] text-copper mono-tight">
              {s.note}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </LayoutGroup>
  );
}

function Slot({ label, h, children }: { label: string; h: string; children: React.ReactNode }) {
  return (
    <div className={`relative flex ${h} items-center justify-center rounded-[2px] border border-dashed border-ink-3/25`}>
      <span className="pointer-events-none absolute left-1 top-0.5 hidden font-mono text-[9px] text-ink-3/70 @md:block">{label}</span>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  );
}
