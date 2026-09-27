"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { CodePane } from "@/components/code-pane";
import { type DState, LOOP_SRC, OPEN_SRC } from "@/lib/engines/defer";

const E = [0.16, 1, 0.3, 1] as const;

const FRAME_CLS: Record<string, string> = {
  running: "border-copper bg-copper/15 text-ink",
  calling: "border-line-2 text-ink-2",
  panicking: "border-rose bg-rose/20 text-ink",
  unwinding: "border-rose border-dashed text-ink",
  resumed: "border-teal bg-teal/15 text-ink",
  returned: "border-line text-ink-3 line-through",
};

export function DeferStage({ s }: { s: DState }) {
  const scope = useId();
  return (
    <LayoutGroup id={scope}>
      <div className="@container grid h-full min-h-0 gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CodePane code={s.variant === "open" ? OPEN_SRC : LOOP_SRC} lit={s.lit} caption={s.variant === "open" ? "open-coded: three defers" : "one defer in a loop"} size="sm" className="min-h-0" />
        <div className="flex min-w-0 flex-col gap-3">
          {s.variant === "open" ? <Bits s={s} /> : <Chain s={s} />}
          <div className="rounded-[3px] border border-line-2 p-3">
            <div className="mb-2 font-mono text-[11px] text-ink-3 mono-tight">goroutine 1 · call stack, newest on top</div>
            <div className="flex flex-col-reverse gap-1.5">
              <AnimatePresence initial={false}>
                {s.frames.map((f) => (
                  <motion.div
                    key={f.name}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20, transition: { duration: 0.35 } }}
                    transition={{ duration: 0.4, ease: E }}
                    className={`flex items-center justify-between rounded-[2px] border px-2.5 py-1.5 font-mono text-[12px] transition-colors duration-300 ${FRAME_CLS[f.state]}`}
                  >
                    <span>{f.name}</span>
                    <span className="text-[10px] text-ink-3">{f.state}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          <div className="min-h-[5.5rem] rounded-[3px] border border-line bg-[#0c0e20] p-3 font-mono text-[12px] leading-[1.6] mono-tight">
            {s.console.length === 0 && <span className="text-ink-3">stdout / stderr</span>}
            {s.console.map((l, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }} className={/panic|exit status/.test(l) ? "text-rose" : /goroutine|main\./.test(l) ? "text-ink-2" : "text-teal"}>
                {l || " "}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </LayoutGroup>
  );
}

function Bits({ s }: { s: DState }) {
  const bits = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => s.recs.find((r) => r.id === `b${i}`));
  return (
    <div className="rounded-[3px] border border-line-2 p-3">
      <div className="mb-2 flex items-baseline justify-between font-mono text-[11px] mono-tight">
        <span className="text-ink-3">deferBits · one byte in the frame</span>
        <span className="tnum text-ink-2">0b{[...bits].reverse().map((b) => (b && b.state === "armed" ? 1 : 0)).join("")}</span>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => {
          const b = bits[i];
          const on = b && b.state === "armed";
          const firing = b && b.state === "firing";
          return (
            <motion.div
              key={i}
              animate={{ scale: firing ? 1.08 : 1 }}
              className={`flex h-10 flex-col items-center justify-center rounded-[2px] border transition-colors duration-300 ${firing ? "border-ink bg-ink/80 text-substrate" : on ? "hatch-copper border-copper text-ink" : "border-line-2 text-ink-3"}`}
            >
              <span className="font-mono text-[14px] font-semibold">{on || firing ? 1 : 0}</span>
              <span className="font-mono text-[9px] opacity-70">bit {i}</span>
            </motion.div>
          );
        })}
      </div>
      <ul className="mt-2 space-y-0.5 font-mono text-[11px] mono-tight">
        {[2, 1, 0].map((i) => {
          const b = bits[i];
          if (!b) return null;
          return (
            <li key={i} className={b.state === "firing" ? "text-ink" : b.state === "done" ? "text-ink-3 line-through" : "text-copper"}>
              bit {i} → {b.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Chain({ s }: { s: DState }) {
  const live = [...s.recs].reverse().filter((r) => r.state !== "done");
  return (
    <div className="rounded-[3px] border border-line-2 p-3">
      <div className="mb-2 font-mono text-[11px] text-ink-3 mono-tight">g._defer · linked records, newest first</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] text-teal">g._defer</span>
        <AnimatePresence initial={false} mode="popLayout">
          {live.map((r) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, x: -14, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: r.state === "firing" ? 1.06 : 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.8 }}
              transition={{ duration: 0.4, ease: E }}
              className="flex items-center gap-1.5"
            >
              <span className="h-px w-3 bg-ink-3" />
              <span className={`flex flex-col rounded-[2px] border px-2 py-1 font-mono text-[11px] leading-tight ${r.state === "firing" ? "border-ink bg-ink/80 text-substrate" : r.where === "heap" ? "hatch-rose border-rose text-ink" : "hatch-teal border-teal text-ink"}`}>
                {r.label}
                <span className="text-[9px] opacity-75">{r.where === "heap" ? "heap · deferproc" : "stack · deferprocStack"}</span>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        <span className="flex items-center gap-1.5"><span className="h-px w-3 bg-ink-3" /><span className="font-mono text-[11px] text-ink-3">nil</span></span>
      </div>
    </div>
  );
}
