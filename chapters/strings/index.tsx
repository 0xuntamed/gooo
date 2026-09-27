"use client";

import { useMemo, useState } from "react";
import { ChapterClose, Sandbox } from "@/components/chapter-shell";
import { Rich } from "@/components/rich";
import { Scrolly, type Step } from "@/components/scrolly";
import { mkTrace, Pad, pushTrace, Readout, type TraceLine } from "@/components/ui";
import { encode, U } from "@/lib/engines/strings";
import { StringStage, type StrMode } from "./stage";

const S = "héllo, 世界";

const FRAMES: { mode: StrMode; code: string; decode?: number }[] = [
  { mode: "bytes", code: `s := "${S}"` },
  { mode: "index", code: "b := s[1]" },
  { mode: "decode", code: "r, size := utf8.DecodeRuneInString(s[1:])", decode: 1 },
  { mode: "decode", code: "r, size := utf8.DecodeRuneInString(s[8:])", decode: 7 },
  { mode: "range", code: "for i, r := range s { … }" },
  { mode: "slice", code: "t := s[8:]" },
  { mode: "tobytes", code: "b := []byte(s)" },
  { mode: "torunes", code: "rs := []rune(s)" },
];

const STEPS: Step[] = [
  {
    id: "header", title: "Two words and some bytes",
    body: (
      <>
        <p>A <code>string</code> is a pointer and a length: 16 bytes. The bytes it points at are <strong>read-only</strong>. For a literal like this one they live in the binary&apos;s read-only data section, and nothing may ever change them.</p>
        <p>This string has 9 characters and <strong>14 bytes</strong>. <code>len(s)</code> is 14. The length counts bytes, not characters.</p>
      </>
    ),
  },
  {
    id: "index", title: "s[1] is a byte",
    body: (
      <>
        <p><code>s[1]</code> is <code>0xC3</code>, which is 195. It is <em>not</em> <code>é</code>. Indexing a string gives you one byte, and this byte is only the first half of a two-byte sequence.</p>
        <p>There is no index that returns the second character. The result has type <code>byte</code>, so the code compiles and is quietly wrong.</p>
      </>
    ),
  },
  {
    id: "decode2", title: "Decoding é",
    body: (
      <>
        <p>UTF-8 marks every byte. A lead byte starting <code>110</code> says &ldquo;two bytes&rdquo;, and each continuation byte starts <code>10</code>. Strip those markers and join what is left: <code>00011</code> + <code>101001</code> = <code>0xE9</code>, or U+00E9.</p>
        <p>Because continuation bytes can never look like lead bytes, a decoder that lands mid-character can always resynchronise.</p>
      </>
    ),
  },
  {
    id: "decode3", title: "Decoding 世",
    body: (
      <>
        <p>A lead byte of <code>1110</code> means three bytes: 4 payload bits, then 6, then 6. Together they make <code>0x4E16</code>, U+4E16.</p>
        <p>ASCII is the one-byte case: a leading <code>0</code> and 7 payload bits. That is why every ASCII file is already valid UTF-8.</p>
      </>
    ),
  },
  {
    id: "range", title: "range decodes as it goes",
    body: (
      <>
        <p><code>for i, r := range s</code> is the one place the language decodes UTF-8 for you. <code>r</code> is a <code>rune</code> (an <code>int32</code> code point), and <code>i</code> is its <strong>byte offset</strong>, not a counter.</p>
        <p>Watch <code>i</code>: 0, 1, 3, 4, 5, 6, 7, 8, 11. It jumps over the second byte of é and the three bytes of 世. Nine iterations over fourteen bytes.</p>
      </>
    ),
  },
  {
    id: "slice", title: "Slicing is free",
    body: (
      <>
        <p><code>t := s[8:]</code> is a new header pointing 8 bytes in, with length 6. It copies nothing and allocates nothing. Because the bytes can never change, sharing them is always safe.</p>
        <p>The indices are byte offsets. <code>s[2:]</code> would start in the middle of é and produce a string that is not valid UTF-8. The runtime will let you do that.</p>
      </>
    ),
  },
  {
    id: "bytes", title: "[]byte(s) must copy",
    body: (
      <>
        <p>A <code>[]byte</code> is mutable, and the string promised its bytes never change. So <code>[]byte(s)</code> has to <strong>allocate</strong> and copy all 14 of them onto the heap.</p>
        <p>The compiler skips the copy only when it can prove nobody writes through the result: <code>for range []byte(s)</code>, a map lookup <code>m[string(b)]</code>, a comparison. Otherwise, assume the copy.</p>
      </>
    ),
  },
  {
    id: "runes", title: "[]rune(s) widens everything",
    body: (
      <>
        <p><code>[]rune(s)</code> decodes every character and stores each one in 4 bytes: 9 × 4 = <strong>36 bytes</strong>, more than twice the string.</p>
        <p>Now <code>rs[1]</code> really is <code>é</code>. You paid for a full decode and the memory to get there, so do it once, not inside a loop.</p>
      </>
    ),
  },
];

export default function StringsChapter() {
  const base = useMemo(() => encode(S), []);
  const [text, setText] = useState(S);
  const enc = useMemo(() => encode(text || " "), [text]);
  const [mode, setMode] = useState<StrMode>("bytes");
  const [decode, setDecode] = useState(1);
  const [play, setPlay] = useState(0);
  const [trace, setTrace] = useState<TraceLine[]>([]);

  const cut = enc.runes[Math.min(7, enc.runes.length - 1)]?.off ?? 0;
  const b1 = enc.bytes[1];
  const msg = (() => {
    if (mode === "index") {
      if (!b1) return "This string is too short to index at 1.";
      const r = enc.runes[b1.rune];
      return b1.kind === "ascii"
        ? `\`s[1]\` is \`0x${b1.v.toString(16).toUpperCase()}\` (${b1.v}), the whole of \`${r.ch}\`, because that character is ASCII. Try a string that starts with a multi-byte character.`
        : `\`s[1]\` is \`0x${b1.v.toString(16).toUpperCase()}\` (${b1.v}): a ${b1.kind === "lead" ? "lead" : "continuation"} byte of \`${r.ch}\`, not a character. !!Indexing is always bytes.!!`;
    }
    if (mode === "decode") {
      const r = enc.runes[Math.min(decode, enc.runes.length - 1)];
      return `\`${r.ch}\` is ${r.n} byte${r.n === 1 ? "" : "s"}. Strip the UTF-8 markers from each and join the payload bits: **${U(r.cp)}**, code point ${r.cp}.`;
    }
    if (mode === "range") return `\`range\` visits ${enc.runes.length} runes over ${enc.bytes.length} bytes. \`i\` is always a byte offset: ${enc.runes.map((r) => r.off).join(", ")}.`;
    if (mode === "slice") return `\`t := s[${cut}:]\` is a new 16-byte header over the same bytes: pointer +${cut}, length ${enc.bytes.length - cut}. ++No copy, no allocation.++`;
    if (mode === "tobytes") return `\`[]byte(s)\` allocated **${enc.bytes.length} bytes** on the heap and copied every one. !!The copy is the price of mutability.!!`;
    if (mode === "torunes") return `\`[]rune(s)\` allocated **${enc.runes.length} × 4 = ${enc.runes.length * 4} bytes** and decoded every character to get there.`;
    return `${enc.runes.length} characters, **${enc.bytes.length} bytes**. \`len(s)\` is ${enc.bytes.length}.`;
  })();

  const go = (m: StrMode, line: string, kind: "info" | "warn" = "info") => {
    setMode(m);
    setPlay((p) => p + 1);
    setTrace((t) => pushTrace(t, mkTrace(kind, line)));
  };

  return (
    <>
      <Scrolly steps={STEPS} block="read-only data (ROM)" pkg="runtime/string.go">
        {(i) => <StringStage enc={base} mode={FRAMES[i].mode} decode={FRAMES[i].decode} code={FRAMES[i].code} playKey={i} />}
      </Scrolly>

      <Sandbox
        slug="strings"
        intro={
          <>
            <p>Type any string, then run the operations on it. Try an emoji: it is four bytes, and the lead byte begins <code>11110</code>.</p>
            <label className="mt-4 flex flex-col gap-2">
              <span className="label text-ink-3">s :=</span>
              <input
                value={text}
                maxLength={18}
                onChange={(e) => { setText(e.target.value); setDecode(0); }}
                className="h-11 rounded-[3px] border border-line-2 bg-[#0e1024] px-3 font-mono text-[15px] text-ink outline-none transition-colors focus:border-teal"
                spellCheck={false}
                aria-label="String to inspect"
              />
            </label>
          </>
        }
        controls={
          <>
            <Pad code onClick={() => go("index", `s[1] = ${b1?.v ?? "-"}`, "warn")}>s[1]</Pad>
            <Pad code onClick={() => go("range", `range s: ${enc.runes.length} runes, offsets ${enc.runes.map((r) => r.off).join(" ")}`)}>for i, r := range s</Pad>
            <Pad code onClick={() => go("slice", `s[${cut}:]: header only, 0 B allocated`)}>s[{cut}:]</Pad>
            <Pad code onClick={() => go("tobytes", `runtime.stringtoslicebyte: ${enc.bytes.length} B allocated`, "warn")}>[]byte(s)</Pad>
            <Pad code onClick={() => go("torunes", `runtime.stringtoslicerune: ${enc.runes.length * 4} B allocated`, "warn")}>[]rune(s)</Pad>
            <Pad
              code
              onClick={() => {
                const next = (decode + 1) % enc.runes.length;
                setDecode(next);
                go("decode", `decode rune ${next}: ${U(enc.runes[next].cp)}`);
              }}
            >
              decode next rune
            </Pad>
            <Pad tone="quiet" onClick={() => { setText(S); setMode("bytes"); setDecode(1); }}>Reset</Pad>
          </>
        }
        stage={<StringStage enc={enc} mode={mode} decode={Math.min(decode, enc.runes.length - 1)} code={`s := "${text}"`} playKey={play} />}
        readout={<Readout id={mode + text + decode}><p><Rich text={msg} /></p></Readout>}
        trace={trace}
        onClearTrace={() => setTrace([])}
        hint="runtime/string.go · unicode/utf8"
      />

      <ChapterClose
        slug="strings"
        notes={
          <p>Where a string&apos;s bytes live depends on where it came from. Literals sit in the binary&apos;s read-only data. Strings built at run time (by concatenation, <code>strconv</code>, or <code>string(b)</code>) live on the heap. Either way the rule is the same: nothing writes to them once the string exists.</p>
        }
      />
    </>
  );
}
