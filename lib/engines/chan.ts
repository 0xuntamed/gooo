/* hchan, after runtime/chan.go: a lock, a ring of dataqsiz slots, send and
   receive indices, and two wait queues of sudogs. */

export type Sudog = { g: number; v?: number };
export type Op =
  | "init" | "buffered" | "recv" | "recv-refill" | "direct-send" | "direct-recv"
  | "block-send" | "block-recv" | "close" | "closed-recv" | "panic-send" | "panic-close";
export type ChanState = {
  cap: number;
  buf: (number | null)[];
  sendx: number; recvx: number; qcount: number;
  /** monotonic counters so the ring's hands only ever turn forward */
  sendAbs: number; recvAbs: number;
  closed: boolean;
  sendq: Sudog[]; recvq: Sudog[];
  next: number; nextG: number;
  /** what the active receiver last got, and what woke */
  got: number | null; gotOk: boolean;
  woke: number[];
  op: Op;
  msg: string;
  code: string;
};

export function chanInit(cap: number): ChanState {
  return {
    cap, buf: Array(cap).fill(null), sendx: 0, recvx: 0, qcount: 0, sendAbs: 0, recvAbs: 0,
    closed: false, sendq: [], recvq: [], next: 1, nextG: 20, got: null, gotOk: true, woke: [], op: "init",
    code: cap ? `ch := make(chan int, ${cap})` : "ch := make(chan int)",
    msg: cap
      ? `A channel is an ordinary struct behind a mutex: a ring of **${cap}** slots, a send index, a receive index, and two queues of parked goroutines. Only the syntax is special.`
      : "An **unbuffered** channel: `dataqsiz` is 0, so there is nowhere to put a value. Every transfer is a rendezvous between two goroutines.",
  };
}

type Tr = { kind: "info" | "warn" | "note"; text: string };

export function chanAct(prev: ChanState, k: "send" | "recv" | "close"): { st: ChanState; trace: Tr[] } {
  const st: ChanState = structuredClone(prev);
  st.woke = [];
  const trace: Tr[] = [];

  if (k === "close") {
    if (st.closed) {
      st.op = "panic-close";
      st.code = "close(ch)";
      st.msg = "!!panic: close of closed channel!! Closing is a one-way event, and the runtime refuses to do it twice.";
      trace.push({ kind: "warn", text: "panic: close of closed channel" });
      return { st, trace };
    }
    st.closed = true;
    st.op = "close";
    st.code = "close(ch)";
    const r = st.recvq.map((s) => s.g), senders = st.sendq.length;
    st.woke = r;
    st.recvq = [];
    st.sendq = [];
    st.msg = `\`closechan\` sets \`closed = 1\` and wakes **every** parked goroutine. ${r.length ? `${r.length} receiver${r.length > 1 ? "s" : ""} wake with the zero value and \`ok == false\`.` : "No receivers were waiting."}` +
      (senders ? ` !!${senders} parked sender${senders > 1 ? "s" : ""} will panic on waking.!!` : "") +
      (st.qcount ? ` The ${st.qcount} buffered value${st.qcount > 1 ? "s" : ""} can still be received.` : "");
    trace.push({ kind: "warn", text: `closechan: released ${r.length} receiver(s), ${senders} sender(s) will panic` });
    return { st, trace };
  }

  if (k === "send") {
    st.code = `ch <- ${st.next}`;
    if (st.closed) {
      st.op = "panic-send";
      st.msg = "!!panic: send on closed channel!! It is the one channel operation that panics instead of blocking, and there is no way to make it safe from the sender's side. Ownership has to decide who closes.";
      trace.push({ kind: "warn", text: "panic: send on closed channel" });
      return { st, trace };
    }
    const v = st.next++;
    if (st.recvq.length) {
      const r = st.recvq.shift()!;
      st.got = v; st.gotOk = true;
      st.woke = [r.g];
      st.op = "direct-send";
      st.msg = `**Direct handoff.** G${r.g} was already parked on \`recvq\`, so \`send\` copied ${v} **straight into G${r.g}'s stack** through the pointer in its sudog. The buffer was never touched. Then \`goready(G${r.g})\`.`;
      trace.push({ kind: "info", text: `chansend: recvq non-empty → sendDirect ${v} to G${r.g}, goready(G${r.g})` });
      return { st, trace };
    }
    if (st.qcount < st.cap) {
      st.buf[st.sendx] = v;
      const at = st.sendx;
      st.sendx = (st.sendx + 1) % st.cap;
      st.sendAbs++;
      st.qcount++;
      st.op = "buffered";
      st.msg = `**Buffered.** ${v} was copied into slot ${at}, and \`sendx\` moved on to ${st.sendx}${st.sendx === 0 && at === st.cap - 1 ? ", wrapping round the ring" : ""}. No goroutine parked, and the scheduler was not involved.`;
      trace.push({ kind: "info", text: `chansend: buffered ${v} at [${at}], qcount=${st.qcount}/${st.cap}` });
      return { st, trace };
    }
    const g = st.nextG++;
    st.sendq.push({ g, v });
    st.op = "block-send";
    st.msg = `**Blocked.** ${st.cap ? "The buffer is full." : "There is no buffer and no receiver waiting."} G${g} wraps itself in a \`sudog\` that points at its value ${v}, joins \`sendq\`, and calls \`gopark\`. It is now off every run queue (block 08).`;
    trace.push({ kind: "info", text: `chansend: G${g} gopark, sudog{elem: ${v}} on sendq` });
    return { st, trace };
  }

  // recv
  st.code = "v, ok := <-ch";
  if (st.qcount > 0) {
    const v = st.buf[st.recvx]!;
    st.buf[st.recvx] = null;
    const at = st.recvx;
    st.recvx = (st.recvx + 1) % st.cap;
    st.recvAbs++;
    st.qcount--;
    st.got = v; st.gotOk = true;
    st.op = "recv";
    let extra = "";
    if (st.sendq.length) {
      const s = st.sendq.shift()!;
      st.buf[st.sendx] = s.v!;
      st.sendx = (st.sendx + 1) % st.cap;
      st.sendAbs++;
      st.qcount++;
      st.woke = [s.g];
      st.op = "recv-refill";
      extra = ` A sender was parked, so its value ${s.v} went straight into the slot just freed, and G${s.g} was readied. The buffer stays full and in order.`;
      trace.push({ kind: "info", text: `chanrecv: took ${v}, refilled from sendq G${s.g} (${s.v}), goready(G${s.g})` });
    } else trace.push({ kind: "info", text: `chanrecv: ${v} from [${at}], qcount=${st.qcount}` });
    st.msg = `Received ${v} from slot ${at}; \`recvx\` moved to ${st.recvx}.` + extra;
    return { st, trace };
  }
  if (st.sendq.length) {
    const s = st.sendq.shift()!;
    st.got = s.v!; st.gotOk = true;
    st.woke = [s.g];
    st.op = "direct-recv";
    st.msg = `**Direct handoff.** Nothing buffered, but G${s.g} was parked holding ${s.v}. \`recv\` copied it out of that sudog and readied G${s.g}. One copy, no buffer.`;
    trace.push({ kind: "info", text: `chanrecv: direct from G${s.g}'s sudog (${s.v}), goready(G${s.g})` });
    return { st, trace };
  }
  if (st.closed) {
    st.got = 0; st.gotOk = false;
    st.op = "closed-recv";
    st.msg = "Closed and drained, so the receive returns at once with the **zero value** and `ok == false`. This is exactly what ends a `for v := range ch` loop.";
    trace.push({ kind: "info", text: "chanrecv: closed and empty → 0, ok=false" });
    return { st, trace };
  }
  const g = st.nextG++;
  st.recvq.push({ g });
  st.op = "block-recv";
  st.msg = `**Blocked.** Nothing to receive. G${g} parks on \`recvq\` with a sudog holding *the address to write into*, which is a slot on its own stack. The next sender will write directly there.`;
  trace.push({ kind: "info", text: `chanrecv: G${g} gopark, sudog on recvq` });
  return { st, trace };
}
