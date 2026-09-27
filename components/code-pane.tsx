"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { TOK_CLASS, tokenizeAsm, tokenizeGo } from "@/lib/highlight";

type Props = {
  code: string;
  lang?: "go" | "asm" | "plain";
  /** 1-based line(s) to light; everything else dims */
  lit?: number | number[] | null;
  /** lines drawn struck through (e.g. SSA values the optimizer removed) */
  gone?: number[];
  caption?: ReactNode;
  tag?: ReactNode;
  className?: string;
  size?: "sm" | "md";
  numbers?: boolean;
};

export function CodePane({ code, lang = "go", lit, gone, caption, tag, className = "", size = "md", numbers = true }: Props) {
  const id = useId();
  const lines = code.split("\n");
  const litSet = new Set(lit == null ? [] : Array.isArray(lit) ? lit : [lit]);
  const goneSet = new Set(gone ?? []);
  const firstLit = litSet.size ? Math.min(...litSet) : -1;
  const hasLit = litSet.size > 0;

  return (
    <figure className={`flex min-h-0 flex-col overflow-hidden rounded-[3px] border border-line bg-[#0e1024] ${className}`}>
      {(caption || tag) && (
        <figcaption className="flex items-center gap-3 border-b border-line px-3 py-2">
          <span className="label truncate text-ink-3">{caption}</span>
          {tag && <span className="ml-auto shrink-0">{tag}</span>}
        </figcaption>
      )}
      <pre
        className={`min-h-0 flex-1 overflow-auto py-2 font-mono mono-tight [tab-size:4] ${
          size === "sm" ? "text-[12px] leading-[1.65]" : "text-[13px] leading-[1.7]"
        }`}
      >
        {lines.map((line, i) => {
          const n = i + 1;
          const on = litSet.has(n);
          const toks = lang === "go" ? tokenizeGo(line) : lang === "asm" ? tokenizeAsm(line) : [{ t: "id" as const, v: line }];
          return (
            <div key={i} className="relative flex pr-4">
              {on && n === firstLit && (
                <motion.span
                  layoutId={`lit-${id}`}
                  aria-hidden
                  className="absolute inset-y-0 left-0 right-0 bg-teal/[0.13]"
                  transition={{ type: "spring", stiffness: 420, damping: 38 }}
                />
              )}
              {on && n !== firstLit && <span aria-hidden className="absolute inset-0 bg-teal/[0.13]" />}
              {numbers && (
                <span
                  aria-hidden
                  className={`relative w-9 shrink-0 select-none pr-3 text-right tnum transition-colors duration-300 ${
                    on ? "text-copper" : "text-ink-3/50"
                  }`}
                >
                  {n}
                </span>
              )}
              <code
                className={`relative whitespace-pre transition-opacity duration-300 ${!numbers ? "pl-3" : ""} ${
                  hasLit && !on ? "opacity-45" : "opacity-100"
                } ${goneSet.has(n) ? "line-through decoration-rose/80 opacity-40" : ""}`}
              >
                {toks.map((t, j) => (
                  <span key={j} className={TOK_CLASS[t.t]}>{t.v}</span>
                ))}
                {line === "" && " "}
              </code>
            </div>
          );
        })}
      </pre>
    </figure>
  );
}
