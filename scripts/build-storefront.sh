#!/usr/bin/env bash
set -euo pipefail
export CARGO_NET_GIT_FETCH_WITH_CLI=true

# Build the product-owned Keel checkout/recovery pages beside the existing
# VitePress documentation. The central checkout is not used by these pages.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

KEEL_REV="${KEEL_REV:-98674c1416cb5a419d1f6d4553d08b3d721e27c3}"
CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
CARGO_BIN="${CARGO_BIN:-cargo}"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/gpdt-keel-target-${KEEL_REV:0:12}}"
CARGO_BUILD_BUILD_DIR="${CARGO_BUILD_BUILD_DIR:-$CARGO_TARGET_DIR}"
export CARGO_TARGET_DIR CARGO_BUILD_BUILD_DIR
DIST="${STOREFRONT_DIST:-_site}"
PREBUILT="docs/storefront/prebuilt"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/gpdt-storefront.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT

# Public pull-request runners must not receive private Keel source or a source
# credential. They verify and compose the committed public engine output. A
# maintainer's local build regenerates that output from the exact pinned Keel.
USE_PREBUILT="${STOREFRONT_USE_PREBUILT:-}"
if [ -z "$USE_PREBUILT" ]; then
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then USE_PREBUILT=1; else USE_PREBUILT=0; fi
fi
if [ "$USE_PREBUILT" != "1" ]; then
  if [ "${STOREFRONT_SKIP_KEEL_INSTALL:-0}" != "1" ]; then
    "$CARGO_BIN" install --locked --git https://github.com/SylphxAI/keel --rev "$KEEL_REV" sylphx-keel-cli --bin keel
  fi
  export PATH="$CARGO_HOME/bin:$PATH"
  keel docs build docs/storefront --out "$OUT/out"
  rm -rf "$PREBUILT"
  mkdir -p "$PREBUILT"
  cp "$OUT/out/pricing.html" "$PREBUILT/pricing.html"
  cp "$OUT/out/recover.html" "$PREBUILT/recover.html"
  cp -R "$OUT/out/_docs" "$PREBUILT/"
  cp -R "$OUT/out/_keel" "$PREBUILT/"
  python3 scripts/storefront_artifact.py write "$ROOT" "$KEEL_REV"
fi
python3 scripts/storefront_artifact.py verify "$ROOT" "$KEEL_REV"

# VitePress owns the rest of dist. Copy only the Keel pages and their runtime,
# never its root index or other generated site metadata.
mkdir -p "$DIST"
cp "$PREBUILT/pricing.html" "$DIST/pricing.html"
cp "$PREBUILT/recover.html" "$DIST/recover.html"
rm -rf "$DIST/_docs" "$DIST/_keel"
cp -R "$PREBUILT/_docs" "$DIST/"
cp -R "$PREBUILT/_keel" "$DIST/"

# The product's Pro activation handoff (site/activate.js) runs on the two
# checkout pages only. The engine output has exactly one </body>; anything
# else fails the build rather than shipping pages without the handoff.
python3 - "$DIST/pricing.html" "$DIST/recover.html" <<'PY'
import sys
tag = '<script src="/Google-Photos-Delete-Tool/activate.js" defer></script>'
for path in sys.argv[1:]:
    with open(path, encoding='utf-8') as f:
        html = f.read()
    if html.count('</body>') != 1 or 'activate.js' in html:
        sys.exit(f'{path}: expected one </body> and no activation script')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(html.replace('</body>', tag + '</body>'))
PY

test -s "$DIST/pricing.html"
test -s "$DIST/recover.html"
test -s "$DIST/activate.js"
grep -q 'src="/Google-Photos-Delete-Tool/activate.js"' "$DIST/pricing.html"
grep -q 'src="/Google-Photos-Delete-Tool/activate.js"' "$DIST/recover.html"
grep -q 'data-keel-money-checkout' "$DIST/pricing.html"
grep -q 'data-keel-money-form="checkout"' "$DIST/pricing.html"
grep -q 'data-keel-money-form="recover"' "$DIST/recover.html"
grep -q 'src="/Google-Photos-Delete-Tool/_keel/' "$DIST/pricing.html"
grep -q 'href="/Google-Photos-Delete-Tool/_docs/' "$DIST/pricing.html"
! grep -q 'buy.sylphx.com' "$DIST/pricing.html"
! grep -q 'buy.sylphx.com' "$DIST/recover.html"

printf 'Keel storefront pages copied into %s (prebuilt=%s)\n' "$DIST" "$USE_PREBUILT"
