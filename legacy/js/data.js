/* ============================================================
   THE GO MACHINE — data structures
   01 arrays & slices · 02 maps · 03 strings & runes · 04 struct layout
   Growth sequences and struct offsets measured on go1.26.2.
   ============================================================ */
(function () {
  'use strict';
  var GM = window.GoMachine;
  var $ = GM.$, $$ = GM.$$, el = GM.el, clear = GM.clear, setCode = GM.setCode;

  /* ══════════════════════════════════════════════════════════
     01 · ARRAYS & SLICES
     ══════════════════════════════════════════════════════════ */

  var SL, slNext;

  function slReset() {
    SL = {
      gen: 1,
      cap: 6,
      arr: [10, 20, 30, 40, 50, null],
      s: { off: 0, len: 5, capEnd: 6, gen: 1 },
      t: null,
      wrote: -1,
      msg: 'A slice of length 5 over an array of 6. That one spare slot is the whole story: ' +
        '<code>append</code> can use it without allocating, and anything else viewing this array ' +
        'will see the write.'
    };
    slNext = 60;
  }

  function capOf(v) { return v.capEnd - v.off; }
  function stale(v) { return v && v.gen !== SL.gen; }

  /* growslice's real capacity rule, from runtime/slice.go */
  function nextslicecap(newLen, oldCap) {
    var newcap = oldCap, doublecap = newcap + newcap;
    if (newLen > doublecap) return newLen;
    if (oldCap < 256) return doublecap;
    while (true) {
      newcap += (newcap + 3 * 256) >> 2;
      if (newcap >= newLen) break;
    }
    return newcap;
  }

  function slAppend(which) {
    var v = which === 's' ? SL.s : SL.t;
    if (!v) { SL.msg = 'There is no <code>t</code> yet — make one first.'; return slRender(); }
    if (stale(v)) {
      SL.msg = '<span class="warn">' + which + ' is on the earlier array</span> — the one no longer ' +
        'drawn above. Appending to it writes there, where the other slice can no longer see it. ' +
        'Nothing crashed and nothing warned you: the two simply stopped sharing the moment one of ' +
        'them had to grow.';
      return slRender();
    }

    var val = slNext; slNext += 10;
    if (v.len < capOf(v)) {
      var idx = v.off + v.len;
      var clobbered = null;
      var other = which === 's' ? SL.t : SL.s;
      if (other && !stale(other) && idx >= other.off && idx < other.off + other.len) {
        clobbered = which === 's' ? 't' : 's';
      }
      SL.arr[idx] = val;
      v.len++;
      SL.wrote = idx;
      SL.msg = '<b>Room to spare</b> (<code>len ' + (v.len - 1) + ' &lt; cap ' + capOf(v) + '</code>), ' +
        'so <code>append</code> wrote ' + val + ' into slot <code>' + idx + '</code> of the ' +
        'existing array and returned a header with len ' + v.len + '. No allocation.' +
        (clobbered
          ? ' <span class="warn">It also overwrote element ' + (idx - (which === 's' ? SL.t : SL.s).off) +
            ' of ' + clobbered + '</span> — both slices point at the same array.'
          : '');
      GM.trace('info', 'append(' + which + ', ' + val + ') — in place at index ' + idx + ', no allocation');
    } else {
      var oldCap = capOf(v);
      var want = nextslicecap(v.len + 1, oldCap);
      var newCap = Math.min(want, 12);
      var vals = [];
      for (var i = 0; i < v.len; i++) vals.push(SL.arr[v.off + i]);
      vals.push(val);
      var arr = new Array(newCap).fill(null);
      for (var j = 0; j < vals.length; j++) arr[j] = vals[j];
      SL.gen++;
      SL.arr = arr;
      SL.cap = newCap;
      SL.wrote = vals.length - 1;
      var nv = { off: 0, len: vals.length, capEnd: newCap, gen: SL.gen };
      if (which === 's') SL.s = nv; else SL.t = nv;
      SL.msg = '<b>Full</b> (<code>len == cap == ' + oldCap + '</code>), so <code>growslice</code> ran: ' +
        '<code>nextslicecap</code> asked for ' + want + ', the allocator rounded that to a size class, ' +
        'and the ' + v.len + ' existing elements were <b>copied</b> into a fresh array. ' +
        '<span class="warn">' + (which === 's' ? 't' : 's') + ' was not updated</span> — it still ' +
        'points at the old array, and the two are now independent.';
      GM.trace('warn', 'growslice: cap ' + oldCap + ' → ' + newCap + ', ' + v.len + ' elements copied to a new array');
    }
    slRender();
  }

  function slAct(k) {
    if (k === 'reset') { slReset(); GM.trace('info', 'slices reset'); return slRender(); }
    if (k === 'append') return slAppend('s');
    if (k === 'appendt') return slAppend('t');

    if (k === 'alias' || k === 'aliascap') {
      if (stale(SL.s)) { SL.msg = 'Reset first — <code>s</code> is on the earlier array.'; return slRender(); }
      var capped = k === 'aliascap';
      SL.t = { off: SL.s.off + 1, len: 2, capEnd: capped ? SL.s.off + 3 : SL.s.capEnd, gen: SL.gen };
      SL.wrote = -1;
      SL.msg = capped
        ? '<code>t := s[1:3:3]</code> — the <b>three-index</b> form. It sets cap as well as the bounds, ' +
          'so <code>cap(t) == len(t) == 2</code>. No copy happened; <code>t</code> is still a view over ' +
          'the same array. But because it has no spare capacity, the next <code>append(t, …)</code> is ' +
          '<span class="ok">forced to allocate</span> instead of writing into s\'s elements.'
        : '<code>t := s[1:3]</code> — a second header over the <b>same</b> array. It costs nothing: ' +
          'no copy, no allocation, just 24 bytes on the stack. Note <code>cap(t) == ' +
          (SL.s.capEnd - SL.s.off - 1) + '</code>, not 2 &mdash; capacity runs from t\'s start to the ' +
          '<b>end of the array</b>, so t can append straight over the top of s.';
      GM.trace('info', 't := s[1:3' + (capped ? ':3' : '') + '] — cap(t) = ' + capOf(SL.t));
      return slRender();
    }

    if (k === 'copy') {
      if (!SL.t) { SL.msg = 'Make a <code>t</code> first.'; return slRender(); }
      var n = Math.min(SL.t.len, SL.s.len);
      SL.msg = '<code>copy(t, s)</code> returned <b>' + n + '</b> — it copies ' +
        '<code>min(len(dst), len(src))</code> elements and never grows anything. ' +
        'This is the honest way to detach a slice: allocate the destination yourself, then copy. ' +
        'Since both views overlap the same array here, <code>copy</code> handles the overlap like ' +
        '<code>memmove</code>.';
      GM.trace('info', 'copy(t, s) = ' + n + ' elements');
      return slRender();
    }
  }

  var GROWTH = [
    ['[]byte  1B', [32, 64, 128, 256, 512, 896, 1408, 2048, 3072], 5],
    ['[]int   8B', [4, 8, 16, 32, 64, 128, 256, 512, 848, 1280, 1792, 2560], 8],
    ['[]Big  32B', [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 852, 1280, 1792], 10]
  ];

  function slRender() {
    $('#slArrTag').textContent = SL.cap + ' slots · generation ' + SL.gen;

    var cells = $('#slCells');
    clear(cells);
    for (var i = 0; i < SL.cap; i++) {
      var v = SL.arr[i];
      cells.appendChild(el('div', {
        class: 'cellx' + (v === null ? ' unset' : '') + (i === SL.wrote ? ' wrote' : '')
      }, [
        el('div', { class: 'v', text: v === null ? '·' : String(v) }),
        el('div', { class: 'i', text: String(i) })
      ]));
    }

    var CW = 52, CG = 4;
    var bars = $('#slBars');
    clear(bars);
    [['s', SL.s, 'var(--go)'], ['t', SL.t, 'var(--st-runnable)']].forEach(function (row) {
      var v = row[1];
      if (!v) return;
      var st = stale(v);
      var bar = el('div', { class: 'slbar', style: '--c:' + row[2] + (st ? ';opacity:.4' : '') }, [
        el('span', { class: 'nm', text: row[0] }),
        el('div', { class: 'track', style: 'width:' + (SL.cap * CW + (SL.cap - 1) * CG) + 'px' }, [
          el('div', { class: 'capb', style: 'left:' + (v.off * (CW + CG)) + 'px;width:' +
            (capOf(v) * CW + (capOf(v) - 1) * CG) + 'px' }),
          el('div', { class: 'lenb', style: 'left:' + (v.off * (CW + CG)) + 'px;width:' +
            (v.len * CW + Math.max(0, v.len - 1) * CG) + 'px' })
        ]),
        el('span', { class: 'meta', text: st ? 'on the earlier array' : 'len ' + v.len + ' · cap ' + capOf(v) })
      ]);
      bars.appendChild(bar);
    });

    var hs = $('#slHeaders');
    clear(hs);
    [['s', SL.s, 'var(--go)', 'var(--go-wash)'], ['t', SL.t, 'var(--st-runnable)', 'var(--st-runnable-bg)']]
      .forEach(function (row) {
        var v = row[1];
        if (!v) return;
        var st = stale(v);
        hs.appendChild(el('div', { class: 'hdr', style: '--c:' + row[2] + ';--bg:' + row[3] }, [
          el('div', { class: 'hdr-t', text: row[0] + ' []int' + (st ? '  — on the earlier array' : '') }),
          el('div', { class: 'hdr-f' }, [
            el('div', null, [el('span', { text: 'ptr' }), el('b', { text: '&arr[' + v.off + ']' })]),
            el('div', null, [el('span', { text: 'len' }), el('b', { text: String(v.len) })]),
            el('div', null, [el('span', { text: 'cap' }), el('b', { text: String(capOf(v)) })])
          ])
        ]));
      });
    if (!SL.t) hs.appendChild(el('div', { class: 'dim mono', style: 'font-size:11px', text: 't is nil' }));

    $('#slEvent').innerHTML = SL.msg;

    var g = $('#slGrowth');
    clear(g);
    GROWTH.forEach(function (row) {
      var r = el('div', { class: 'growrow' }, [el('span', { class: 'ty2', text: row[0] })]);
      row[1].forEach(function (c, i) {
        r.appendChild(el('span', { class: 'gcap' + (i === row[2] ? ' turn' : ''), text: String(c) }));
      });
      g.appendChild(r);
    });
    g.appendChild(el('p', { class: 'note2', html:
      'Doubling stops at 256. Above it <code>nextslicecap</code> grows by about 1.25×: ' +
      '<code>newcap += (newcap + 768) &gt;&gt; 2</code>. The result is then rounded up to an ' +
      'allocator size class, which is why the numbers stop being round &mdash; ' +
      '<code>512 → 832 → size class 6784 bytes → cap 848</code>, then ' +
      '<code>848 → 1252 → 10240 bytes → cap 1280</code>. Highlighted chip marks the turn.' }));
    g.appendChild(el('p', { class: 'note2', html:
      'The early numbers differ per element type because a slice that never escapes starts in a ' +
      '<b>32-byte stack buffer</b> — 32 for <code>[]byte</code>, 4 for <code>[]int</code>, ' +
      '1 for a 32-byte struct. Make it escape and <code>[]int</code> starts at 1 instead.' }));
  }

  GM.register('slices', {
    title: 'Arrays & slices',
    sub: 'A 24-byte header over someone else\'s memory',
    hint: 'runtime/slice.go · growslice · nextslicecap',
    init: function () {
      slReset();
      $$('[data-sl]').forEach(function (b) {
        b.addEventListener('click', function () { slAct(b.getAttribute('data-sl')); });
      });
    },
    enter: slRender
  });

  /* ══════════════════════════════════════════════════════════
     02 · MAPS — Swiss tables (Go 1.24+)
     ══════════════════════════════════════════════════════════ */

  var CTRL_EMPTY = 0x80, CTRL_DEL = 0xFE;
  var NAMES = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace', 'heidi',
    'ivan', 'judy', 'mallory', 'niaj', 'olivia', 'peggy', 'rupert', 'sybil'];
  var MP;

  function mpReset() {
    MP = { groups: mkGroups(2), used: 0, tomb: 0, pool: NAMES.slice(), probe: null, msg: null };
    MP.msg = 'An empty map: 2 groups of 8 slots. Every control byte is <code>0b10000000</code> — ' +
      'the empty marker. Nothing has been hashed yet.';
  }

  function mkGroups(n) {
    var g = [];
    for (var i = 0; i < n; i++) {
      g.push({ ctrl: new Array(8).fill(CTRL_EMPTY), keys: new Array(8).fill(null) });
    }
    return g;
  }

  function hashOf(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }
  function h1(h) { return h >>> 7; }
  function h2(h) { return h & 0x7F; }

  function mpFindSlot(key) {
    var h = hashOf(key), g0 = h1(h) % MP.groups.length, t = h2(h);
    for (var p = 0; p < MP.groups.length; p++) {
      var gi = (g0 + p) % MP.groups.length, g = MP.groups[gi];
      for (var i = 0; i < 8; i++) {
        if (g.ctrl[i] === t && g.keys[i] === key) return { gi: gi, si: i, h2: t, found: true };
      }
      for (var j = 0; j < 8; j++) {
        if (g.ctrl[j] === CTRL_EMPTY || g.ctrl[j] === CTRL_DEL) {
          return { gi: gi, si: j, h2: t, found: false };
        }
      }
    }
    return null;
  }

  function mpGrow() {
    var old = MP.groups, n = old.length * 2;
    MP.groups = mkGroups(n);
    MP.used = 0; MP.tomb = 0;
    old.forEach(function (g) {
      g.keys.forEach(function (k, i) {
        if (k !== null && g.ctrl[i] !== CTRL_DEL) {
          var slot = mpFindSlot(k);
          MP.groups[slot.gi].ctrl[slot.si] = slot.h2;
          MP.groups[slot.gi].keys[slot.si] = k;
          MP.used++;
        }
      });
    });
    GM.trace('warn', 'map grow: ' + old.length + ' → ' + n + ' groups, all keys rehashed');
    return n;
  }

  function mpInsert(quiet) {
    if (!MP.pool.length) { MP.msg = 'Out of sample keys — reset to start again.'; return; }
    var cap = MP.groups.length * 8;
    if (MP.used + MP.tomb >= Math.floor(cap * 7 / 8)) {
      var n = mpGrow();
      MP.msg = '<b>Load hit 7/8.</b> <code>maxAvgGroupLoad</code> is 7 slots per group of 8, so the ' +
        'table doubled to ' + n + ' groups and every key was rehashed into a new position. ' +
        'This is why a map that will get big is worth sizing up front with <code>make(map[K]V, n)</code>.';
    }
    var key = MP.pool.shift();
    var slot = mpFindSlot(key);
    if (!slot) return;
    if (MP.groups[slot.gi].ctrl[slot.si] === CTRL_DEL) MP.tomb--;
    MP.groups[slot.gi].ctrl[slot.si] = slot.h2;
    MP.groups[slot.gi].keys[slot.si] = key;
    MP.used++;
    MP.probe = { gi: slot.gi, si: slot.si, h2: slot.h2 };
    if (!quiet) {
      var h = hashOf(key);
      MP.msg = 'Inserted <code>"' + key + '"</code>. The hash splits in two: <b>h1</b> ' +
        '(the high bits) picked group <b>' + slot.gi + '</b>, and <b>h2</b> (the low 7 bits, ' +
        '<code>0x' + slot.h2.toString(16).toUpperCase() + '</code>) went into control byte <b>' +
        slot.si + '</b>. The key itself is stored in the matching slot.';
      GM.trace('info', 'map insert "' + key + '" — h1→group ' + slot.gi + ', h2=0x' +
        slot.h2.toString(16) + ' → slot ' + slot.si);
    }
  }

  function mpAct(k) {
    if (k === 'reset') { mpReset(); GM.trace('info', 'map reset'); return mpRender(); }
    if (k === 'insert') { mpInsert(false); return mpRender(); }
    if (k === 'insert5') {
      for (var i = 0; i < 5; i++) mpInsert(true);
      MP.msg = 'Inserted five keys. Watch how they scatter across groups &mdash; h1 has no ' +
        'relationship to insertion order, which is the whole point of a hash table.';
      GM.trace('info', 'map: 5 inserts, load ' + MP.used + '/' + (MP.groups.length * 8));
      return mpRender();
    }
    var placed = [];
    MP.groups.forEach(function (g, gi) {
      g.keys.forEach(function (key, si) { if (key !== null && g.ctrl[si] !== CTRL_DEL) placed.push([gi, si, key]); });
    });
    if (!placed.length) { MP.msg = 'Nothing in the map yet.'; return mpRender(); }
    var pickd = placed[(Math.random() * placed.length) | 0];

    if (k === 'lookup') {
      var slot = mpFindSlot(pickd[2]);
      MP.probe = { gi: slot.gi, si: slot.si, h2: slot.h2, matches: mpMatches(slot.gi, slot.h2) };
      MP.msg = 'Looking up <code>"' + pickd[2] + '"</code>. h1 selects group <b>' + slot.gi +
        '</b>. Then <code>matchH2</code> compares h2 against <b>all eight</b> control bytes in one ' +
        '64-bit operation — highlighted below. ' +
        (MP.probe.matches.length === 1
          ? 'One candidate, so exactly one key comparison follows.'
          : MP.probe.matches.length + ' candidates share those 7 bits, so the keys are compared in turn.');
      GM.trace('info', 'map lookup "' + pickd[2] + '" — group ' + slot.gi + ', ' +
        MP.probe.matches.length + ' control match(es)');
      return mpRender();
    }
    if (k === 'delete') {
      MP.groups[pickd[0]].ctrl[pickd[1]] = CTRL_DEL;
      MP.used--; MP.tomb++;
      MP.probe = { gi: pickd[0], si: pickd[1] };
      MP.msg = 'Deleted <code>"' + pickd[2] + '"</code>. The slot is marked <code>0b11111110</code> — ' +
        'a <b>tombstone</b>, not empty. It has to be: a probe that stopped at a truly empty slot ' +
        'would miss keys that had probed past this one. Tombstones count toward the load factor ' +
        'and are cleared on the next grow.';
      GM.trace('info', 'map delete "' + pickd[2] + '" — slot marked deleted (tombstone)');
      return mpRender();
    }
  }

  function mpMatches(gi, t) {
    var out = [];
    MP.groups[gi].ctrl.forEach(function (c, i) { if (c === t) out.push(i); });
    return out;
  }

  var PROBE_SRC =
    '// internal/runtime/maps/group.go\n' +
    '//\n' +
    '// Eight control bytes live in one uint64. This compares\n' +
    '// all of them against h2 at once, with no branches.\n' +
    '\n' +
    'func (g ctrlGroup) matchH2(h uintptr) bitset {\n' +
    '\tv := uint64(g) ^ (bitsetLSB * uint64(h))\n' +
    '\treturn bitset(((v - bitsetLSB) &^ v) & bitsetMSB)\n' +
    '}\n' +
    '\n' +
    '// XOR zeroes any byte that matched. The subtract-and-mask\n' +
    '// then lights the high bit of exactly those zero bytes,\n' +
    '// giving a bitmask of matching slots to walk.\n' +
    '\n' +
    'ctrlEmpty   = 0b10000000   // never a valid h2\n' +
    'ctrlDeleted = 0b11111110   // tombstone';

  function mpRender() {
    var board = $('#mapBoard');
    clear(board);
    var cap = MP.groups.length * 8;

    MP.groups.forEach(function (g, gi) {
      var probing = MP.probe && MP.probe.gi === gi;
      var filled = g.ctrl.filter(function (c) { return c !== CTRL_EMPTY && c !== CTRL_DEL; }).length;
      var box = el('div', { class: 'mgroup' + (probing ? ' probing' : '') }, [
        el('div', { class: 'mgroup-h' }, [
          el('b', { text: 'group ' + gi }),
          el('span', { text: 'ctrl uint64 · 8 slots' }),
          el('span', { class: 'load', text: filled + '/8' })
        ])
      ]);

      var ctrlRow = el('div', { class: 'mrow' }, [el('span', { class: 'lab', text: 'control' })]);
      g.ctrl.forEach(function (c, i) {
        var isHit = probing && MP.probe.matches && MP.probe.matches.indexOf(i) >= 0;
        var cls = c === CTRL_EMPTY ? '' : c === CTRL_DEL ? ' del' : ' full';
        if (isHit) cls = ' hit';
        ctrlRow.appendChild(el('div', {
          class: 'ctrlb' + cls,
          title: c === CTRL_EMPTY ? 'empty (0x80)' : c === CTRL_DEL ? 'deleted (0xFE)' : 'h2 = 0x' + c.toString(16),
          text: c === CTRL_EMPTY ? '—' : c === CTRL_DEL ? 'DEL' : '0x' + c.toString(16).toUpperCase()
        }));
      });
      box.appendChild(ctrlRow);

      var slotRow = el('div', { class: 'mrow' }, [el('span', { class: 'lab', text: 'slots' })]);
      g.keys.forEach(function (key, i) {
        var isHit = probing && MP.probe.si === i;
        var dead = g.ctrl[i] === CTRL_DEL;
        slotRow.appendChild(el('div', {
          class: 'mslot2' + (key !== null && !dead ? ' full' : '') + (isHit ? ' hit' : ''),
          title: key || 'empty',
          text: key !== null && !dead ? key : '·'
        }));
      });
      box.appendChild(slotRow);
      board.appendChild(box);
    });

    board.appendChild(el('div', { class: 'legend' }, [
      el('span', { class: 'lg dim mono', text: 'load ' + MP.used + '/' + cap +
        '  ·  tombstones ' + MP.tomb + '  ·  grows at ' + Math.floor(cap * 7 / 8) + ' (7 of every 8)' })
    ]));

    $('#mapProbe').innerHTML = GM.goHL(PROBE_SRC);
    $('#mapEvent').innerHTML = MP.msg || '';
  }

  GM.register('maps', {
    title: 'Maps',
    sub: 'Swiss tables — 8 slots probed at once',
    hint: 'internal/runtime/maps · Go 1.24+',
    init: function () {
      mpReset();
      $$('[data-mp]').forEach(function (b) {
        b.addEventListener('click', function () { mpAct(b.getAttribute('data-mp')); });
      });
    },
    enter: mpRender
  });

  /* ══════════════════════════════════════════════════════════
     03 · STRINGS & RUNES
     ══════════════════════════════════════════════════════════ */

  var STR = 'héllo, 世界';
  var SBYTES = [], SRUNES = [], SMODE = 'reset', SLIT = -1;

  function buildStr() {
    var enc = new TextEncoder();
    SBYTES = []; SRUNES = [];
    var off = 0;
    Array.from(STR).forEach(function (ch) {
      var b = enc.encode(ch);
      SRUNES.push({ ch: ch, off: off, n: b.length, cp: ch.codePointAt(0) });
      for (var i = 0; i < b.length; i++) SBYTES.push({ v: b[i], off: off + i, multi: b.length > 1, ch: ch });
      off += b.length;
    });
  }

  function strAct(k) {
    SMODE = k; SLIT = -1;
    var box = $('#strEvent');
    if (k === 'reset') {
      box.innerHTML = 'A string header is a pointer and a length &mdash; 16 bytes, pointing at ' +
        'read-only bytes. Slicing it allocates nothing; it just makes another header.';
      GM.trace('info', 'string reset');
    } else if (k === 'index') {
      SLIT = 1;
      box.innerHTML = '<code>s[1]</code> is <b>195</b> (<code>0xC3</code>) &mdash; not <code>é</code>. ' +
        'Indexing a string gives you one <b>byte</b>, and this one is only the first half of a ' +
        'two-byte UTF-8 sequence. <span class="warn">There is no index that gives you the second ' +
        'character.</span> The type is <code>byte</code>, so it will compile and quietly be wrong.';
      GM.trace('warn', 's[1] = 195 (0xC3) — the leading byte of é, not the character');
    } else if (k === 'range') {
      box.innerHTML = '<code>for i, r := range s</code> decodes UTF-8 as it goes: <code>r</code> is a ' +
        '<b>rune</b> (an int32 code point) and <code>i</code> is its <b>byte offset</b>, not a ' +
        'counter. That is why the index jumps <code>… 6, 7, 8, 11</code> &mdash; it steps over the ' +
        'three bytes of <code>世</code>. Nine iterations over fourteen bytes.';
      GM.trace('info', 'range s — 9 runes over 14 bytes, offsets 0 1 3 4 5 6 7 8 11');
    } else if (k === 'bytes') {
      box.innerHTML = '<code>[]byte(s)</code> <span class="warn">allocates and copies all 14 bytes</span>. ' +
        'It has to: the result is mutable and the string promised it never changes. ' +
        'The compiler can skip the copy in a few proven cases &mdash; <code>for range []byte(s)</code>, ' +
        'or a map lookup <code>m[string(b)]</code> &mdash; but assume the copy unless you have checked.';
      GM.trace('warn', '[]byte(s) — runtime.stringtoslicebyte, 14-byte allocation');
    } else if (k === 'runes') {
      box.innerHTML = '<code>[]rune(s)</code> allocates <b>9 × 4 = 36 bytes</b> and decodes every ' +
        'character. Now indexing works the way people expect &mdash; <code>r[1]</code> really is ' +
        '<code>é</code> &mdash; but you have paid for a full decode and more memory than the string used.';
      GM.trace('info', '[]rune(s) — 9 runes × 4 bytes = 36-byte allocation');
    }
    strRender();
  }

  function strRender() {
    $('#strTag').textContent = SBYTES.length + ' bytes · ' + SRUNES.length + ' runes';

    var bb = $('#strBytes');
    clear(bb);
    SBYTES.forEach(function (b, i) {
      bb.appendChild(el('div', {
        class: 'bcell' + (b.multi ? ' multi' : '') + (i === SLIT ? ' lit' : ''),
        title: 'byte ' + b.off + ' of "' + b.ch + '"'
      }, [
        el('div', { class: 'hex', text: '0x' + b.v.toString(16).toUpperCase().padStart(2, '0') }),
        el('div', { class: 'idx', text: String(b.off) })
      ]));
    });

    var rr = $('#strRunes');
    clear(rr);
    SRUNES.forEach(function (r) {
      var w = r.n * 40 + (r.n - 1) * 3;
      rr.appendChild(el('div', {
        class: 'rcell' + (SMODE === 'range' ? ' lit' : ''),
        style: 'width:' + w + 'px',
        title: r.n + ' byte' + (r.n === 1 ? '' : 's') + ' at offset ' + r.off
      }, [
        el('div', { class: 'ch', text: r.ch === ' ' ? '␣' : r.ch }),
        el('div', { class: 'cp', text: 'i=' + r.off })
      ]));
    });

    var h = $('#strHeader');
    clear(h);
    h.appendChild(el('div', { class: 'hdr', style: '--c:var(--go);--bg:var(--go-wash)' }, [
      el('div', { class: 'hdr-t', text: 's string — read-only data' }),
      el('div', { class: 'hdr-f', style: 'grid-template-columns:repeat(2,1fr)' }, [
        el('div', null, [el('span', { text: 'ptr' }), el('b', { text: '&rodata' })]),
        el('div', null, [el('span', { text: 'len' }), el('b', { text: String(SBYTES.length) })])
      ])
    ]));
    h.appendChild(el('p', { class: 'note2', style: 'font-size:11.5px;color:var(--ink-3)', html:
      'Purple cells are bytes belonging to a multi-byte character. ' +
      '<code>len(s)</code> counts every cell in the top row; <code>range</code> walks the bottom one.' }));
  }

  GM.register('strings', {
    title: 'Strings & runes',
    sub: 'Immutable bytes, decoded on demand',
    hint: 'runtime/string.go · unicode/utf8',
    init: function () {
      buildStr();
      $$('[data-st]').forEach(function (b) {
        b.addEventListener('click', function () { strAct(b.getAttribute('data-st')); });
      });
    },
    enter: function () { strAct(SMODE === 'reset' ? 'reset' : SMODE); }
  });

  /* ══════════════════════════════════════════════════════════
     04 · STRUCT LAYOUT
     Sizes and offsets from unsafe.Sizeof / Offsetof on go1.26.2.
     ══════════════════════════════════════════════════════════ */

  var STRUCTS = [
    {
      id: 'bad', label: 'As written', size: 24,
      src: 'type Record struct {\n' +
           '\ta bool   // 1 byte\n' +
           '\tb int64  // 8 bytes, needs 8-byte alignment\n' +
           '\tc bool   // 1 byte\n' +
           '\td int32  // 4 bytes, needs 4-byte alignment\n' +
           '}',
      fields: [
        { n: 'a', t: 'bool', off: 0, size: 1 },
        { n: 'b', t: 'int64', off: 8, size: 8 },
        { n: 'c', t: 'bool', off: 16, size: 1 },
        { n: 'd', t: 'int32', off: 20, size: 4 }
      ],
      note: 'Real values: <code>Sizeof = 24</code>, <code>Alignof = 8</code>, offsets ' +
        '<code>a=0 b=8 c=16 d=20</code>.<br><br><b>8 of 24 bytes are padding.</b> ' +
        '<code>b</code> needs an 8-byte boundary so seven bytes die after <code>a</code>; ' +
        '<code>d</code> needs a 4-byte boundary so three more die after <code>c</code>.'
    },
    {
      id: 'good', label: 'Largest first', size: 16,
      src: 'type Record struct {\n' +
           '\tb int64  // 8 bytes\n' +
           '\td int32  // 4 bytes\n' +
           '\ta bool   // 1 byte\n' +
           '\tc bool   // 1 byte\n' +
           '}',
      fields: [
        { n: 'b', t: 'int64', off: 0, size: 8 },
        { n: 'd', t: 'int32', off: 8, size: 4 },
        { n: 'a', t: 'bool', off: 12, size: 1 },
        { n: 'c', t: 'bool', off: 13, size: 1 }
      ],
      note: 'Real values: <code>Sizeof = 16</code>, <code>Alignof = 8</code>, offsets ' +
        '<code>b=0 d=8 a=12 c=13</code>.<br><br><b>Same fields, same types, 8 bytes smaller</b> — ' +
        'a third of the struct, recovered by typing them in a different order. Only 2 bytes of ' +
        'tail padding remain, to keep the struct itself 8-byte aligned in an array.'
    }
  ];

  var stIdx = 0;

  function structRender() {
    var S2 = STRUCTS[stIdx];
    $$('#structSeg button').forEach(function (b, i) {
      b.setAttribute('aria-selected', i === stIdx ? 'true' : 'false');
    });
    $('#structTag').textContent = S2.size + ' bytes · align 8';
    setCode($('#structSrc'), S2.src);

    var map = new Array(S2.size).fill(null);
    S2.fields.forEach(function (f) {
      for (var i = 0; i < f.size; i++) map[f.off + i] = f;
    });

    var lay = $('#structLayout');
    clear(lay);
    for (var r = 0; r < S2.size / 8; r++) {
      var row = el('div', { class: 'mlrow' }, [el('span', { class: 'off', text: '+' + (r * 8) })]);
      var cells = el('div', { class: 'mlbytes' });
      for (var c = 0; c < 8; c++) {
        var f = map[r * 8 + c];
        cells.appendChild(el('div', {
          class: 'mbyte' + (f ? ' f' : ' pad'),
          title: f ? f.n + ' ' + f.t + ' @' + f.off : 'padding',
          text: f ? f.n : '·'
        }));
      }
      row.appendChild(cells);
      lay.appendChild(row);
    }

    var padBytes = map.filter(function (x) { return x === null; }).length;
    var sum = el('div', { class: 'mlsum' });
    [['Size', S2.size + ' B', 1], ['Payload', (S2.size - padBytes) + ' B'],
     ['Padding', padBytes + ' B', padBytes > 4 ? 1 : 0],
     ['× 1M', GM.bytes(S2.size * 1000000)]
    ].forEach(function (m) {
      sum.appendChild(el('div', { class: 'metric' + (m[2] ? ' accent' : '') }, [
        el('div', { class: 'm-l', text: m[0] }),
        el('div', { class: 'm-v', text: m[1] })
      ]));
    });
    lay.appendChild(sum);

    $('#structEvent').innerHTML = S2.note;
  }

  GM.register('structs', {
    title: 'Struct layout',
    sub: 'Alignment, padding, and free memory',
    hint: 'unsafe.Sizeof · fieldalignment',
    init: function () {
      var seg = $('#structSeg');
      STRUCTS.forEach(function (s, i) {
        var b = el('button', { type: 'button', role: 'tab', text: s.label });
        b.addEventListener('click', function () { stIdx = i; structRender(); });
        seg.appendChild(b);
      });
      $$('[data-sx2]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-sx2');
          stIdx = k === 'sort' ? 1 : 0;
          GM.trace(k === 'sort' ? 'note' : 'info',
            k === 'sort' ? 'fields reordered largest-first: 24 → 16 bytes' : 'struct layout reset');
          structRender();
        });
      });
    },
    enter: structRender
  });

})();
