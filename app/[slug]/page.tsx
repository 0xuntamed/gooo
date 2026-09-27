import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChapterHead, TopBar } from "@/components/chapter-shell";
import { BODIES } from "@/chapters";
import { bySlug, CHAPTERS } from "@/lib/chapters";

export const dynamicParams = false;

export function generateStaticParams() {
  return CHAPTERS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = bySlug(slug);
  if (!c) return {};
  return { title: c.title, description: `${c.sub} An interactive, step-by-step look at ${c.pkg}.` };
}

export default async function ChapterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = bySlug(slug);
  const Body = BODIES[slug];
  if (!c || !Body) notFound();
  return (
    <>
      <TopBar slug={slug} />
      <main>
        <ChapterHead slug={slug} />
        <Body />
      </main>
    </>
  );
}
