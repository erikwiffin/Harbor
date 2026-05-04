# Harbor — design notes

A short field guide to the choices in `index.html`, `landscape.html`, and `styles.css`. Use this when iterating; nothing here is sacred, but most of it is load-bearing.

## Voice on the page

The brief asked for "Stripe docs × Anthropic × simonwillison.net × CSS-Tricks." That's a real triangulation, not a vibe — it pulls in four moves:

1. **Code is a first-class citizen.** Three full snippets above the fold-ish, plus inline code in body copy, plus one-line code in the "what you could build" rows.
2. **Editorial pacing.** The page is a scrollable essay with chapter numbers (`01` … `09`), eyebrows, and section rules. Every section has a different background tint or layout so the eye doesn't fall asleep.
3. **Frank, factual labels.** "draft · 2026" in the masthead. "we don't say *safe*" at the end of the security section. "v0.3 · last updated may 2026" in the footer. Status is part of the design, not in spite of it.
4. **No marketing decoration.** No hero illustration. No gradients. No icon set. The only ornament is the accent rule on one word and one column.

## Type system

| token        | family                                | use                                        |
|--------------|---------------------------------------|--------------------------------------------|
| `--font-display` / `--font-serif` | **Instrument Serif**       | hero, h1–h3, pull quotes, brand wordmark   |
| `--font-sans`  | **Inter**                            | body, nav, controls, table cells           |
| `--font-mono`  | **JetBrains Mono**                   | code, eyebrows, captions, footer chrome    |

> *Iteration note:* the first draft used **Fraunces** (a variable optical-size serif) on a warm-paper background. After review, the direction was pushed toward true-white + a sharper, more contemporary, "technical paper" register, so the headline face was swapped to **Instrument Serif**. Notes below describe the shipped state. The transcript of that iteration lives in `design-bundle/chat-transcript.md`.

Instrument Serif at hero scale reads sharp and a little spec-document; at h2 it's still distinctly editorial without going decorative. We use `text-wrap: balance` on headings and `text-wrap: pretty` on body to keep ragged edges sane.

Hero is `clamp(3.4rem, 8vw, 7rem)` with `letter-spacing: -0.035em` and tight 0.96 leading. One word — *browser capability* — gets a 0.18em accent rule behind it (z-index -1) so the text sits on top, not next to it.

## Color tokens

One restrained accent: **rust-clay**. Light: `oklch(58% 0.13 45)`. Dark: `oklch(72% 0.13 45)`. It is *not* on buttons. Buttons are ink-on-paper. The accent appears in:

- the underline behind one hero word
- the dot before "harbor · draft 2026" in the eyebrow
- the rule under the Harbor table column header (and the soft tint of the column itself)
- the dot before "Web Agent API" in the convergence row
- the "—" before pull quotes
- inline link underlines (`text-decoration-color`)
- the `:not(pre) > code` inline-code tint (12% alpha)

That's it. If you find yourself adding it to a sixth thing, take one of the others away first.

Light background is **paper-warm**, not white: `oklch(98.5% 0.006 85)`. Dark is **cool slate**: `oklch(16% 0.008 250)`. Light has a hint of yellow; dark has a hint of blue. They're intentionally different tones rather than one being an inversion of the other — both look intentional.

Three background tints across sections cycle `bg → tint → sunken` so the page reads as chapters, not a wall. Section borders are a 1px hairline rule, never a shadow.

## Spacing & rhythm

- Base unit 4px, but used as composed values (28, 36, 56, 80, 96, 120) — no `padding: 1rem 1rem` boxes.
- Sections are `96px` top/bottom on desktop, `64px` on mobile.
- Prose measure capped at `64ch`; the comparison table and diagrams get `1180px`.
- Two-column layouts use `minmax(0, 1fr) minmax(0, 1.15fr)` so the right column is the lead, left is sticky context.

## Components, briefly

**Hero.** Pure type. Eyebrow with a bullet, two-line headline with one accented word, sub, two CTAs (ink button + outline button), and a mono "tag-strip" with a `STATUS` pill. No image.

**Code cards.** 1px hairline border, mono header strip with the API surface name on the right in accent. No traffic-lights, no copy button (the brief was specific). Tokenized by hand with five classes (`tk-c k s f p n num`) — restrained palette, comments are italic mute, keywords are accent.

**Comparison table.** This is the centerpiece. `<colgroup>` makes the Harbor column inherit the soft tint without per-cell classes. The thead has a 2px accent rule under the Harbor column only. Row headers are mono small-caps; cells are sans. **Below 640px, the table hides and a card-per-column stack appears** — same data, transposed. No horizontal scroll on phones.

**Standards convergence.** A 4-column hairline grid with no fills. The "ours" cell gets a single accent dot after the title — same trick as the table column.

**Architecture diagram.** Inline SVG, `currentColor` strokes so it adapts to dark mode, one Instrument Serif italic line for the in-scene caption ("— Harbor lives here —"). Drawn in 1px line-art with a single arrow marker. Sits in a tinted card with a mono caption underneath ("fig. 1 · the trust line").

**What you could build.** Five rows: chapter number / title + caption / one-line code. The code lives in a quieter mono pill so the title carries the weight.

**Security columns.** Two ledger-style lists, em-dash bullets, a single mono closing line: *"we say 'by design' and 'smaller surface'. We don't say 'safe.'"* That sentence is the section, really.

**Get started.** Three editorial cards in a hairline-bordered row, each numbered. A small mono `→` link instead of another button — this is page bottom, not a sales close.

## Subpage template (`landscape.html`)

Two-column long-form layout: prose on the left at 68ch, sticky right-rail TOC at 240px. TOC items are number-prefixed (`01`, `02`, …) with a current-section highlight driven by a small scroll handler. Section headings are h2 in serif; sub-points are h3 in sans-bold (the only place sans takes a heading role) — that delineation makes scanning easy.

This is the template for `spec.html` and `build.html` too. The spec page would add a per-method API table; the build page would tilt the right rail toward an "install" pill instead of a TOC. Both reuse every other token.

## Dark mode

Toggled by `.dark` on `<html>`, persisted to localStorage, falls back to `prefers-color-scheme`. Both modes reuse the same accent hue at different lightness — neither mode looks like the inverse of the other. The diagram, code blocks, and tables all use semantic tokens (`--ink`, `--rule`, `--bg-tint`) so nothing has to be re-skinned.

## Things deliberately not done

- No "Harbor is an AI browser" framing anywhere. The hero says *capability*, the meta tag says *proposal and reference implementation*, the footer says *not a Mozilla product*.
- No positioning against Firefox. Firefox is named only as one of the two browsers Harbor ships in.
- No "secure" or "safe." Only "by design" and "smaller surface."
- No icon set. No emoji. No stock illustrations.
- No copy buttons on code blocks. (Add later if usage data demands it; they always look heavier than they need to.)

## Open questions for the next pass

1. Should the hero accent word be **browser capability** (current) or just **capability**? Shorter underline reads cleaner.
2. The architecture diagram uses `var(--accent)` baked into the SVG `fill` attribute for one label — fine in light, slightly hot in dark. Consider switching to `currentColor` and a wrapping span.
3. The comparison table's mobile card-stack is correct but long. A "show all / show Harbor only" toggle could help on phones.
4. Spec and Build pages are stubs (linked from nav; pages themselves not in this round). The Landscape page is the template.
