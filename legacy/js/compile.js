/* ============================================================
   THE GO MACHINE — compile-time modules
   01 pipeline · 02 escape · 03 interfaces · 06 defer/panic
   All compiler output here was captured from go1.26.2.
   ============================================================ */
(function () {
  'use strict';
  var GM = window.GoMachine;
  var $ = GM.$, $$ = GM.$$, el = GM.el, esc = GM.esc, clear = GM.clear, setCode = GM.setCode;

  /* ══════════════════════════════════════════════════════════
     01 · COMPILER PIPELINE
     ══════════════════════════════════════════════════════════ */

  var SUM_SRC =
    'func sum(xs []int) int {\n' +
    '\ttotal := 0\n' +
    '\tfor _, x := range xs {\n' +
    '\t\ttotal += x\n' +
    '\t}\n' +
    '\treturn total\n' +
    '}';

  /* Real `go/scanner` output. `;` entries with literal "\n" are
     semicolons the scanner inserted — Go's whole "no semicolons" story. */
  var TOKENS = [
    ['3:1', 'func', 'func'], ['3:6', 'IDENT', 'sum'], ['3:9', '(', ''],
    ['3:10', 'IDENT', 'xs'], ['3:13', '[', ''], ['3:14', ']', ''],
    ['3:15', 'IDENT', 'int'], ['3:18', ')', ''], ['3:20', 'IDENT', 'int'],
    ['3:24', '{', ''],
    ['4:2', 'IDENT', 'total'], ['4:8', ':=', ''], ['4:11', 'INT', '0'],
    ['4:12', ';', '\\n'],
    ['5:2', 'for', 'for'], ['5:6', 'IDENT', '_'], ['5:7', ',', ''],
    ['5:9', 'IDENT', 'x'], ['5:11', ':=', ''], ['5:14', 'range', 'range'],
    ['5:20', 'IDENT', 'xs'], ['5:23', '{', ''],
    ['6:3', 'IDENT', 'total'], ['6:9', '+=', ''], ['6:12', 'IDENT', 'x'],
    ['6:13', ';', '\\n'],
    ['7:2', '}', ''], ['7:3', ';', '\\n'],
    ['8:2', 'return', 'return'], ['8:9', 'IDENT', 'total'], ['8:14', ';', '\\n'],
    ['9:1', '}', ''], ['9:2', ';', '\\n'], ['9:3', 'EOF', '']
  ];

  function tokenText() {
    return TOKENS.map(function (t) {
      var asi = t[1] === ';' && t[2] === '\\n';
      var lit = t[2] ? '"' + t[2] + '"' : '';
      var line = pad('sum.go:' + t[0], 12) + pad(t[1], 8) + lit;
      return asi ? line + '   ← inserted' : line;
    }).join('\n');
  }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

  var PHASES = [
    {
      id: 'scan', n: 'Phase 1', l: 'Scan',
      pkg: 'cmd/compile/internal/syntax',
      tag: '37 tokens',
      note: 'Scanner',
      body: 'Bytes become tokens. The scanner is also where Go\'s most famous ergonomic lives: ' +
            'when a line ends in an identifier, literal, <code>)</code>, <code>]</code>, <code>}</code>, ' +
            '<code>++</code>, <code>--</code> or <code>return</code>, it silently inserts a semicolon.',
      why: 'Automatic semicolon insertion is why the opening brace <em>must</em> be on the same line. ' +
           'Put it on the next line and the scanner terminates your statement before you get there.',
      out: tokenText,
      metrics: [['Tokens', '37'], ['Inserted ;', '6', 1], ['Bytes in', '96']]
    },
    {
      id: 'parse', n: 'Phase 2', l: 'Parse',
      pkg: 'cmd/compile/internal/syntax',
      tag: 'condensed from ast.Fprint',
      note: 'Parser',
      body: 'A recursive-descent parser builds one syntax tree per file, in parallel across files. ' +
            'No symbol resolution yet &mdash; this tree knows <code>xs</code> is an identifier, not what it means.',
      why: 'Go\'s grammar is small enough to parse without a symbol table, which is what makes the ' +
           'compiler fast and tools like <code>gofmt</code> possible on unbuildable code.',
      out: function () {
        return '*ast.FuncDecl\n' +
          '├─ Name: *ast.Ident "sum"\n' +
          '├─ Type: *ast.FuncType\n' +
          '│  ├─ Params:  xs *ast.ArrayType → Elt *ast.Ident "int"\n' +
          '│  └─ Results: *ast.Ident "int"\n' +
          '└─ Body: *ast.BlockStmt\n' +
          '   ├─ *ast.AssignStmt  (Tok := )\n' +
          '   │  ├─ Lhs: *ast.Ident "total"\n' +
          '   │  └─ Rhs: *ast.BasicLit INT "0"\n' +
          '   ├─ *ast.RangeStmt\n' +
          '   │  ├─ Key:   *ast.Ident "_"\n' +
          '   │  ├─ Value: *ast.Ident "x"\n' +
          '   │  ├─ X:     *ast.Ident "xs"\n' +
          '   │  └─ Body: *ast.BlockStmt\n' +
          '   │     └─ *ast.AssignStmt (Tok += )\n' +
          '   │        ├─ Lhs: *ast.Ident "total"\n' +
          '   │        └─ Rhs: *ast.Ident "x"\n' +
          '   └─ *ast.ReturnStmt\n' +
          '      └─ Results: *ast.Ident "total"';
      },
      metrics: [['AST nodes', '19'], ['Depth', '6'], ['Decls', '1']]
    },
    {
      id: 'types', n: 'Phase 3', l: 'Type-check',
      pkg: 'cmd/compile/internal/types2',
      tag: 'resolved objects',
      note: 'types2',
      body: 'Every identifier is bound to an object and every expression gets a type. Untyped ' +
            'constants collapse to their default types here &mdash; <code>0</code> is an untyped int ' +
            'constant until it lands in <code>total</code>.',
      why: 'This is the same checker <code>go vet</code> and <code>gopls</code> run, which is why the ' +
           'compiler and your editor agree on errors to the character.',
      out: function () {
        return 'object            kind        type\n' +
          '─────────────────────────────────────────────\n' +
          'sum               func        func([]int) int\n' +
          'xs                var (param) []int\n' +
          'total             var         int\n' +
          'x                 var         int\n' +
          '_                 blank       —\n\n' +
          'expression        type        value\n' +
          '─────────────────────────────────────────────\n' +
          '0                 untyped int → int   constant 0\n' +
          'range xs          index int, elem int\n' +
          'total + x         int\n' +
          'return total      int         (assignable ✓)';
      },
      metrics: [['Objects', '5'], ['Type errors', '0'], ['Untyped consts', '1']]
    },
    {
      id: 'middle', n: 'Phase 4', l: 'Middle-end',
      pkg: 'cmd/compile/internal/{inline,escape,devirtualize}',
      tag: 'real -m output',
      note: 'Inline, escape, devirtualize',
      body: 'Three analyses over the whole package IR. Inlining runs bottom-up with a cost budget ' +
            'of 80 &ldquo;nodes&rdquo;. Escape analysis decides stack or heap. Devirtualization turns ' +
            'interface calls into direct ones when the concrete type is provable.',
      why: 'Inlining is the enabling optimization: once <code>Rect.Area</code> is inlined, escape ' +
           'analysis can see the receiver never escapes, and the allocation disappears.',
      out: function () {
        return './sample.go:9:6:  can inline Rect.Area with cost 6\n' +
          './sample.go:11:6: can inline sum with cost 16\n' +
          './sample.go:19:6: can inline makeCounter with cost 8\n' +
          './sample.go:24:6: cannot inline main: function too complex:\n' +
          '                  cost 183 exceeds budget 80\n\n' +
          './sample.go:26:41: devirtualizing s.Area to Rect\n' +
          './sample.go:26:17: inlining call to sum\n' +
          './sample.go:26:41: inlining call to Rect.Area\n\n' +
          './sample.go:11:10: xs does not escape\n' +
          './sample.go:20:2:  n escapes to heap in makeCounter:\n' +
          './sample.go:20:2:    flow: ~r0 ← &n:\n' +
          './sample.go:20:2:      from &n (address-of) at :21:9\n' +
          './sample.go:20:2:      from return &n (return) at :21:2\n' +
          './sample.go:20:2:  moved to heap: n';
      },
      metrics: [['Inlined', '3'], ['Budget', '80'], ['Devirtualized', '1', 1], ['Heap moves', '1']]
    },
    {
      id: 'ssabuild', n: 'Phase 5', l: 'SSA build',
      pkg: 'cmd/compile/internal/ssa',
      tag: 'pass: start',
      note: 'Static single assignment',
      body: 'The IR is flattened into basic blocks of three-address instructions where every value ' +
            'is assigned exactly once. Control-flow joins get <code>Phi</code> values that pick a ' +
            'version based on which edge you arrived on.',
      why: 'SSA makes &ldquo;where did this value come from?&rdquo; a pointer dereference instead of a ' +
           'dataflow analysis. Every optimization after this is cheap because of it.',
      out: function () {
        return 'b1:\n' +
          '  v1  = InitMem <mem>\n' +
          '  v2  = SP <uintptr>\n' +
          '  v3  = SB <uintptr>\n' +
          '  v4  = LocalAddr <*[]int> {xs} v2 v1\n' +
          '  v6  = Arg <[]int> {xs}\n' +
          '  v7  = Const64 <int> [0]        (total)\n' +
          '  v8  = SliceLen <int> v6\n' +
          '  v22 = Const64 <int> [1]\n' +
          '  Plain → b2\n\n' +
          'b2: ← b1 b4\n' +
          '  v9  = Phi <int> v7 v23         (loop index)\n' +
          '  v27 = Phi <mem> v1 v17\n' +
          '  v28 = Phi <int> v7 v20         (total)\n' +
          '  v29 = Phi <[]int> v6 v13\n' +
          '  v10 = Copy <int> v8\n' +
          '  v11 = Less64 <bool> v9 v10\n' +
          '  If v11 → b3 b5 (likely)\n\n' +
          'b3: ← b2\n' +
          '  v14 = SliceLen <int> v13\n' +
          '  v15 = SlicePtr <*int> v13\n' +
          '  v16 = PtrIndex <*int> v15 v12\n' +
          '  v18 = Load <int> v16 v17       (x)\n' +
          '  v20 = Add64 <int> v19 v18      (total)\n' +
          '  Plain → b4';
      },
      metrics: [['Values', '29'], ['Blocks', '5'], ['Phi', '4']]
    },
    {
      id: 'ssaopt', n: 'Phase 6', l: 'SSA optimize',
      pkg: 'cmd/compile/internal/ssa (≈50 passes)',
      tag: 'pass: opt',
      note: 'Rewrite to a fixed point',
      body: 'Copy elimination, constant folding, common-subexpression elimination, dead code, ' +
            'and <strong>bounds-check elimination</strong>. Most of it is generated from ' +
            '<code>.rules</code> files &mdash; pattern rewrites applied until nothing changes.',
      why: 'Note what vanished: <code>v10</code>, <code>v13</code>, <code>v14</code>, ' +
           '<code>v29</code> and block <code>b3</code>. The prover established <code>0 ≤ i &lt; len(xs)</code> ' +
           'from the loop condition, so the index never needs a runtime check.',
      out: function () {
        return 'b1:\n' +
          '  v1  = InitMem <mem>\n' +
          '  v6  = Arg <[]int> {xs}\n' +
          '  v7  = Const64 <int> [0]        (total)\n' +
          '  v8  = SliceLen <int> v6\n' +
          '  v22 = Const64 <int> [1]\n' +
          '  Plain → b2\n\n' +
          'b2: ← b1 b4\n' +
          '  v9  = Phi <int> v7 v23         (loop index)\n' +
          '  v28 = Phi <int> v7 v20         (total)\n' +
          '  v11 = Less64 <bool> v9 v8\n' +
          '  If v11 → b4 b5 (likely)\n\n' +
          'b4: ← b2\n' +
          '  v15 = SlicePtr <*int> v6\n' +
          '  v23 = Add64 <int> v9 v22\n' +
          '  v24 = Const64 <int> [8]\n' +
          '  v25 = Mul64 <int> v9 v24\n' +
          '  v16 = AddPtr <*int> v15 v25\n' +
          '  v18 = Load <int> v16 v1        (x)\n' +
          '  v20 = Add64 <int> v28 v18      (total)\n' +
          '  Plain → b2\n\n' +
          'b5: ← b2\n' +
          '  v26 = MakeResult <int,mem> v28 v1\n' +
          '  Ret v26\n\n' +
          '── no IsInBounds. no PanicBounds. ──';
      },
      metrics: [['Values', '16', 1], ['Blocks', '4'], ['Bounds checks', '0', 1]]
    },
    {
      id: 'gen', n: 'Phase 7', l: 'Codegen',
      pkg: 'cmd/compile/internal/ssagen → cmd/internal/obj',
      tag: 'real -S output',
      note: 'Lower, allocate, emit',
      body: 'Machine-independent ops are lowered to amd64 ops, values are assigned to registers, ' +
            'and the block order is chosen to minimise jumps. What was 29 SSA values is 9 instructions ' +
            'and no stack frame at all.',
      why: 'Everything lives in registers: <code>AX</code> the data pointer, <code>BX</code> the length, ' +
           '<code>CX</code> the index, <code>DX</code> the running total. <code>NOFRAME</code> means ' +
           'this function never touches the stack, so it also never needs a growth check.',
      out: function () {
        return 'main.sum STEXT nosplit size=27 args=0x18 locals=0x0\n' +
          '  TEXT  main.sum(SB), NOSPLIT|NOFRAME|ABIInternal, $0-24\n' +
          '  MOVQ  AX, main.xs+8(FP)\n' +
          '  XORL  CX, CX          ; i = 0\n' +
          '  XORL  DX, DX          ; total = 0\n' +
          '  JMP   18\n' +
          '11:\n' +
          '  ADDQ  (AX)(CX*8), DX  ; total += xs[i]   ← one instruction\n' +
          '  INCQ  CX              ; i++\n' +
          '18:\n' +
          '  CMPQ  BX, CX          ; i < len(xs) ?\n' +
          '  JGT   11\n' +
          '  MOVQ  DX, AX          ; return total\n' +
          '  RET\n\n' +
          '  0x0000  48 89 44 24 08 31 c9 31 d2 eb 07 48 03 14 c8 48\n' +
          '  0x0010  ff c1 48 39 cb 7f f4 48 89 d0 c3\n\n' +
          '── with -N -l (optimizations off): 136 bytes, 33 instructions ──';
      },
      metrics: [['Instructions', '9', 1], ['Bytes', '27', 1], ['Stack frame', '0'], ['Unoptimized', '136 B']]
    }
  ];

  var phaseIdx = 0;

  function renderPhases() {
    var list = $('#phases');
    clear(list);
    PHASES.forEach(function (p, i) {
      var b = el('button', {
        class: 'phase' + (i < phaseIdx ? ' done' : ''),
        'aria-current': i === phaseIdx ? 'true' : 'false',
        type: 'button'
      }, [
        el('span', { class: 'p-n', text: p.n }),
        el('span', { class: 'p-l', text: p.l })
      ]);
      b.addEventListener('click', function () { setPhase(i); });
      list.appendChild(el('li', { style: 'display:contents' }, [b]));
    });
  }

  function setPhase(i) {
    phaseIdx = i;
    var p = PHASES[i];
    renderPhases();
    $('#pipeOut').textContent = p.out();
    $('#pipeOutTag').textContent = p.tag;
    $('#pipeNoteTitle').textContent = p.note;
    $('#pipeNoteBody').innerHTML = p.body;
    $('#pipeWhy').innerHTML = p.why;
    $('#pipePkg').textContent = p.pkg;

    var m = $('#pipeMetrics');
    clear(m);
    p.metrics.forEach(function (mm) {
      m.appendChild(el('div', { class: 'metric' + (mm[2] ? ' accent' : '') }, [
        el('div', { class: 'm-l', text: mm[0] }),
        el('div', { class: 'm-v', text: mm[1] })
      ]));
    });
    GM.trace('info', 'compile: ' + p.l.toLowerCase() + ' — ' + p.tag);
  }

  GM.register('pipeline', {
    title: 'Compiler pipeline',
    sub: 'One function, from bytes to machine code',
    hint: 'go build -gcflags="-m -S" · GOSSAFUNC=sum',
    init: function () {
      setCode($('#pipeSource'), SUM_SRC);
      renderPhases();
    },
    enter: function () { setPhase(phaseIdx); }
  });

  /* ══════════════════════════════════════════════════════════
     02 · ESCAPE ANALYSIS
     ══════════════════════════════════════════════════════════ */

  var ESC_EX = [
    {
      k: 'stack', label: 'Stays on the stack',
      src: 'func sum(xs []int) int {\n' +
           '\ttotal := 0\n' +
           '\tfor _, x := range xs {\n' +
           '\t\ttotal += x\n' +
           '\t}\n' +
           '\treturn total\n' +
           '}',
      out: './sample.go:11:10: xs does not escape\n\n' +
           'The slice header is read, never stored anywhere\n' +
           'that outlives the call. No pointer to it leaves\n' +
           'the frame, so nothing needs the heap.\n\n' +
           'Generated code:\n' +
           '  NOSPLIT|NOFRAME  — zero-byte stack frame\n' +
           '  no CALL runtime.newobject',
      obj: 'xs []int', dest: 'stack'
    },
    {
      k: 'heap', label: 'Moved to the heap',
      src: 'func makeCounter() *int {\n' +
           '\tn := 0\n' +
           '\treturn &n\n' +
           '}',
      out: './sample.go:20:2: n escapes to heap in makeCounter:\n' +
           './sample.go:20:2:   flow: ~r0 ← &n:\n' +
           './sample.go:20:2:     from &n (address-of) at :21:9\n' +
           './sample.go:20:2:     from return &n (return) at :21:2\n' +
           './sample.go:20:2: moved to heap: n\n\n' +
           'Generated code:\n' +
           '  LEAQ  type:int(SB), AX\n' +
           '  CALL  runtime.newobject(SB)   ← the allocation',
      obj: 'n int', dest: 'heap'
    },
    {
      k: 'iface', label: 'Escapes through fmt',
      src: 'func main() {\n' +
           '\tv := sum([]int{1, 2, 3})\n' +
           '\tfmt.Println(v)\n' +
           '}',
      out: './sample.go:26:17: ~r0 escapes to heap in main:\n' +
           './sample.go:26:17:   flow: {storage for ... argument}\n' +
           './sample.go:26:17:         ← &{storage for ~r0}\n' +
           './sample.go:26:17:   flow: fmt.a ← &{storage for ...}\n' +
           './sample.go:26:17:     from fmt.Fprintln(os.Stdout, fmt.a...)\n' +
           './sample.go:26:17:          (call parameter)\n\n' +
           'Println takes ...any. Boxing an int into an\n' +
           'interface needs a pointer, and Fprintln is too\n' +
           'big to inline — so the compiler must assume the\n' +
           'callee keeps it. Everything you print escapes.',
      obj: 'v int → any', dest: 'heap'
    }
  ];

  var escIdx = 0;

  function renderEsc() {
    var e = ESC_EX[escIdx];
    setCode($('#escSource'), e.src);
    $('#escOut').textContent = e.out;

    $$('#escPick button').forEach(function (b, i) {
      b.setAttribute('aria-selected', i === escIdx ? 'true' : 'false');
    });

    var stackSlot = $('#escStackSlot'), heapSlot = $('#escHeapSlot');
    clear(stackSlot); clear(heapSlot);
    $('#escArrow').classList.toggle('on', e.dest === 'heap');

    var chip = el('div', {
      class: 'obj',
      style: e.dest === 'heap'
        ? '--c: var(--st-syscall); --bg: var(--st-syscall-bg)'
        : '--c: var(--st-gcwork); --bg: var(--st-gcwork-bg)',
      text: e.obj
    });
    (e.dest === 'heap' ? heapSlot : stackSlot).appendChild(chip);

    if (e.dest === 'heap') {
      heapSlot.appendChild(el('div', {
        class: 'obj', style: '--c: var(--rule-firm); --bg: var(--tag)',
        text: 'runtime.newobject'
      }));
      GM.trace('warn', 'escape: moved to heap — ' + e.obj);
    } else {
      stackSlot.appendChild(el('div', {
        class: 'obj', style: '--c: var(--rule-firm); --bg: var(--tag)',
        text: 'frame · 0 bytes'
      }));
      GM.trace('info', 'escape: ' + e.obj + ' does not escape');
    }
  }

  GM.register('escape', {
    title: 'Escape analysis',
    sub: 'Stack or heap, decided at compile time',
    hint: "go build -gcflags='-m -m'",
    init: function () {
      var seg = $('#escPick');
      ESC_EX.forEach(function (e, i) {
        var b = el('button', { type: 'button', role: 'tab', text: e.label });
        b.addEventListener('click', function () { escIdx = i; renderEsc(); });
        seg.appendChild(b);
      });
    },
    enter: renderEsc
  });

  /* ══════════════════════════════════════════════════════════
     03 · INTERFACES & ITABS
     ══════════════════════════════════════════════════════════ */

  var IFACE_STEPS = {
    assign: {
      lit: ['iface', 'itab', 'data', 'rect'],
      code: 'var s Shape = Rect{3, 4}\n\n' +
        '// The compiler emits a static itab because both\n' +
        '// types are known here. Nothing is searched at runtime.\n' +
        '  LEAQ  go:itab.main.Rect,main.Shape(SB), AX  ; s.tab\n' +
        '  LEAQ  main..stmp_0(SB), BX                  ; s.data\n\n' +
        '// Rect is 16 bytes — larger than one word — so the\n' +
        '// data word must point at it. Here it is a read-only\n' +
        '// static, but a computed Rect would be heap-allocated.',
      trace: ['info', 'iface: assign Rect → Shape, static itab bound']
    },
    call: {
      lit: ['iface', 'itab', 'fun', 'code'],
      code: 's.Area()\n\n' +
        '// Load the method pointer out of the itab, then call it.\n' +
        '  MOVQ  8(AX), CX      ; itab.fun[0]\n' +
        '  MOVQ  BX, AX         ; receiver = s.data\n' +
        '  CALL  CX             ; indirect call\n\n' +
        '// Two loads and an indirect CALL. No hashing, no search.\n' +
        '// The cost versus a direct call is the missed inlining\n' +
        '// and the branch predictor, not the dispatch itself.',
      trace: ['info', 'iface: dynamic dispatch via itab.fun[0]']
    },
    assert: {
      lit: ['iface', 'itab'],
      code: 'r, ok := s.(Rect)\n\n' +
        '// A type assertion to a concrete type is a pointer compare.\n' +
        '  LEAQ  go:itab.main.Rect,main.Shape(SB), CX\n' +
        '  CMPQ  AX, CX         ; s.tab == the Rect itab ?\n' +
        '  JNE   fail\n\n' +
        '// Asserting to another *interface* is different: that needs\n' +
        '// getitab(), which checks the runtime itabTable hash map\n' +
        '// and builds a new itab on a miss.',
      trace: ['info', 'iface: type assert — itab pointer compare']
    },
    devirt: {
      lit: ['code'],
      code: '// Middle-end, real output from -gcflags=-m:\n' +
        '//   ./sample.go:26:41: devirtualizing s.Area to Rect\n' +
        '//   ./sample.go:26:41: inlining call to Rect.Area\n\n' +
        '// Because s is assigned exactly once from a known type,\n' +
        '// the compiler rewrites the dynamic call to a static one —\n' +
        '// and then inlines it away entirely.\n\n' +
        's.Area()   →   Rect.Area(s.data)   →   r.W * r.H\n\n' +
        '  MOVSD  X0, X1\n' +
        '  MULSD  X1, X0        ; the whole call, gone\n\n' +
        '// The itab is still emitted; it is simply never read.',
      trace: ['note', 'iface: devirtualized s.Area → Rect.Area, then inlined']
    }
  };

  function ifaceSVG() {
    return '' +
    '<svg viewBox="0 0 720 292" role="img" aria-label="An interface value holds an itab pointer and a data pointer; the itab holds the method table.">' +
      '<defs>' +
        '<marker id="ifarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
          '<path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>' +
        '</marker>' +
      '</defs>' +
      '<g font-family="IBM Plex Mono, monospace" font-size="11.5" fill="currentColor">' +

        /* iface value */
        '<g id="if-iface">' +
          '<rect x="12" y="52" width="176" height="76" rx="6" fill="none" stroke="currentColor" stroke-opacity=".45"/>' +
          '<text x="18" y="42" font-size="10.5" fill-opacity=".62">var s Shape — 16 bytes</text>' +
          '<rect id="if-tabw" x="22" y="62" width="156" height="26" rx="4" fill="none" stroke="currentColor" stroke-opacity=".3"/>' +
          '<text x="30" y="79">tab  *itab</text>' +
          '<rect id="if-dataw" x="22" y="94" width="156" height="26" rx="4" fill="none" stroke="currentColor" stroke-opacity=".3"/>' +
          '<text x="30" y="111">data unsafe.Pointer</text>' +
        '</g>' +

        /* itab */
        '<g id="if-itab">' +
          '<rect x="264" y="20" width="196" height="140" rx="6" fill="none" stroke="currentColor" stroke-opacity=".45"/>' +
          '<text x="270" y="12" font-size="10.5" fill-opacity=".62">runtime.itab</text>' +
          '<text x="276" y="44">inter  *interfacetype</text>' +
          '<text x="276" y="64">_type  *_type</text>' +
          '<text x="276" y="84">hash   uint32</text>' +
          '<line x1="272" y1="96" x2="452" y2="96" stroke="currentColor" stroke-opacity=".22"/>' +
          '<rect id="if-funw" x="270" y="104" width="184" height="46" rx="4" fill="none" stroke="currentColor" stroke-opacity=".3"/>' +
          '<text x="278" y="121">fun[0] uintptr</text>' +
          '<text x="278" y="140" fill-opacity=".7">→ main.Rect.Area</text>' +
        '</g>' +

        /* concrete value */
        '<g id="if-rect">' +
          '<rect x="540" y="52" width="164" height="70" rx="6" fill="none" stroke="currentColor" stroke-opacity=".45"/>' +
          '<text x="546" y="42" font-size="10.5" fill-opacity=".62">Rect — 16 bytes</text>' +
          '<text x="554" y="78">W float64 = 3</text>' +
          '<text x="554" y="102">H float64 = 4</text>' +
        '</g>' +

        /* code symbol */
        '<g id="if-code">' +
          '<rect x="264" y="204" width="196" height="56" rx="6" fill="none" stroke="currentColor" stroke-opacity=".45"/>' +
          '<text x="270" y="196" font-size="10.5" fill-opacity=".62">text segment</text>' +
          '<text x="276" y="228">main.Rect.Area:</text>' +
          '<text x="276" y="248" fill-opacity=".7">  MULSD X1, X0</text>' +
        '</g>' +

        /* edges */
        '<g stroke="currentColor" fill="none" marker-end="url(#ifarrow)">' +
          '<path id="if-e1" d="M178,75 L258,75" stroke-opacity=".5"/>' +
          '<path id="if-e2" d="M178,107 C 400,107 380,88 534,88" stroke-opacity=".5"/>' +
          '<path id="if-e3" d="M362,150 L362,198" stroke-opacity=".5"/>' +
        '</g>' +
        '<text x="186" y="68" font-size="9.5" fill-opacity=".6">points to</text>' +
        '<text x="368" y="176" font-size="9.5" fill-opacity=".6">calls</text>' +
      '</g>' +
    '</svg>';
  }

  var IF_MAP = {
    iface: '#if-iface', itab: '#if-itab', data: '#if-e2',
    rect: '#if-rect', fun: '#if-funw', code: '#if-code'
  };

  function ifaceReset() {
    $$('#ifaceBoard [stroke]').forEach(function (n) {
      n.style.stroke = ''; n.style.strokeOpacity = ''; n.style.strokeWidth = '';
    });
    $$('#ifaceBoard text').forEach(function (n) { n.style.fill = ''; });
  }

  function ifaceStep(key) {
    if (key === 'reset') {
      ifaceReset();
      $('#ifaceCode').textContent =
        '// Pick an operation above.\n\n' +
        '// An interface value is two words. Always.\n' +
        'type iface struct {\n' +
        '\ttab  *itab\n' +
        '\tdata unsafe.Pointer\n' +
        '}';
      GM.trace('info', 'iface: reset');
      return;
    }
    var s = IFACE_STEPS[key];
    if (!s) return;
    ifaceReset();
    s.lit.forEach(function (k) {
      var sel = IF_MAP[k]; if (!sel) return;
      var g = $('#ifaceBoard ' + sel);
      if (!g) return;
      var shapes = g.tagName === 'g' ? Array.prototype.slice.call(g.querySelectorAll('rect,path,line')) : [g];
      shapes.forEach(function (n) {
        n.style.stroke = 'var(--go)';
        n.style.strokeOpacity = '1';
        n.style.strokeWidth = '1.6';
      });
      if (g.tagName === 'g') {
        Array.prototype.slice.call(g.querySelectorAll('text')).forEach(function (t) {
          t.style.fill = 'var(--go-deep)';
        });
      }
    });
    $('#ifaceCode').innerHTML = GM.goHL(s.code);
    GM.trace(s.trace[0], s.trace[1]);
  }

  GM.register('iface', {
    title: 'Interfaces & itabs',
    sub: 'Two words, one method table',
    hint: 'go build -gcflags=-m · go tool compile -S',
    init: function () {
      $('#ifaceBoard').innerHTML = ifaceSVG();
      $$('[data-ifx]').forEach(function (b) {
        b.addEventListener('click', function () { ifaceStep(b.getAttribute('data-ifx')); });
      });
    },
    enter: function () { ifaceStep('reset'); }
  });

  /* ══════════════════════════════════════════════════════════
     06 · DEFER · PANIC · RECOVER
     ══════════════════════════════════════════════════════════ */

  var DEF_VARIANTS = [
    {
      id: 'open', label: 'Straight-line (open-coded)',
      src:
        'func process(items []string) (err error) {\n' +
        '\tf, _ := os.Open("data.txt")\n' +
        '\tdefer f.Close()          // bit 0\n' +
        '\n' +
        '\tmu.Lock()\n' +
        '\tdefer mu.Unlock()        // bit 1\n' +
        '\n' +
        '\tdefer func() {           // bit 2\n' +
        '\t\tif r := recover(); r != nil {\n' +
        '\t\t\terr = fmt.Errorf("recovered: %v", r)\n' +
        '\t\t}\n' +
        '\t}()\n' +
        '\n' +
        '\treturn doWork(items)\n' +
        '}',
      defers: ['f.Close()', 'mu.Unlock()', 'func() { recover() }'],
      open: true,
      note: 'Three defers, none in a loop, all in straight-line code — so the compiler ' +
            '<b>open-codes</b> them. No <code>_defer</code> records exist at all. ' +
            'A single 8-bit register tracks which have been armed; the calls are ' +
            'emitted inline at every return path.'
    },
    {
      id: 'loop', label: 'One defer in a loop',
      src:
        'func process(items []string) (err error) {\n' +
        '\tf, _ := os.Open("data.txt")\n' +
        '\tdefer f.Close()\n' +
        '\n' +
        '\tmu.Lock()\n' +
        '\tdefer mu.Unlock()\n' +
        '\n' +
        '\tfor _, it := range items {\n' +
        '\t\tdefer track(it)      // ← in a loop\n' +
        '\t}\n' +
        '\n' +
        '\treturn doWork(items)\n' +
        '}',
      defers: ['f.Close()', 'mu.Unlock()', 'track("a")', 'track("b")', 'track("c")'],
      open: false,
      note: 'One defer inside a loop and the whole function loses open-coding. ' +
            'Every defer here now allocates a <code>_defer</code> record and pushes it onto ' +
            '<code>g._defer</code> at runtime. The count is not knowable at compile time, ' +
            'so the bitmask trick cannot apply.'
    }
  ];

  var defVar = 0, defState = 'idle', defFired = 0, defPanicking = false;

  function renderDefer() {
    var v = DEF_VARIANTS[defVar];
    setCode($('#defSource'), v.src);

    $$('#defSeg button').forEach(function (b, i) {
      b.setAttribute('aria-selected', i === defVar ? 'true' : 'false');
    });

    var box = $('#defState');
    clear(box);

    if (v.open) {
      box.appendChild(el('div', { class: 'subhead', text: 'deferBits — one register, no memory' }));
      var bits = el('div', { class: 'bitmask' });
      for (var i = 7; i >= 0; i--) {
        var armed = i < v.defers.length && (defState !== 'idle') && i >= defFired;
        bits.appendChild(el('span', { class: 'bit' + (armed ? ' on' : ''), text: armed ? '1' : '0' }));
      }
      bits.appendChild(el('span', { class: 'dim mono', style: 'margin-left:6px', text: 'bit 7 … 0' }));
      box.appendChild(bits);
    } else {
      box.appendChild(el('div', { class: 'subhead', text: 'g._defer — heap-allocated chain (LIFO)' }));
    }

    var chain = el('div', { class: 'dchain' });
    var list = v.defers.slice().reverse();
    list.forEach(function (d, i) {
      var realIdx = v.defers.length - 1 - i;
      var fired = realIdx >= v.defers.length - defFired;
      var firing = defState === 'unwind' && realIdx === v.defers.length - defFired - 1;
      chain.appendChild(el('div', {
        class: 'drec' + (v.open ? ' open' : '') + (fired ? ' done' : '') + (firing ? ' firing' : '')
      }, [
        el('span', { text: d }),
        el('span', { class: 'ptr', text: v.open ? 'inline @ret' : '_defer ' + (realIdx === 0 ? 'nil' : '→0x' + (0xc000 + realIdx * 8).toString(16)) })
      ]));
    });
    if (!v.defers.length) chain.appendChild(el('div', { class: 'dim mono', text: '(empty)' }));
    box.appendChild(chain);

    var strip = $('#defStrip');
    if (defState === 'idle') strip.innerHTML = v.note;
    else if (defState === 'ran') {
      strip.innerHTML = '<b>Returned normally.</b> ' + (v.open
        ? 'All three inline calls fired at the return site in reverse order, guarded by the bitmask. Cost: three <code>CALL</code>s and a few <code>TESTB</code>s.'
        : 'The runtime walked <code>g._defer</code>, calling and popping ' + v.defers.length + ' records.');
    } else if (defState === 'unwind') {
      var remaining = v.defers.length - defFired;
      strip.innerHTML = '<span class="panicline">panic: boom</span> &nbsp;— <b>gopanic</b> is walking the defer chain. ' +
        remaining + ' record' + (remaining === 1 ? '' : 's') + ' left. ' +
        (v.open ? 'Even open-coded defers are found here: the frame descriptor records where the bitmask lives.' : '');
    } else if (defState === 'recovered') {
      strip.innerHTML = '<b>recover() returned "boom".</b> It marked <code>_panic.recovered</code>, then ' +
        '<code>mcall(recovery)</code> reset SP and PC to the deferring frame\'s return point. ' +
        '<code>process</code> now returns <code>err = recovered: boom</code> — having never finished its body.';
    } else if (defState === 'crashed') {
      strip.innerHTML = '<span class="panicline">panic: boom</span><br>' +
        '<span class="panicline">goroutine 1 [running]:</span><br>' +
        '<span class="panicline">main.process(...)</span><br>' +
        '<b>No recover in the chain</b> — the runtime printed the traceback and called <code>exit(2)</code>.';
    }
  }

  function deferAct(k) {
    var v = DEF_VARIANTS[defVar];
    if (k === 'reset') {
      defState = 'idle'; defFired = 0; defPanicking = false;
      GM.trace('info', 'defer: reset');
    } else if (k === 'run') {
      defState = 'ran'; defFired = v.defers.length; defPanicking = false;
      GM.trace('info', 'defer: return path fired ' + v.defers.length +
        (v.open ? ' open-coded defers' : ' heap _defer records') + ' (LIFO)');
    } else if (k === 'panic') {
      defState = 'unwind'; defFired = 0; defPanicking = true;
      GM.trace('warn', 'panic: boom — gopanic walking g._defer');
    } else if (k === 'step') {
      if (!defPanicking) { deferAct('panic'); return; }
      if (defFired < v.defers.length) {
        var firing = v.defers[v.defers.length - defFired - 1];
        defFired++;
        GM.trace('warn', 'gopanic: running deferred ' + firing);
        if (/recover/.test(firing)) {
          defState = 'recovered'; defPanicking = false;
          GM.trace('note', 'recover(): _panic.recovered = true → mcall(recovery)');
        }
      } else {
        defState = 'crashed'; defPanicking = false;
        GM.trace('warn', 'fatal: no recover — exit status 2');
      }
    }
    renderDefer();
  }

  GM.register('defer', {
    title: 'defer · panic · recover',
    sub: 'Three implementations, chosen by shape',
    hint: 'go build -gcflags=-d=defer',
    init: function () {
      var tb = $('[data-mod="defer"] .toolbar');
      var seg = el('div', { class: 'seg', id: 'defSeg', role: 'tablist' });
      DEF_VARIANTS.forEach(function (v, i) {
        var b = el('button', { type: 'button', role: 'tab', text: v.label });
        b.addEventListener('click', function () {
          defVar = i; defState = 'idle'; defFired = 0; defPanicking = false;
          GM.trace('info', 'defer: variant → ' + v.label);
          renderDefer();
        });
        seg.appendChild(b);
      });
      tb.insertBefore(seg, tb.firstChild);

      $$('[data-dx]').forEach(function (b) {
        b.addEventListener('click', function () { deferAct(b.getAttribute('data-dx')); });
      });
    },
    enter: renderDefer
  });

})();
