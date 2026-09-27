/* Strings are immutable bytes; runes are decoded from them on demand. */

export type Byte = { v: number; off: number; rune: number; kind: "ascii" | "lead" | "cont" };
export type Rune = { ch: string; off: number; n: number; cp: number };
export type Encoded = { str: string; bytes: Byte[]; runes: Rune[] };

export function encode(str: string): Encoded {
  const enc = new TextEncoder();
  const bytes: Byte[] = [];
  const runes: Rune[] = [];
  let off = 0;
  Array.from(str).forEach((ch, ri) => {
    const b = enc.encode(ch);
    runes.push({ ch, off, n: b.length, cp: ch.codePointAt(0)! });
    b.forEach((v, i) => bytes.push({ v, off: off + i, rune: ri, kind: b.length === 1 ? "ascii" : i === 0 ? "lead" : "cont" }));
    off += b.length;
  });
  return { str, bytes, runes };
}

/** split each byte into its UTF-8 prefix and payload bits */
export function anatomy(r: Rune, bytes: Byte[]) {
  const own = bytes.filter((b) => b.off >= r.off && b.off < r.off + r.n);
  const prefixLen = (b: Byte, i: number) => (r.n === 1 ? 1 : i === 0 ? r.n + 1 : 2);
  const parts = own.map((b, i) => {
    const bits = b.v.toString(2).padStart(8, "0");
    const p = prefixLen(b, i);
    return { v: b.v, prefix: bits.slice(0, p), payload: bits.slice(p) };
  });
  const payload = parts.map((p) => p.payload).join("");
  return { parts, payload, cp: r.cp };
}

export const U = (cp: number) => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
