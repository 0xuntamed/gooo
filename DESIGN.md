---
name: The Go Machine
description: Go's compiler and runtime under the microscope, drawn as one silicon die of thirteen functional blocks.
colors:
  substrate: "#11132a"
  substrate-2: "#171a35"
  substrate-3: "#1f2346"
  substrate-4: "#2a2f5c"
  console: "#0e1024"
  line: "#ece9f51f"
  line-2: "#ece9f538"
  ink: "#ece9f5"
  ink-2: "#c3bfdb"
  ink-3: "#948fb4"
  copper: "#e78b52"
  teal: "#3fc6b4"
  rose: "#f0607c"
  violet: "#a493f4"
  pad-gold: "#c4a060"
typography:
  marking:
    fontFamily: "Encode Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "4.25rem"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "0.02em"
    fontVariation: '"wdth" 125'
  display:
    fontFamily: "Encode Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.01em"
    fontVariation: '"wdth" 118'
  headline-lg:
    fontFamily: "Encode Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.01em"
    fontVariation: '"wdth" 118'
  headline:
    fontFamily: "Encode Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontVariation: '"wdth" 118'
  headline-sm:
    fontFamily: "Encode Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.08
    fontVariation: '"wdth" 118'
  title:
    fontFamily: "Encode Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.15
    fontVariation: '"wdth" 118'
  title-sm:
    fontFamily: "Encode Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    fontVariation: '"wdth" 118'
  body:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.62
  body-sm:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  ui:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  code:
    fontFamily: "Martian Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.7
    fontVariation: '"wdth" 82'
  code-sm:
    fontFamily: "Martian Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.65
    fontVariation: '"wdth" 82'
  label:
    fontFamily: "Martian Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.06em"
  annotation:
    fontFamily: "Martian Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
  micro:
    fontFamily: "Martian Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  cell: "2px"
  control: "3px"
  frame: "4px"
spacing:
  gutter-mobile: "16px"
  gutter-desktop: "32px"
  reading-column: "34rem"
components:
  pad:
    backgroundColor: "{colors.substrate-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 12px"
  pad-hover:
    backgroundColor: "{colors.substrate-3}"
  pad-primary:
    backgroundColor: "#e78b5226"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 12px"
  pad-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
  stage-frame:
    backgroundColor: "{colors.substrate-2}"
    rounded: "{rounded.frame}"
  code-pane:
    backgroundColor: "{colors.console}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.control}"
  readout:
    backgroundColor: "{colors.substrate-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.frame}"
    padding: "20px"
---

# Design System: The Go Machine

## Overview

**Creative North Star: "The Die Shot"**

The whole site is one chip under a microscope. The home page is the die itself: a seal ring, a perimeter of bond pads, and thirteen functional blocks, each drawn in its own layout grammar (maps as control-word SRAM banks, the scheduler as cores, strings as read-only bytes). Every chapter is one of those blocks at higher magnification, and every drawing inside it is built from the same small set of layers laid over a violet-black substrate.

Nothing is decoration. Motion only ever shows the mechanism moving: a goroutine flying from a run queue to a P, a token becoming a tree node, a value crossing from a sender's stack to a receiver's. The same piece of "matter" keeps its identity from one state to the next, and animates between them rather than cross-fading. Density is high, like a real die, but every region is labelled with the runtime name it stands for.

**Key Characteristics:**
- A dark silicon substrate ground, chosen for long reading beside a dark editor.
- A five-layer hatch language that encodes meaning by hue *and* pattern.
- Extended die-marking capitals for identity, a hyper-legible face for prose, a width-variable mono for code and data.
- Hairline rectangles with 2–4px corners, crop marks and bond pads, never soft cards.
- Motion as the explanation: layout flights, path draws and pulses, all ease-out-expo.

## Colors

A full palette of four named metal layers over a near-black violet substrate, with ivory ink. The palette is committed: the layers carry meaning everywhere, not accent duty.

### Primary
- **Copper Metal** (copper): values and data, and the goroutine that is running. It is also the primary action, the lit clock tick, and the active chapter number.

### Secondary
- **Teal Interconnect** (teal): pointers, headers, wires and queued goroutines, plus focus rings, lit code lines, and "resolved" states.

### Tertiary
- **Rose Poly** (rose): the heap, an escape, a syscall, a panic, padding waste, and stop-the-world.
- **Violet Well** (violet): parked and waiting, and SSA value names.
- **Bond-Pad Gold** (pad-gold): only the die's bond pads and the small pad square on every control.

### Neutral
- **Silicon Substrate** (substrate): the page ground and the die's surface.
- **Block Interior** (substrate-2): stage frames, panels, controls at rest.
- **Lifted Plane** (substrate-3): hovered controls, inline code in prose.
- **Deep Rail** (substrate-4): scrollbar thumb, empty meter tracks.
- **Console Black** (console): code panes, the trace console, readouts that hold machine output.
- **Ivory Ink** (ink): primary text and die labels. **Soft Ink** (ink-2): prose. **Annotation Ink** (ink-3): captions and axis labels, at least 4.5:1 on substrate.
- **Hairline** (line) and **Firm Hairline** (line-2): every border and divider.

### Named Rules
**The Layer Means One Thing Rule.** Copper is always a value or the running thing. Teal is always a pointer or the waiting thing. Rose is always heap, danger or a stopped world. Violet is always parked. Never use a layer colour for decoration or emphasis that breaks its meaning.

**The Hatch Carries It Too Rule.** State is encoded by pattern as well as hue: copper 45° hatch, teal −45° hatch, rose horizontal hatch, violet dots, cross-hatch for padding and free space. A drawing must stay readable in greyscale.

**The Solid Is Measured Rule.** A solid line marks a value measured on go1.26.2. A dashed line marks a simulated or scaled-down value, and the real value must be stated beside it.

## Typography

**Display Font:** Encode Sans, on its width axis (fallback: system sans)
**Body Font:** Atkinson Hyperlegible Next (fallback: system sans)
**Label/Mono Font:** Martian Mono, on its width axis (fallback: ui-monospace)

**Character:** Wide, heavy capitals read like marking etched on a die. The body face is built for legibility at length. The mono runs condensed (`wdth` 82) for code and wide (`wdth` 112.5) for markings.

### Hierarchy
Two ladders, and nothing between their steps.

- **Heading ladder** (Encode Sans 700, `wdth` 118): **marking** 4.25rem (800, `wdth` 125, uppercase: site name and region names), **display** 3.5rem, **headline-lg** 3rem, **headline** 2.5rem, **headline-sm** 2rem, **title** 1.5rem, **title-sm** 1.25rem. A heading steps down one rung per breakpoint: a chapter title is 2.5rem on phones, 3.5rem from sm, and 4.25rem from xl.
- **Reading and data ladder**, 1px apart: **body** 17px (16px on phones, 1.62) for prose in a 34rem column; **small** 15px for readouts and secondary prose; **ui** 14px for lists, tables and controls; **code** 13px and **code-sm** 12px (condensed mono) for listings and identifiers; **label** 11px (uppercase, +0.06em) for instrument labels; **annotation** 10px and **micro** 9px for text inside diagrams, such as cell indices, offsets and axis ticks.

### Named Rules
**The Mono Is Data Rule.** Monospace is for code, runtime identifiers, addresses and measurements. A heading or a sentence is never set in mono.

**The Fixed Measure Rule.** Prose never runs wider than 34rem. The live diagram owns the rest of the viewport.

**The Ladder Rule.** Every size is a rung: 9–17px in whole pixels, and headings in the rem steps above. Nothing is set at a half pixel, and nothing below 9px.

## Layout

Chapters use a two-column grid on desktop: the prose column (34rem) scrolls on the left, and a sticky stage fills the right, from under the 52px top bar to the bottom of the viewport. On phones the stage sticks to the top half (52svh) and the prose scrolls beneath it. Each scroll step is a full state of the machine. Steps are tall (92svh on desktop, 64svh on phones), so exactly one is live as it crosses the viewport's middle (desktop) or its lower third (phones).

The home page's first viewport is the die beside an inspector column (320–360px). Below it, a floorplan index runs as a datasheet table grouped by region. Content width caps at 1680px, with gutters of 16px on phones and 32px from md up. Stages use container queries, so a stage adapts to its frame rather than to the viewport.

The die has two authored floorplans: landscape (viewBox 1600×1000) for md and up, and portrait (1000×1900) for phones, with labels scaled ×1.6 so they stay legible.

## Elevation & Depth

Flat by construction, as a die is. Depth comes from layering tone (substrate → block interior → lifted plane → console black) and from hairline borders, never from shadows. The one exception is the floorplan menu, a transient panel that drops a single soft shadow (`0 18px 40px -18px #000c`) to separate it from the page it covers.

### Named Rules
**The Flat Die Rule.** Surfaces are flat. Hierarchy comes from tone, border weight and hatch density, not from shadows or glows. Nothing glows.

## Shapes

Hairline rectangles with barely softened corners: 2px for cells and chips, 3px for controls and panes, 4px for frames. Stage frames carry L-shaped crop marks in their four corners, as on a microscope capture. The die carries a double seal ring and a perimeter of square bond pads. Round shapes appear only where the subject is round: GC objects, the channel ring, and status dots.

## Components

### Buttons (Pads)
A control is a bond pad, the place where a signal enters the chip.
- **Shape:** gently squared (3px), 36px tall, 12px horizontal padding, 1px firm hairline border.
- **Pad square:** every control leads with a 7px square in bond-pad gold, which turns teal on hover and solid copper when pressed.
- **Primary:** a copper border over a 15% copper wash. It is used once per row for the main action.
- **Hover / Focus:** the border shifts to teal and the fill lifts to the Lifted Plane over 150ms ease-out-expo. Focus is a 2px teal ring offset 3px. Active nudges down 1px.
- **Quiet:** transparent, soft ink, and a border appears only on hover. Used for Reset.
- **Code pads:** when a pad *is* a line of Go (`t := s[1:3]`), its label is set in condensed mono.

### Dials
A labelled range input inside a pad-shaped well: an uppercase mono label, a copper-filled track, a squared ivory thumb with a copper border, and a tabular copper readout.

### Stage frame (signature)
The block under the microscope. A 4px frame in Block Interior over faint horizontal standard-cell rows, with crop marks, the block name and source path in the bottom corner, and above it the **clock strip**: one small square per step (copper = now, teal = done, hollow = to come), then the step's number and title.

### Code pane
Console Black, hairline border, caption bar. Line numbers on the left. The executing line is **lit** by a teal band that physically slides between lines, and every other line dims to 45%.

### Readout and trace
"What just happened" is a Block Interior panel whose text swaps with a short blur-and-rise. The trace console is Console Black with lines tinted by kind (info ink, warn rose, sched teal, gc violet, note copper) in the real `GODEBUG` formats.

### Navigation
A fixed 52px top bar: a chip mark with the site name, the chapter number and title, previous/next arrows, and a **Floorplan** control that opens a clip-revealed panel with a miniature die and the grouped chapter list. The die itself is the primary navigation: hovering a block lights its real wires, and clicking zooms the camera into it before the route changes.

## Do's and Don'ts

### Do:
- **Do** draw every mechanism from the five layers, with hatch and hue together.
- **Do** give each piece of matter (a goroutine, a token, a value) one identity and animate it between states (`layoutId`), scoped with its own `LayoutGroup` id per stage.
- **Do** label every block and region with the real runtime name it stands for.
- **Do** mark measured values solid and simulated values dashed, with the real value stated.
- **Do** keep ease-out-expo (`cubic-bezier(0.16, 1, 0.3, 1)`) for every transition and respect `prefers-reduced-motion`.

### Don't:
- **Don't** add motion that does not show the mechanism: no floating shapes, no parallax, no ambient loops. The one ambient loop is the live scheduler, and it is the real engine.
- **Don't** make it cartoonish: no mascots, no bouncy toy easing.
- **Don't** use shadows, glows or gradient text for emphasis.
- **Don't** set headings or prose in monospace.
- **Don't** put a kicker or eyebrow above a heading. A chapter number sits inline, in the heading.
- **Don't** replace a captured value with a rounder or invented one.
