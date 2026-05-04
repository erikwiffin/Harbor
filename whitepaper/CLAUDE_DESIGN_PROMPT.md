# Prompt: Redesign the Harbor Website

> **Historical artifact (May 2026).** This is the brief that produced the redesign that's currently live. It references files (e.g. `whitepaper/index.md`, `whitepaper/landscape.md`) that **no longer exist** — they were the Markdown drafts that drove the design and were retired when the static-HTML site shipped. The current site lives at `whitepaper/index.html`, `whitepaper/landscape.html`, `whitepaper/spec.html`, `whitepaper/build.html`, `whitepaper/styles.css`. See `whitepaper/README.md` for structure and `whitepaper/DESIGN_NOTES.md` for design rationale. The actual handoff (chat transcript + bundle README) is in `whitepaper/design-bundle/`. Keep this file as a paper trail for *what was asked*; don't take it as current state.

**How to use this (originally):** open Claude Design, paste the entire prompt below (everything between the rules), and attach `whitepaper/index.md`, `docs/POSITIONING.md`, `spec/README.md`, and the project `README.md` as context. Iterate on individual sections in Claude Design once you have the first draft.

---

## Role and goal

You are designing the public website for **Harbor**, an open proposal and reference implementation that turns AI into a browser capability — like `fetch()` is for networking. The site lives at the project's GitHub Pages URL (currently `whitepaper/` in the repo, served via Jekyll). We want to replace it with a beautifully designed single-page site (with a few subpages linked off it) that feels current as of 2026 and clearly explains why Harbor matters even though "AI in the browser" is now everywhere.

The site has three audiences and you should design with all three in mind:

1. **Web developers** who could build on the Web Agent API. They land here via Hacker News, Twitter, or a coworker. They want code in 30 seconds.
2. **Standards / browser-vendor people** (W3C, Chrome, Firefox, Microsoft, Apple). They want the proposal, the threat model, and the WebIDL.
3. **AI / privacy / "user-controlled AI" people** — Mozilla folks, EFF readers, Bruce Schneier blog readers, Simon Willison's audience. They want the architecture argument: why the browser, why now, what's wrong with the alternatives.

The site should feel like one piece of work for all three; you reach the right depth by scrolling and clicking, not by switching to a different site.

## Tone and voice

Match the existing whitepaper. Not corporate. Not breathless. Lowercase where it fits ("your AI", "context is all you need"). It is a **proposal** with a working implementation — never marketing. We invite arguments. We are not announcing a product.

Imagine the love child of:

- **Stripe docs** (developer-focused, content-dense, code as first-class citizen, generous whitespace)
- **Anthropic's website** (calm, intellectual, lots of room to breathe, restrained type)
- **simonwillison.net** (frank, factual, "here is what I built and why")
- **CSS-Tricks article layouts** (tables, code blocks, comparison tables done well)

Avoid:

- Stock illustrations of brains, lightbulbs, or robots
- Gradients that feel like a 2022 SaaS startup
- Animated hero videos with synth music
- "AI" written in chrome 3D
- Abstract isometric "platform diagrams"

## Visual direction

- **Light by default; dark mode toggle.** Both should look intentional, not derivative.
- **Type-led design.** A confident editorial serif or a high-quality sans (think *Söhne*, *Inter Display*, or *Fraunces* + *Inter*). Big hero type. Generous line-height in body copy.
- **One restrained accent color** — something a little unusual (rust orange, a deep teal, a muted plum). Not "Mozilla blue." Not "OpenAI green." Not "Anthropic salmon."
- **Code is a star.** Code blocks should be elegant: a thin border or a soft tint, monospace that reads well at small sizes (JetBrains Mono, Berkeley Mono, IBM Plex Mono). Inline code uses a subtle tint, not a heavy box.
- **Comparison tables are expected.** Plan for at least one wide comparison table that needs to render well on mobile (consider stacking by column on narrow viewports).
- **Diagrams are minimal.** A single architecture diagram done as restrained line-art SVG (no gradients, no shadows). One per section maximum.
- **Whitespace > density.** The page should feel like an essay, not a brochure.

The aesthetic should feel like a serious proposal from people who have read a lot of W3C drafts.

## Information architecture

The home page is one long, scrollable page with these sections in order. Each section should be visually distinct (different background tint, different layout) without being noisy.

1. **Hero**
2. **The problem (the 2026 landscape)** — short
3. **The proposal** — what changes if AI is a browser capability
4. **How it works** — three concrete code snippets
5. **Comparison: where Harbor sits** — the differentiation table
6. **Standards convergence** — WebMCP, Chrome Prompt API, MCP, our piece
7. **One sketch: Harbor** — the implementation, the architecture diagram
8. **What you could build** — five concrete examples with one-line code
9. **Security & permissions** — the threat-model story (compact)
10. **An invitation** — feedback, contact
11. **Get started** — three CTAs (read the spec, install Harbor, talk to us)
12. **Footer** — links, changelog, contact, GitHub

Use the copy in `whitepaper/index.md` (the rewritten version, not the current one) as the canonical text. Don't paraphrase it; render it. If you need a section that isn't in the source, ask before inventing.

### Subpages to design (linked from the home page)

These are simpler — text-led, like a long-form blog post in the same design system:

- `/spec/` — the Web Agent API explainer (lives at `spec/README.md`). Long, technical, with sticky table of contents.
- `/landscape/` — the full 2026 landscape essay (drawn from `docs/POSITIONING.md`). Same design as the spec page.
- `/build/` — the developer "build with this" page (drawn from `QUICKSTART.md` and `docs/BUILDING_ON_WEB_AGENTS_API.md`). Code-first.

Don't design every subpage in detail — design *one* (the landscape essay) as a template for the rest.

## Hero requirements (be specific)

- **Headline:** "AI as a browser capability."
- **Sub-headline:** "Bring your AI to every website. Your model, your credentials, your context — mediated by the browser, not a vendor."
- **Two CTAs:** "Read the proposal →" (primary) and "Install Harbor →" (secondary).
- **A short, calm tag-strip** under the CTAs: a single line like *"a working sketch of what user-controlled AI on the open web could look like — open spec, working extension, Firefox + Chrome."*
- **No hero image.** A single typographic hero with a tasteful underline or accent on one word. If you do show anything visual, make it a tiny architecture diagram or a single live-feeling code snippet — not a stock illustration.

## Comparison table (be specific)

The differentiation table from `docs/POSITIONING.md` is the centerpiece of the page. Design it carefully.

- Four columns: "Vendor agent browsers (Atlas, Comet, Gemini in Chrome)", "Sidebar AI assistants (Brave Leo, Firefox AI Window)", "Chrome Prompt API + WebMCP alone", "**Harbor + Web Agent API**" (the last one visually distinguished).
- ~9 rows (see `docs/POSITIONING.md`). Don't drop rows.
- On mobile: stack into a card-per-column comparison or transpose. Don't horizontal-scroll a wide table on phones — that signals you didn't think about it.
- The Harbor column should not feel like a sales pitch. Same visual weight as the others; the only difference is a single accent (a rule, a small dot, a subtle tint) so the eye lands there last.

## Code snippets (be specific)

Three code blocks should appear on the home page. Use these exact snippets — they're the API surface we want people to remember:

```js
// 1) Use the user's model
const session = await window.ai.createTextSession();
const reply   = await session.prompt("Summarize this page");
```

```js
// 2) Run an agent that can call tools the user has approved
for await (const ev of window.agent.run({ task: "find recent press on quantum chips" })) {
  if (ev.type === "tool_call") console.log("→", ev.tool);
  if (ev.type === "final")     console.log(ev.output);
}
```

```js
// 3) A page declares its own tool (W3C WebMCP)
navigator.modelContext.registerTool({
  name:        "search_archive",
  description: "Search our 20-year archive",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
  execute:     ({ query }) => searchArchive(query),
});
```

Render them with proper syntax highlighting. Keep them visually quiet — no faux-terminal chrome, no "copy" buttons that look heavier than the code itself.

## Architecture diagram (be specific)

Make one diagram, in the "How it works" section. Restrained SVG line-art. No gradients. Four boxes stacked vertically with thin connector lines:

```
   web page
      │  window.ai / window.agent
      ▼
   browser (mediates)   ←— user's permissions, per origin
      │
      ▼
   user's model       user's MCP servers (page tools, remote tools)
```

Make it look hand-drawn-but-precise, like a diagram in a paper, not a marketing illustration.

## Footer / nav requirements

- Top nav: *Proposal · Spec · Build · Landscape · GitHub*. Sticky on desktop, collapses on mobile.
- Footer: small. Project name, license, contact emails (`raffi@mozilla.org`, `raffi.krikorian@gmail.com`), GitHub link, and the line *"a sketch by people inside Mozilla. not a Mozilla product."*

## Things to deliberately get right

- **Don't say "Harbor is an AI browser."** It isn't. It's a proposal, an extension, and a spec. The headline must communicate this.
- **Don't position against Firefox.** Firefox is the primary platform. We're allies, not competitors.
- **Don't oversell security.** We have a real, positive security story (scoped APIs vs. free-roaming DOM agents) — but we're a draft proposal, not a finished hardened product. Use words like "by design" and "smaller surface", not "secure" or "safe."
- **Always link to the spec, not just the implementation.** The point is the standard.

## Output

1. **A complete `index.html` (or React component, your choice — but static HTML is preferred for a Jekyll/GitHub Pages site)** for the home page, with all sections, the comparison table, the architecture diagram (as inline SVG), the code snippets, and a tasteful dark-mode toggle.
2. **A single shared CSS file** (or Tailwind config + a small custom layer) defining the type system, color tokens, spacing scale, and component styles. The CSS should be readable — this will live in the repo.
3. **One subpage template** (`landscape.html`) demonstrating how long-form text pages look in the same system, including a sticky right-rail table of contents on desktop.
4. **A short `DESIGN_NOTES.md`** describing the type choices, color tokens, and any deliberate decisions you made. We will use this to iterate.

Output everything in one response if it fits, otherwise split clearly with headings: `=== index.html ===`, `=== styles.css ===`, `=== landscape.html ===`, `=== DESIGN_NOTES.md ===`.

## What to ask before designing (if anything)

If you have to pick between two reasonable directions and the brief doesn't say, just **show both** in side-by-side comments and pick a default. Don't stall on questions. Iteration will happen in Claude Design after the first draft.

---

*The body copy for the home page is in `whitepaper/index.md`. The full landscape essay is in `docs/POSITIONING.md`. The spec lives at `spec/README.md`. Use those as the source of truth — don't write new claims.*
