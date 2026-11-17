#!/usr/bin/env bash
# Vydání nové verze s automatickou aktualizací (Linux AppImage).
#
#   scripts/release.sh 1.3.0 "Co je nového…"            sestaví, podepíše a zveřejní
#   scripts/release.sh 1.3.0 "Co je nového…" --no-publish   jen sestaví a připraví soubory
#
# Potřebuje: podpisový klíč ~/.tauri/zazijvr.key (nebo proměnnou TAURI_SIGNING_PRIVATE_KEY),
# GitHub CLI (gh) přihlášené k účtu zazijvr a vyplněný .env.
set -euo pipefail

VERSION="${1:-}"
NOTES="${2:-}"
PUBLISH=1
[ "${3:-}" = "--no-publish" ] && PUBLISH=0

RELEASES_REPO="zazijvr/Zazij-VR-Email-releases"
KEY_FILE="${TAURI_SIGNING_KEY_FILE:-$HOME/.tauri/zazijvr.key}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Použití: scripts/release.sh X.Y.Z \"poznámky k vydání\" [--no-publish]" >&2
  exit 1
fi
[ -n "$NOTES" ] || { echo "❌ Chybí poznámky k vydání (co je nového)." >&2; exit 1; }

cd "$(dirname "$0")/.."

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  [ -f "$KEY_FILE" ] || { echo "❌ Podpisový klíč $KEY_FILE nenalezen." >&2; exit 1; }
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
fi
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
# strip z linuxdeploy nezná novější knihovny (.relr.dyn) v Archu/CachyOS – ořezávání vypnout
export NO_STRIP=true

if [ "$PUBLISH" = 1 ]; then
  command -v gh >/dev/null || { echo "❌ Chybí GitHub CLI: sudo pacman -S github-cli && gh auth login" >&2; exit 1; }
  if gh release view "v$VERSION" --repo "$RELEASES_REPO" >/dev/null 2>&1; then
    echo "❌ Vydání v$VERSION už existuje – zvolte vyšší číslo verze." >&2; exit 1
  fi
fi

echo "🔢 Nastavuji verzi $VERSION"
python3 - "$VERSION" <<'PY'
import json, re, sys
v = sys.argv[1]
for path in ("package.json", "src-tauri/tauri.conf.json"):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = v
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
path = "src-tauri/Cargo.toml"
s = open(path, encoding="utf-8").read()
s = re.sub(r'(\[package\][^\[]*?\nversion\s*=\s*")[^"]*(")', lambda m: m.group(1) + v + m.group(2), s, count=1)
open(path, "w", encoding="utf-8").write(s)
PY

echo "🛠️  Sestavuji podepsaný AppImage…"
npx tauri build --bundles appimage

BUNDLE_DIR="src-tauri/target/release/bundle/appimage"
SRC_APPIMAGE=$(ls -t "$BUNDLE_DIR"/*_"$VERSION"_*.AppImage | head -n 1)
[ -f "$SRC_APPIMAGE.sig" ] || { echo "❌ Chybí podpis $SRC_APPIMAGE.sig" >&2; exit 1; }

OUT="release/v$VERSION"
rm -rf "$OUT" && mkdir -p "$OUT"
ASSET="ZazijVR-Email_${VERSION}_amd64.AppImage"
cp "$SRC_APPIMAGE" "$OUT/$ASSET"
cp "$SRC_APPIMAGE.sig" "$OUT/$ASSET.sig"
chmod +x "$OUT/$ASSET"

python3 - "$VERSION" "$NOTES" "$OUT" "$ASSET" "$RELEASES_REPO" <<'PY'
import json, sys, datetime
v, notes, out, asset, repo = sys.argv[1:6]
sig = open(f"{out}/{asset}.sig", encoding="utf-8").read().strip()
latest = {
    "version": v,
    "notes": notes,
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {
        "linux-x86_64": {
            "signature": sig,
            "url": f"https://github.com/{repo}/releases/download/v{v}/{asset}",
        }
    },
}
with open(f"{out}/latest.json", "w", encoding="utf-8") as f:
    json.dump(latest, f, indent=2, ensure_ascii=False)
PY

echo "📦 Připraveno v $OUT:"
ls -la "$OUT"

if [ "$PUBLISH" = 0 ]; then
  echo "ℹ️  Nezveřejněno (--no-publish)."
  exit 0
fi

echo "🚀 Zveřejňuji v$VERSION v $RELEASES_REPO…"
gh release create "v$VERSION" \
  --repo "$RELEASES_REPO" \
  --title "ZažijVR Email $VERSION" \
  --notes "$NOTES" \
  --latest \
  "$OUT/$ASSET" "$OUT/latest.json"

echo "✅ Hotovo. Nainstalované aplikace si verzi $VERSION najdou samy."
