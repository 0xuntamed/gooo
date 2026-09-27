"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import type { ChanState } from "@/lib/engines/chan";

const E = [0.16, 1, 0.3, 1] as const;
const FLY = { layout: { duration: 0.75, ease: E } };

function Val({ v, zero }: { v: number; zero?: boolean }) {
  return (
    <motion.span
      layoutId={zero ? undefined : `cv-${v}`}
      transition={FLY}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-[2px] border px-1.5 font-mono text-[13px] font-semibold ${zero ? "border-dashed border-ink-3 text-ink-3" : "hatch-copper border-copper text-ink"}`}
    >
      {v}
    </motion.span>
  );
}

const arc = (i: number, n: number, r0: number, r1: number) => {
  const g = n > 1 ? 0.07 : 0;
  const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n + g;
  const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n - g;
  const p = (r: number, a: number) => `${50 + r * Math.cos(a)} ${50 + r * Math.sin(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
};

export function ChanStage({ st }: { st: ChanState }) {
  const scope = useId();
  const direct = st.op === "direct-send" || st.op === "direct-recv";
  const step = st.cap ? 360 / st.cap : 0;
  const fields: [string, string | number, boolean][] = [
    ["qcount", st.qcount, st.op === "buffered" || st.op === "recv"],
    ["dataqsiz", st.cap, false],
    ["sendx", st.cap ? st.sendx : "—", st.op === "buffered" || st.op === "recv-refill"],
    ["recvx", st.cap ? st.recvx : "—", st.op === "recv" || st.op === "recv-refill"],
    ["closed", st.closed ? 1 : 0, st.op === "close"],
    ["elemsize", 8, false],
    ["sendq", `${st.sendq.length} sudog`, st.op === "block-send" || st.op === "direct-recv"],
    ["recvq", `${st.recvq.length} sudog`, st.op === "block-recv" || st.op === "direct-send"],
  ];
  return (
    <LayoutGroup id={scope}>
      <div className="@container flex h-full min-h-0 flex-col [justify-content:safe_center] gap-4">
        <div className="flex items-center gap-3">
          <code className="rounded-[3px] border border-line-2 bg-[#0e1024] px-3 py-1.5 font-mono text-[13px] text-ink mono-tight">{st.code}</code>
          <motion.span key={st.code + st.sendAbs + st.recvAbs + st.op} initial={{ backgroundColor: "rgba(231,139,82,.55)" }} animate={{ backgroundColor: "rgba(231,139,82,0)" }} transition={{ duration: 0.9 }} className="rounded-[2px] border border-line-2 px-2 py-0.5 font-mono text-[11px] text-ink-2">
            lock(&amp;c.lock)
          </motion.span>
        </div>

        <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-3">
          {/* bypass path for direct handoffs */}
          <svg className="pointer-events-none absolute inset-x-[12%] -top-2 h-10 w-[76%] overflow-visible" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
            <motion.path d="M0 20 C 25 -6, 75 -6, 100 20" fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2" strokeDasharray="5 4" animate={{ stroke: direct ? "#3fc6b4" : "#ece9f51f" }} transition={{ duration: 0.4 }} />
          </svg>

          <Side title="senders" active={`G1 · its stack holds`} q={st.sendq.map((s) => ({ g: s.g, v: s.v }))} qname="sendq" woke={st.op === "direct-recv" || st.op === "recv-refill" ? st.woke : []}>
            {!st.closed && <Val key={st.next} v={st.next} />}
          </Side>

          <div className="flex flex-col items-center gap-2 pt-6">
            {st.cap > 0 ? (
              <div className="relative mb-7 aspect-square w-full max-w-[17rem]">
                <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
                  {st.buf.map((v, i) => (
                    <path key={i} d={arc(i, st.cap, 30, 47)} fill={v !== null ? "url(#p-copper)" : "#171a35"} stroke={v !== null ? "#e78b52" : "#948fb4"} strokeOpacity={v !== null ? 0.8 : 0.35} strokeWidth="0.6" />
                  ))}
                  {st.buf.map((_, i) => {
                    const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / st.cap;
                    return <text key={`i${i}`} x={50 + 52 * Math.cos(a)} y={50 + 52 * Math.sin(a) + 1.5} textAnchor="middle" fontSize="4.2" fill="#948fb4" fontFamily="var(--font-martian), monospace">{i}</text>;
                  })}
                </svg>
                {st.buf.map((v, i) => {
                  const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / st.cap;
                  return v !== null ? (
                    <div key={`s${i}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${50 + 38.5 * Math.cos(a)}%`, top: `${50 + 38.5 * Math.sin(a)}%` }}>
                      <Val v={v} />
                    </div>
                  ) : null;
                })}
                <Hand deg={st.sendAbs * step + step / 2} color="bg-copper" />
                <Hand deg={st.recvAbs * step + step / 2} color="bg-teal" short />
                <div className="absolute inset-x-0 -bottom-7 flex justify-center gap-4 font-mono text-[10px] text-ink-2">
                  <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-copper" />sendx {st.sendx}</span>
                  <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-teal" />recvx {st.recvx}</span>
                </div>
                <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                  <span className="tnum font-mono text-[15px] font-semibold text-ink">{st.qcount}/{st.cap}</span>
                  <span className="font-mono text-[9px] text-ink-3">qcount</span>
                </div>
              </div>
            ) : (
              <div className="flex aspect-square w-full max-w-[13rem] flex-col items-center justify-center gap-2 rounded-full border border-dashed border-ink-3/40 text-center">
                <span className="font-mono text-[12px] text-ink">no buffer</span>
                <span className="px-6 font-mono text-[11px] text-ink-3">dataqsiz = 0 · every send meets a receive</span>
              </div>
            )}
            <AnimatePresence>
              {st.closed && (
                <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-[2px] bg-rose/20 px-2 font-mono text-[11px] text-rose">closed</motion.span>
              )}
            </AnimatePresence>
          </div>

          <Side title="receivers" active={st.got === null ? "G2 · waiting to receive" : `G2 · v, ok = `} q={st.recvq.map((s) => ({ g: s.g }))} qname="recvq" woke={st.op === "direct-send" || st.op === "close" ? st.woke : []} right>
            {st.got !== null && <Val key={st.op === "closed-recv" ? `z${st.recvAbs}` : st.got} v={st.got} zero={st.op === "closed-recv"} />}
            {st.got !== null && <span className={`font-mono text-[11px] ${st.gotOk ? "text-teal" : "text-rose"}`}>{st.gotOk ? "true" : "false"}</span>}
          </Side>
        </div>

        <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-[3px] border border-line-2 bg-line">
          {fields.map(([k, v, lit]) => (
            <div key={k} className={`px-2.5 py-1.5 transition-colors duration-500 ${lit ? "bg-copper/15" : "bg-substrate-2"}`}>
              <dt className="font-mono text-[10px] text-ink-3">{k}</dt>
              <motion.dd key={String(v)} initial={{ opacity: 0.2 }} animate={{ opacity: 1 }} className="tnum font-mono text-[13px] text-ink">{v}</motion.dd>
            </div>
          ))}
        </dl>
      </div>
    </LayoutGroup>
  );
}

function Hand({ deg, color, short }: { deg: number; color: string; short?: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 top-1/2 h-0 origin-left"
      style={{ width: "30%" }}
      initial={false}
      animate={{ rotate: deg - 90 }}
      transition={{ duration: 0.6, ease: E }}
    >
      <span className={`absolute -top-px h-[2px] ${color}`} style={{ left: short ? "46%" : "40%", right: short ? "12%" : "4%" }} />
      <span className={`absolute -top-[4px] size-2 rounded-full ${color}`} style={{ right: short ? "12%" : "4%" }} />
    </motion.div>
  );
}

function Side({ title, active, q, qname, woke, right, children }: { title: string; active: string; q: { g: number; v?: number }[]; qname: string; woke: number[]; right?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 pt-6 ${right ? "items-end text-right" : ""}`}>
      <span className="font-mono text-[11px] text-ink-3">{title}</span>
      <div className={`flex min-h-[3.2rem] w-full flex-col gap-1.5 rounded-[3px] border border-line-2 bg-[#141731] p-2 ${right ? "items-end" : ""}`}>
        <span className="font-mono text-[11px] text-ink-2 mono-tight">{active}</span>
        <div className="flex min-h-7 items-center gap-1.5">
          <AnimatePresence mode="popLayout" initial={false}>{children}</AnimatePresence>
        </div>
      </div>
      <span className="mt-1 font-mono text-[11px] text-ink-3">{qname}</span>
      <div className={`flex w-full flex-col gap-1 ${right ? "items-end" : ""}`}>
        <AnimatePresence initial={false}>
          {q.map((s) => (
            <motion.div key={s.g} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: right ? 14 : -14 }} transition={{ duration: 0.4, ease: E }} className="hatch-violet flex items-center gap-1.5 rounded-[2px] border border-violet/70 px-2 py-1">
              <span className="font-mono text-[11px] text-ink">G{s.g}</span>
              <span className="font-mono text-[10px] text-ink-2">sudog</span>
              {s.v !== undefined ? <Val v={s.v} /> : <span className="font-mono text-[10px] text-ink-3">elem → stack</span>}
            </motion.div>
          ))}
        </AnimatePresence>
        {q.length === 0 && <span className="font-mono text-[11px] text-ink-3/60">empty</span>}
        <AnimatePresence>
          {woke.map((g) => (
            <motion.span key={`w${g}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-mono text-[11px] text-teal">
              goready(G{g})
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
