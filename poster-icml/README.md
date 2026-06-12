# ICML 2026 Poster (v2)

Version 2 of the Habermolt poster, for ICML 2026. Same method as the CAIRF showcase poster in
`poster/` (HTML + CSS, exported via Chrome headless), redesigned around the final paper and the
ICML poster rules.

## Format

24in (W) × 36in (H) **portrait** — the ICML workshop poster spec
("must not exceed 36in (H) x 24in (W)", "must be in portrait format").
Note: ICML *main conference* posters are landscape (36in H × 48–72in W); if this ends up being
a main-track poster the layout needs reflowing, not just resizing.

## Structure

1. **Header** — title, full author list + affiliations, QR to the live platform.
2. **Hook band** (deep brand orange, semibold white sans for readability) — the
   gradual-disempowerment framing: as AI systems act on our behalf, human influence over
   collective decisions needs a machine-speed channel that remains inspectable and correctable.
   AI-delegated deliberation is that channel; we deployed it publicly and probed where
   faithfulness fails.
3. **01 · The platform** — architecture figure (paper Fig. 2), the 8-panel cycle comic
   (paper page 1), three dimension pillars (representation / aggregation / revision), and a
   condensed version of the paper's Table 2 design-space comparison (citizen assembly, Pol.is,
   Habermas Machine, generative simulacra, Habermolt).
4. **02 · The evidence** — one finding per dimension, each with a pull-stat:
   - **36/54** — autonomous opinions collapse toward the model's prior (Table 1 rendered as an
     inline-SVG dot plot with ± s.d. error bars, plus the identical-opening-phrase example).
   - **10** — representativeness–actionability frontier (paper Fig. 6 + frontier-anchor
     mini-table from Table 3).
   - **>90%** — the correction loop goes unused (paper Fig. 7, the 8-of-91 stat, the
     critique-pattern taxonomy from Appendix C).
   Each finding closes with a "Design lever" card from the paper's design-space discussion.
5. **03 · The stakes** — the impact-statement argument (misrepresentation creates the
   appearance of participation; memory is the central design primitive) + design agenda chips.

## Design

- **Type:** DM Sans (display + body), Instrument Serif (hook statement, stakes, pillar
  questions). Futura Handwritten appears only in the footer URL — the v1 handwritten-heavy
  look read too playful for ICML.
- **Palette:** habermolt.com tokens — `#c84a20` brand orange (hook band, accents),
  stone-warm neutrals. Dimensions colour-coded blue / orange / violet, matching the paper's
  Figure 2 panels.
- **Figures:** extracted directly from the final paper PDF (`pdfimages`), since the copies in
  `delibsim/Paper/` predate the last experiment round.

## View / export

```bash
open poster-icml/index.html      # preview in browser
./poster-icml/export-pdf.sh      # regenerate poster.pdf (Chrome headless)
```

Or print from Chrome: paper size Custom `24 × 36 in`, margins None, background graphics ON.
The exported `poster.pdf` is exactly 1728 × 2592 pt (24 × 36 in) — any large-format print shop
can print it at 100% scale.

## File layout

```
poster-icml/
├── index.html         # poster markup
├── poster.css         # all styles
├── export-pdf.sh      # Chrome-headless PDF export
├── poster.pdf         # latest export
├── assets/            # logo, QR, lobster
├── figures/           # figures extracted from the final paper PDF
└── fonts/             # Futura Handwritten
```
