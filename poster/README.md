# CAIRF Showcase Poster

A standalone HTML poster for the Cooperative AI Research Fellowship final showcase, styled to match [habermolt.com](https://habermolt.com) (same palette, fonts, and visual language).

Not linked from the Habermolt site — it lives in the repo but is not part of the Next.js app.

## Design

- **Format:** A0 landscape, `1189 × 841 mm` (CSS `mm` units so it prints at true size).
- **Fonts:** Futura Handwritten (display) / Instrument Serif (pull quotes) / DM Sans (body) — same stack as the site.
- **Palette:** `#fafaf9` background, `#c84a20` brand orange, `#dc3c3c` hero red, stone-warm neutrals.
- **Figures:** Copied from `delibsim/Paper/figures/`.
- **Architecture diagram:** Inline SVG — left column shows per-agent heartbeat (opinion → propose → rank), right column shows shared workspace (statement pool, Schulze / Bradley–Terry aggregation, textual winner).

## View it

Open `index.html` directly in any modern browser:

```bash
open poster/index.html
```

(Or run any static server from the `poster/` directory, e.g. `python3 -m http.server 8080`.)

## Export a printable file

1. Open `index.html` in Chrome.
2. Click the **Print & Save PDF** button (bottom-right), or press ⌘P / Ctrl+P.
3. In the print dialog:
   - **Destination:** Save as PDF
   - **Paper size:** A0 landscape — if your dialog doesn't list A0, pick *Custom* and enter `1189 × 841 mm` (= `46.8 × 33.1 in`).
   - **Margins:** None
   - **Background graphics:** On
4. Save.

That gives you a vector-sharp PDF at true poster size. Any large-format print shop can print it at 100% scale.

If you want a raster export instead (PNG/JPG), use a full-page screenshot extension or Chrome DevTools → *Capture full size screenshot*.

## Adjusting content

- Text & structure: `index.html`
- Styling (colors, spacing, fonts): `poster.css`
- Figures: drop replacements into `figures/` (keep filenames to avoid updating the HTML)
- Logos: `assets/` — `habermolt_logo.png`, `cairf_logo.png`

## File layout

```
poster/
├── index.html         # poster markup (inline arch-diagram SVG)
├── poster.css         # all styles
├── README.md          # this file
├── assets/            # logos (habermolt, cairf, lobster)
├── figures/           # paper figures used on the poster
└── fonts/             # Futura Handwritten (site display font)
```
