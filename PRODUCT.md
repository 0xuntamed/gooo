# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + Tailwind CSS + Motion (Framer Motion), pinned by the user. No database, no backend: a static site. Deploy target not specified; keep it static-export compatible so it can go anywhere.

## Users

Working Go developers who already write Go daily and want to understand what happens underneath it: the compiler, the scheduler, memory, and the garbage collector. They know the syntax. What they lack is a mental model of the mechanism, e.g. why an `append` aliased two slices, why a value escaped, or why a goroutine didn't get scheduled.

## Product Purpose

The Go Machine is an interactive explanation of how Go actually works: the compiler pipeline and the runtime. Readers operate each mechanism instead of reading about it. Success means a reader leaves a chapter able to predict the runtime's behaviour in their own code, e.g. "this will escape", "this append will reallocate", "this syscall will hand off the P".

## Positioning

Nothing here was written from memory. Every compiler output, growth sequence, struct offset and assembly listing was captured from go1.26.2, or read out of `$(go env GOROOT)/src`. The simulations follow the real runtime algorithms (nextslicecap, runqputslow, the 61st-tick global queue check, stealing half a victim's queue, the hybrid write barrier, `live × (1 + GOGC/100)`). Most Go explainers are prose and static diagrams. This one lets the reader drive the real algorithm.

## Operating Context

Read at a desk, often alongside an editor and a terminal running the same `go build -gcflags` commands the site quotes. Readers arrive at a specific chapter from a search or a link, and some return to replay one mechanism.

## Capabilities and Constraints

- Thirteen chapters in five groups:
  - Data structures: 01 Arrays & slices, 02 Maps (Swiss tables), 03 Strings & runes, 04 Struct layout.
  - Compile time: 05 Compiler pipeline, 06 Escape analysis, 07 Interfaces & itabs.
  - Run time: 08 GMP scheduler (live simulation), 09 Goroutines & stacks, 10 defer · panic · recover.
  - Communication: 11 Channels & select.
  - Memory: 12 Allocator, 13 Garbage collector.
- Structure (user-confirmed): scroll-driven chapters. Scrolling advances the explanation step by step, and each chapter ends in a free sandbox.
- Two deliberate scale-downs must stay disclosed: the local run queue holds 6 here (256 in the real runtime), and sysmon thresholds are in ticks rather than 20 µs / 10 ms.
- Existing trace console formats follow the real `GODEBUG=schedtrace` and `gctrace` line formats.

## Brand Commitments

- Name: "The Go Machine".
- Fidelity is the brand: real captured output is never replaced with invented or rounded numbers.
- Motion must explain a mechanism. Decorative motion (floating shapes, parallax for its own sake) is out (user-confirmed).
- Not cartoonish: no mascots or toy-like bouncing that makes the internals feel less real (user-confirmed).

## Evidence on Hand

- Real compiler output and measurements already in the legacy source: `js/data.js`, `js/compile.js`, `js/schedule.js`, `js/memory.js` (tokens, AST, types2, `-m -m` escape chains, SSA before/after opt, `-S` assembly of `sum` at 27 bytes / 9 instructions, slice growth sequences, struct offsets, the size-class table, and `matchH2`).
- README.md documents the capture commands and the fidelity notes.
- No testimonials, users, or benchmarks exist. Do not fabricate them.

## Product Principles

1. Operate, don't read: every mechanism is something the reader drives.
2. Motion is the explanation: each animation maps one-to-one onto a real runtime or compiler step.
3. Real over plausible: captured output beats a cleaner-looking invented example.
4. Predictive understanding is the goal: a chapter succeeds when the reader can call the outcome before pressing the button.
5. Disclose every simplification where it happens.

## Accessibility & Inclusion

Respect `prefers-reduced-motion`: steps must still be readable as discrete states without animation. Every simulation must be operable by keyboard.
