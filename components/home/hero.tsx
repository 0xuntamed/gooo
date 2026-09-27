"use client";

import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Die } from "@/components/die/die";
import { LiveSched } from "@/components/die/live-sched";
import { bySlug, CHAPTERS, GROUPS, WIRES } from "@/lib/chapters";
import { LayerKey } from "./layer-key";

export function Hero() {
  const [inspect, setInspect] = useState<string | null>(null);
  const [descending, setDescending] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const reduce = useReducedMotion();

  const pick = async (slug: string, el: SVGElement) => {
    if (descending) return;
    setDescending(slug);
    setInspect(slug);
    router.prefetch(`/${slug}/`);
    const wrap = stage.current;
    if (!wrap || reduce) { router.push(`/${slug}/`); return; }
    const box = el.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const k = Math.min((vw * 0.9) / box.width, (vh * 0.78) / box.height, 7);
    wrap.style.transformOrigin = `${box.left + box.width / 2 - w.left}px ${box.top + box.height / 2 - w.top}px`;
    await animate(
      wrap,
      { x: vw / 2 - (box.left + box.width / 2), y: vh / 2 - (box.top + box.height / 2), scale: k },
      { duration: 0.85, ease: [0.76, 0, 0.18, 1] },
    );
    router.push(`/${slug}/`);
  };

  const cur = inspect ? bySlug(inspect) : null;

  return (
    <section className="relative flex min-h-svh flex-col overflow-hidden">
      <motion.div
        animate={{ opacity: descending ? 0 : 1 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 flex flex-col gap-5 px-4 pb-4 pt-6 md:px-8 md:pt-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-8">
          <h1 className="marking text-[2.5rem] text-ink sm:text-[3.5rem] xl:text-[4.25rem]">
            The Go
            <br />
            Machine
          </h1>
          <p className="max-w-[40ch] pb-1 text-[16px] leading-snug text-ink-2 md:text-[17px]">
            Go&apos;s compiler and runtime, under the microscope. Thirteen blocks you step through
            one clock at a time, then drive yourself. Every number is captured from{" "}
            <code className="font-mono text-[0.85em] text-copper mono-tight">go1.26.2</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:pb-1.5">
          <Link
            href="/slices/"
            className="group inline-flex h-11 items-center gap-3 rounded-[3px] border border-copper bg-copper/15 px-4 font-bold text-ink transition-colors duration-200 hover:bg-copper/25"
          >
            <span aria-hidden className="size-2 rounded-[1px] bg-copper" />
            Start at block 01
            <Arrow />
          </Link>
          <a href="#floorplan" className="inline-flex h-11 items-center px-2 text-[15px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-teal">
            See all thirteen
          </a>
        </div>
      </motion.div>

      <div className="relative flex flex-1 flex-col gap-4 px-4 pb-6 md:px-8 lg:flex-row lg:items-stretch lg:gap-8">
        <div className="relative min-w-0 flex-1 lg:flex lg:items-center">
          <div ref={stage} className="relative mx-auto w-full will-change-transform lg:max-h-[calc(100svh-190px)] lg:max-w-[calc((100svh-190px)*1.6)]" onMouseLeave={() => !descending && setInspect(null)}>
            <Die
              layout="wide"
              className="hidden md:block"
              inspect={inspect}
              onInspect={(s) => !descending && setInspect(s)}
              onPick={pick}
              overlay={(slug, r, s) => (slug === "scheduler" ? <LiveSched r={r} s={s} /> : null)}
            />
            <Die
              layout="tall"
              className="md:hidden"
              inspect={inspect}
              onInspect={(s) => !descending && setInspect(s)}
              onPick={pick}
              overlay={(slug, r, s) => (slug === "scheduler" ? <LiveSched r={r} s={s} /> : null)}
            />
          </div>
        </div>

        <motion.aside
          animate={{ opacity: descending ? 0 : 1 }}
          transition={{ duration: 0.3 }}
          aria-live="polite"
          className="relative flex shrink-0 flex-col rounded-[4px] border border-line-2 bg-substrate-2 p-5 lg:w-[320px] xl:w-[360px]"
        >
          <AnimatePresence mode="wait" initial={false}>
            {cur ? (
              <motion.div
                key={cur.slug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-full flex-col"
              >
                <h2 className="display text-[1.5rem] text-ink">
                  <span className="mr-2 font-mono text-[0.62em] font-normal text-copper tnum">{String(cur.n).padStart(2, "0")}</span>
                  {cur.title}
                </h2>
                <p className="mt-2 text-[15px] leading-snug text-ink-2">{cur.sub}</p>
                <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
                  <dt className="text-ink-3">Region</dt>
                  <dd className="text-ink">{GROUPS[cur.group].name}</dd>
                  <dt className="text-ink-3">Drawn as</dt>
                  <dd className="text-ink">{cur.block}</dd>
                  <dt className="text-ink-3">Source</dt>
                  <dd className="break-words font-mono text-[12px] text-ink mono-tight">{cur.pkg}</dd>
                </dl>
                <h3 className="label mt-5 text-ink-3">Wired to</h3>
                <ul className="mt-2 space-y-1.5 text-[14px]">
                  {WIRES.filter((w) => w.a === cur.slug || w.b === cur.slug).map((w) => {
                    const other = bySlug(w.a === cur.slug ? w.b : w.a)!;
                    return (
                      <li key={w.a + w.b} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-ink">{other.title}</span>
                        <span className="font-mono text-[12px] text-teal mono-tight">{w.via}</span>
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href={`/${cur.slug}/`}
                  onClick={(e) => {
                    const el = Array.from(document.querySelectorAll<SVGElement>(`svg a[href="/${cur.slug}/"]`)).find((n) => n.getBoundingClientRect().width > 0);
                    if (el && !e.metaKey && !e.ctrlKey) { e.preventDefault(); pick(cur.slug, el); }
                  }}
                  className="mt-auto inline-flex h-10 items-center gap-2.5 self-start pt-6 font-bold text-copper transition-colors hover:text-ink"
                >
                  Descend into block {String(cur.n).padStart(2, "0")} <Arrow />
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="display text-[1.5rem] text-ink">Inspect a block</h2>
                <p className="mt-2 text-[15px] leading-snug text-ink-2">
                  Point at any block to see what it is and which runtime functions wire it to the rest
                  of the machine. Click to descend into it. The scheduler is already running.
                </p>
                <LayerKey className="mt-5" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      </div>
      <p className="sr-only">
        {CHAPTERS.length} chapters: {CHAPTERS.map((c) => c.title).join(", ")}.
      </p>
    </section>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden className={`transition-transform duration-200 group-hover:translate-x-0.5 ${className}`}>
      <path d="M0 5H14M10 1L14 5L10 9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
