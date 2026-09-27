/* Compiler pipeline for one function. Token positions, -m output, SSA
   listings and assembly are the captured go1.26.2 output from the legacy
   site; the SSA build listing is the captured excerpt (first 3 of 5 blocks). */

export const SOURCE_LINES = [
  "package main",
  "",
  "func sum(xs []int) int {",
  "\ttotal := 0",
  "\tfor _, x := range xs {",
  "\t\ttotal += x",
  "\t}",
  "\treturn total",
  "}",
];
export const SOURCE = SOURCE_LINES.join("\n") + "\n";
export const SOURCE_BYTES = new TextEncoder().encode(SOURCE).length;

/** [line, col, kind, lit]; lit "\n" on ";" marks a semicolon the scanner inserted */
const RAW: [number, number, string, string][] = [
  [1, 1, "package", "package"], [1, 9, "IDENT", "main"], [1, 13, ";", "\n"],
  [3, 1, "func", "func"], [3, 6, "IDENT", "sum"], [3, 9, "(", "("], [3, 10, "IDENT", "xs"], [3, 13, "[", "["], [3, 14, "]", "]"],
  [3, 15, "IDENT", "int"], [3, 18, ")", ")"], [3, 20, "IDENT", "int"], [3, 24, "{", "{"],
  [4, 2, "IDENT", "total"], [4, 8, ":=", ":="], [4, 11, "INT", "0"], [4, 12, ";", "\n"],
  [5, 2, "for", "for"], [5, 6, "IDENT", "_"], [5, 7, ",", ","], [5, 9, "IDENT", "x"], [5, 11, ":=", ":="], [5, 14, "range", "range"],
  [5, 20, "IDENT", "xs"], [5, 23, "{", "{"],
  [6, 3, "IDENT", "total"], [6, 9, "+=", "+="], [6, 12, "IDENT", "x"], [6, 13, ";", "\n"],
  [7, 2, "}", "}"], [7, 3, ";", "\n"],
  [8, 2, "return", "return"], [8, 9, "IDENT", "total"], [8, 14, ";", "\n"],
  [9, 1, "}", "}"], [9, 2, ";", "\n"], [9, 3, "EOF", ""],
];
export type Token = { id: number; line: number; col: number; kind: string; lit: string; inserted: boolean };
export const TOKENS: Token[] = RAW.map(([line, col, kind, lit], id) => ({ id, line, col, kind, lit, inserted: kind === ";" && lit === "\n" }));

/** token id by (line, col), for the tree to claim */
const T = (line: number, col: number) => TOKENS.find((t) => t.line === line && t.col === col)!.id;

/* The syntax tree, condensed from ast.Fprint. `tok` is the token that becomes
   this node; `type` is what types2 attaches to it. */
export type Node = { id: string; label: string; tok?: number; depth: number; type?: string; note?: string };
export const TREE: Node[] = [
  { id: "fn", label: "FuncDecl", tok: T(3, 1), depth: 0, type: "func([]int) int" },
  { id: "name", label: "Name  sum", tok: T(3, 6), depth: 1 },
  { id: "param", label: "Param  xs []int", tok: T(3, 10), depth: 1, type: "[]int", note: "xs does not escape" },
  { id: "result", label: "Result  int", tok: T(3, 20), depth: 1, type: "int" },
  { id: "assign", label: "AssignStmt  :=", tok: T(4, 8), depth: 1 },
  { id: "total1", label: "total", tok: T(4, 2), depth: 2, type: "int" },
  { id: "zero", label: "BasicLit 0", tok: T(4, 11), depth: 2, type: "untyped int → int" },
  { id: "range", label: "RangeStmt", tok: T(5, 14), depth: 1, type: "index int, elem int" },
  { id: "key", label: "Key  _", tok: T(5, 6), depth: 2 },
  { id: "val", label: "Value  x", tok: T(5, 9), depth: 2, type: "int" },
  { id: "xs2", label: "X  xs", tok: T(5, 20), depth: 2, type: "[]int" },
  { id: "add", label: "AssignStmt  +=", tok: T(6, 9), depth: 2 },
  { id: "total2", label: "total", tok: T(6, 3), depth: 3, type: "int" },
  { id: "x2", label: "x", tok: T(6, 12), depth: 3, type: "int" },
  { id: "ret", label: "ReturnStmt", tok: T(8, 2), depth: 1 },
  { id: "total3", label: "total", tok: T(8, 9), depth: 2, type: "int, assignable to result" },
];

export const MIDDLE = [
  "./sample.go:11:6: can inline sum with cost 16",
  "./sample.go:11:10: xs does not escape",
  "./sample.go:26:17: inlining call to sum",
];

/* SSA. `from` names the tree node a value came from; values carry ids so
   the same value can be followed from one listing to the next. */
export type SsaLine = { k: "block" | "val" | "term" | "gap" | "note"; text: string; v?: string; from?: string };
export const SSA_BUILD: SsaLine[] = [
  { k: "block", text: "b1:" },
  { k: "val", v: "v1", text: "v1  = InitMem <mem>" },
  { k: "val", v: "v2", text: "v2  = SP <uintptr>" },
  { k: "val", v: "v3", text: "v3  = SB <uintptr>" },
  { k: "val", v: "v4", text: "v4  = LocalAddr <*[]int> {xs} v2 v1" },
  { k: "val", v: "v6", text: "v6  = Arg <[]int> {xs}", from: "param" },
  { k: "val", v: "v7", text: "v7  = Const64 <int> [0]        (total)", from: "assign" },
  { k: "val", v: "v8", text: "v8  = SliceLen <int> v6" },
  { k: "val", v: "v22", text: "v22 = Const64 <int> [1]" },
  { k: "term", text: "Plain → b2" },
  { k: "block", text: "b2: ← b1 b4" },
  { k: "val", v: "v9", text: "v9  = Phi <int> v7 v23         (loop index)" },
  { k: "val", v: "v27", text: "v27 = Phi <mem> v1 v17" },
  { k: "val", v: "v28", text: "v28 = Phi <int> v7 v20         (total)" },
  { k: "val", v: "v29", text: "v29 = Phi <[]int> v6 v13" },
  { k: "val", v: "v10", text: "v10 = Copy <int> v8" },
  { k: "val", v: "v11", text: "v11 = Less64 <bool> v9 v10", from: "range" },
  { k: "term", text: "If v11 → b3 b5 (likely)" },
  { k: "block", text: "b3: ← b2" },
  { k: "val", v: "v14", text: "v14 = SliceLen <int> v13" },
  { k: "val", v: "v15", text: "v15 = SlicePtr <*int> v13" },
  { k: "val", v: "v16", text: "v16 = PtrIndex <*int> v15 v12" },
  { k: "val", v: "v18", text: "v18 = Load <int> v16 v17       (x)", from: "val" },
  { k: "val", v: "v20", text: "v20 = Add64 <int> v19 v18      (total)", from: "add" },
  { k: "term", text: "Plain → b4" },
  { k: "gap", text: "… b4 (i++) and b5 (return): 29 values, 5 blocks in all" },
];

export const SSA_OPT: SsaLine[] = [
  { k: "block", text: "b1:" },
  { k: "val", v: "v1", text: "v1  = InitMem <mem>" },
  { k: "val", v: "v6", text: "v6  = Arg <[]int> {xs}" },
  { k: "val", v: "v7", text: "v7  = Const64 <int> [0]        (total)" },
  { k: "val", v: "v8", text: "v8  = SliceLen <int> v6" },
  { k: "val", v: "v22", text: "v22 = Const64 <int> [1]" },
  { k: "term", text: "Plain → b2" },
  { k: "block", text: "b2: ← b1 b4" },
  { k: "val", v: "v9", text: "v9  = Phi <int> v7 v23         (loop index)" },
  { k: "val", v: "v28", text: "v28 = Phi <int> v7 v20         (total)" },
  { k: "val", v: "v11", text: "v11 = Less64 <bool> v9 v8" },
  { k: "term", text: "If v11 → b4 b5 (likely)" },
  { k: "block", text: "b4: ← b2" },
  { k: "val", v: "v15", text: "v15 = SlicePtr <*int> v6" },
  { k: "val", v: "v23", text: "v23 = Add64 <int> v9 v22" },
  { k: "val", v: "v24", text: "v24 = Const64 <int> [8]" },
  { k: "val", v: "v25", text: "v25 = Mul64 <int> v9 v24" },
  { k: "val", v: "v16", text: "v16 = AddPtr <*int> v15 v25" },
  { k: "val", v: "v18", text: "v18 = Load <int> v16 v1        (x)" },
  { k: "val", v: "v20", text: "v20 = Add64 <int> v28 v18      (total)" },
  { k: "term", text: "Plain → b2" },
  { k: "block", text: "b5: ← b2" },
  { k: "val", v: "v26", text: "v26 = MakeResult <int,mem> v28 v1" },
  { k: "term", text: "Ret v26" },
  { k: "note", text: "no IsInBounds · no PanicBounds" },
];

/** final assembly, each instruction tagged with the SSA values it absorbed */
export type AsmLine = { text: string; from?: string[]; label?: string };
export const ASM: AsmLine[] = [
  { text: "TEXT  main.sum(SB), NOSPLIT|NOFRAME|ABIInternal, $0-24" },
  { text: "MOVQ  AX, main.xs+8(FP)", from: ["v6"] },
  { text: "XORL  CX, CX          ; i = 0", from: ["v7", "v9"] },
  { text: "XORL  DX, DX          ; total = 0", from: ["v28"] },
  { text: "JMP   18" },
  { label: "11:", text: "ADDQ  (AX)(CX*8), DX  ; total += xs[i]", from: ["v15", "v24", "v25", "v16", "v18", "v20"] },
  { text: "INCQ  CX              ; i++", from: ["v23", "v22"] },
  { label: "18:", text: "CMPQ  BX, CX          ; i < len(xs) ?", from: ["v8"] },
  { text: "JGT   11", from: ["v11"] },
  { text: "MOVQ  DX, AX          ; return total", from: ["v26"] },
  { text: "RET", from: ["v1"] },
];

export const MACHINE = "48 89 44 24 08 31 c9 31 d2 eb 07 48 03 14 c8 48 ff c1 48 39 cb 7f f4 48 89 d0 c3".split(" ");

export const PHASES = [
  { id: "source", name: "Source", pkg: "sample.go" },
  { id: "scan", name: "Scan", pkg: "cmd/compile/internal/syntax" },
  { id: "parse", name: "Parse", pkg: "cmd/compile/internal/syntax" },
  { id: "types", name: "Type-check", pkg: "cmd/compile/internal/types2" },
  { id: "middle", name: "Middle-end", pkg: "inline · escape · devirtualize" },
  { id: "ssa", name: "SSA build", pkg: "cmd/compile/internal/ssa" },
  { id: "opt", name: "SSA opt", pkg: "≈50 passes to a fixed point" },
  { id: "gen", name: "Codegen", pkg: "ssagen → cmd/internal/obj" },
  { id: "bytes", name: "Machine code", pkg: "27 bytes" },
] as const;
export type PhaseId = (typeof PHASES)[number]["id"];
