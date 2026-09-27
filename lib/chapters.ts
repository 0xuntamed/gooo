export type GroupId = "data" | "compile" | "run" | "comm" | "memory";

export const GROUPS: Record<GroupId, { name: string; blurb: string }> = {
  data: { name: "Data structures", blurb: "What your values look like in memory." },
  compile: { name: "Compile time", blurb: "What the compiler decides before anything runs." },
  run: { name: "Run time", blurb: "How goroutines get onto threads, and how their stacks behave." },
  comm: { name: "Communication", blurb: "What a channel operation actually does." },
  memory: { name: "Memory", blurb: "Where allocations come from and how they are reclaimed." },
};

export type Rect = { x: number; y: number; w: number; h: number };

export type Chapter = {
  slug: string;
  /** terse marking printed on the die */
  die: string;
  n: number;
  group: GroupId;
  title: string;
  /** one-line thesis of the chapter */
  sub: string;
  /** the real source this chapter is about */
  pkg: string;
  /** what the block is, in die terms */
  block: string;
  /** the command a reader would run to see this for themselves */
  cmd: string;
  /** position on the landscape die (viewBox 1600 × 1000) */
  wide: Rect;
  /** position on the portrait die (viewBox 1000 × 1900) */
  tall: Rect;
};

export const CHAPTERS: Chapter[] = [
  {
    slug: "slices", die: "SLICES", n: 1, group: "data",
    title: "Arrays & slices",
    sub: "A 24-byte header over someone else's memory.",
    pkg: "runtime/slice.go", block: "SRAM row + header register",
    cmd: "go run data.go   # cap growth, measured",
    wide: { x: 120, y: 120, w: 360, h: 210 },
    tall: { x: 90, y: 120, w: 400, h: 210 },
  },
  {
    slug: "maps", die: "MAPS", n: 2, group: "data",
    title: "Maps",
    sub: "Swiss tables: eight slots compared in one instruction.",
    pkg: "internal/runtime/maps", block: "control-word SRAM banks",
    cmd: "go doc internal/runtime/maps",
    wide: { x: 500, y: 120, w: 400, h: 210 },
    tall: { x: 510, y: 120, w: 400, h: 210 },
  },
  {
    slug: "strings", die: "STRINGS", n: 3, group: "data",
    title: "Strings & runes",
    sub: "Read-only bytes, decoded only when you range.",
    pkg: "runtime/string.go · unicode/utf8", block: "read-only data (ROM)",
    cmd: "go vet ./...   # catches s[i] vs rune mixups, sometimes",
    wide: { x: 920, y: 120, w: 260, h: 210 },
    tall: { x: 90, y: 350, w: 400, h: 190 },
  },
  {
    slug: "structs", die: "STRUCTS", n: 4, group: "data",
    title: "Struct layout",
    sub: "Alignment, padding, and eight bytes you can have back.",
    pkg: "unsafe.Sizeof · Offsetof · Alignof", block: "byte rows + filler cells",
    cmd: "go run data.go   # unsafe.Sizeof / Offsetof",
    wide: { x: 1200, y: 120, w: 280, h: 210 },
    tall: { x: 510, y: 350, w: 400, h: 190 },
  },
  {
    slug: "pipeline", die: "COMPILER", n: 5, group: "compile",
    title: "Compiler pipeline",
    sub: "One function, from source text to 27 bytes of machine code.",
    pkg: "cmd/compile", block: "seven-stage pipeline",
    cmd: "GOSSAFUNC=sum go build -o /dev/null sample.go",
    wide: { x: 120, y: 350, w: 360, h: 90 },
    tall: { x: 90, y: 560, w: 820, h: 160 },
  },
  {
    slug: "escape", die: "ESCAPE", n: 6, group: "compile",
    title: "Escape analysis",
    sub: "Stack or heap, decided before the program runs.",
    pkg: "cmd/compile/internal/escape", block: "stack / heap router",
    cmd: "go build -gcflags='-m -m' sample.go",
    wide: { x: 120, y: 460, w: 360, h: 90 },
    tall: { x: 90, y: 740, w: 400, h: 170 },
  },
  {
    slug: "interfaces", die: "ITABS", n: 7, group: "compile",
    title: "Interfaces & itabs",
    sub: "Two words, one method table, and the call that disappears.",
    pkg: "runtime/iface.go", block: "two-word register + itab table",
    cmd: "go build -gcflags=-m sample.go   # devirtualizing …",
    wide: { x: 120, y: 570, w: 360, h: 80 },
    tall: { x: 510, y: 740, w: 400, h: 170 },
  },
  {
    slug: "scheduler", die: "SCHEDULER", n: 8, group: "run",
    title: "GMP scheduler",
    sub: "How a million goroutines share a handful of threads.",
    pkg: "runtime/proc.go", block: "multi-core array",
    cmd: "GODEBUG=schedtrace=120 go run tracer.go",
    wide: { x: 500, y: 350, w: 560, h: 300 },
    tall: { x: 90, y: 930, w: 820, h: 330 },
  },
  {
    slug: "stacks", die: "STACKS", n: 9, group: "run",
    title: "Goroutines & stacks",
    sub: "Two kilobytes that grow by moving.",
    pkg: "runtime/stack.go", block: "growable stack region",
    cmd: "go build -gcflags=-S sample.go   # the prologue",
    wide: { x: 1080, y: 350, w: 180, h: 300 },
    tall: { x: 90, y: 1280, w: 250, h: 300 },
  },
  {
    slug: "defer", die: "DEFER", n: 10, group: "run",
    title: "defer · panic · recover",
    sub: "Three implementations, chosen by the shape of your function.",
    pkg: "runtime/panic.go", block: "8-bit defer register",
    cmd: "go build -gcflags=-d=defer sample.go",
    wide: { x: 1280, y: 350, w: 200, h: 140 },
    tall: { x: 360, y: 1280, w: 280, h: 140 },
  },
  {
    slug: "channels", die: "CHANNELS", n: 11, group: "comm",
    title: "Channels & select",
    sub: "A ring buffer, two wait queues, and a copy that skips them both.",
    pkg: "runtime/chan.go · runtime/select.go", block: "FIFO ring + bypass path",
    cmd: "go doc runtime.hchan   # or read runtime/chan.go",
    wide: { x: 1280, y: 510, w: 200, h: 140 },
    tall: { x: 360, y: 1440, w: 280, h: 140 },
  },
  {
    slug: "allocator", die: "ALLOC", n: 12, group: "memory",
    title: "Allocator",
    sub: "Three tiers, and on the fast path, no lock at all.",
    pkg: "runtime/malloc.go · mcache.go · mcentral.go · mheap.go", block: "cache hierarchy",
    cmd: "go test -bench . -benchmem   # allocs/op",
    wide: { x: 120, y: 670, w: 560, h: 210 },
    tall: { x: 660, y: 1280, w: 250, h: 300 },
  },
  {
    slug: "gc", die: "GC", n: 13, group: "memory",
    title: "Garbage collector",
    sub: "Tricolour marking while your code keeps writing pointers.",
    pkg: "runtime/mgc.go · mbarrier.go · mgcpacer.go", block: "heap arena",
    cmd: "GODEBUG=gctrace=1 go run tracer.go",
    wide: { x: 700, y: 670, w: 780, h: 210 },
    tall: { x: 90, y: 1600, w: 820, h: 200 },
  },
];

export const bySlug = (slug: string) => CHAPTERS.find((c) => c.slug === slug);

export const neighbours = (slug: string) => {
  const i = CHAPTERS.findIndex((c) => c.slug === slug);
  return { prev: CHAPTERS[i - 1] ?? null, next: CHAPTERS[i + 1] ?? null };
};

/**
 * Real relationships between blocks: the runtime or compiler function that
 * connects them. Drawn as routed wires when a block is inspected on the die.
 */
export const WIRES: { a: string; b: string; via: string }[] = [
  { a: "slices", b: "allocator", via: "growslice → mallocgc" },
  { a: "maps", b: "allocator", via: "table grow → newarray" },
  { a: "strings", b: "allocator", via: "stringtoslicebyte" },
  { a: "escape", b: "allocator", via: "runtime.newobject" },
  { a: "interfaces", b: "allocator", via: "convT boxing" },
  { a: "pipeline", b: "escape", via: "middle-end pass" },
  { a: "pipeline", b: "interfaces", via: "devirtualize pass" },
  { a: "pipeline", b: "stacks", via: "emits the stack-check prologue" },
  { a: "scheduler", b: "channels", via: "gopark / goready" },
  { a: "scheduler", b: "stacks", via: "newproc · 2 KB stack" },
  { a: "defer", b: "stacks", via: "gopanic unwinds frames" },
  { a: "allocator", b: "gc", via: "sweep · mark assist" },
  { a: "gc", b: "stacks", via: "scans roots · shrinkstack" },
  { a: "scheduler", b: "gc", via: "25% of Ps run mark workers" },
];
