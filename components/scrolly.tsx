"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type Step = { id: string; title: string; body: ReactNode };

type Props = {
  steps: Step[];
  /** block name printed on the stage frame, e.g. "SRAM row + header register" */
  block: string;
  pkg: string;
  children: (active: number) => ReactNode;
};

/**
 * Scroll advances the machine in discrete, named clock steps. The stage never
 * rests between two states: each step is a whole state, and the stage animates
 * from one to the next.
 */
export function Scrolly({ steps, block, pkg, children }: Props) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    let io: IntersectionObserver | null = null;
    const setup = () => {
      io?.disconnect();
      // desktop: the step crossing the middle of the viewport is live.
      // mobile: the stage owns the top half, so read at three-quarters.
      const rootMargin = mq.matches ? "-49% 0px -49% 0px" : "-74% 0px -24% 0px";
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
          }
        },
        { rootMargin },
      );
      refs.current.forEach((el) => el && io!.observe(el));
    };
    setup();
    mq.addEventListener("change", setup);
    return () => {
      io?.disconnect();
      mq.removeEventListener("change", setup);
    };
  }, [steps.length]);

  const jump = (i: number) => {
    const el = refs.current[i];
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDesk = window.matchMedia("(min-width: 1024px)").matches;
    const r = el.getBoundingClientRect();
    const target = window.scrollY + r.top - (isDesk ? window.innerHeight / 2 - Math.min(r.height, 300) / 2 : window.innerHeight * 0.6);
    window.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section className="relative mx-auto max-w-[1680px] px-4 md:px-8 lg:grid lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
      {/* the stage: sticky; top half on phones, right column on desktop */}
      <div className="sticky top-[52px] z-20 -mx-4 h-[52svh] bg-substrate px-4 pb-3 pt-3 md:-mx-8 md:px-8 lg:order-2 lg:mx-0 lg:h-[calc(100svh-52px)] lg:self-start lg:px-0 lg:py-7">
        <StageFrame steps={steps} active={active} onJump={jump} block={block} pkg={pkg}>
          {children(active)}
        </StageFrame>
      </div>

      <div className="relative lg:order-1">
        {steps.map((s, i) => (
          <article
            key={s.id}
            ref={(el) => { refs.current[i] = el; }}
            data-step={i}
            className="flex min-h-[64svh] items-start py-[6svh] first:pt-[4svh] last:min-h-[80svh] lg:min-h-[92svh] lg:items-center lg:py-[10svh] lg:last:min-h-[100svh]"
          >
            <div
              className={`transition-[opacity,filter] duration-500 ease-[var(--ease-expo)] ${
                active === i ? "opacity-100" : "opacity-[0.32] lg:blur-[0.3px]"
              }`}
            >
              <button
                type="button"
                onClick={() => jump(i)}
                className="mb-3 flex items-baseline gap-3 text-left"
              >
                <span className={`tnum font-mono text-[12px] transition-colors ${active === i ? "text-copper" : "text-ink-3"}`}>
                  T{String(i).padStart(2, "0")}
                </span>
                <h3 className="display text-[1.5rem] leading-tight text-ink">{s.title}</h3>
              </button>
              <div className="prose max-w-[34rem] text-ink-2">{s.body}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ── the stage frame: the block, under the microscope ── */

export function StageFrame({
  steps, active, onJump, block, pkg, children,
}: {
  steps?: Step[]; active?: number; onJump?: (i: number) => void; block: string; pkg: string; children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {steps && active !== undefined && (
        <div className="mb-2 flex min-w-0 items-center gap-3 lg:mb-3">
          <span className="label hidden text-ink-3 sm:inline">clock</span>
          <div className="flex items-center gap-[3px]" role="tablist" aria-label="Steps">
            {steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Step ${i}: ${s.title}`}
                onClick={() => onJump?.(i)}
                className="group relative grid h-5 w-3 place-items-center sm:w-3.5"
              >
                <span
                  className={`block h-3 w-full rounded-[1px] border transition-colors duration-300 ${
                    i === active
                      ? "border-copper bg-copper"
                      : i < active
                        ? "border-teal/60 bg-teal/35"
                        : "border-line-2 bg-transparent group-hover:border-ink-3"
                  }`}
                />
              </button>
            ))}
          </div>
          <motion.span
            key={active}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0 truncate font-mono text-[12px] text-ink-2 mono-tight"
          >
            <span className="text-copper">T{String(active).padStart(2, "0")}</span> {steps[active]?.title}
          </motion.span>
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[4px] border border-line-2 bg-substrate-2 substrate-rows">
        <CropMarks />
        <div className="absolute inset-0 overflow-auto p-3 md:p-5">{children}</div>
        <div className="pointer-events-none absolute bottom-1.5 right-3 hidden font-mono text-[10px] text-ink-3/70 mono-tight md:block">
          {block} · {pkg}
        </div>
      </div>
    </div>
  );
}

function CropMarks() {
  const c = "pointer-events-none absolute size-2.5 border-ink-3/60";
  return (
    <>
      <span aria-hidden className={`${c} left-1.5 top-1.5 border-l border-t`} />
      <span aria-hidden className={`${c} right-1.5 top-1.5 border-r border-t`} />
      <span aria-hidden className={`${c} bottom-1.5 left-1.5 border-b border-l`} />
      <span aria-hidden className={`${c} bottom-1.5 right-1.5 border-b border-r`} />
    </>
  );
}
