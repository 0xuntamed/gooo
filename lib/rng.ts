/** Small deterministic PRNG (mulberry32). Story steps must replay identically. */
export function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    /** expose the state so a whole simulation can be snapshotted */
    get state() { return s; },
    set state(v: number) { s = v >>> 0; },
  };
}
export type Rng = ReturnType<typeof rng>;

export function bytes(n: number) {
  if (n >= 1048576) return `${+(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB`;
  if (n >= 1024) return `${+(n / 1024).toFixed(n >= 10240 ? 0 : 1)} KB`;
  return `${n} B`;
}

export const hex = (n: number, pad = 2) => "0x" + n.toString(16).toUpperCase().padStart(pad, "0");
export const bin = (n: number, pad = 8) => n.toString(2).padStart(pad, "0");
