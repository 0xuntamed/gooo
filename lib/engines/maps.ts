/* Swiss-table map, after internal/runtime/maps (Go 1.24+).
   Hashes here are FNV-1a so the demo is deterministic; the runtime uses a
   per-map random seed and memhash/aeshash, so real h1/h2 values differ.
   Everything else (group layout, control bytes, matchH2, probe sequence,
   empty-vs-tombstone on delete, 7/8 load) follows the runtime. */

export const EMPTY = 0x80;
export const DELETED = 0xfe;
export const NAMES = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi", "ivan", "judy", "mallory", "niaj", "olivia", "peggy", "rupert", "sybil", "trent", "victor", "walter", "yvonne", "zed", "oscar", "pat", "quinn"];

export type Group = { ctrl: number[]; keys: (string | null)[] };
export type MatchRows = { ctrl: number[]; h2: number; xor: number[]; bits: number[]; hits: number[] };
export type ProbeStep = { g: number; match: MatchRows; cmp: { s: number; key: string | null; eq: boolean }[]; hasEmpty: boolean };
export type Probe = { key: string; hash: number; h1: number; h2: number; seq: number[]; group: number; slot: number; found: boolean; path: ProbeStep[]; match?: MatchRows };
export type MapState = { groups: Group[]; used: number; tomb: number; pool: string[]; probe: Probe | null; msg: string; code: string; grew: boolean; last: { g: number; s: number; kind: "insert" | "delete-empty" | "delete-tomb" | "lookup" } | null };

export function fnv(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
export const h1 = (h: number) => h >>> 7;
export const h2 = (h: number) => h & 0x7f;

const mkGroups = (n: number): Group[] => Array.from({ length: n }, () => ({ ctrl: Array(8).fill(EMPTY), keys: Array(8).fill(null) }));

/** probeSeq: quadratic over groups (offset += ++index), masked */
export function probeSeq(hash: number, groups: number) {
  const mask = groups - 1;
  const seq: number[] = [];
  let off = h1(hash) & mask;
  for (let i = 0; i < groups; i++) {
    seq.push(off);
    off = (off + i + 1) & mask;
  }
  return seq;
}

/** the portable ctrlGroupMatchH2, byte by byte, so every row can be drawn.
    v := ctrl ^ (lsb * h); return ((v - lsb) &^ v) & msb */
export function matchH2(ctrl: number[], h: number): MatchRows {
  const L = 0x0101010101010101n, M = 0x8080808080808080n;
  let word = 0n;
  ctrl.forEach((b, i) => { word |= BigInt(b) << BigInt(8 * i); }); // slot 0 is the low byte
  const v = word ^ (L * BigInt(h));
  const r = ((v - L) & ~v) & M;
  const bytes = (x: bigint) => Array.from({ length: 8 }, (_, i) => Number((x >> BigInt(8 * i)) & 0xffn));
  const bits = bytes(r);
  return { ctrl: [...ctrl], h2: h, xor: bytes(v), bits, hits: bits.map((b, i) => (b ? i : -1)).filter((i) => i >= 0) };
}

export function mapInit(): MapState {
  return {
    groups: mkGroups(2), used: 0, tomb: 0, pool: [...NAMES], probe: null, grew: false, last: null,
    code: "m := make(map[string]int)",
    msg: "A map past its first 8 entries: a table of **2 groups × 8 slots**. Every control byte is `0x80`, the empty marker, which no hash can ever produce.",
  };
}

const cap = (st: MapState) => st.groups.length * 8;
export const growAt = (st: MapState) => Math.floor((cap(st) * 7) / 8);

function locate(st: MapState, key: string): Probe {
  const hash = fnv(key);
  const seq = probeSeq(hash, st.groups.length);
  const t = h2(hash);
  let firstFree: { g: number; s: number } | null = null;
  const path: ProbeStep[] = [];
  const base = { key, hash, h1: h1(hash), h2: t };
  for (const g of seq) {
    const grp = st.groups[g];
    const m = matchH2(grp.ctrl, t);
    const cmp = m.hits.map((s) => ({ s, key: grp.keys[s], eq: grp.keys[s] === key }));
    const hasEmpty = grp.ctrl.includes(EMPTY);
    path.push({ g, match: m, cmp, hasEmpty });
    const hit = cmp.find((c) => c.eq);
    if (hit) return { ...base, seq: path.map((x) => x.g), group: g, slot: hit.s, found: true, path, match: m };
    if (!firstFree) {
      const i = grp.ctrl.findIndex((c) => c === EMPTY || c === DELETED);
      if (i >= 0) firstFree = { g, s: i };
    }
    if (hasEmpty) return { ...base, seq: path.map((x) => x.g), group: firstFree!.g, slot: firstFree!.s, found: false, path, match: m };
  }
  return { ...base, seq: path.map((x) => x.g), group: firstFree?.g ?? 0, slot: firstFree?.s ?? 0, found: false, path };
}

function rehashInto(st: MapState, n: number) {
  const old = st.groups;
  st.groups = mkGroups(n);
  st.used = 0; st.tomb = 0;
  for (const g of old) g.keys.forEach((k, i) => {
    if (k !== null && g.ctrl[i] !== DELETED && g.ctrl[i] !== EMPTY) {
      const p = locate(st, k);
      st.groups[p.group].ctrl[p.slot] = p.h2;
      st.groups[p.group].keys[p.slot] = k;
      st.used++;
    }
  });
}

type Tr = { kind: "info" | "warn" | "note"; text: string };

export function mapAct(prev: MapState, k: "insert" | "insert5" | "lookup" | "delete" | "fill", arg?: string | number): { st: MapState; trace: Tr[] } {
  const st: MapState = structuredClone(prev);
  st.grew = false; st.last = null;
  const trace: Tr[] = [];

  const insertOne = (key: string, quiet: boolean) => {
    if (st.used + st.tomb >= growAt(st)) {
      const was = st.groups.length;
      rehashInto(st, was * 2);
      st.grew = true;
      trace.push({ kind: "warn", text: `table grow: ${was} → ${was * 2} groups, ${st.used} keys rehashed into new slots` });
    }
    const p = locate(st, key);
    const g = st.groups[p.group];
    if (g.ctrl[p.slot] === DELETED) st.tomb--;
    g.ctrl[p.slot] = p.h2;
    g.keys[p.slot] = key;
    st.used++;
    st.probe = p;
    st.last = { g: p.group, s: p.slot, kind: "insert" };
    if (!quiet) trace.push({ kind: "info", text: `m["${key}"]: hash=0x${p.hash.toString(16).padStart(8, "0")} h1&mask→group ${p.seq[0]}${p.seq.length > 1 ? ` probe ${p.seq.join("→")}` : ""}, h2=0x${p.h2.toString(16).padStart(2, "0")} → slot ${p.slot}` });
    return p;
  };

  if (k === "insert" || k === "fill") {
    const n = k === "fill" ? Number(arg ?? 1) : 1;
    let p: Probe | null = null;
    for (let i = 0; i < n && st.pool.length; i++) {
      const key = typeof arg === "string" && k === "insert" ? arg : st.pool[0];
      st.pool = st.pool.filter((x) => x !== key);
      p = insertOne(key, k === "fill");
    }
    if (!p) { st.msg = "Out of sample keys. Reset to start again."; return { st, trace }; }
    st.code = k === "fill" ? `// ${n} inserts` : `m["${p.key}"] = ${st.used}`;
    st.msg = st.grew
      ? `**The load hit 7/8.** A group may hold 8, but the table only fills to 7 per group on average, so it doubled to **${st.groups.length} groups** and rehashed every key. Most keys land somewhere new, because one more bit of h1 now picks the group. Sizing up front with \`make(map[K]V, n)\` avoids this.`
      : k === "fill"
        ? `Inserted ${n} keys. They scatter across groups with no relation to insertion order, which is the whole point of a hash table.`
        : `Inserted \`"${p.key}"\`. The hash split in two: **h1** (the high bits) chose group **${p.seq[0]}**${p.seq.length > 1 ? `, and the probe moved on to group ${p.group} to find space` : ""}. **h2** (the low 7 bits, \`0x${p.h2.toString(16).toUpperCase().padStart(2, "0")}\`) became control byte ${p.slot}, and the key went into the slot beside it.`;
    if (k === "fill") trace.push({ kind: "info", text: `${n} inserts, load ${st.used}/${cap(st)} (+${st.tomb} tombstones), grows at ${growAt(st)}` });
    return { st, trace };
  }

  if (k === "insert5") return mapAct(prev, "fill", 5);

  const placed: { g: number; s: number; key: string }[] = [];
  st.groups.forEach((g, gi) => g.keys.forEach((key, si) => { if (key !== null && g.ctrl[si] !== DELETED && g.ctrl[si] !== EMPTY) placed.push({ g: gi, s: si, key }); }));
  if (!placed.length) { st.msg = "Nothing in the map yet."; return { st, trace }; }

  if (k === "lookup") {
    const key = typeof arg === "string" ? arg : placed[(st.used * 7 + st.tomb * 3) % placed.length].key;
    const p = locate(st, key);
    st.probe = p;
    st.last = { g: p.group, s: p.slot, kind: "lookup" };
    st.code = `v, ok := m["${key}"]`;
    const falseHits = p.path.flatMap((x) => x.cmp.filter((c) => !c.eq));
    st.msg = `Looking up \`"${key}"\`. h1 picks group **${p.seq[0]}**, and \`matchH2\` tests h2 against **all eight** control bytes at once. ` +
      (p.path.length > 1
        ? `Group ${p.path[0].g} ${falseHits.length ? `matched on \`"${falseHits[0].key}"\`, but the key compare said no` : "had no match"}; and because that group has **no empty slot**, the key might have been pushed further along, so the probe continues to group ${p.group}, where it is found.`
        : falseHits.length
          ? `${p.path[0].cmp.length} control bytes match those 7 bits, so the keys are compared in turn until one is equal.`
          : "Exactly one byte matches, so exactly one key comparison follows.");
    trace.push({ kind: "info", text: `lookup "${key}": probe ${p.seq.join("→")}, ${p.path.map((x) => `g${x.g}:[${x.match.hits.join(" ")}]`).join(" ")}, found at g${p.group}/s${p.slot}` });
    return { st, trace };
  }

  // delete: the runtime writes EMPTY when the group still has an empty slot
  const target = typeof arg === "string" ? placed.find((x) => x.key === arg)! : placed[(st.used * 5) % placed.length];
  const g = st.groups[target.g];
  const groupHasEmpty = g.ctrl.includes(EMPTY);
  g.ctrl[target.s] = groupHasEmpty ? EMPTY : DELETED;
  g.keys[target.s] = groupHasEmpty ? null : target.key;
  st.used--;
  if (!groupHasEmpty) st.tomb++;
  st.probe = null;
  st.last = { g: target.g, s: target.s, kind: groupHasEmpty ? "delete-empty" : "delete-tomb" };
  st.code = `delete(m, "${target.key}")`;
  st.msg = groupHasEmpty
    ? `Deleted \`"${target.key}"\`. Group ${target.g} still had an empty slot, and a lookup stops at the first group with one. So nothing could have probed *past* this group, and the slot goes straight back to **empty** (\`0x80\`).`
    : `Deleted \`"${target.key}"\`. Group ${target.g} was **full**, so an earlier insert may have probed past it to the next group. Writing empty here would make that key unfindable, so the slot becomes a !!tombstone!! (\`0xFE\`) instead. Tombstones still count toward the load, and are dropped on the next grow.`;
  trace.push({ kind: groupHasEmpty ? "info" : "warn", text: `delete "${target.key}": group ${target.g} ${groupHasEmpty ? "has an empty slot → ctrl=0x80" : "full → ctrl=0xFE tombstone"}` });
  return { st, trace };
}
