import { Fragment, type ReactNode } from "react";

/** `code`, **bold**, !!warning!!, ++good++ — the markup engine messages use. */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|!!([^!]+)!!|\+\+([^+]+)\+\+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] !== undefined) out.push(<code key={k++}>{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<span key={k++} className="font-bold text-rose">{m[3]}</span>);
    else if (m[4] !== undefined) out.push(<span key={k++} className="font-bold text-teal">{m[4]}</span>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return <>{out}</>;
}
