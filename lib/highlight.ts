/* A deliberately small tokenizer for Go and for amd64 assembly listings.
   Enough to give code structure, with no dependency. */

export type Tok = { t: "kw" | "ty" | "fn" | "st" | "cm" | "nu" | "op" | "id" | "reg" | "mn" | "ws"; v: string };

const KW = new Set(
  "package import func return if else for range go defer chan select case default switch type struct interface map var const break continue goto fallthrough".split(" "),
);
const TY = new Set(
  "int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 complex64 complex128 string bool byte rune error any".split(" "),
);
const BUILTIN = new Set("append cap len make new copy close delete panic recover print println min max clear".split(" "));

export function tokenizeGo(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let prevWord = "";
  while (i < line.length) {
    const c = line[i];
    if (c === "/" && line[i + 1] === "/") { out.push({ t: "cm", v: line.slice(i) }); break; }
    if (c === '"' || c === "`" || c === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== c) { if (line[j] === "\\") j++; j++; }
      out.push({ t: "st", v: line.slice(i, j + 1) });
      i = j + 1; continue;
    }
    if (/\s/.test(c)) {
      let j = i; while (j < line.length && /\s/.test(line[j])) j++;
      out.push({ t: "ws", v: line.slice(i, j) }); i = j; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i; while (j < line.length && /[0-9a-fA-FxX_.]/.test(line[j])) j++;
      out.push({ t: "nu", v: line.slice(i, j) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
      const w = line.slice(i, j);
      let t: Tok["t"] = "id";
      if (KW.has(w)) t = "kw";
      else if (TY.has(w)) t = "ty";
      else if (prevWord === "func" || BUILTIN.has(w) || line[j] === "(") t = "fn";
      out.push({ t, v: w }); prevWord = w; i = j; continue;
    }
    out.push({ t: "op", v: c }); i++;
  }
  return out;
}

const REG = /^(R\d+|[A-D]X|[SD]I|[SB]P|SP|SB|FP|X\d+|E?[A-D]X)$/;

export function tokenizeAsm(line: string): Tok[] {
  const out: Tok[] = [];
  const ci = line.search(/;|\/\/|←/);
  const code = ci >= 0 ? line.slice(0, ci) : line;
  const cm = ci >= 0 ? line.slice(ci) : "";
  const parts = code.split(/(\s+|,|\(|\)|\*|\+)/).filter((p) => p !== "");
  let sawMnemonic = false;
  for (const p of parts) {
    if (/^\s+$/.test(p)) { out.push({ t: "ws", v: p }); continue; }
    if (!sawMnemonic && /^[A-Z][A-Z0-9]{1,6}$/.test(p) && !REG.test(p)) { out.push({ t: "mn", v: p }); sawMnemonic = true; continue; }
    if (REG.test(p)) { out.push({ t: "reg", v: p }); continue; }
    if (/^(\$?-?0x[0-9a-fA-F]+|\$?-?\d+)$/.test(p)) { out.push({ t: "nu", v: p }); continue; }
    if (/^[a-z_.]*[a-z].*:$/.test(p) || /^\d+:$/.test(p)) { out.push({ t: "fn", v: p }); continue; }
    out.push({ t: /^[,()*+]$/.test(p) ? "op" : "id", v: p });
  }
  if (cm) out.push({ t: "cm", v: cm });
  return out;
}

export const TOK_CLASS: Record<Tok["t"], string> = {
  kw: "text-rose",
  ty: "text-teal",
  fn: "text-copper",
  st: "text-[#d9c27e]",
  cm: "text-ink-3",
  nu: "text-violet",
  op: "text-ink-3",
  id: "text-ink",
  reg: "text-teal",
  mn: "text-copper",
  ws: "",
};
