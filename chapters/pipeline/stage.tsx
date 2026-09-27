"use client";

import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { TOK_CLASS, tokenizeAsm, tokenizeGo } from "@/lib/highlight";
import { ASM, MACHINE, MIDDLE, PHASES, type PhaseId, SOURCE_BYTES, SOURCE_LINES, SSA_BUILD, SSA_OPT, type SsaLine, TOKENS, TREE } from "@/lib/engines/pipeline";

const E = [0.16, 1, 0.3, 1] as const;
const FLY = { layout: { duration: 0.75, ease: E } };

export function PipelineStage({ phase }: { phase: PhaseId }) {
  const scope = useId();
  const idx = PHASES.findIndex((p) => p.id === phase);
  const cur = PHASES[idx];
  return (
    <LayoutGroup id={scope}>
      <div className="@container flex h-full min-h-0 flex-col gap-4">
        <ol className="grid grid-cols-9 gap-[3px]" aria-label="Compiler phases">
          {PHASES.map((p, i) => (
            <li key={p.id} className="min-w-0">
              <div className={`h-1.5 rounded-[1px] transition-colors duration-500 ${i < idx ? "bg-teal/60" : i === idx ? "bg-copper" : "bg-substrate-4"}`} />
              <span className={`mt-1 hidden truncate font-mono text-[10px] mono-tight @2xl:block ${i === idx ? "text-copper" : "text-ink-3"}`}>{p.name}</span>
            </li>
          ))}
        </ol>
        <div className="flex items-baseline gap-3 font-mono text-[12px] mono-tight">
          <span className="text-copper">{cur.name}</span>
          <span className="truncate text-ink-3">{cur.pkg}</span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto pr-1">
          {phase === "source" && <SourceView />}
          {phase === "scan" && <ScanView />}
          {(phase === "parse" || phase === "types" || phase === "middle") && <TreeView phase={phase} />}
          {phase === "ssa" && <SsaView lines={SSA_BUILD} build />}
          {phase === "opt" && <SsaView lines={SSA_OPT} />}
          {phase === "gen" && <GenView />}
          {phase === "bytes" && <BytesView />}
        </div>
      </div>
    </LayoutGroup>
  );
}

/* ── source: each token is already a separate piece of matter ── */
function SourceView() {
  return (
    <div>
      <pre className="font-mono text-[13px] leading-[1.9] mono-tight [tab-size:4] @md:text-[14px]">
        {SOURCE_LINES.map((line, li) => {
          const toks = TOKENS.filter((t) => t.line === li + 1 && !t.inserted && t.kind !== "EOF").sort((a, b) => a.col - b.col);
          const parts: React.ReactNode[] = [];
          let col = 1;
          for (const t of toks) {
            if (t.col > col) parts.push(<span key={`w${t.id}`}>{line.slice(col - 1, t.col - 1)}</span>);
            const cls = TOK_CLASS[tokenizeGo(t.lit)[0]?.t ?? "id"];
            parts.push(
              <motion.span key={t.id} layoutId={`tk-${t.id}`} transition={FLY} className={`inline-block ${cls}`}>
                {t.lit}
              </motion.span>,
            );
            col = t.col + t.lit.length;
          }
          return (
            <div key={li} className="flex">
              <span className="w-8 shrink-0 select-none pr-3 text-right text-ink-3/50 tnum">{li + 1}</span>
              <span className="whitespace-pre">{parts.length ? parts : " "}</span>
            </div>
          );
        })}
      </pre>
      <p className="mt-4 font-mono text-[12px] text-ink-3 mono-tight">{SOURCE_BYTES} bytes of UTF-8 text. To the compiler it is nothing more yet.</p>
    </div>
  );
}

/* ── scan: bytes → 37 tokens, six of them invented ── */
function ScanView() {
  return (
    <div>
      <div className="flex flex-wrap gap-[5px]">
        {TOKENS.map((t, i) => (
          <motion.span
            key={t.id}
            layoutId={t.inserted || t.kind === "EOF" ? undefined : `tk-${t.id}`}
            initial={t.inserted || t.kind === "EOF" ? { opacity: 0, scale: 0.4 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...FLY, delay: t.inserted ? 0.7 + i * 0.01 : 0, duration: 0.4 }}
            title={`sum.go:${t.line}:${t.col}`}
            className={`inline-flex items-baseline gap-1.5 rounded-[2px] border px-1.5 py-0.5 font-mono text-[11px] mono-tight @md:text-[12px] ${
              t.inserted ? "border-rose bg-rose/20 text-ink" : t.kind === "IDENT" || t.kind === "INT" ? "border-teal/60 bg-teal/10 text-ink" : "border-line-2 bg-substrate-3 text-ink"
            }`}
          >
            {t.kind === "IDENT" || t.kind === "INT" ? (
              <>
                <span className="text-[9px] text-ink-3">{t.kind}</span>
                {t.lit}
              </>
            ) : t.inserted ? (
              <>; <span className="text-[9px] text-rose">auto</span></>
            ) : (
              t.kind
            )}
          </motion.span>
        ))}
      </div>
      <p className="mt-4 font-mono text-[12px] text-ink-3 mono-tight">
        37 tokens · <span className="text-rose">6 semicolons inserted</span> at line ends after an identifier, literal, <code>)</code>, <code>]</code>, <code>{"}"}</code> or <code>return</code>
      </p>
    </div>
  );
}

/* ── parse / type-check / middle-end: tokens become the tree ── */
function TreeView({ phase }: { phase: "parse" | "types" | "middle" }) {
  const typed = phase !== "parse";
  const mid = phase === "middle";
  return (
    <div className="flex flex-col gap-4">
      <ul className="space-y-[5px]">
        {TREE.map((n, i) => (
          <li key={n.id} className="flex items-center gap-2" style={{ paddingLeft: `${n.depth * 1.25}rem` }}>
            {n.depth > 0 && <span aria-hidden className="h-px w-3 shrink-0 bg-ink-3/40" />}
            <motion.span
              layoutId={`tk-${n.tok}`}
              transition={{ ...FLY, delay: i * 0.015 }}
              className={`inline-block whitespace-nowrap rounded-[2px] border px-1.5 py-0.5 font-mono text-[11px] mono-tight @md:text-[12px] ${
                n.depth === 0 ? "border-copper bg-copper/15 text-ink" : "border-teal/60 bg-teal/10 text-ink"
              }`}
            >
              {n.label}
            </motion.span>
            {typed && n.type && (
              <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.04 }} className="truncate font-mono text-[11px] text-violet mono-tight @md:text-[12px]">
                {n.type}
              </motion.span>
            )}
            {mid && n.note && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="rounded-[2px] bg-teal/20 px-1.5 font-mono text-[11px] text-teal">
                {n.note}
              </motion.span>
            )}
            {mid && n.id === "fn" && <InlineMeter />}
          </li>
        ))}
      </ul>
      {mid && (
        <motion.pre initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-[3px] border border-line bg-[#0e1024] p-3 font-mono text-[11px] leading-[1.7] text-ink-2 mono-tight @md:text-[12px]">
          {MIDDLE.join("\n")}
        </motion.pre>
      )}
    </div>
  );
}

function InlineMeter() {
  return (
    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="ml-2 inline-flex items-center gap-2 font-mono text-[11px] text-ink-3">
      <span className="relative h-2 w-24 overflow-hidden rounded-[1px] bg-substrate-4">
        <motion.span initial={{ width: 0 }} animate={{ width: `${(16 / 80) * 100}%` }} transition={{ delay: 0.5, duration: 0.8, ease: E }} className="absolute inset-y-0 left-0 bg-copper" />
      </span>
      inline cost 16 / 80
    </motion.span>
  );
}

/* ── SSA: tree nodes become values; the optimizer deletes some ── */
function SsaView({ lines, build }: { lines: SsaLine[]; build?: boolean }) {
  return (
    <div className="font-mono text-[12px] leading-[1.75] mono-tight @md:text-[13px]">
      {lines.map((l, i) => {
        if (l.k === "block") return <div key={i} className="mt-2 text-copper first:mt-0">{l.text}</div>;
        if (l.k === "term") return <div key={i} className="pl-4 text-ink-3">{l.text}</div>;
        if (l.k === "gap") return <div key={i} className="mt-2 pl-4 text-ink-3/70">{l.text}</div>;
        if (l.k === "note") return (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-3 inline-block rounded-[2px] bg-teal/20 px-2 text-teal">
            {l.text}
          </motion.div>
        );
        const node = l.from ? TREE.find((n) => n.id === l.from) : null;
        return (
          <div key={i} className="flex items-center gap-2 pl-4">
            <motion.span layoutId={`v-${l.v}`} transition={FLY} className="inline-block whitespace-pre text-ink">
              <SsaText text={l.text} />
            </motion.span>
            {build && node && (
              <motion.span
                layoutId={`tk-${node.tok}`}
                transition={FLY}
                animate={{ opacity: 0.45 }}
                className="inline-block whitespace-nowrap rounded-[2px] border border-teal/50 bg-teal/10 px-1.5 text-[11px] text-ink"
              >
                {node.label}
              </motion.span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SsaText({ text }: { text: string }) {
  const m = text.match(/^(v\d+\s*=\s*)(\w+)(.*)$/);
  if (!m) return <>{text}</>;
  const [, lhs, op, rest] = m;
  const note = rest.match(/(.*?)(\s+\(.+\))$/);
  return (
    <>
      <span className="text-violet">{lhs}</span>
      <span className="text-copper">{op}</span>
      <span className="text-ink-2">{note ? note[1] : rest}</span>
      {note && <span className="text-ink-3">{note[2]}</span>}
    </>
  );
}

/* ── codegen: SSA values fold into instructions ── */
function GenView() {
  return (
    <div className="font-mono text-[12px] leading-[1.9] mono-tight @md:text-[13px]">
      {ASM.map((a, i) => (
        <div key={i} className="flex flex-wrap items-center gap-x-3">
          <span className="w-7 shrink-0 text-right text-ink-3">{a.label ?? ""}</span>
          <span className="whitespace-pre">
            {tokenizeAsm(a.text).map((t, j) => (
              <span key={j} className={TOK_CLASS[t.t]}>{t.v}</span>
            ))}
          </span>
          {a.from && (
            <span className="flex gap-1">
              {a.from.map((v) => (
                <motion.span
                  key={v}
                  layoutId={`v-${v}`}
                  transition={FLY}
                  animate={{ opacity: 0.55 }}
                  className="inline-block whitespace-nowrap rounded-[2px] border border-violet/50 bg-violet/10 px-1 text-[10px] leading-[1.5] text-violet"
                >
                  {v}
                </motion.span>
              ))}
            </span>
          )}
        </div>
      ))}
      <p className="mt-4 text-ink-3">16 SSA values → 9 instructions · every value lives in a register · no stack frame</p>
    </div>
  );
}

/* ── the bytes that run ── */
function BytesView() {
  const groups = [5, 2, 2, 2, 4, 3, 3, 2, 3, 1];
  const names = ["MOVQ", "XORL", "XORL", "JMP", "ADDQ", "INCQ", "CMPQ", "JGT", "MOVQ", "RET"];
  let k = 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-x-3 gap-y-3">
        {groups.map((n, gi) => {
          const bytes = MACHINE.slice(k, k + n);
          const start = k;
          k += n;
          return (
            <div key={gi} className="flex flex-col gap-1">
              <div className="flex gap-[3px]">
                {bytes.map((b, j) => (
                  <motion.span
                    key={j}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (start + j) * 0.04, ease: E }}
                    className={`flex h-8 w-8 items-center justify-center rounded-[2px] border font-mono text-[12px] @md:h-9 @md:w-9 ${gi === 4 ? "hatch-copper border-copper text-ink" : "border-line-2 bg-substrate-3 text-ink"}`}
                  >
                    {b}
                  </motion.span>
                ))}
              </div>
              <span className={`font-mono text-[10px] ${gi === 4 ? "text-copper" : "text-ink-3"}`}>{names[gi]}</span>
            </div>
          );
        })}
      </div>
      <div className="space-y-3">
        {[
          ["go build (optimized)", 27, 9],
          ["go build -gcflags='-N -l'", 136, 33],
        ].map(([l, b, n], i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)] gap-1 @md:grid-cols-[14rem_minmax(0,1fr)] @md:items-center @md:gap-3">
            <span className="font-mono text-[12px] text-ink-2 mono-tight">{l}</span>
            <div className="relative h-7">
              <motion.div initial={{ width: 0 }} animate={{ width: `${(Number(b) / 136) * 100}%` }} transition={{ delay: 0.6 + i * 0.2, duration: 0.9, ease: E }} className={`absolute inset-y-0 left-0 rounded-[2px] ${i ? "hatch-rose border border-rose/70" : "hatch-copper border border-copper"}`} />
              <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[12px] text-ink">{b} bytes · {n} instructions</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
