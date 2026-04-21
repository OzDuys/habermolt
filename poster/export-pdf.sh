#!/usr/bin/env bash
# ============================================================
# Export the poster to poster.pdf using Chrome headless.
# Runs from anywhere — cd into poster/ before invoking Chrome
# because it expects paths relative to index.html.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OUT="$SCRIPT_DIR/poster.pdf"
HTML="file://$SCRIPT_DIR/index.html"

# Find Chrome / Chromium / Edge in that order
CHROME=""
for cand in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)" \
  "$(command -v chromium-browser || true)"; do
  if [[ -n "$cand" && -x "$cand" ]]; then
    CHROME="$cand"
    break
  fi
done

if [[ -z "$CHROME" ]]; then
  echo "ERROR: Chrome / Chromium not found. Install Chrome or set CHROME=<path>." >&2
  exit 1
fi

echo "→ Rendering $HTML"
echo "→ Using $CHROME"
echo "→ Writing $OUT"

# --no-pdf-header-footer: no "about:blank" header
# --print-to-pdf-no-header: alias on newer versions
# Chrome honours the @page size in CSS (we set 1189mm × 841mm), so no --paper-size flag needed.
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-sandbox \
  --hide-scrollbars \
  --virtual-time-budget=8000 \
  --no-pdf-header-footer \
  --print-to-pdf-no-header \
  --print-to-pdf="$OUT" \
  "$HTML" 2>&1 | grep -v -E '^\[|DevTools|GPU|WebGL|Gpu' || true

if [[ -f "$OUT" ]]; then
  SIZE=$(du -h "$OUT" | cut -f1)
  echo "✓ Saved $OUT ($SIZE)"
else
  echo "ERROR: $OUT was not created." >&2
  exit 1
fi
