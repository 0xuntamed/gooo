import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center px-6">
      <div className="max-w-md">
        <p className="font-mono text-[13px] text-rose">panic: runtime error: index out of range</p>
        <h1 className="display mt-4 text-[2.5rem] text-ink">There is no block here</h1>
        <p className="mt-3 text-ink-2">That address does not map to anything on the die.</p>
        <Link href="/" className="mt-6 inline-flex font-bold text-copper hover:text-ink">Back to the die →</Link>
      </div>
    </main>
  );
}
