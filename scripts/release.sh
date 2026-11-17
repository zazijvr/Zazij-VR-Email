#!/usr/bin/env bash
# Vydání nové verze s automatickou aktualizací (Linux AppImage).
#
#   scripts/release.sh 1.3.0 "Co je nového…"            sestaví, podepíše a zveřejní
#   scripts/release.sh 1.3.0 "Co je nového…" --no-publish   jen sestaví a připraví soubory
#
# Windows instalátor k už zveřejněnému vydání (verze musí být commitnutá a pushnutá na main):
#   scripts/release.sh windows 1.3.0
#   – sestaví ho GitHub Actions na Windows (.github/workflows/windows.yml), skript ho stáhne,
#     lokálně podepíše (klíč na GitHub nejde), nahraje k vydání a doplní Windows do latest.json
#
# Potřebuje: podpisový klíč ~/.tauri/zazijvr.key (nebo proměnnou TAURI_SIGNING_PRIVATE_KEY),
# GitHub CLI (gh) přihlášené k účtu zazijvr a vyplněný .env.
set -euo pipefail

RELEASES_REPO="zazijvr/Zazij-VR-Email-releases"
CODE_REPO="zazijvr/Zazij-VR-Email"
KEY_FILE="${TAURI_SIGNING_KEY_FILE:-$HOME/.tauri/zazijvr.key}"

load_signing_key() {
  if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
    [ -f "$KEY_FILE" ] || { echo "❌ Podpisový klíč $KEY_FILE nenalezen." >&2; exit 1; }
    export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
  fi
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
}

# ───────────── Windows instalátor ─────────────
if [ "${1:-}" = "windows" ]; then
  VERSION="${2:-}"
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Použití: scripts/release.sh windows X.Y.Z" >&2; exit 1; }
  cd "$(dirname "$0")/.."
  command -v gh >/dev/null || { echo "❌ Chybí GitHub CLI." >&2; exit 1; }
  load_signing_key

  CONF_VERSION=$(python3 -c "import json;print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
  [ "$CONF_VERSION" = "$VERSION" ] || { echo "❌ V tauri.conf.json je verze $CONF_VERSION, ne $VERSION." >&2; exit 1; }
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "❌ Lokální main není shodný s GitHubem – nejdřív commit a push." >&2; exit 1; }
  gh release view "v$VERSION" --repo "$RELEASES_REPO" >/dev/null 2>&1 || { echo "❌ Vydání v$VERSION neexistuje – nejdřív scripts/release.sh $VERSION \"…\"." >&2; exit 1; }

  echo "☁️  Spouštím sestavení pro Windows na GitHubu…"
  BEFORE=$(gh run list --repo "$CODE_REPO" --workflow windows.yml --limit 1 --json databaseId --jq '.[0].databaseId // 0')
  gh workflow run windows.yml --repo "$CODE_REPO" --ref main
  RUN_ID=""
  for _ in $(seq 1 30); do
    sleep 4
    RUN_ID=$(gh run list --repo "$CODE_REPO" --workflow windows.yml --limit 1 --json databaseId --jq '.[0].databaseId // 0')
    [ "$RUN_ID" != "$BEFORE" ] && [ "$RUN_ID" != "0" ] && break
  done
  [ -n "$RUN_ID" ] && [ "$RUN_ID" != "$BEFORE" ] || { echo "❌ Sestavení se nespustilo." >&2; exit 1; }
  echo "   https://github.com/$CODE_REPO/actions/runs/$RUN_ID"
  gh run watch "$RUN_ID" --repo "$CODE_REPO" --exit-status --interval 30 >/dev/null || {
    echo "❌ Sestavení na GitHubu selhalo – log: gh run view $RUN_ID --repo $CODE_REPO --log-failed" >&2; exit 1; }

  OUT="release/v$VERSION/windows"
  rm -rf "$OUT" && mkdir -p "$OUT"
  gh run download "$RUN_ID" --repo "$CODE_REPO" -n windows-installer -D "$OUT"
  SRC_EXE=$(ls "$OUT"/*_"$VERSION"_*.exe | head -n 1)
  ASSET="ZazijVR-Email_${VERSION}_x64-setup.exe"
  mv "$SRC_EXE" "$OUT/$ASSET"

  echo "✍️  Podepisuji instalátor pro automatické aktualizace…"
  npx tauri signer sign "$OUT/$ASSET" >/dev/null
  [ -f "$OUT/$ASSET.sig" ] || { echo "❌ Podpis se nevytvořil." >&2; exit 1; }

  echo "🧩 Doplňuji Windows do latest.json…"
  gh release download "v$VERSION" --repo "$RELEASES_REPO" -p latest.json -D "$OUT" --clobber
  python3 - "$OUT" "$ASSET" "$VERSION" "$RELEASES_REPO" <<'PY'
import json, sys
out, asset, v, repo = sys.argv[1:5]
path = f"{out}/latest.json"
data = json.load(open(path, encoding="utf-8"))
if data.get("version") != v:
    sys.exit(f"latest.json patří k verzi {data.get('version')}, ne {v}")
data["platforms"]["windows-x86_64"] = {
    "signature": open(f"{out}/{asset}.sig", encoding="utf-8").read().strip(),
    "url": f"https://github.com/{repo}/releases/download/v{v}/{asset}",
}
json.dump(data, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
PY

  echo "🚀 Nahrávám k vydání v$VERSION…"
  gh release upload "v$VERSION" --repo "$RELEASES_REPO" --clobber "$OUT/$ASSET" "$OUT/latest.json"
  echo "✅ Hotovo: https://github.com/$RELEASES_REPO/releases/download/v$VERSION/$ASSET"
  exit 0
fi

VERSION="${1:-}"
NOTES="${2:-}"
PUBLISH=1
[ "${3:-}" = "--no-publish" ] && PUBLISH=0

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Použití: scripts/release.sh X.Y.Z \"poznámky k vydání\" [--no-publish]" >&2
  exit 1
fi
[ -n "$NOTES" ] || { echo "❌ Chybí poznámky k vydání (co je nového)." >&2; exit 1; }

cd "$(dirname "$0")/.."

load_signing_key
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
