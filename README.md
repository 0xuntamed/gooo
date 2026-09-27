# The Go Machine

Go's compiler and runtime, under the microscope. The site is drawn as one silicon die with
thirteen functional blocks. Pick a block and the camera descends into it. Scrolling then steps
the real algorithm one clock at a time, and each chapter ends in a sandbox where you drive it
yourself.

Built with **Next.js 16** (App Router, static export), **Tailwind CSS 4** and **Motion**
(the library formerly called Framer Motion). There is no backend and no database.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000   (pass -- -p 3217 to pick a port)
npm run build      # static site in ./out, deployable anywhere
npx serve out      # preview the built site
```

## The thirteen blocks

| | Block | What moves |
|---|---|---|
| 01 | Arrays & slices | Headers slide over a shared array; `append` clobbers a neighbour; `growslice` copies to a new array; the capacity ladder is computed and checked against measured caps |
| 02 | Maps | A hash splits into h1/h2; `matchH2` is shown byte by byte; a false h2 match forces a probe; delete leaves *empty* or a *tombstone* by the real rule; the 7/8 grow rehashes every key |
| 03 | Strings & runes | UTF-8 decoded at the bit level; `range` walks byte offsets; `[]byte(s)` and `[]rune(s)` copy onto the heap. Type your own string |
| 04 | Struct layout | The compiler's layout rule runs field by field; padding appears; reordering flies fields to new offsets (24 → 16 B); cache-line view. Build your own struct |
| 05 | Compiler pipeline | Source tokens physically become tokens, tree nodes, SSA values, and finally one `ADDQ (AX)(CX*8), DX` |
| 06 | Escape analysis | The pointer-flow graph is walked; an escaping value moves from the stack frame to the heap |
| 07 | Interfaces & itabs | Two words, an itab with real field offsets, dispatch through `fun[0]`, concrete vs interface assertions, devirtualization |
| 08 | GMP scheduler | A scripted story, then the **live engine**: runnext, runqputslow, stealing half, syscall handoff, async preemption, the 61st tick |
| 09 | Goroutines & stacks | The prologue check, `morestack`, double-and-copy, pointer adjustment, and the `uintptr` that goes stale |
| 10 | defer · panic · recover | Open-coded `deferBits` vs `_defer` records (stack and heap); `gopanic`, `recover`, resuming at `deferreturn` |
| 11 | Channels & select | A literal ring buffer with `sendx`/`recvx` hands, parked sudogs, the direct stack-to-stack handoff, close, select |
| 12 | Allocator | mcache → mcentral → mheap, size classes, `allocBits`, the tiny allocator, large objects |
| 13 | Garbage collector | Tricolour marking, the hybrid write barrier (with a counterfactual showing the bug it prevents), sweep, GOGC pacing |

## The output is real

Everything was captured from **go1.26.2** on amd64, or read out of `$(go env GOROOT)/src`:

```bash
go build -gcflags='-m -m' sample.go     # inlining, escape analysis, devirtualization
go build -gcflags='-S'    sample.go     # final assembly
GOSSAFUNC=sum go build -o /dev/null sample.go   # SSA at every pass → ssa.html
GODEBUG=schedtrace=120,gctrace=1 go run tracer.go
go run data.go                          # cap growth, unsafe.Sizeof/Offsetof, aliasing
```

The slice growth numbers are measured, and the rule behind them is `nextslicecap` in
`runtime/slice.go` plus rounding up to an allocator size class. That chain reproduces every
observed capacity, e.g. `512 → 832 → class 6784 B → 848`. `sum` compiles to 27 bytes and
9 instructions with bounds checks eliminated, or 136 bytes under `-N -l`.

Wherever something is scaled down or illustrative, the page says so with a dashed line:

- the local run queue holds **6** here (256 in the runtime), and sysmon counts ticks instead
  of 20 µs / 10 ms;
- map hashes are FNV-1a so the picture is repeatable (the runtime uses a random per-map seed);
- stack addresses, GC object sizes and `gctrace` timings are illustrative. The formats,
  phases and rules are real;
- stack sizes are linux/amd64's (on Windows goroutines start at 8 KB because of `stackSystem`).

## Layout

```
app/                 routes: the die (/) and one static page per block (/[slug])
components/die/      the die: floorplan, block glyphs, layer patterns, live scheduler
components/          shared stage frame, scrolly stepper, sandbox, code pane, controls
chapters/<slug>/     each block's stage (the animated drawing) and its story + sandbox
lib/engines/         pure simulations: slices, maps, strings, structs, pipeline data,
                     escape, sched, stack, defer, chan, alloc, gc
lib/chapters.ts      the registry: titles, packages, positions on both die floorplans
legacy/              the original single-file vanilla-JS version, kept for reference
PRODUCT.md           who it is for and what must stay true
DESIGN.md            the visual system ("The Die Shot"): tokens, layers, rules
```

Every stage renders a state produced by an engine in `lib/engines`, so the scroll story and
the sandbox run the same code. To add a block: add it to `lib/chapters.ts` (with a rectangle
on each floorplan), draw its glyph in `components/die/glyphs.tsx`, write an engine, a stage,
and a chapter body, and register it in `chapters/index.ts`.

## Accessibility

Every simulation is operable by keyboard, the die's blocks are links, and
`prefers-reduced-motion` is honoured site-wide: steps still read as discrete states without
animation.
