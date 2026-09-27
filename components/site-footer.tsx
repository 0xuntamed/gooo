import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 flex max-w-[1680px] flex-col gap-4 border-t border-line px-4 py-10 text-[14px] text-ink-3 md:flex-row md:items-center md:justify-between md:px-8">
      <Link href="/" className="marking text-[13px] text-ink-2 transition-colors hover:text-ink">The Go Machine</Link>
      <p className="max-w-[60ch]">
        Compiler output captured from <code className="font-mono text-[12px] text-ink-2 mono-tight">go1.26.2</code> on
        amd64. Runtime traces follow the <code className="font-mono text-[12px] text-ink-2 mono-tight">GODEBUG</code>{" "}
        schedtrace and gctrace line formats.
      </p>
    </footer>
  );
}
