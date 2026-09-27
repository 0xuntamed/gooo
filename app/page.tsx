import Link from "next/link";
import { CodePane } from "@/components/code-pane";
import { Hero } from "@/components/home/hero";
import { LayerKey } from "@/components/home/layer-key";
import { SiteFooter } from "@/components/site-footer";
import { CHAPTERS, GROUPS, type GroupId } from "@/lib/chapters";

const CAPTURE = `go build -gcflags='-m -m' sample.go        # inlining, escape analysis, devirtualization
go build -gcflags='-S'    sample.go        # final assembly
GOSSAFUNC=sum go build -o /dev/null sample.go   # SSA at every pass → ssa.html
GODEBUG=schedtrace=120,gctrace=1 go run tracer.go
go run data.go                             # cap growth, unsafe.Sizeof/Offsetof`;

export default function Home() {
  const groups = Object.keys(GROUPS) as GroupId[];
  return (
    <main>
      <Hero />

      <section id="floorplan" className="mx-auto max-w-[1680px] scroll-mt-6 px-4 pb-24 pt-24 md:px-8 md:pt-32">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
          <div className="lg:sticky lg:top-10 lg:self-start">
            <h2 className="display text-[2.5rem] text-ink md:text-[3rem]">The floorplan</h2>
            <p className="mt-4 max-w-[36ch] text-ink-2">
              Five regions, in the order a Go program meets them: its data, what the compiler
              decides about it, how it runs, how goroutines talk, and how memory is found and
              given back. Each block reads on its own. The order builds on itself.
            </p>
            <div className="mt-8 rounded-[4px] border border-line-2 bg-substrate-2 p-5">
              <h3 className="display text-[1.25rem] text-ink">How to read every drawing</h3>
              <LayerKey className="mt-4" />
            </div>
          </div>

          <div className="space-y-14">
            {groups.map((g) => (
              <div key={g}>
                <div className="flex items-baseline justify-between gap-4 border-b border-line-2 pb-3">
                  <h3 className="marking text-[1.25rem] text-ink">{GROUPS[g].name}</h3>
                  <p className="hidden text-[14px] text-ink-3 sm:block">{GROUPS[g].blurb}</p>
                </div>
                <ul>
                  {CHAPTERS.filter((c) => c.group === g).map((c) => (
                    <li key={c.slug} className="border-b border-line">
                      <Link
                        href={`/${c.slug}/`}
                        className="group grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 py-5 transition-colors duration-200 hover:bg-substrate-2 md:grid-cols-[3.5rem_minmax(0,16rem)_minmax(0,1fr)_minmax(0,15rem)] md:px-3"
                      >
                        <span className="tnum font-mono text-[14px] text-copper">{String(c.n).padStart(2, "0")}</span>
                        <span className="display text-[1.25rem] text-ink transition-colors group-hover:text-copper">{c.title}</span>
                        <span className="col-start-2 text-[15px] leading-snug text-ink-2 md:col-start-auto">{c.sub}</span>
                        <span className="col-start-2 font-mono text-[12px] leading-snug text-ink-3 mono-tight md:col-start-auto md:text-right">{c.pkg}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line-2 bg-[#0e1024]">
        <div className="mx-auto grid max-w-[1680px] gap-10 px-4 py-20 md:px-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="display text-[2rem] text-ink md:text-[2.5rem]">Nothing here is from memory</h2>
            <div className="prose mt-4 max-w-[38ch] text-ink-2">
              <p>
                The tokens, trees, SSA, assembly, escape reasoning, growth sequences and struct offsets
                were captured from <code>go1.26.2</code> on amd64 with the commands on the right, or read
                out of <code>$(go env GOROOT)/src</code>.
              </p>
              <p>
                Two things are scaled down so the mechanism fits on screen. The local run queue holds
                <strong> 6</strong> here (<strong>256</strong> in the runtime), and sysmon counts ticks
                instead of 20&nbsp;µs and 10&nbsp;ms. Both are drawn with a dashed line wherever they appear.
              </p>
            </div>
          </div>
          <CodePane code={CAPTURE} lang="plain" caption="capture commands" numbers={false} className="self-start" />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
