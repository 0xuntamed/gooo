/* Escape analysis: three captured cases from `go build -gcflags='-m -m'`
   (go1.26.2). The graph is the flow the compiler reports, drawn as nodes. */

export type ENode = { id: string; label: string; sub: string; x: number; y: number; outlives?: boolean };
export type EEdge = { a: string; b: string; label: string };
export type Example = {
  id: "stack" | "heap" | "iface";
  tab: string;
  src: string;
  /** lines lit at reveal 0, 1, 2 */
  lit: number[][];
  out: string[];
  nodes: ENode[];
  edges: EEdge[];
  /** the path that proves (or fails to prove) an escape */
  path: string[];
  escapes: boolean;
  obj: string;
  code: { caption: string; lang: "asm" | "go"; text: string };
  verdict: string;
};

export const EXAMPLES: Example[] = [
  {
    id: "stack", tab: "Stays on the stack",
    src: "func sum(xs []int) int {\n\ttotal := 0\n\tfor _, x := range xs {\n\t\ttotal += x\n\t}\n\treturn total\n}",
    lit: [[1], [3, 4], [6]],
    out: ["./sample.go:11:10: xs does not escape"],
    nodes: [
      { id: "xs", label: "xs", sub: "[]int param", x: 90, y: 64 },
      { id: "x", label: "x", sub: "int, copied out", x: 300, y: 64 },
      { id: "r", label: "~r0", sub: "int result", x: 510, y: 64, outlives: true },
    ],
    edges: [
      { a: "xs", b: "x", label: "deref: values copied" },
      { a: "x", b: "r", label: "int, by value" },
    ],
    path: ["xs", "x", "r"],
    escapes: false,
    obj: "xs []int",
    code: { caption: "go build -gcflags=-S (captured)", lang: "asm", text: "TEXT  main.sum(SB), NOSPLIT|NOFRAME|ABIInternal, $0-24\n; zero-byte frame, and no CALL runtime.newobject" },
    verdict: "Only copies of the elements reach the result, never the address of xs. **xs does not escape.**",
  },
  {
    id: "heap", tab: "Moved to the heap",
    src: "func makeCounter() *int {\n\tn := 0\n\treturn &n\n}",
    lit: [[2], [3], [3]],
    out: [
      "./sample.go:20:2: n escapes to heap in makeCounter:",
      "./sample.go:20:2:   flow: ~r0 ← &n:",
      "./sample.go:20:2:     from &n (address-of) at :21:9",
      "./sample.go:20:2:     from return &n (return) at :21:2",
      "./sample.go:20:2: moved to heap: n",
    ],
    nodes: [
      { id: "n", label: "n", sub: "int local", x: 90, y: 64 },
      { id: "addr", label: "&n", sub: "address-of", x: 300, y: 64 },
      { id: "r", label: "~r0", sub: "*int result", x: 510, y: 64, outlives: true },
    ],
    edges: [
      { a: "n", b: "addr", label: "address-of :21:9" },
      { a: "addr", b: "r", label: "return :21:2" },
    ],
    path: ["n", "addr", "r"],
    escapes: true,
    obj: "n int",
    code: { caption: "go build -gcflags=-S (captured)", lang: "asm", text: "LEAQ  type:int(SB), AX\nCALL  runtime.newobject(SB)   ; the allocation" },
    verdict: "A pointer to n reaches ~r0, and the result outlives the frame. **n is moved to the heap.**",
  },
  {
    id: "iface", tab: "Escapes through fmt",
    src: "func main() {\n\tv := sum([]int{1, 2, 3})\n\tfmt.Println(v)\n}",
    lit: [[2], [3], [3]],
    out: [
      "./sample.go:26:17: ~r0 escapes to heap in main:",
      "./sample.go:26:17:   flow: {storage for ... argument}",
      "./sample.go:26:17:         ← &{storage for ~r0}",
      "./sample.go:26:17:   flow: fmt.a ← &{storage for ...}",
      "./sample.go:26:17:     from fmt.Fprintln(os.Stdout, fmt.a...)",
      "./sample.go:26:17:          (call parameter)",
    ],
    nodes: [
      { id: "v", label: "v", sub: "int (inlined ~r0)", x: 70, y: 64 },
      { id: "box", label: "&{storage for ~r0}", sub: "boxed into any", x: 245, y: 64 },
      { id: "dots", label: "{storage for ...}", sub: "the []any argument", x: 420, y: 64 },
      { id: "a", label: "fmt.a", sub: "param of Fprintln", x: 560, y: 150, outlives: true },
    ],
    edges: [
      { a: "v", b: "box", label: "convert to any" },
      { a: "box", b: "dots", label: "variadic slice" },
      { a: "dots", b: "a", label: "call parameter" },
    ],
    path: ["v", "box", "dots", "a"],
    escapes: true,
    obj: "v → any",
    code: { caption: "runtime/iface.go: what boxing an int calls", lang: "go", text: "func convT64(val uint64) (x unsafe.Pointer) {\n\tif val < uint64(len(staticuint64s)) {\n\t\tx = unsafe.Pointer(&staticuint64s[val])\n\t} else {\n\t\tx = mallocgc(8, uint64Type, false)\n\t\t*(*uint64)(x) = val\n\t}\n\treturn\n}" },
    verdict: "`Println` takes `...any`, and `Fprintln` is too big to inline, so the compiler must assume the callee keeps the pointer. **Everything you print escapes.**",
  },
];
