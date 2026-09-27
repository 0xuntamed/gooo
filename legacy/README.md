# The Go Machine

An interactive visualisation of how Go actually works — the compiler pipeline and the
runtime, built as something you operate rather than read.

Thirteen modules, grouped by when they happen:

| | Module | What it does |
|---|---|---|
| 01 | Arrays & slices | The 24-byte header, aliasing, three-index slicing, and real `append` growth |
| 02 | Maps | Swiss tables — groups of 8, control words, the branch-free probe, tombstones |
| 03 | Strings & runes | Immutable bytes, UTF-8 decoding, what `s[1]` really gives you |
| 04 | Struct layout | Alignment, padding, and the same fields in 16 bytes instead of 24 |
| 05 | Compiler pipeline | Steps one function through scan → parse → type-check → middle-end → SSA build → SSA opt → codegen |
| 06 | Escape analysis | Why a value lands on the stack or the heap, with the real `-m` reasoning chain |
| 07 | Interfaces & itabs | The two-word interface value, the method table, dispatch and devirtualization |
| 08 | GMP scheduler | **Live simulation** — run queues, work stealing, syscall handoff, sysmon preemption |
| 09 | Goroutines & stacks | 2 KB stacks, the `stackguard0` check, `morestack` and pointer-adjusting copies |
| 10 | defer · panic · recover | Open-coded vs heap `_defer`, and how one defer in a loop deoptimizes the function |
| 11 | Channels & select | `hchan`'s ring buffer, `sudog` wait queues, direct handoff |
| 12 | Allocator | mcache → mcentral → mheap, size classes, the tiny allocator |
| 13 | Garbage collector | Tricolour marking with a running mutator, the hybrid write barrier, GOGC pacing |

## The output is real

Nothing here was written from memory. Everything was captured from **go1.26.2** on this
machine, or read out of `$(go env GOROOT)/src`:

```bash
go build -gcflags='-m -m' sample.go     # inlining, escape analysis, devirtualization
go build -gcflags='-S'    sample.go     # final assembly
GOSSAFUNC=sum go build -o /dev/null sample.go   # SSA at every pass → ssa.html
GODEBUG=schedtrace=120,gctrace=1 go run tracer.go
go run data.go                          # cap growth, unsafe.Sizeof/Offsetof, aliasing
```

The slice growth numbers are measured, and the rule behind them is
`nextslicecap` in `runtime/slice.go`: double below 256, then
`newcap += (newcap + 768) >> 2`, then round up to an allocator size class. That chain
reproduces the observed caps exactly — `512 → 832 → class 6784 B → 848`, then
`848 → 1252 → 10240 B → 1280`.

One measurement worth knowing about: a slice that never escapes starts life in a
**32-byte stack buffer**, so the same append loop shows a different early sequence
depending on whether the result escapes. Both are shown.

`sum` compiles to 27 bytes and 9 instructions with bounds checks eliminated — and 136
bytes under `-N -l`. Both are in the codegen phase.

The runtime trace console at the bottom follows the real `GODEBUG=schedtrace` and
`gctrace` line formats.

## Running it

Any static server works:

```bash
python -m http.server 8099
```

Then open <http://localhost:8099>.

## Building the single-file version

```bash
node build.mjs
```

Inlines the CSS and all four JS files into `dist/go-machine.html` — one self-contained
page with no build step and no dependencies.

## Layout

```
index.html        markup: app shell + all nine panels
styles.css        design tokens, light/dark, every component
js/core.js        module registry, transport, router, trace console
js/data.js        01 slices · 02 maps · 03 strings · 04 struct layout
js/compile.js     05 pipeline · 06 escape · 07 interfaces · 10 defer
js/schedule.js    08 GMP scheduler · 09 stacks
js/memory.js      11 channels · 12 allocator · 13 GC
build.mjs         → dist/go-machine.html
```

Adding a module means calling `GoMachine.register(id, { title, sub, init, enter, tick })`
and adding a `<section class="panel" data-mod="id">` plus a rail button. A module with a
`tick` gets driven by the shared transport (play/pause/step/speed); one without is static.

## Keyboard

`Space` play/pause · `.` step one tick · `1`–`9` jump to a module

## Notes on fidelity

Two things are deliberately scaled down so the mechanism is visible:

- the local run queue holds **6** here, 256 in the real runtime, so the overflow into the
  global queue actually happens on screen;
- sysmon's thresholds are in ticks rather than 20 µs / 10 ms.

Everything else — the 61st-tick global queue check, stealing half a victim's queue,
`runqputslow` moving half the local queue, the hybrid write barrier shading both
pointers, `live × (1 + GOGC/100)` — follows the real algorithms.
