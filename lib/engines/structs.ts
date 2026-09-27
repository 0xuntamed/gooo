/* Struct layout as the gc compiler does it on amd64 (cmd/compile/internal/types/size.go):
   each field at the next offset aligned to its type, size rounded up to the
   struct's alignment (the largest field alignment). Fields are never reordered. */

export type FType = { t: string; size: number; align: number };
export const TYPES: FType[] = [
  { t: "bool", size: 1, align: 1 },
  { t: "int8", size: 1, align: 1 },
  { t: "int16", size: 2, align: 2 },
  { t: "[3]byte", size: 3, align: 1 },
  { t: "int32", size: 4, align: 4 },
  { t: "float32", size: 4, align: 4 },
  { t: "int64", size: 8, align: 8 },
  { t: "*T", size: 8, align: 8 },
  { t: "string", size: 16, align: 8 },
  { t: "[]byte", size: 24, align: 8 },
];

export type Field = { n: string } & FType;
export type Placed = Field & { off: number };
export type Pad = { off: number; n: number; tail: boolean; before?: string };
export type Layout = { placed: Placed[]; pads: Pad[]; size: number; align: number; payload: number; cursor: number };

const up = (x: number, a: number) => Math.ceil(x / a) * a;

/** lay out the first `k` fields (all by default); `final` rounds the size up */
export function layout(fields: Field[], k = fields.length, final = k === fields.length): Layout {
  let off = 0;
  let align = 1;
  const placed: Placed[] = [];
  const pads: Pad[] = [];
  for (const f of fields.slice(0, k)) {
    const at = up(off, f.align);
    if (at > off) pads.push({ off, n: at - off, tail: false, before: f.n });
    placed.push({ ...f, off: at });
    off = at + f.size;
    align = Math.max(align, f.align);
  }
  let size = off;
  if (final) {
    size = up(off, align);
    if (size > off) pads.push({ off, n: size - off, tail: true });
  }
  return { placed, pads, size, align, payload: placed.reduce((a, p) => a + p.size, 0), cursor: off };
}

export const RECORD: Field[] = [
  { n: "a", t: "bool", size: 1, align: 1 },
  { n: "b", t: "int64", size: 8, align: 8 },
  { n: "c", t: "bool", size: 1, align: 1 },
  { n: "d", t: "int32", size: 4, align: 4 },
];

/** largest alignment first, then largest size: a layout with minimal padding */
export const sorted = (fields: Field[]) => [...fields].sort((x, y) => y.align - x.align || y.size - x.size);

export const src = (name: string, fields: Field[]) =>
  `type ${name} struct {\n${fields.map((f) => `\t${f.n} ${f.t.padEnd(7)} // ${f.size} B, align ${f.align}`).join("\n")}\n}`;
