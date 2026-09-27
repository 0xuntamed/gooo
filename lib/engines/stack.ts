/* Goroutine stacks on linux/amd64 (runtime/stack.go, internal/abi/stack.go):
   stackMin = 2048; stackGuard = StackNosplitBase(800) + StackSmall(128) = 928.
   The prologue compares SP with g.stackguard0 = stack.lo + 928; crossing it
   calls morestack → newstack, which doubles the stack by copying. */

export const STACK_MIN = 2048;
export const GUARD = 928;

export type Frame = { id: string; name: string; size: number; holds?: { to: string; kind: "ptr" | "uintptr"; label: string } };
export type Phase = "fresh" | "call" | "check-fail" | "copy" | "adjust" | "retry" | "ret" | "shrink" | "noshrink";
export type StackState = {
  size: number;
  frames: Frame[];
  phase: Phase;
  /** the stack being copied from, during growth */
  old: { size: number; frames: Frame[] } | null;
  pending: Frame | null;
  /** a uintptr taken before the move keeps its old number */
  staleUintptr: boolean;
  msg: string;
};

export const used = (fs: Frame[]) => fs.reduce((a, f) => a + f.size, 0);
export const ptrs = (fs: Frame[]) => fs.filter((f) => f.holds?.kind === "ptr").length;

export function stackInit(): StackState {
  return {
    size: STACK_MIN, phase: "fresh", old: null, pending: null, staleUintptr: false,
    frames: [{ id: "entry", name: "goroutine entry", size: 128 }],
    msg: "A new goroutine gets **2 KB** of stack. That is why a million of them fit in memory, where a million threads, at megabytes of stack each, would not.",
  };
}

export function call(st: StackState, f: Frame): StackState {
  const u = used(st.frames);
  if (u + f.size > st.size - GUARD) {
    return {
      ...st, phase: "check-fail", pending: f, old: null,
      msg: `Calling **${f.name}** needs ${f.size} B, and SP would drop below \`stackguard0\`. The prologue's \`JLS\` is taken: **morestack**.`,
    };
  }
  return {
    ...st, phase: "call", pending: null, old: null,
    frames: [...st.frames, f],
    msg: `Called **${f.name}**: a ${f.size}-byte frame. The prologue compared SP with \`g.stackguard0\`, found room, and fell through. Two instructions and a branch that was not taken.`,
  };
}

export function grow(st: StackState): StackState {
  const size = st.size * 2;
  return {
    ...st, size, phase: "copy", old: { size: st.size, frames: st.frames },
    msg: `\`newstack\` allocates **${size / 1024} KB**, twice the old size, and \`copystack\` moves every frame across with one \`memmove\`. The goroutine sits in \`_Gcopystack\` meanwhile.`,
  };
}

export function adjust(st: StackState): StackState {
  const n = ptrs(st.frames);
  const saved = st.frames.length - 1;
  return {
    ...st, phase: "adjust",
    staleUintptr: st.frames.some((f) => f.holds?.kind === "uintptr"),
    msg: `Every pointer that aimed into the old stack is rewritten to the same offset in the new one: **${n} pointer${n === 1 ? "" : "s"}** held in locals here, plus ${saved} saved frame pointers. Stack maps say exactly which words are pointers.` +
      (st.frames.some((f) => f.holds?.kind === "uintptr") ? " !!The uintptr is not one of them.!!" : ""),
  };
}

export function retry(st: StackState): StackState {
  const f = st.pending!;
  return {
    ...st, phase: "retry", old: null, pending: null,
    frames: [...st.frames, f],
    msg: `The old stack is freed and **${f.name}** is called again from the top, on the new stack, as if nothing had happened.`,
  };
}

export function ret(st: StackState): StackState {
  if (st.frames.length <= 1) return { ...st, phase: "ret", msg: "Nothing left to return from." };
  const f = st.frames[st.frames.length - 1];
  return {
    ...st, phase: "ret", old: null, pending: null,
    frames: st.frames.slice(0, -1),
    msg: `Returned from **${f.name}**. The stack does **not** shrink here: the ${st.size / 1024} KB stay allocated. Returning has to be cheap, and the goroutine may well go deep again.`,
  };
}

export function shrink(st: StackState): StackState {
  const u = used(st.frames);
  if (st.size > STACK_MIN && u < st.size / 4) {
    return {
      ...st, size: st.size / 2, phase: "shrink", old: null,
      msg: `During a GC, \`shrinkstack\` found only ${u} B of ${st.size / 1024} KB in use, under a quarter, so it copied the frames into a stack half the size: **${st.size / 2048} KB**.`,
    };
  }
  return {
    ...st, phase: "noshrink",
    msg: `No shrink. The GC only halves a stack when less than **a quarter** of it is in use (${u} B of ${st.size} B now)${st.size === STACK_MIN ? ", and never below 2 KB" : ""}.`,
  };
}

/* the frames of the story: a recursive-descent parser going deep */
export const STORY_FRAMES: Frame[] = [
  { id: "f1", name: "parseExpr", size: 160 },
  { id: "f2", name: "parseTerm", size: 128 },
  { id: "f3", name: "parseFactor", size: 192, holds: { to: "f1", kind: "ptr", label: "p := &buf" } },
  { id: "f4", name: "parseUnary", size: 160 },
  { id: "f5", name: "parsePrimary", size: 224, holds: { to: "f3", kind: "uintptr", label: "u := uintptr(…)" } },
  { id: "f6", name: "parseCall", size: 192, holds: { to: "f4", kind: "ptr", label: "q := &tok" } },
];

const NAMES = ["parseExpr", "parseTerm", "parseFactor", "parseUnary", "parsePrimary", "parseCall", "parseArgs", "parseList"];
let n = 0;
export function randomFrame(depth: number): Frame {
  const size = [96, 128, 160, 192, 224][(depth * 7 + n) % 5];
  n++;
  const id = `r${n}`;
  return { id, name: NAMES[depth % NAMES.length] + (depth >= NAMES.length ? "′" : ""), size, holds: depth > 1 && depth % 3 === 0 ? { to: "", kind: "ptr", label: "&local" } : undefined };
}
