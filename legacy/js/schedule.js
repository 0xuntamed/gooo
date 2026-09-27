/* ============================================================
   THE GO MACHINE — runtime scheduling
   04 GMP scheduler (live simulation) · 05 goroutines & stacks
   ============================================================ */
(function () {
  'use strict';
  var GM = window.GoMachine;
  var $ = GM.$, $$ = GM.$$, el = GM.el, clear = GM.clear, pick = GM.pick;

  /* ══════════════════════════════════════════════════════════
     04 · GMP SCHEDULER
     The real local run queue holds 256; this one holds 6 so the
     overflow path into the global queue is actually visible.
     ══════════════════════════════════════════════════════════ */

  var RUNQ_CAP = 6;
  var CHIP_W = 46, CHIP_H = 24, GAP_X = 5, GAP_Y = 3;
  var SYSCALL_RETAKE = 3;   // sysmon hands the P off after this many ticks
  var PREEMPT_AFTER = 8;    // async preemption for a G that will not yield

  var S = null;
  var board, glayer, chips = {};

  function newState() {
    return {
      gomaxprocs: 4,
      ps: [],
      gs: {},
      globalq: [],
      netpoll: [],
      syscalls: [],
      waiting: [],
      nextG: 1,
      nextM: 1,
      threads: 4,
      tick: 0,
      lastTrace: 0,
      note: 'idle'
    };
  }

  function makeP(id) {
    return { id: id, m: null, runq: [], runnext: null, running: null, spinning: false, ticks: 0, retake: 0 };
  }

  function newG(kind) {
    var id = S.nextG++;
    var g = {
      id: id,
      state: 'runnable',
      work: kind === 'hog' ? 999 : 3 + ((Math.random() * 5) | 0),
      kind: kind || 'normal',
      run: 0,
      wait: 0
    };
    S.gs[id] = g;
    return g;
  }

  /* ---------- run queue plumbing (mirrors runtime.runqput) ---------- */

  function runqput(p, gid, next) {
    var g = S.gs[gid];
    if (g) g.state = 'runnable';
    if (next !== false) {
      var old = p.runnext;
      p.runnext = gid;
      if (old === null) return;
      gid = old;
    }
    if (p.runq.length < RUNQ_CAP) { p.runq.push(gid); return; }
    // runqputslow: the first half of the local queue, plus this g, go to the global queue
    var n = Math.floor(RUNQ_CAP / 2);
    var batch = p.runq.splice(0, n);
    batch.push(gid);
    S.globalq = S.globalq.concat(batch);
    GM.trace('warn', 'runqputslow: P' + p.id + ' local runq full → ' + batch.length +
      ' G moved to the global queue');
    S.note = 'local runq overflow → global';
  }

  function globalrunqget(p, max) {
    if (!S.globalq.length) return null;
    var n = Math.min(S.globalq.length, Math.max(1, Math.floor(S.globalq.length / S.gomaxprocs) + 1));
    if (max) n = Math.min(n, max);
    var gid = S.globalq.shift();
    for (var i = 1; i < n && S.globalq.length; i++) {
      if (p.runq.length < RUNQ_CAP) p.runq.push(S.globalq.shift());
    }
    return gid;
  }

  function runqsteal(p) {
    var victims = S.ps.filter(function (o) {
      return o !== p && (o.runq.length > 0 || o.runnext !== null);
    });
    if (!victims.length) return null;
    // the real scheduler makes 4 attempts in a randomized order
    var v = pick(victims);
    if (v.runq.length >= 2) {
      var n = Math.ceil(v.runq.length / 2);
      var taken = v.runq.splice(0, n);
      var got = taken.shift();
      p.runq = p.runq.concat(taken);
      GM.trace('sched', 'P' + p.id + ' stole ' + (taken.length + 1) + ' G from P' + v.id +
        ' (runqsteal, half the queue)');
      S.note = 'work stealing: P' + p.id + ' ← P' + v.id;
      flash(got, 'stolen');
      taken.forEach(function (g) { flash(g, 'stolen'); });
      return got;
    }
    if (v.runq.length === 1) {
      GM.trace('sched', 'P' + p.id + ' stole G' + v.runq[0] + ' from P' + v.id);
      S.note = 'work stealing: P' + p.id + ' ← P' + v.id;
      var one = v.runq.shift();
      flash(one, 'stolen');
      return one;
    }
    return null;
  }

  /* ---------- schedule() ---------- */

  function schedule(p) {
    p.ticks++;
    var gid = null;

    // every 61st tick, look at the global queue first so it cannot starve
    if (p.ticks % 61 === 0 && S.globalq.length) {
      gid = globalrunqget(p, 1);
      if (gid !== null) GM.trace('sched', 'P' + p.id + ' tick 61 — global queue checked first (anti-starvation)');
    }
    if (gid === null && p.runnext !== null) { gid = p.runnext; p.runnext = null; }
    if (gid === null && p.runq.length) gid = p.runq.shift();
    if (gid === null) gid = globalrunqget(p);
    if (gid === null && S.netpoll.length) {
      gid = S.netpoll.shift();
      GM.trace('sched', 'netpoll returned G' + gid + ' — ready to run');
    }
    if (gid === null) {
      if (!p.spinning) { p.spinning = true; }
      gid = runqsteal(p);
    }

    if (gid === null) { p.spinning = false; return; }
    p.spinning = false;
    var g = S.gs[gid];
    if (!g) return;
    g.state = 'running';
    g.run = 0;
    p.running = gid;
    if (p.m === null) p.m = S.nextM++;
  }

  /* ---------- one scheduler round ---------- */

  function tick() {
    S.tick++;

    // ── sysmon ────────────────────────────────────────────────
    S.ps.forEach(function (p) {
      if (p.retake > 0) {
        p.retake++;
        if (p.retake > SYSCALL_RETAKE) {
          var gid = p.running;
          p.retake = 0;
          p.running = null;
          p.m = S.nextM++;
          S.threads++;
          GM.trace('warn', 'sysmon: retake(P' + p.id + ') — syscall over 20µs, P handed to M' + p.m);
          S.note = 'sysmon handed P' + p.id + ' to a new M';
          if (gid !== null) { /* the G stays in the syscall bay */ }
        }
      }
    });

    // ── each P runs its current G ─────────────────────────────
    S.ps.forEach(function (p) {
      if (p.running === null) { schedule(p); return; }
      var g = S.gs[p.running];
      if (!g) { p.running = null; return; }
      if (g.state !== 'running') { p.running = null; schedule(p); return; }

      g.run++;
      g.work--;

      // async preemption of a goroutine that will not yield
      if (g.kind === 'hog' && g.run >= PREEMPT_AFTER) {
        GM.trace('warn', 'sysmon: preemptone(G' + g.id + ') — ran ' + g.run +
          ' ticks, signal-based async preemption');
        S.note = 'async preemption of G' + g.id;
        g.kind = 'normal';
        g.work = 4;
        p.running = null;
        runqput(p, g.id, false);
        schedule(p);
        return;
      }

      if (g.work <= 0) {
        var roll = Math.random();
        if (roll < 0.16) {
          // parks on a channel
          g.state = 'waiting'; g.wait = 2 + ((Math.random() * 4) | 0);
          S.waiting.push(g.id);
          GM.trace('info', 'G' + g.id + ' gopark(chan receive) → _Gwaiting');
        } else if (roll < 0.26) {
          // network read
          g.state = 'waiting'; g.wait = 2 + ((Math.random() * 3) | 0);
          S.netpoll.push(g.id);
          GM.trace('info', 'G' + g.id + ' parked on the netpoller (epoll)');
        } else {
          g.state = 'dead';
          removeChip(g.id);
          delete S.gs[g.id];
          GM.trace('info', 'G' + g.id + ' returned → goexit, _Gdead (put on gFree)');
        }
        p.running = null;
        schedule(p);
      }
    });

    // ── parked goroutines wake up ─────────────────────────────
    [['waiting', S.waiting], ['netpoll', S.netpoll]].forEach(function (pair) {
      var arr = pair[1];
      for (var i = arr.length - 1; i >= 0; i--) {
        var g = S.gs[arr[i]];
        if (!g) { arr.splice(i, 1); continue; }
        if (pair[0] === 'netpoll') continue;   // netpoll drains in schedule()
        g.wait--;
        if (g.wait <= 0) {
          arr.splice(i, 1);
          g.work = 2 + ((Math.random() * 4) | 0);
          var p = pick(S.ps);
          runqput(p, g.id, true);
          GM.trace('info', 'goready(G' + g.id + ') → P' + p.id + '.runnext');
        }
      }
    });

    // ── syscalls return ───────────────────────────────────────
    for (var i = S.syscalls.length - 1; i >= 0; i--) {
      var g = S.gs[S.syscalls[i]];
      if (!g) { S.syscalls.splice(i, 1); continue; }
      g.wait--;
      if (g.wait <= 0) {
        S.syscalls.splice(i, 1);
        g.work = 2 + ((Math.random() * 3) | 0);
        var free = S.ps.filter(function (p) { return p.running === null && p.retake === 0; });
        if (free.length) {
          runqput(free[0], g.id, true);
          GM.trace('info', 'exitsyscall(G' + g.id + ') — reacquired P' + free[0].id + ' directly');
        } else {
          g.state = 'runnable';
          S.globalq.push(g.id);
          S.threads = Math.max(S.gomaxprocs, S.threads - 1);
          GM.trace('info', 'exitsyscall(G' + g.id + ') — no P free, parked on the global queue');
        }
      }
    }

    // sysmon polls the network if nobody has for a while
    if (S.tick % 7 === 0 && S.netpoll.length) {
      var ng = S.netpoll.shift();
      S.globalq.push(ng);
      if (S.gs[ng]) { S.gs[ng].state = 'runnable'; S.gs[ng].work = 2 + ((Math.random() * 3) | 0); }
      GM.trace('sched', 'sysmon: netpoll() returned G' + ng + ' → global run queue');
    }

    if (S.tick - S.lastTrace >= 9) {
      S.lastTrace = S.tick;
      schedTrace();
    }

    render();
  }

  function schedTrace() {
    var idle = S.ps.filter(function (p) { return p.running === null; }).length;
    var spin = S.ps.filter(function (p) { return p.spinning; }).length;
    var per = S.ps.map(function (p) { return p.runq.length + (p.runnext !== null ? 1 : 0); });
    GM.trace('sched',
      'SCHED ' + (S.tick * 120) + 'ms: gomaxprocs=' + S.gomaxprocs +
      ' idleprocs=' + idle + ' threads=' + S.threads +
      ' spinningthreads=' + spin + ' needspinning=0' +
      ' idlethreads=' + Math.max(0, S.threads - S.gomaxprocs) +
      ' runqueue=' + S.globalq.length +
      ' [ ' + per.join(' ') + ' ]');
  }

  /* ---------- user actions ---------- */

  function act(k) {
    if (!S) return;
    if (k === 'reset') { buildState(S.gomaxprocs); render(); GM.trace('info', 'runtime reset'); return; }

    if (k === 'go1') {
      var g = newG();
      var p = S.ps[0];
      runqput(p, g.id, true);
      GM.trace('note', 'newproc: G' + g.id + ' created (2 KB stack) → P' + p.id + '.runnext');
      S.note = 'go f() → P' + p.id + '.runnext';
    } else if (k === 'go20') {
      GM.trace('note', 'newproc ×20 on P0 — watch the local runq overflow');
      for (var i = 0; i < 20; i++) runqput(S.ps[0], newG().id, true);
      S.note = '20 goroutines spawned on P0';
    } else if (k === 'block') {
      var cand = S.ps.filter(function (p) { return p.running !== null; });
      if (!cand.length) { GM.trace('info', 'nothing running to block'); return; }
      var pp = pick(cand);
      var gg = S.gs[pp.running];
      gg.state = 'waiting'; gg.wait = 3 + ((Math.random() * 3) | 0);
      S.waiting.push(gg.id);
      pp.running = null;
      GM.trace('info', 'G' + gg.id + ' gopark(chan send, sudog on hchan.sendq) → _Gwaiting');
      GM.trace('info', 'P' + pp.id + ' kept — the M just picks up the next G');
      S.note = 'G' + gg.id + ' parked on a channel';
      schedule(pp);
    } else if (k === 'syscall') {
      var cs = S.ps.filter(function (p) { return p.running !== null && p.retake === 0; });
      if (!cs.length) { GM.trace('info', 'nothing running to put in a syscall'); return; }
      var p2 = pick(cs);
      var g2 = S.gs[p2.running];
      g2.state = 'syscall'; g2.wait = SYSCALL_RETAKE + 2;
      S.syscalls.push(g2.id);
      p2.retake = 1;
      GM.trace('warn', 'entersyscall(G' + g2.id + ') — M' + p2.m + ' blocks in the kernel, P' + p2.id + ' marked _Psyscall');
      S.note = 'G' + g2.id + ' in a syscall, P' + p2.id + ' pending handoff';
    } else if (k === 'hog') {
      var h = newG('hog');
      runqput(S.ps[0], h.id, true);
      GM.trace('note', 'G' + h.id + ' is a tight loop with no function calls — only sysmon can stop it');
      S.note = 'CPU hog spawned';
    }
    render();
  }

  /* ---------- structure ---------- */

  function buildState(n) {
    S = newState();
    S.gomaxprocs = n;
    S.threads = n;
    for (var i = 0; i < n; i++) S.ps.push(makeP(i));
    S.nextM = n;
    for (var j = 0; j < n * 2; j++) runqput(S.ps[j % n], newG().id, j < n);
    chips = {};
    buildBoard();
  }

  function buildBoard() {
    board = $('#schedBoard');
    clear(board);

    var top = el('div', { class: 'sched-row' });
    top.appendChild(bay('globalq', 'Global run queue', 'schedt.runq · unbounded', 2));
    top.appendChild(bay('netpoll', 'Netpoller', 'epoll / kqueue', 1));
    board.appendChild(top);

    var cols = el('div', { class: 'pcols' });
    cols.style.gridTemplateColumns = 'repeat(' + S.gomaxprocs + ', minmax(0,1fr))';
    S.ps.forEach(function (p) {
      var c = el('div', { class: 'pcol', id: 'pcol' + p.id }, [
        el('div', { class: 'pcol-h' }, [
          el('span', { class: 'pid', text: 'P' + p.id }),
          el('span', { class: 'spin', id: 'spin' + p.id }),
          el('span', { class: 'mid', id: 'mid' + p.id })
        ]),
        el('div', { class: 'pcol-b' }, [
          el('div', { class: 'subhead' }, [el('span', { text: 'running' })]),
          el('div', { class: 'runslot', id: 'run' + p.id }),
          el('div', { class: 'subhead' }, [el('span', { text: 'runnext' })]),
          el('div', { class: 'nextslot', id: 'next' + p.id }),
          el('div', { class: 'subhead' }, [
            el('span', { text: 'local runq' }),
            el('span', { class: 'mono', id: 'qc' + p.id })
          ]),
          el('div', { class: 'runq', id: 'runq' + p.id })
        ])
      ]);
      cols.appendChild(c);
    });
    board.appendChild(cols);

    var bot = el('div', { class: 'sched-row' });
    bot.appendChild(bay('syscalls', 'In syscall', 'M blocked in the kernel', 1));
    bot.appendChild(bay('waiting', 'Waiting', '_Gwaiting · parked on chan / sema', 1));
    board.appendChild(bot);

    board.appendChild(el('div', { class: 'sysmon', id: 'sysmon' }, [
      el('span', { class: 'dot' }),
      el('span', { class: 'mono', text: 'sysmon' }),
      el('span', { class: 'dim', text: 'no P, no G — retakes syscalls at 20µs, preempts at 10ms' }),
      el('span', { class: 'msg', id: 'sysmonMsg' })
    ]));

    glayer = el('div', { class: 'glayer' });
    board.appendChild(glayer);

    var lg = $('#schedLegend');
    clear(lg);
    [['runnable', 'st-runnable', 'queued, waiting for a P'],
     ['running', 'st-running', 'executing on an M'],
     ['waiting', 'st-waiting', 'parked — chan, mutex, sleep'],
     ['syscall', 'st-syscall', 'in the kernel']
    ].forEach(function (l) {
      lg.appendChild(el('span', { class: 'lg' }, [
        el('i', { style: '--c: var(--' + l[1] + ')' }),
        el('span', { text: l[0] + ' — ' + l[2] })
      ]));
    });
    lg.appendChild(el('span', { class: 'lg dim mono', text: 'local runq cap ' + RUNQ_CAP + ' here · 256 in the real runtime' }));
  }

  function bay(id, title, sub, flex) {
    var b = el('div', { class: 'bay' }, [
      el('div', { class: 'bay-h' }, [
        el('b', { text: title }),
        el('span', { text: sub }),
        el('span', { class: 'cnt', id: 'cnt-' + id })
      ]),
      el('div', { class: 'slots row', id: 'slot-' + id })
    ]);
    b.style.flex = flex + ' 1 0';
    return b;
  }

  /* ---------- chips & layout ---------- */

  function chipFor(gid) {
    if (chips[gid]) return chips[gid];
    var n = el('div', { class: 'gchip enter g-runnable' }, [el('span', { class: 'gid', text: 'G' + gid })]);
    n.style.width = CHIP_W + 'px';
    n.title = 'goroutine ' + gid;
    glayer.appendChild(n);
    setTimeout(function () { n.classList.remove('enter'); }, 360);
    chips[gid] = n;
    return n;
  }

  function removeChip(gid) {
    var c = chips[gid];
    if (!c) return;
    c.classList.add('leaving');
    delete chips[gid];
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 320);
  }

  function flash(gid, cls) {
    var c = chips[gid];
    if (!c) return;
    c.classList.add(cls);
    setTimeout(function () { c.classList.remove(cls); }, 420);
  }

  function place(gid, container, index, horizontal) {
    var c = chipFor(gid);
    if (!container) return;
    var br = board.getBoundingClientRect();
    var cr = container.getBoundingClientRect();
    if (!cr.width) return;
    var x, y;
    if (horizontal) {
      var perRow = Math.max(1, Math.floor(cr.width / (CHIP_W + GAP_X)));
      var row = Math.floor(index / perRow), col = index % perRow;
      x = cr.left - br.left + col * (CHIP_W + GAP_X);
      y = cr.top - br.top + row * (CHIP_H + GAP_Y);
    } else {
      x = cr.left - br.left + Math.max(0, (cr.width - CHIP_W) / 2);
      y = cr.top - br.top + index * (CHIP_H + GAP_Y);
    }
    c.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    var g = S.gs[gid];
    if (g) {
      c.className = 'gchip g-' + g.state + (c.classList.contains('enter') ? ' enter' : '');
      c.title = 'G' + gid + ' — _G' + g.state + (g.kind === 'hog' ? ' (tight loop)' : '');
    }
  }

  /* Chips are absolutely positioned in an overlay, so each slot has to be
     grown to the size of what it holds or the chips spill past its border. */
  function fitRow(id, count) {
    var c = $('#slot-' + id);
    if (!c) return;
    var w = c.getBoundingClientRect().width;
    var perRow = Math.max(1, Math.floor(w / (CHIP_W + GAP_X)));
    var rows = Math.max(1, Math.ceil(count / perRow));
    c.style.minHeight = (rows * CHIP_H + (rows - 1) * GAP_Y) + 'px';
  }

  function fitCol(id, count) {
    var c = $('#' + id);
    if (!c) return;
    c.style.minHeight = Math.max(76, count * CHIP_H + Math.max(0, count - 1) * GAP_Y) + 'px';
  }

  function render() {
    if (!board || !board.getBoundingClientRect().width) return;

    // size every slot first, so the rects read during placement are final
    fitRow('globalq', S.globalq.length);
    fitRow('netpoll', S.netpoll.length);
    fitRow('syscalls', S.syscalls.length);
    fitRow('waiting', S.waiting.length);
    S.ps.forEach(function (p) { fitCol('runq' + p.id, p.runq.length); });

    S.ps.forEach(function (p) {
      var col = $('#pcol' + p.id);
      if (col) col.classList.toggle('idle', p.running === null);
      var mid = $('#mid' + p.id);
      if (mid) mid.textContent = p.running !== null ? 'M' + p.m : (p.retake ? 'M' + p.m + ' ⛔' : '—');
      var sp = $('#spin' + p.id);
      if (sp) sp.textContent = p.spinning ? 'spinning' : '';
      var qc = $('#qc' + p.id);
      if (qc) qc.textContent = p.runq.length + '/' + RUNQ_CAP;
      var rq = $('#runq' + p.id);
      if (rq) rq.classList.toggle('full', p.runq.length >= RUNQ_CAP);
      var rs = $('#run' + p.id);
      if (rs) rs.classList.toggle('empty', p.running === null);

      if (p.running !== null) place(p.running, $('#run' + p.id), 0, false);
      if (p.runnext !== null) place(p.runnext, $('#next' + p.id), 0, false);
      p.runq.forEach(function (gid, i) { place(gid, $('#runq' + p.id), i, false); });
    });

    S.globalq.forEach(function (gid, i) { place(gid, $('#slot-globalq'), i, true); });
    S.netpoll.forEach(function (gid, i) { place(gid, $('#slot-netpoll'), i, true); });
    S.syscalls.forEach(function (gid, i) { place(gid, $('#slot-syscalls'), i, true); });
    S.waiting.forEach(function (gid, i) { place(gid, $('#slot-waiting'), i, true); });

    setCnt('globalq', S.globalq.length);
    setCnt('netpoll', S.netpoll.length);
    setCnt('syscalls', S.syscalls.length);
    setCnt('waiting', S.waiting.length);

    var sm = $('#sysmon');
    var busy = S.syscalls.length > 0 || S.ps.some(function (p) { return p.retake > 0; });
    if (sm) sm.classList.toggle('act', busy);
    var msg = $('#sysmonMsg');
    if (msg) msg.textContent = S.note;
  }

  function setCnt(id, n) {
    var e = $('#cnt-' + id);
    if (e) e.textContent = n;
  }

  GM.register('sched', {
    title: 'GMP scheduler',
    sub: 'How goroutines get onto threads',
    hint: 'GODEBUG=schedtrace=120',
    init: function () {
      buildState(4);
      $$('[data-sx]').forEach(function (b) {
        b.addEventListener('click', function () { act(b.getAttribute('data-sx')); });
      });
      var gmp = $('#gomaxprocs');
      gmp.addEventListener('input', function (e) {
        var n = +e.target.value;
        $('#gmpOut').textContent = n;
        buildState(n);
        GM.trace('note', 'runtime.GOMAXPROCS(' + n + ') — ' + n + ' P' + (n === 1 ? '' : 's') + ', world restarted');
        render();
      });
      window.addEventListener('resize', function () { if (GM.active === 'sched') render(); });
    },
    enter: function () {
      requestAnimationFrame(function () { render(); requestAnimationFrame(render); });
      GM.trace('info', 'GOMAXPROCS=' + S.gomaxprocs + ' — since Go 1.25 this defaults to the cgroup CPU limit, not the core count');
    },
    tick: tick
  });

  /* ══════════════════════════════════════════════════════════
     05 · GOROUTINES & STACKS
     ══════════════════════════════════════════════════════════ */

  var FRAME_NAMES = ['parseExpr', 'parseTerm', 'parseFactor', 'parseUnary', 'parsePrimary', 'parseCall'];
  var K = { size: 2048, frames: [], event: null, copying: false, depth: 0 };

  var G_STATES = [
    ['_Gidle', 'created, not initialised'],
    ['_Grunnable', 'on a run queue'],
    ['_Grunning', 'executing, owns a P and an M'],
    ['_Gsyscall', 'in a syscall, not on a P'],
    ['_Gwaiting', 'blocked — chan, mutex, GC, sleep'],
    ['_Gpreempted', 'stopped itself for a preemption request'],
    ['_Gcopystack', 'stack is being moved'],
    ['_Gdead', 'unused — on gFree, awaiting reuse']
  ];

  var STK_ASM =
    'main.makeCounter:\n' +
    '  CMPQ  SP, 16(R14)     ; R14 = g   16 = g.stackguard0\n' +
    '  JLS   morestack       ; below the guard? grow first\n' +
    '  PUSHQ BP\n' +
    '  ...\n' +
    'morestack:\n' +
    '  CALL  runtime.morestack_noctxt(SB)\n' +
    '  JMP   0               ; retry the whole function';

  function stkUsed() {
    return K.frames.reduce(function (a, f) { return a + f.size; }, 0) + 128;
  }

  function stkAct(k) {
    if (k === 'reset') {
      K.size = 2048; K.frames = []; K.depth = 0; K.copying = false;
      K.event = 'A fresh goroutine: <b>2 KB</b> of stack from the per-P cache. ' +
        'That is why spawning a million is reasonable and spawning a million threads is not.';
      GM.trace('info', 'newproc: G stack = 2048 bytes (_StackMin)');
    } else if (k === 'call') {
      var f = {
        name: FRAME_NAMES[K.depth % FRAME_NAMES.length] + (K.depth >= FRAME_NAMES.length ? '′' : ''),
        size: [96, 128, 160, 192, 224][(Math.random() * 5) | 0]
      };
      if (stkUsed() + f.size > K.size - 128) {
        var old = K.size;
        K.size *= 2;
        K.copying = true;
        var ptrs = 3 + K.frames.length * 2;
        K.event = '<b>Stack overflow check failed.</b> <code>morestack</code> → <code>newstack</code>: ' +
          'allocate ' + GM.bytes(K.size) + ', <code>memmove</code> the old frames, then walk every frame ' +
          'and rewrite <b>' + ptrs + ' pointers</b> that aimed into the old stack. The goroutine sits in ' +
          '<code>_Gcopystack</code> while this happens, then re-runs the call as if nothing did.';
        GM.trace('warn', 'morestack: G stack ' + old + ' → ' + K.size + ' bytes, copystack adjusted ' + ptrs + ' pointers');
        setTimeout(function () { K.copying = false; renderStack(); }, 900);
      } else {
        K.event = 'Called <b>' + f.name + '</b> — ' + f.size + ' byte frame. The prologue compared ' +
          '<code>SP</code> against <code>g.stackguard0</code> and there was room, so the check cost ' +
          'two instructions and a not-taken branch.';
      }
      K.frames.push(f);
      K.depth++;
    } else if (k === 'ret') {
      if (!K.frames.length) { K.event = 'Nothing left to return from.'; }
      else {
        var g = K.frames.pop();
        K.depth = Math.max(0, K.depth - 1);
        K.event = 'Returned from <b>' + g.name + '</b>. The stack does not shrink here — ' +
          'the memory stays until a GC decides to give it back.';
      }
    } else if (k === 'shrink') {
      var used = stkUsed();
      if (K.size > 2048 && used < K.size / 4) {
        var was = K.size;
        K.size /= 2;
        K.event = '<b>shrinkstack</b> during GC: only ' + GM.bytes(used) + ' of ' + GM.bytes(was) +
          ' was live — under a quarter — so the runtime halved it and copied the frames down.';
        GM.trace('gc', 'shrinkstack: G stack ' + was + ' → ' + K.size + ' bytes');
      } else {
        K.event = 'No shrink. The runtime only halves a stack when live data is under <b>1/4</b> of it, ' +
          'and only while the world is stopped for GC. Currently using ' + GM.bytes(used) +
          ' of ' + GM.bytes(K.size) + '.';
      }
    }
    renderStack();
  }

  function renderStack() {
    var used = stkUsed();
    $('#stkSize').textContent = GM.bytes(K.size);
    $('#stkUse').textContent = 'used ' + GM.bytes(used) + ' · ' + Math.round(used / K.size * 100) + '%';

    var t = $('#stkTower');
    clear(t);
    t.style.minHeight = Math.min(360, 120 + Math.log2(K.size / 2048) * 46) + 'px';
    t.appendChild(el('div', { class: 'frame g0' }, [
      el('span', { text: 'goroutine entry' }), el('span', { class: 'sz', text: '128 B' })
    ]));
    K.frames.forEach(function (f) {
      t.appendChild(el('div', { class: 'frame' }, [
        el('span', { text: f.name }), el('span', { class: 'sz', text: f.size + ' B' })
      ]));
    });

    $('#stkGuard').textContent = 'stackguard0 — ' + GM.bytes(K.size) + ' limit · ' +
      GM.bytes(Math.max(0, K.size - used)) + ' free';

    $('#stkEvent').innerHTML = K.event || '';

    var gs = $('#gstates');
    clear(gs);
    var active = K.copying ? '_Gcopystack' : '_Grunning';
    G_STATES.forEach(function (s) {
      var on = s[0] === active;
      gs.appendChild(el('div', {
        class: 'gstate' + (on ? ' on' : ''),
        title: s[1],
        style: on ? '--c: var(--st-running-bg); --cc: var(--st-running)' : '',
        text: s[0]
      }));
    });
  }

  GM.register('stack', {
    title: 'Goroutines & stacks',
    sub: 'Two kilobytes that grow by copying',
    hint: 'runtime/stack.go · go tool compile -S',
    init: function () {
      $('#stkAsm').innerHTML = GM.goHL(STK_ASM);
      $$('[data-kx]').forEach(function (b) {
        b.addEventListener('click', function () { stkAct(b.getAttribute('data-kx')); });
      });
      stkAct('reset');
    },
    enter: renderStack
  });

})();
