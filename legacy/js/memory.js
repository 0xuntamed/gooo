/* ============================================================
   THE GO MACHINE — communication & memory
   07 channels & select · 08 allocator · 09 garbage collector
   ============================================================ */
(function () {
  'use strict';
  var GM = window.GoMachine;
  var $ = GM.$, $$ = GM.$$, el = GM.el, clear = GM.clear;

  /* ══════════════════════════════════════════════════════════
     07 · CHANNELS & SELECT
     ══════════════════════════════════════════════════════════ */

  var C = null;

  function newChan(cap) {
    return {
      cap: cap, buf: new Array(cap).fill(null),
      sendx: 0, recvx: 0, qcount: 0,
      closed: false, sendq: [], recvq: [],
      nextVal: 1, nextG: 20, msg: null
    };
  }

  function chSend() {
    if (C.closed) {
      C.msg = '<span class="panicline">panic: send on closed channel</span> — ' +
        'the only channel operation that panics rather than blocking. There is no way to ' +
        'make it safe from the sender side; ownership has to decide who closes.';
      GM.trace('warn', 'panic: send on closed channel');
      return render07();
    }
    var v = C.nextVal++;

    if (C.recvq.length) {
      var r = C.recvq.shift();
      C.msg = '<b class="direct">Direct handoff.</b> A receiver was already parked, so ' +
        '<code>send</code> copied value <code>' + v + '</code> straight from the sender\'s stack into ' +
        '<b>G' + r.g + '</b>\'s frame — the buffer was never touched — then called ' +
        '<code>goready(G' + r.g + ')</code>.';
      GM.trace('info', 'chansend: direct handoff of ' + v + ' → G' + r.g + ', goready');
      return render07();
    }
    if (C.qcount < C.cap) {
      C.buf[C.sendx] = v;
      C.sendx = (C.sendx + 1) % C.cap;
      C.qcount++;
      C.msg = 'Buffered. Value <code>' + v + '</code> copied into slot <code>' +
        ((C.sendx - 1 + C.cap) % C.cap) + '</code>; <code>sendx</code> advanced, wrapping at ' +
        '<code>dataqsiz</code>. No goroutine parked, no scheduler involvement.';
      GM.trace('info', 'chansend: buffered ' + v + ' (qcount=' + C.qcount + '/' + C.cap + ')');
      return render07();
    }
    var g = C.nextG++;
    C.sendq.push({ g: g, v: v });
    C.msg = '<b>Blocked.</b> ' + (C.cap === 0
      ? 'This channel is unbuffered, so there is nowhere to put the value. '
      : 'The buffer is full. ') +
      '<b>G' + g + '</b> allocated a <code>sudog</code> holding a pointer to its value, pushed it onto ' +
      '<code>hchan.sendq</code>, and called <code>gopark</code> → <code>_Gwaiting</code>. ' +
      'It is now off every run queue.';
    GM.trace('info', 'chansend: G' + g + ' gopark — sudog queued on sendq');
    render07();
  }

  function chRecv() {
    if (C.qcount > 0) {
      var v = C.buf[C.recvx];
      C.buf[C.recvx] = null;
      C.recvx = (C.recvx + 1) % C.cap;
      C.qcount--;
      var extra = '';
      if (C.sendq.length) {
        var s = C.sendq.shift();
        C.buf[C.sendx] = s.v;
        C.sendx = (C.sendx + 1) % C.cap;
        C.qcount++;
        extra = ' A sender was parked, so the freed slot was immediately refilled from ' +
          '<b>G' + s.g + '</b>\'s <code>sudog</code> and that goroutine was readied.';
        GM.trace('info', 'chanrecv: slot freed → dequeued sudog from sendq, goready(G' + s.g + ')');
      }
      C.msg = 'Received <code>' + v + '</code> from slot <code>' +
        ((C.recvx - 1 + C.cap) % C.cap) + '</code>.' + extra;
      GM.trace('info', 'chanrecv: got ' + v + ' (qcount=' + C.qcount + ')');
      return render07();
    }
    if (C.sendq.length) {
      var s2 = C.sendq.shift();
      C.msg = '<b class="direct">Direct handoff.</b> Nothing in the buffer, but <b>G' + s2.g +
        '</b> was parked with value <code>' + s2.v + '</code>. <code>recv</code> copied it out of that ' +
        'goroutine\'s <code>sudog</code> and readied it. One copy, no buffer.';
      GM.trace('info', 'chanrecv: direct receive of ' + s2.v + ' from G' + s2.g + ', goready');
      return render07();
    }
    if (C.closed) {
      C.msg = 'Channel is closed and drained, so the receive returns immediately with the ' +
        '<b>zero value</b> and <code>ok == false</code>. This is exactly what ends a ' +
        '<code>for range ch</code> loop.';
      GM.trace('info', 'chanrecv: closed and empty → zero value, ok=false');
      return render07();
    }
    var g = C.nextG++;
    C.recvq.push({ g: g });
    C.msg = '<b>Blocked.</b> <b>G' + g + '</b> pushed a <code>sudog</code> onto <code>recvq</code> ' +
      'carrying the address to write into, then parked. The next sender will write ' +
      'directly into this goroutine\'s stack.';
    GM.trace('info', 'chanrecv: G' + g + ' gopark — sudog queued on recvq');
    render07();
  }

  function chClose() {
    if (C.closed) {
      C.msg = '<span class="panicline">panic: close of closed channel</span>';
      GM.trace('warn', 'panic: close of closed channel');
      return render07();
    }
    C.closed = true;
    var woke = C.recvq.length, senders = C.sendq.length;
    C.recvq = [];
    C.msg = '<code>closechan</code> set <code>closed = 1</code> and drained both wait queues. ' +
      woke + ' parked receiver' + (woke === 1 ? '' : 's') + ' woke with the zero value.' +
      (senders ? ' <span class="panicline">' + senders + ' parked sender' + (senders === 1 ? '' : 's') +
        ' will panic on wake.</span>' : '');
    GM.trace('warn', 'closechan: released ' + woke + ' receiver(s), ' + senders + ' sender(s) will panic');
    C.sendq = [];
    render07();
  }

  function render07() {
    var box = $('#hchanBox');
    clear(box);
    [['qcount', C.qcount, C.qcount > 0],
     ['dataqsiz', C.cap, false],
     ['sendx', C.cap ? C.sendx : '—', false],
     ['recvx', C.cap ? C.recvx : '—', false],
     ['closed', C.closed ? 1 : 0, C.closed],
     ['elemsize', 8, false],
     ['sendq', C.sendq.length, C.sendq.length > 0],
     ['recvq', C.recvq.length, C.recvq.length > 0]
    ].forEach(function (f) {
      box.appendChild(el('div', { class: 'f' + (f[2] ? ' lit' : '') }, [
        el('span', { text: f[0] }), el('b', { text: String(f[1]) })
      ]));
    });

    var ring = $('#chanRing');
    clear(ring);
    ring.classList.toggle('unbuf', C.cap === 0);
    if (C.cap === 0) {
      ring.appendChild(el('div', { class: 'dim', html:
        'unbuffered — <code>dataqsiz = 0</code><br>every transfer is a rendezvous' }));
    } else {
      for (var i = 0; i < C.cap; i++) {
        var filled = C.buf[i] !== null;
        var cls = 'cell' + (filled ? ' filled' : '') +
          (i === C.sendx ? ' sendx' : '') + (i === C.recvx ? ' recvx' : '');
        ring.appendChild(el('div', { class: cls, text: filled ? String(C.buf[i]) : '·' }));
      }
    }

    var sq = $('#chanSenders');
    clear(sq);
    sq.appendChild(el('h5', null, [el('span', { text: 'hchan.sendq' }),
      el('span', { text: C.sendq.length + ' sudog' })]));
    C.sendq.forEach(function (s) {
      sq.appendChild(el('div', { class: 'sudog' }, [
        el('span', { text: 'G' + s.g }), el('span', { class: 'el', text: 'elem→' + s.v })
      ]));
    });
    if (!C.sendq.length) sq.appendChild(el('div', { class: 'dim mono', style: 'font-size:11px', text: 'empty' }));

    var rq = $('#chanRecvers');
    clear(rq);
    rq.appendChild(el('h5', null, [el('span', { text: 'hchan.recvq' }),
      el('span', { text: C.recvq.length + ' sudog' })]));
    C.recvq.forEach(function (s) {
      rq.appendChild(el('div', { class: 'sudog' }, [
        el('span', { text: 'G' + s.g }), el('span', { class: 'el', text: 'elem→stack' })
      ]));
    });
    if (!C.recvq.length) rq.appendChild(el('div', { class: 'dim mono', style: 'font-size:11px', text: 'empty' }));

    $('#chanHandoff').innerHTML = C.msg ||
      'A channel is a struct behind a mutex. Send, receive and close are ordinary functions in ' +
      '<code>runtime/chan.go</code> — the only compiler magic is the syntax.';
  }

  GM.register('chan', {
    title: 'Channels & select',
    sub: 'A ring buffer, two wait queues, one lock',
    hint: 'runtime/chan.go · hchan',
    init: function () {
      C = newChan(4);
      $$('[data-cx]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-cx');
          if (k === 'send') chSend();
          else if (k === 'recv') chRecv();
          else if (k === 'close') chClose();
          else { C = newChan(C.cap); GM.trace('info', 'chan reset'); render07(); }
        });
      });
      $('#chcap').addEventListener('input', function (e) {
        var n = +e.target.value;
        $('#chcapOut').textContent = n === 0 ? '0' : n;
        C = newChan(n);
        GM.trace('note', 'ch = make(chan int, ' + n + ')' + (n === 0 ? ' — unbuffered' : ''));
        render07();
      });
    },
    enter: render07
  });

  /* ══════════════════════════════════════════════════════════
     08 · ALLOCATOR
     ══════════════════════════════════════════════════════════ */

  /* runtime's real class_to_size table */
  var SIZE_CLASSES = [0, 8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208,
    224, 240, 256, 288, 320, 352, 384, 416, 448, 480, 512, 576, 640, 704, 768, 896, 1024,
    1152, 1280, 1408, 1536, 1792, 2048, 2304, 2688, 3072, 3200, 3456, 4096, 4864, 5376,
    6144, 6528, 6784, 6912, 8192, 9472, 9728, 10240, 10880, 12288, 13568, 14336, 16384,
    18432, 19072, 20480, 21760, 24576, 27264, 28672, 32768];

  var A = { cls: -1, tier: null, span: null, msg: '', mcacheLeft: {} };

  var TIERS = [
    { id: 'call', h: 'mallocgc', sub: 'the entry point', p: 'Rounds the size up, picks a path, and returns a pointer. Also charges the goroutine a GC assist if a cycle is running.', lock: 'no lock' },
    { id: 'mcache', h: 'mcache', sub: 'per-P · runtime.p.mcache', p: 'A private set of spans, one per size class. Bump a pointer into the current span and you are done.', lock: 'no lock' },
    { id: 'mcentral', h: 'mcentral', sub: 'per size class · global', p: 'Holds partially-full and full spans of one size class. Only touched when the mcache runs dry.', lock: 'needs a lock' },
    { id: 'mheap', h: 'mheap', sub: 'page allocator · 8 KB pages', p: 'Carves 64 MB arenas into spans. Falls through to the OS when it has no free pages.', lock: 'needs a lock' }
  ];

  function classFor(n) {
    for (var i = 1; i < SIZE_CLASSES.length; i++) if (SIZE_CLASSES[i] >= n) return i;
    return -1;
  }

  function alloc(kind) {
    if (kind === 'reset') {
      A = { cls: -1, tier: null, span: null, msg: '', mcacheLeft: {} };
      GM.trace('info', 'allocator reset');
      return render08();
    }

    if (kind === 'tiny') {
      A.cls = classFor(16);
      A.tier = ['call', 'mcache'];
      A.span = { size: 16, total: 512, used: 340, fresh: 3, tiny: true };
      A.msg = '8 bytes, and <code>[]byte</code> holds no pointers — so this goes through the ' +
        '<b>tiny allocator</b>. The current 16-byte tiny block has room, so the offset is bumped ' +
        'and the pointer returned. No size class lookup, no span refill, nothing for the sweeper ' +
        'to track separately.';
      GM.trace('info', 'mallocgc(8, noscan) — tiny allocator, bumped tinyoffset');
      return render08();
    }

    if (kind === 'small') {
      A.cls = classFor(200);
      var sz = SIZE_CLASSES[A.cls];
      var left = A.mcacheLeft[A.cls];
      if (left === undefined || left <= 0) {
        A.tier = ['call', 'mcache', 'mcentral'];
        A.mcacheLeft[A.cls] = 39;
        A.span = { size: sz, total: 39, used: 1, fresh: 1 };
        A.msg = '200 bytes rounds up to size class <b>' + A.cls + '</b> (' + sz + ' bytes) — ' +
          '8 bytes wasted, 4%. The mcache had no span for this class, so it called ' +
          '<code>mcentral.cacheSpan()</code>, took a lock, and got an 8 KB span holding ' +
          '<b>39 objects</b>. The next 38 allocations of this size will not leave the P.';
        GM.trace('warn', 'mcache miss → mcentral.cacheSpan(class ' + A.cls + '), 8192/208 = 39 objects');
      } else {
        A.mcacheLeft[A.cls]--;
        A.tier = ['call', 'mcache'];
        A.span = { size: sz, total: 39, used: 39 - A.mcacheLeft[A.cls], fresh: 1 };
        A.msg = 'Size class <b>' + A.cls + '</b> (' + sz + ' bytes). The mcache span for this class ' +
          'still has <b>' + A.mcacheLeft[A.cls] + '</b> free slots, so the allocation is a scan of ' +
          '<code>allocCache</code> for a zero bit and a pointer computation. <b>No lock was taken.</b>';
        GM.trace('info', 'mallocgc(200) — mcache hit, class ' + A.cls + ', ' + A.mcacheLeft[A.cls] + ' left');
      }
      return render08();
    }

    // large
    A.cls = -1;
    A.tier = ['call', 'mheap'];
    A.span = { size: 65536, total: 1, used: 1, fresh: 1, large: true };
    A.msg = '64 KB is over the 32 KB limit, so there is no size class and no mcache involvement. ' +
      '<code>mheap.allocSpan()</code> takes the heap lock and carves a dedicated span of ' +
      '<b>8 pages</b> holding exactly one object. Large objects are also swept individually.';
    GM.trace('warn', 'mallocgc(65536) — large object, mheap.allocSpan(8 pages), heap lock held');
    render08();
  }

  function render08() {
    var flow = $('#allocFlow');
    clear(flow);
    TIERS.forEach(function (t) {
      var lit = A.tier && A.tier.indexOf(t.id) >= 0;
      flow.appendChild(el('div', { class: 'atier' + (lit ? ' lit' : '') }, [
        el('div', { class: 'sub', text: t.sub }),
        el('h5', { text: t.h }),
        el('p', { text: t.p }),
        el('div', { class: 'lock' + (t.lock !== 'no lock' ? ' needs' : ''), text: t.lock })
      ]));
    });

    var sc = $('#sizeClasses');
    clear(sc);
    SIZE_CLASSES.forEach(function (s, i) {
      if (i === 0) return;
      sc.appendChild(el('div', {
        class: 'sc' + (i === A.cls ? ' hit' : ''),
        title: 'class ' + i + ' — ' + s + ' bytes',
        text: String(s)
      }));
    });
    var hit = sc.querySelector('.hit');
    if (hit && hit.scrollIntoView) hit.scrollIntoView({ block: 'nearest' });

    var sv = $('#spanView');
    clear(sv);
    if (!A.span) {
      sv.appendChild(el('div', { class: 'dim', style: 'font-size:12.5px',
        html: 'Allocate something above.<br><br>Every object in a span is the same size, which is what lets the sweeper free memory by clearing a bitmap instead of walking a free list.' }));
    } else {
      var s = A.span;
      var meta = el('div', { class: 'spanmeta' });
      [['elemsize', s.size + ' B'],
       ['npages', s.large ? '8' : '1'],
       ['nelems', String(s.total)],
       ['freeindex', String(s.used)],
       ['sweepgen', 'clean']
      ].forEach(function (r) {
        meta.appendChild(el('div', null, [
          el('span', { class: 'dim', text: r[0] + '  ' }), el('b', { text: r[1] })
        ]));
      });
      sv.appendChild(meta);
      var grid = el('div', { class: 'spangrid' });
      var n = Math.min(s.total, 60);
      for (var i = 0; i < n; i++) {
        grid.appendChild(el('div', {
          class: 'obj-cell' + (i < s.used ? ' used' : '') + (i === s.used - 1 ? ' fresh' : '')
        }));
      }
      sv.appendChild(grid);
      if (s.total > 60) sv.appendChild(el('div', { class: 'dim mono', style: 'font-size:10px', text: '+ ' + (s.total - 60) + ' more' }));
      sv.appendChild(el('div', { class: 'dim mono', style: 'font-size:10px',
        text: s.large ? 'one object, its own span' : 'allocBits — one bit per object' }));
    }

    var msg = $('.allocmsg');
    if (!msg) {
      msg = el('div', { class: 'handoff allocmsg' });
      $('#allocFlow').insertAdjacentElement('afterend', msg);
    }
    msg.innerHTML = A.msg ||
      'Go\'s allocator is TCMalloc rebuilt around P. Because an M must hold a P to run Go code, ' +
      'and the <code>mcache</code> hangs off the P, the fast path needs no lock at all.';
  }

  GM.register('alloc', {
    title: 'Allocator',
    sub: 'Three tiers, and mostly no lock',
    hint: 'runtime/malloc.go · GODEBUG=allocfreetrace=1',
    init: function () {
      $$('[data-ax]').forEach(function (b) {
        b.addEventListener('click', function () { alloc(b.getAttribute('data-ax')); });
      });
    },
    enter: render08
  });

  /* ══════════════════════════════════════════════════════════
     09 · GARBAGE COLLECTOR
     ══════════════════════════════════════════════════════════ */

  var G9 = null;
  var GC_PHASES = [
    ['off', 'Off', 'mutator only', false],
    ['sweeptermination', 'Sweep termination', 'STW', true],
    ['mark', 'Mark', 'concurrent · barrier on', false],
    ['marktermination', 'Mark termination', 'STW', true],
    ['sweep', 'Sweep', 'concurrent · lazy', false]
  ];

  function seeded(seed) {
    return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  }

  function buildGraph() {
    var rnd = seeded(20260909);
    var nodes = [], edges = [];
    var cols = [2, 5, 6, 5];
    var id = 0;
    cols.forEach(function (count, c) {
      for (var i = 0; i < count; i++) {
        nodes.push({
          id: id++, col: c, root: c === 0,
          x: 58 + c * 148,
          y: 42 + i * 52 + (c % 2 ? 22 : 0) + Math.round(rnd() * 8),
          color: 'white',
          size: [32, 48, 64, 96, 128, 256][(rnd() * 6) | 0]
        });
      }
    });
    nodes.forEach(function (n) {
      if (n.col === 0) return;
      var prev = nodes.filter(function (o) { return o.col === n.col - 1; });
      // deliberately leave a few nodes unreachable so the sweep has something to free
      if (rnd() < 0.78 && prev.length) {
        edges.push({ from: prev[(rnd() * prev.length) | 0].id, to: n.id });
      }
      if (rnd() < 0.28 && prev.length) {
        edges.push({ from: prev[(rnd() * prev.length) | 0].id, to: n.id });
      }
    });
    return { nodes: nodes, edges: edges };
  }

  function newGC() {
    var g = buildGraph();
    var st = {
      nodes: g.nodes, edges: g.edges,
      phase: 0, grey: [], scanned: 0, barrierHits: 0,
      gogc: 100, live: 0, heap: 0, goal: 0, cycle: 0,
      msg: null
    };
    // The goal is a standing value set at the end of a cycle, so it needs a
    // starting figure before any cycle has run.
    st.goal = Math.round(g.nodes.reduce(function (a, n) { return a + n.size; }, 0) * 2);
    return st;
  }

  function reachable(id) {
    return G9.edges.filter(function (e) { return e.from === id; }).map(function (e) { return e.to; });
  }

  function heapBytes() {
    return G9.nodes.reduce(function (a, n) { return n.freed ? a : a + n.size; }, 0);
  }
  function liveBytes() {
    return G9.nodes.reduce(function (a, n) { return (n.color === 'black' && !n.freed) ? a + n.size : a; }, 0);
  }

  function gcStart() {
    G9.cycle++;
    G9.phase = 1;
    G9.nodes.forEach(function (n) { n.color = 'white'; n.freed = false; });
    G9.grey = [];
    G9.scanned = 0;
    G9.barrierHits = 0;
    GM.trace('gc', 'GC ' + G9.cycle + ' start — sweep termination, stop-the-world');
    setTimeout(function () {
      if (!G9 || G9.phase !== 1) return;
      G9.phase = 2;
      G9.nodes.filter(function (n) { return n.root; }).forEach(function (n) {
        n.color = 'grey'; G9.grey.push(n.id);
      });
      G9.msg = 'World restarted. Write barrier is <b>on</b>. Roots — globals and every goroutine ' +
        'stack — are greyed; from here the collector runs alongside your code on 25% of the Ps.';
      GM.trace('gc', 'GC ' + G9.cycle + ' mark phase — write barrier enabled, ' +
        G9.grey.length + ' roots greyed, 25% of Ps dedicated');
      render09();
    }, 520);
    G9.msg = '<b>Stop-the-world.</b> Finish sweeping the previous cycle, then turn the write ' +
      'barrier on. This pause is measured in microseconds.';
    render09();
  }

  function gcStep() {
    if (G9.phase === 0) return gcStart();
    if (G9.phase !== 2) return;

    if (!G9.grey.length) {
      G9.phase = 3;
      G9.msg = '<b>No grey objects left.</b> Stop-the-world again to check the work queues are ' +
        'genuinely drained, then turn the barrier off.';
      GM.trace('gc', 'GC ' + G9.cycle + ' mark termination — stop-the-world, barrier off');
      setTimeout(function () {
        if (!G9 || G9.phase !== 3) return;
        G9.phase = 4;
        var garbage = G9.nodes.filter(function (n) { return n.color === 'white' && !n.freed; });
        var freed = garbage.reduce(function (a, n) { return a + n.size; }, 0);
        garbage.forEach(function (n) { n.freed = true; });
        G9.live = liveBytes();
        G9.goal = Math.round(G9.live * (1 + G9.gogc / 100));
        G9.msg = '<b>Sweep.</b> ' + garbage.length + ' white objects (' + GM.bytes(freed) +
          ') were never reached, so their bits are cleared in the span bitmaps. Nothing moves — ' +
          'Go\'s collector is non-compacting, which is what lets cgo hold Go pointers.';
        GM.trace('gc', 'gc ' + G9.cycle + ' @' + (G9.cycle * 0.31).toFixed(3) + 's 0%: ' +
          '0.021+1.4+0.008 ms clock, ' + GM.bytes(G9.live + freed) + '->' + GM.bytes(G9.live + freed) +
          '->' + GM.bytes(G9.live) + ', ' + GM.bytes(G9.goal) + ' goal, 4 P');
        render09();
      }, 520);
      return render09();
    }

    var id = G9.grey.shift();
    var n = G9.nodes[id];
    n.color = 'black';
    G9.scanned++;
    var greyed = 0;
    reachable(id).forEach(function (cid) {
      var c = G9.nodes[cid];
      if (c.color === 'white') { c.color = 'grey'; G9.grey.push(cid); greyed++; }
    });
    G9.msg = 'Scanned object <b>' + id + '</b> → black. It pointed at ' + greyed +
      ' white object' + (greyed === 1 ? '' : 's') + ', now grey. The invariant holds: ' +
      '<b>no black object points at a white one.</b>';
    render09();
  }

  function gcMutate() {
    if (G9.phase !== 2) {
      G9.msg = 'The write barrier only exists during the mark phase. Outside it, a pointer write ' +
        'is a plain <code>MOV</code>. Start a GC to see it fire.';
      return render09();
    }
    var blacks = G9.nodes.filter(function (n) { return n.color === 'black' && !n.freed; });
    var whites = G9.nodes.filter(function (n) { return n.color === 'white' && !n.freed; });
    if (!blacks.length || !whites.length) {
      G9.msg = 'Need a black object and a white object for the dangerous case. Step the mark a few more times.';
      return render09();
    }
    var b = blacks[(Math.random() * blacks.length) | 0];
    var w = whites[(Math.random() * whites.length) | 0];

    // Dijkstra insertion: shade the new value
    w.color = 'grey';
    G9.grey.push(w.id);
    G9.edges.push({ from: b.id, to: w.id, barrier: true });
    G9.barrierHits++;

    G9.msg = '<b>Write barrier fired.</b> Your code stored a pointer to white object <b>' + w.id +
      '</b> into black object <b>' + b.id + '</b> — the one write that could hide a live object from ' +
      'the collector. Go\'s hybrid barrier shades <b>both</b> the overwritten pointer (Yuasa, ' +
      'deletion) and the newly stored one (Dijkstra, insertion), so object ' + w.id + ' is now grey ' +
      'and safe.';
    GM.trace('note', 'gcWriteBarrier: shaded object ' + w.id + ' grey (insertion) — ' +
      G9.barrierHits + ' barrier hits this cycle');
    render09();
  }

  function render09() {
    var ph = $('#gcPhases');
    clear(ph);
    GC_PHASES.forEach(function (p, i) {
      var on = i === G9.phase;
      ph.appendChild(el('div', {
        class: 'gcph' + (on ? (p[3] ? ' stw' : ' on') : ''),
        title: p[2]
      }, [
        el('span', { class: 'n', text: p[2] }),
        el('span', { class: 'l', text: p[1] })
      ]));
    });

    // graph
    var W = 660, H = 300;
    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Object graph coloured white, grey and black as the collector marks it.">'];
    svg.push('<g stroke-width="1.2" fill="none">');
    G9.edges.forEach(function (e) {
      var a = G9.nodes[e.from], b = G9.nodes[e.to];
      if (a.freed || b.freed) return;
      var col = e.barrier ? 'var(--st-runnable)' : 'currentColor';
      var op = e.barrier ? '1' : '.26';
      svg.push('<line class="gedge" x1="' + (a.x + 15) + '" y1="' + a.y + '" x2="' + (b.x - 15) +
        '" y2="' + b.y + '" stroke="' + col + '" stroke-opacity="' + op + '"' +
        (e.barrier ? ' stroke-dasharray="4 3"' : '') + '/>');
    });
    svg.push('</g>');

    G9.nodes.forEach(function (n) {
      if (n.freed) return;
      var fill = n.color === 'white' ? 'var(--tri-white)' : n.color === 'grey' ? 'var(--tri-grey)' : 'var(--tri-black)';
      var stroke = n.color === 'white' ? 'var(--tri-white-line)' : fill;
      svg.push('<circle class="gnode" cx="' + n.x + '" cy="' + n.y + '" r="14" fill="' + fill +
        '" stroke="' + stroke + '" stroke-width="1.4"/>');
      var tc = n.color === 'black' ? 'var(--tri-white)' : '#16323B';
      svg.push('<text x="' + n.x + '" y="' + (n.y + 4) + '" text-anchor="middle" font-size="10.5" ' +
        'font-family="IBM Plex Mono, monospace" fill="' + tc + '">' + n.id + '</text>');
      if (n.root) {
        svg.push('<text x="' + n.x + '" y="' + (n.y - 21) + '" text-anchor="middle" font-size="9" ' +
          'font-family="IBM Plex Mono, monospace" fill="currentColor" fill-opacity=".65">root</text>');
      }
    });
    svg.push('</svg>');
    $('#gcGraph').innerHTML = svg.join('');

    // pacing
    // live and goal are what the *last completed* cycle settled on — a goal
    // recomputed from a half-finished mark would read below the live heap.
    var heap = heapBytes(), live = G9.live, goal = G9.goal;
    var pace = $('#gcPace');
    clear(pace);
    pace.appendChild(el('h5', { text: 'Pacing — GOGC ' + G9.gogc }));
    var maxv = Math.max(goal, heap) * 1.08;
    var frac = function (n) { return Math.max(0, Math.min(1, n / maxv)).toFixed(4); };
    var bar = el('div', { class: 'goalbar' }, [
      el('div', { class: 'live', style: 'transform:scaleX(' + frac(live) + ')' }),
      el('div', { class: 'cur', style: 'transform:scaleX(' + frac(heap) + ')' }),
      el('div', { class: 'mark', style: 'left:' + (goal / maxv * 100) + '%' }),
      el('div', { class: 'lbl', text: GM.bytes(heap) + ' / ' + GM.bytes(goal) })
    ]);
    pace.appendChild(bar);
    [['live heap', live ? GM.bytes(live) : 'no cycle yet'],
     ['next goal', GM.bytes(goal)],
     ['formula', 'live × (1 + ' + G9.gogc + '/100)']
    ].forEach(function (r) {
      pace.appendChild(el('div', { class: 'paceline' }, [
        el('span', { text: r[0] }), el('b', { text: r[1] })
      ]));
    });
    pace.appendChild(el('p', { class: 'dim', style: 'font-size:11px;line-height:1.5',
      text: 'GOMEMLIMIT can cap this independently — a soft limit that overrides GOGC when the heap approaches it.' }));

    var work = $('#gcWork');
    clear(work);
    work.appendChild(el('h5', { text: 'Grey set — gcw work buffers' }));
    var q = el('div', { class: 'greyq' });
    G9.grey.slice(0, 24).forEach(function () { q.appendChild(el('div', { class: 'gq' })); });
    if (!G9.grey.length) q.appendChild(el('div', { class: 'dim mono', style: 'font-size:11px', text: 'empty' }));
    work.appendChild(q);
    [['scanned', String(G9.scanned)],
     ['grey', String(G9.grey.length)],
     ['barrier hits', String(G9.barrierHits)]
    ].forEach(function (r) {
      work.appendChild(el('div', { class: 'paceline' }, [
        el('span', { text: r[0] }), el('b', { text: r[1] })
      ]));
    });

    var host = $('[data-mod="gc"] .gcmain');
    var msg = $('.gcmsg');
    if (!msg) {
      msg = el('div', { class: 'handoff gcmsg' });
      host.insertAdjacentElement('afterend', msg);
    }
    msg.innerHTML = G9.msg ||
      'Nothing is collected until a cycle starts. Trigger one, then step the mark — or write a ' +
      'pointer mid-cycle and watch the barrier catch it.';
  }

  GM.register('gc', {
    title: 'Garbage collector',
    sub: 'Tricolour marking with the mutator still running',
    hint: 'GODEBUG=gctrace=1 · GOGC · GOMEMLIMIT',
    init: function () {
      G9 = newGC();
      $$('[data-gx]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-gx');
          if (k === 'start') gcStart();
          else if (k === 'step') gcStep();
          else if (k === 'mutate') gcMutate();
          else {
            var keep = G9.gogc;
            G9 = newGC(); G9.gogc = keep;
            GM.trace('info', 'gc state reset');
            render09();
          }
        });
      });
      $('#gogc').addEventListener('input', function (e) {
        G9.gogc = +e.target.value;
        $('#gogcOut').textContent = G9.gogc;
        G9.goal = Math.round((G9.live || heapBytes()) * (1 + G9.gogc / 100));
        GM.trace('note', 'GOGC=' + G9.gogc + ' — next cycle at live × ' + (1 + G9.gogc / 100).toFixed(2));
        render09();
      });
    },
    enter: render09
  });

})();
