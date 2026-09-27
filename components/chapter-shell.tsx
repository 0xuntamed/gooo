"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GLYPHS } from "@/components/die/glyphs";
import { BlockLabel, MiniDie } from "@/components/die/die";
import { LiveSched } from "@/components/die/live-sched";
import { Arrow } from "@/components/home/hero";
import { SiteFooter } from "@/components/site-footer";
import { StageFrame } from "@/components/scrolly";
import { TraceConsole, type TraceLine } from "@/components/ui";
import { bySlug, CHAPTERS, GROUPS, neighbours } from "@/lib/chapters";

/* ── top bar ── */

export function TopBar({ slug }: { slug?: string }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const c = slug ? bySlug(slug) : null;
  const { prev, next } = slug ? neighbours(slug) : { prev: null, next: null };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => { if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[52px] border-b border-line-2 bg-substrate">
      <div className="mx-auto flex h-full max-w-[1680px] items-center gap-4 px-4 md:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="The Go Machine: back to the die">
          <ChipMark />
          <span className="marking hidden text-[13px] text-ink sm:inline">The Go Machine</span>
        </Link>
        {c && (
          <div className="flex min-w-0 items-baseline gap-2.5 border-l border-line-2 pl-4">
            <span className="tnum shrink-0 font-mono text-[12px] text-copper">{String(c.n).padStart(2, "0")}</span>
            <span className="truncate font-bold text-[14px] text-ink">{c.title}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1" ref={panel}>
          {prev && (
            <Link href={`/${prev.slug}/`} className="hidden h-9 items-center px-2.5 text-[14px] text-ink-3 transition-colors hover:text-ink md:inline-flex" title={`Previous: ${prev.title}`}>
              <Arrow className="rotate-180" />
            </Link>
          )}
          {next && (
            <Link href={`/${next.slug}/`} className="hidden h-9 items-center px-2.5 text-[14px] text-ink-3 transition-colors hover:text-ink md:inline-flex" title={`Next: ${next.title}`}>
              <Arrow />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="floorplan-menu"
            className="inline-flex h-9 items-center gap-2 rounded-[3px] border border-line-2 px-3 text-[13px] font-bold text-ink transition-colors hover:border-teal/70"
          >
            <FloorplanIcon />
            Floorplan
          </button>
          <AnimatePresence>
            {open && (
              <motion.div
                id="floorplan-menu"
                initial={{ opacity: 0, y: -6, clipPath: "inset(0 0 100% 0)" }}
                animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
                exit={{ opacity: 0, y: -4, clipPath: "inset(0 0 100% 0)" }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-4 top-[58px] w-[min(560px,calc(100vw-2rem))] rounded-[4px] border border-line-2 bg-substrate-2 p-4 shadow-[0_18px_40px_-18px_#000c] md:right-8"
              >
                <MiniDie active={slug} onPick={() => setOpen(false)} />
                <FloorplanList active={slug} onPick={() => setOpen(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

function FloorplanList({ active, onPick }: { active?: string; onPick: () => void }) {
  const groups = ["data", "compile", "run", "comm", "memory"] as const;
  return (
    <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g} className="mt-3">
          <div className="mb-1 text-[13px] font-bold text-ink-3">{GROUPS[g].name}</div>
          <ul>
            {CHAPTERS
              .filter((c) => c.group === g)
              .map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/${c.slug}/`}
                    onClick={onPick}
                    aria-current={c.slug === active ? "page" : undefined}
                    className={`flex items-baseline gap-2.5 py-1 text-[14px] transition-colors hover:text-copper ${c.slug === active ? "text-copper" : "text-ink"}`}
                  >
                    <span className="tnum font-mono text-[11px] text-ink-3">{String(c.n).padStart(2, "0")}</span>
                    {c.title}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ChipMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="shrink-0">
      <rect x="5" y="5" width="16" height="16" fill="url(#p-copper)" stroke="#e78b52" strokeWidth="1.2" />
      <g stroke="#c4a060" strokeWidth="1.2">
        {[8.5, 13, 17.5].map((v) => (
          <g key={v}>
            <path d={`M${v} 1V4.5`} /><path d={`M${v} 21.5V25`} /><path d={`M1 ${v}H4.5`} /><path d={`M21.5 ${v}H25`} />
          </g>
        ))}
      </g>
    </svg>
  );
}

function FloorplanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="0.75" y="0.75" width="12.5" height="12.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M0.75 5.5H13.25M5.5 5.5V13.25M9 0.75V5.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/* ── chapter head: where the descent from the die lands ── */

export function ChapterHead({ slug }: { slug: string }) {
  const c = bySlug(slug)!;
  const Glyph = GLYPHS[slug];
  const w = 800, h = Math.max(300, Math.round((c.wide.h / c.wide.w) * 800));
  const hh = Math.min(h, 440);
  return (
    <section className="relative mx-auto grid max-w-[1680px] gap-10 px-4 pb-16 pt-[88px] md:px-8 md:pt-[108px] lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-center lg:gap-12 xl:gap-16">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      >
<h1 className="display text-[2.5rem] text-ink sm:text-[3.5rem] xl:text-[4.25rem]">
          <span className="mr-3 align-[0.35em] font-mono text-[0.32em] font-normal text-copper tnum">{String(c.n).padStart(2, "0")}</span>
          {c.title}
        </h1>
        <p className="mt-5 max-w-[30ch] text-[1.25rem] leading-snug text-ink-2 md:text-[1.5rem]">{c.sub}</p>
        <dl className="mt-8 grid max-w-[34rem] grid-cols-[auto_1fr] gap-x-5 gap-y-2 border-t border-line pt-5 text-[14px]">
          <dt className="text-ink-3">Region</dt>
          <dd className="text-ink">{GROUPS[c.group].name}</dd>
          <dt className="text-ink-3">Drawn as</dt>
          <dd className="text-ink">{c.block}</dd>
          <dt className="text-ink-3">Source</dt>
          <dd className="font-mono text-[13px] text-ink mono-tight">{c.pkg}</dd>
          <dt className="text-ink-3">Try it</dt>
          <dd className="font-mono text-[13px] text-ink mono-tight">{c.cmd}</dd>
        </dl>
        <p className="mt-8 flex items-center gap-3 text-[14px] text-ink-3">
          <ScrollCue /> Scroll to step the clock. Each step is one state of the machine.
        </p>
      </motion.div>

      <motion.figure
        initial={{ opacity: 0, scale: 1.14, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <div className="relative overflow-hidden rounded-[4px] border border-line-2 bg-[#151833]">
          <svg viewBox={`0 0 ${w} ${hh}`} className="block h-auto w-full" role="img" aria-label={`${c.title}, drawn as ${c.block}`}>
            <rect width={w} height={hh} fill="url(#p-rows)" />
            <g transform={`translate(24 24)`}>
              <rect width={w - 48} height={hh - 48} fill="#171a35" stroke="#e78b52" strokeWidth="2" />
              <Glyph w={w - 48} h={hh - 48} s={1.55} short={false} />
              {slug === "scheduler" && <LiveSched r={{ x: 0, y: 0, w: w - 48, h: hh - 48 }} s={1.55} />}
              <BlockLabel n={c.n} name={c.die} pkg={c.pkg} w={w - 48} h={hh - 48} s={1.55} short={false} on />
            </g>
          </svg>
        </div>
        <figcaption className="mt-3 flex items-center justify-between gap-4 font-mono text-[12px] text-ink-3 mono-tight">
          <span>block {String(c.n).padStart(2, "0")} · {c.block}</span>
          <span className="hidden truncate sm:inline">{c.pkg.split(" · ")[0]}</span>
        </figcaption>
      </motion.figure>
    </section>
  );
}

function ScrollCue() {
  return (
    <svg width="14" height="22" viewBox="0 0 14 22" fill="none" aria-hidden>
      <rect x="0.75" y="0.75" width="12.5" height="20.5" rx="6.25" stroke="currentColor" strokeWidth="1.2" />
      <motion.rect
        x="6" y="5" width="2" height="4" rx="1" fill="#e78b52"
        animate={{ y: [5, 10, 5] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

/* ── sandbox: the same stage, now driven by the reader ── */

export function Sandbox({
  slug, intro, controls, stage, readout, trace, hint, onClearTrace,
}: {
  slug: string; intro: ReactNode; controls: ReactNode; stage: ReactNode; readout: ReactNode;
  trace?: TraceLine[]; hint?: string; onClearTrace?: () => void;
}) {
  const c = bySlug(slug)!;
  return (
    <section id="sandbox" className="mx-auto max-w-[1680px] scroll-mt-16 px-4 pt-20 md:px-8 md:pt-28">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
        <div>
          <h2 className="display text-[2rem] text-ink md:text-[2.5rem]">Drive it yourself</h2>
          <div className="prose mt-4 max-w-[34rem] text-ink-2">{intro}</div>
        </div>
        <div className="hidden lg:block" />
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-2">{controls}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
        <div className="h-[min(640px,78svh)] min-h-[420px]">
          <StageFrame block={c.block} pkg={c.pkg}>{stage}</StageFrame>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-[4px] border border-line-2 bg-substrate-2 p-5">
            <h3 className="mb-3 text-[14px] font-bold text-ink-2">What just happened</h3>
            {readout}
          </div>
          {trace && <TraceConsole lines={trace} hint={hint ?? c.cmd} onClear={onClearTrace} />}
        </div>
      </div>
    </section>
  );
}

/* ── closing: the route to the next block ── */

export function ChapterClose({ slug, notes }: { slug: string; notes?: ReactNode }) {
  const { next, prev } = neighbours(slug);
  return (
    <>
      {notes && (
        <section className="mx-auto max-w-[1680px] px-4 pt-24 md:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
            <div>
              <h2 className="display text-[1.5rem] text-ink">Fidelity notes</h2>
              <div className="prose mt-3 text-[15px] text-ink-2">{notes}</div>
            </div>
          </div>
        </section>
      )}
      <nav aria-label="Next block" className="mx-auto mt-24 max-w-[1680px] px-4 md:px-8">
        <div className="grid border-y border-line-2 md:grid-cols-2">
          {prev ? (
            <Link href={`/${prev.slug}/`} className="group flex flex-col gap-1 border-line-2 py-8 transition-colors hover:bg-substrate-2 md:border-r md:pr-8">
              <span className="flex items-center gap-2 font-mono text-[12px] text-ink-3"><Arrow className="rotate-180" /> block {String(prev.n).padStart(2, "0")}</span>
              <span className="display text-[1.5rem] text-ink-2 transition-colors group-hover:text-ink">{prev.title}</span>
            </Link>
          ) : (
            <Link href="/" className="group flex flex-col gap-1 border-line-2 py-8 transition-colors hover:bg-substrate-2 md:border-r md:pr-8">
              <span className="flex items-center gap-2 font-mono text-[12px] text-ink-3"><Arrow className="rotate-180" /> the die</span>
              <span className="display text-[1.5rem] text-ink-2 transition-colors group-hover:text-ink">All thirteen blocks</span>
            </Link>
          )}
          {next ? (
            <Link href={`/${next.slug}/`} className="group flex flex-col gap-1 border-t border-line-2 py-8 transition-colors hover:bg-substrate-2 md:items-end md:border-t-0 md:pl-8 md:text-right">
              <span className="flex items-center gap-2 font-mono text-[12px] text-copper">block {String(next.n).padStart(2, "0")} <Arrow /></span>
              <span className="display text-[2rem] text-ink transition-colors group-hover:text-copper md:text-[2.5rem]">{next.title}</span>
              <span className="max-w-[40ch] text-[15px] text-ink-2">{next.sub}</span>
            </Link>
          ) : (
            <Link href="/" className="group flex flex-col gap-1 border-t border-line-2 py-8 transition-colors hover:bg-substrate-2 md:items-end md:border-t-0 md:pl-8 md:text-right">
              <span className="flex items-center gap-2 font-mono text-[12px] text-copper">back to the die <Arrow /></span>
              <span className="display text-[2rem] text-ink transition-colors group-hover:text-copper md:text-[2.5rem]">You have seen the whole machine</span>
            </Link>
          )}
        </div>
      </nav>
      <SiteFooter />
    </>
  );
}
