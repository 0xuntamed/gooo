/* defer · panic · recover, following runtime/panic.go.
   Open-coded defers (Go 1.14+): at most 8, none in a loop → a bitmask in the
   frame, calls inlined at each return. Otherwise _defer records: stack-allocated
   (deferprocStack) for straight-line defers, heap-allocated (deferproc) in loops. */

export const OPEN_SRC = `func process(items []string) (err error) {
	f, _ := os.Open("data.txt")
	defer f.Close()          // bit 0

	mu.Lock()
	defer mu.Unlock()        // bit 1

	defer func() {           // bit 2
		if r := recover(); r != nil {
			err = fmt.Errorf("recovered: %v", r)
		}
	}()

	return doWork(items)
}`;

export const LOOP_SRC = `func process(items []string) (err error) {
	f, _ := os.Open("data.txt")
	defer f.Close()

	mu.Lock()
	defer mu.Unlock()

	for _, it := range items {
		defer track(it)      // ← in a loop
	}

	return doWork(items)
}`;

export type Rec = { id: string; label: string; where: "bit" | "stack" | "heap"; state: "armed" | "firing" | "done" };
export type FrameState = "running" | "calling" | "panicking" | "unwinding" | "resumed" | "returned";
export type DState = {
  variant: "open" | "loop";
  lit: number[];
  recs: Rec[];
  frames: { name: string; state: FrameState }[];
  console: string[];
  msg: string;
  panicking: boolean;
};

const clone = (s: DState): DState => structuredClone(s);

function base(variant: "open" | "loop"): DState {
  return {
    variant, lit: [1], recs: [], console: [], panicking: false,
    frames: [{ name: "main.main", state: "calling" }, { name: "main.process", state: "running" }],
    msg: variant === "open"
      ? "Three defers, none in a loop, all in straight-line code: the compiler can **open-code** them."
      : "One defer sits in a loop. The compiler cannot know how many will run, so **open-coding is off for the whole function**.",
  };
}

type Tape = DState[];

function arm(t: Tape, lit: number[], rec: Rec, msg: string) {
  const s = clone(t[t.length - 1]);
  s.lit = lit;
  s.recs.push(rec);
  s.msg = msg;
  t.push(s);
}

function fire(t: Tape, id: string, lit: number[], msg: string, out?: string) {
  const s = clone(t[t.length - 1]);
  s.lit = lit;
  s.recs = s.recs.map((r) => (r.id === id ? { ...r, state: "firing" } : r.state === "firing" ? { ...r, state: "done" } : r));
  s.msg = msg;
  if (out) s.console.push(out);
  t.push(s);
}

function settle(t: Tape, patch: Partial<DState>, frames?: DState["frames"]) {
  const s = clone(t[t.length - 1]);
  s.recs = s.recs.map((r) => (r.state === "firing" ? { ...r, state: "done" } : r));
  Object.assign(s, patch);
  if (frames) s.frames = frames;
  t.push(s);
}

/** everything up to `return doWork(items)` */
function prologue(variant: "open" | "loop"): Tape {
  const t: Tape = [base(variant)];
  if (variant === "open") {
    arm(t, [3], { id: "b0", label: "f.Close()", where: "bit", state: "armed" }, "`defer f.Close()` sets **bit 0** of `deferBits`, a byte in the frame. No record, no allocation, no runtime call.");
    arm(t, [5, 6], { id: "b1", label: "mu.Unlock()", where: "bit", state: "armed" }, "`defer mu.Unlock()` sets **bit 1**. The arguments are evaluated now and saved in the frame.");
    arm(t, [8, 12], { id: "b2", label: "func() { recover() }", where: "bit", state: "armed" }, "The closure sets **bit 2**. The frame now carries `deferBits = 0b00000111`.");
  } else {
    arm(t, [3], { id: "d0", label: "f.Close()", where: "stack", state: "armed" }, "`defer f.Close()` builds a `_defer` record **in the frame** (`deferprocStack`) and links it onto `g._defer`.");
    arm(t, [5, 6], { id: "d1", label: "mu.Unlock()", where: "stack", state: "armed" }, "`defer mu.Unlock()`: another stack-allocated record, pushed on the front of the chain.");
    ["a", "b", "c"].forEach((it, i) => arm(t, [8, 9], { id: `h${i}`, label: `track("${it}")`, where: "heap", state: "armed" }, `Loop iteration ${i + 1}: \`defer track("${it}")\` calls \`deferproc\`, which !!allocates the record on the heap!!, because the count is only known at run time.`));
  }
  return t;
}

export function scenario(variant: "open" | "loop", how: "return" | "panic"): Tape {
  const t = prologue(variant);
  const ret = variant === "open" ? [14] : [12];
  const order = variant === "open" ? ["b2", "b1", "b0"] : ["h2", "h1", "h0", "d1", "d0"];
  const label = (id: string) => t[t.length - 1].recs.find((r) => r.id === id)!.label;

  if (how === "return") {
    settle(t, { lit: ret, msg: "`doWork` returns normally, and `process` starts its return path." }, [
      { name: "main.main", state: "calling" }, { name: "main.process", state: "running" },
    ]);
    order.forEach((id, i) => {
      const l = label(id);
      fire(t, id, ret, variant === "open"
        ? `Return path: test bit ${2 - i}, clear it, call **${l}** inline. ${i === 0 ? "No panic, so `recover()` returns nil." : ""}`
        : `\`deferreturn\` pops the front record and calls **${l}**. Last deferred, first run.`);
    });
    settle(t, { msg: variant === "open" ? "All three ran in reverse order, at the cost of a few `TESTB`s and three direct calls. ++`err` is nil.++" : `The runtime walked \`g._defer\`, calling and freeing ${order.length} records, ${order.filter((x) => x.startsWith("h")).length} of them heap-allocated.` }, [
      { name: "main.main", state: "running" },
    ]);
    t[t.length - 1].console.push("process returned <nil>");
    return t;
  }

  // panic
  settle(t, {
    lit: ret, panicking: true,
    msg: "`doWork` calls `panic(\"boom\")`. `gopanic` takes over: it stops normal execution and starts walking deferred calls, newest first, frame by frame.",
  }, [
    { name: "main.main", state: "calling" }, { name: "main.process", state: "calling" }, { name: "main.doWork", state: "panicking" },
  ]);
  settle(t, {
    msg: variant === "open"
      ? "`doWork` has no defers. In `process`, the frame's metadata says where `deferBits` lives, so **even open-coded defers are found** during a panic."
      : "`doWork` has no defers. The next records on `g._defer` belong to `process`.",
  }, [
    { name: "main.main", state: "calling" }, { name: "main.process", state: "unwinding" }, { name: "main.doWork", state: "returned" },
  ]);

  if (variant === "open") {
    fire(t, "b2", [9, 10], "The closure runs and calls `recover()`. There **is** a panic in progress, so recover marks `_panic.recovered = true` and returns `\"boom\"`.");
    settle(t, {
      lit: [10], panicking: false,
      msg: "The deferred call returns. The panic was recovered, so the runtime calls `mcall(recovery)`, which resets SP and PC to `process`'s **deferreturn point**. `process` resumes as if returning normally, and `err` is already set.",
    }, [
      { name: "main.main", state: "calling" }, { name: "main.process", state: "resumed" },
    ]);
    fire(t, "b1", [6], "The normal return path runs the remaining defers: **mu.Unlock()**…");
    fire(t, "b0", [3], "…and **f.Close()**. The lock and the file are released even though the body never finished.");
    settle(t, { msg: "`process` returns `err = recovered: boom`. It never finished its body, and nothing leaked." }, [{ name: "main.main", state: "running" }]);
    t[t.length - 1].console.push("process returned: recovered: boom");
    return t;
  }

  order.forEach((id) => fire(t, id, [9], `\`gopanic\` calls **${label(id)}**. It does not call \`recover()\`, so the panic continues.`));
  settle(t, {
    msg: "Every deferred call has run and none recovered. `gopanic` reaches the top of the goroutine, so the runtime prints the panic and a traceback, then !!exits with status 2!!.",
    panicking: true,
  }, [{ name: "main.main", state: "unwinding" }]);
  const s = t[t.length - 1];
  s.console.push("panic: boom", "", "goroutine 1 [running]:", "main.doWork(…)", "main.process(…)", "main.main()", "exit status 2");
  return t;
}
