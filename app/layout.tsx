/*
  DIRECTION CONTRACT: see the comment emitted as the first child of <body>.
  Every edit to this site answers to it.
*/
import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Encode_Sans, Martian_Mono } from "next/font/google";
import { LayerPatterns } from "@/components/die/patterns";
import { MotionProvider } from "@/components/motion-provider";
import "./globals.css";

const encode = Encode_Sans({ subsets: ["latin"], axes: ["wdth"], variable: "--font-encode", display: "swap" });
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap", adjustFontFallback: false });
const martian = Martian_Mono({ subsets: ["latin"], axes: ["wdth"], variable: "--font-martian", display: "swap" });

export const metadata: Metadata = {
  title: { default: "The Go Machine", template: "%s · The Go Machine" },
  description:
    "Go's compiler and runtime under the microscope. Thirteen mechanisms you step through and drive yourself, with every number captured from go1.26.2.",
};

export const viewport: Viewport = { themeColor: "#11132a", colorScheme: "dark" };

const CONTRACT = `
THESIS: Go's runtime under the microscope. One die, thirteen functional blocks; scrolling descends into a block and steps the real algorithm one clock at a time. Refuses the dark dev-tool dashboard and the cream explorable essay.
OWN-WORLD: violet-black silicon substrate; blocks as hatched translucent layers (copper = values, teal = pointers, rose = heap/escape/danger, violet = parked, cross-hatch = padding/free); ivory annotations; bond-pad perimeter and seal ring; Encode Sans extended markings, Atkinson Hyperlegible Next prose, Martian Mono for code and data.
STORY: A working Go dev picks a block, watches the mechanism move step by step against real go1.26.2 output, drives it in the sandbox, and leaves able to predict it in their own code.
FIRST VIEWPORT: the whole die, top-down, filling the viewport beside the inspector; THE GO MACHINE marking top-left; scheduler cores ticking live; hovering a block lights its real wires; clicking zooms the camera into its chapter. Primary action: Start at block 01.
FORM: die floorplan, #5 of 7, seed d238cfb0.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${encode.variable} ${atkinson.variable} ${martian.variable}`}>
      <body>
        <div hidden dangerouslySetInnerHTML={{ __html: `<!--${CONTRACT}-->` }} />
        <LayerPatterns />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
