#!/usr/bin/env bash
# Vydání nové verze s automatickou aktualizací (Linux AppImage + Windows instalátor).
#
#   scripts/release.sh 1.3.0 "Co je nového…"
#     nastaví verzi, commitne a pushne ji na main, na GitHub Actions sestaví Linux (Ubuntu 22.04)
#     i Windows, stáhne je, lokálně podepíše (klíč na GitHub nejde) a zveřejní vydání s latest.json
#
# Jednu platformu znovu sestavit a vyměnit v už zveřejněném vydání (verze musí být pushnutá na main):
#   scripts/release.sh linux 1.3.0
#   scripts/release.sh windows 1.3.0
#
# Proč ne lokálně: AppImage přibalí systémové knihovny a CachyOS (znver4) je má sestavené pro Zen 4
# s AVX-512 – lokálně sestavený AppImage na jiných procesorech padal na SIGILL (Illegal instruction).
#
# Potřebuje: podpisový klíč ~/.tauri/zazijvr.key (nebo proměnnou TAURI_SIGNING_PRIVATE_KEY),
# GitHub CLI (gh) přihlášené k účtu zazijvr.
set -euo pipefail

RELEASES_REPO="zazijvr/Zazij-VR-Email-releases"
CODE_REPO="zazijvr/Zazij-VR-Email"
KEY_FILE="${TAURI_SIGNING_KEY_FILE:-$HOME/.tauri/zazijvr.key}"
cd "$(dirname "$0")/.."

die() { echo "❌ $*" >&2; exit 1; }

load_signing_key() {
  if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
    [ -f "$KEY_FILE" ] || die "Podpisový klíč $KEY_FILE nenalezen."
    export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
  fi
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
}

conf_version() { python3 -c "import json;print(json.load(open('src-tauri/tauri.conf.json'))['version'])"; }

ensure_pushed() {
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "Lokální main není shodný s GitHubem – nejdřív commit a push."
}

# Platforma: linux | windows → workflow, artefakt, název souboru ve vydání, klíč v latest.json
platform_info() {
  local platform="$1" version="$2"
  case "$platform" in
    linux)   WORKFLOW=linux.yml;   ARTIFACT=linux-appimage;    ASSET="ZazijVR-Email_${version}_amd64.AppImage";   PKEY=linux-x86_64;   PATTERN="*.AppImage" ;;
    windows) WORKFLOW=windows.yml; ARTIFACT=windows-installer; ASSET="ZazijVR-Email_${version}_x64-setup.exe";  PKEY=windows-x86_64; PATTERN="*.exe" ;;
    *) die "Neznámá platforma $platform" ;;
  esac
}

# Spustí sestavení na GitHubu a vypíše id běhu (stdout)
start_build() {
  local workflow="$1" before run_id=""
  before=$(gh run list --repo "$CODE_REPO" --workflow "$workflow" --limit 1 --json databaseId --jq '.[0].databaseId // 0')
  gh workflow run "$workflow" --repo "$CODE_REPO" --ref main >/dev/null
  for _ in $(seq 1 30); do
    sleep 4
    run_id=$(gh run list --repo "$CODE_REPO" --workflow "$workflow" --limit 1 --json databaseId --jq '.[0].databaseId // 0')
    [ "$run_id" != "$before" ] && [ "$run_id" != "0" ] && break
  done
  [ -n "$run_id" ] && [ "$run_id" != "$before" ] || die "Sestavení $workflow se nespustilo."
  echo "$run_id"
}

# Počká na sestavení, stáhne ho, přejmenuje a podepíše → $OUT/$ASSET(.sig)
fetch_and_sign() {
  local platform="$1" version="$2" run_id="$3" out="$4"
  platform_info "$platform" "$version"
  echo "⏳ Čekám na sestavení ($platform): https://github.com/$CODE_REPO/actions/runs/$run_id"
  gh run watch "$run_id" --repo "$CODE_REPO" --exit-status --interval 30 >/dev/null ||
    die "Sestavení ($platform) selhalo – log: gh run view $run_id --repo $CODE_REPO --log-failed"
  local tmp="$out/.$platform"
  rm -rf "$tmp" && mkdir -p "$tmp"
  gh run download "$run_id" --repo "$CODE_REPO" -n "$ARTIFACT" -D "$tmp"
  local src
  src=$(ls "$tmp"/$PATTERN | grep -F "_${version}_" | head -n 1) || true
  [ -n "$src" ] || die "Ve staženém sestavení ($platform) chybí verze $version."
  mv "$src" "$out/$ASSET" && rm -rf "$tmp"
  [ "$platform" = linux ] && chmod +x "$out/$ASSET"
  echo "✍️  Podepisuji $ASSET…"
  npx tauri signer sign "$out/$ASSET" >/dev/null
  [ -f "$out/$ASSET.sig" ] || die "Podpis $ASSET se nevytvořil."
}

# Zapíše / doplní platformu do $OUT/latest.json
set_platform() {
  python3 - "$1" "$2" "$3" "$4" "$RELEASES_REPO" <<'PY'
import json, sys, os
out, pkey, asset, v, repo = sys.argv[1:6]
path = f"{out}/latest.json"
data = json.load(open(path, encoding="utf-8"))
if data.get("version") != v:
    sys.exit(f"latest.json patří k verzi {data.get('version')}, ne {v}")
data.setdefault("platforms", {})[pkey] = {
    "signature": open(f"{out}/{asset}.sig", encoding="utf-8").read().strip(),
    "url": f"https://github.com/{repo}/releases/download/v{v}/{asset}",
}
json.dump(data, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
PY
}

command -v gh >/dev/null || die "Chybí GitHub CLI: sudo pacman -S github-cli && gh auth login"

# ───────────── Jedna platforma do už zveřejněného vydání ─────────────
if [ "${1:-}" = "linux" ] || [ "${1:-}" = "windows" ]; then
  PLATFORM="$1"
  VERSION="${2:-}"
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Použití: scripts/release.sh $PLATFORM X.Y.Z"
  load_signing_key
  [ "$(conf_version)" = "$VERSION" ] || die "V tauri.conf.json je verze $(conf_version), ne $VERSION."
  ensure_pushed
  gh release view "v$VERSION" --repo "$RELEASES_REPO" >/dev/null 2>&1 || die "Vydání v$VERSION neexistuje."

  OUT="release/v$VERSION/$PLATFORM"
  rm -rf "$OUT" && mkdir -p "$OUT"
  platform_info "$PLATFORM" "$VERSION"
  echo "☁️  Spouštím sestavení ($PLATFORM) na GitHubu…"
  RUN_ID=$(start_build "$WORKFLOW")
  fetch_and_sign "$PLATFORM" "$VERSION" "$RUN_ID" "$OUT"

  echo "🧩 Doplňuji $PLATFORM do latest.json…"
  gh release download "v$VERSION" --repo "$RELEASES_REPO" -p latest.json -D "$OUT" --clobber
  set_platform "$OUT" "$PKEY" "$ASSET" "$VERSION"

  echo "🚀 Nahrávám k vydání v$VERSION…"
  gh release upload "v$VERSION" --repo "$RELEASES_REPO" --clobber "$OUT/$ASSET" "$OUT/latest.json"
  echo "✅ Hotovo: https://github.com/$RELEASES_REPO/releases/download/v$VERSION/$ASSET"
  exit 0
fi

# ───────────── Nové vydání ─────────────
VERSION="${1:-}"
NOTES="${2:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'Použití: scripts/release.sh X.Y.Z "poznámky k vydání"'
[ -n "$NOTES" ] || die "Chybí poznámky k vydání (co je nového)."
load_signing_key
if gh release view "v$VERSION" --repo "$RELEASES_REPO" >/dev/null 2>&1; then
  die "Vydání v$VERSION už existuje – zvolte vyšší číslo verze."
fi
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "Vydává se z větve main."

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
# Cargo.lock dorovnat na novou verzi (bez sestavování)
(cd src-tauri && cargo update -p zazijvr-email --offline >/dev/null 2>&1 || cargo metadata --format-version 1 >/dev/null)

echo "📤 Commit a push verze $VERSION…"
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git diff --cached --quiet || git commit -q -m "Vydání $VERSION"
git push -q origin main
ensure_pushed

OUT="release/v$VERSION"
rm -rf "$OUT" && mkdir -p "$OUT"
echo "☁️  Spouštím sestavení Linux a Windows na GitHubu…"
LINUX_RUN=$(start_build linux.yml)
WINDOWS_RUN=$(start_build windows.yml)
fetch_and_sign linux "$VERSION" "$LINUX_RUN" "$OUT"
LINUX_ASSET="$ASSET"
fetch_and_sign windows "$VERSION" "$WINDOWS_RUN" "$OUT"
WINDOWS_ASSET="$ASSET"

python3 - "$VERSION" "$NOTES" "$OUT" <<'PY'
import json, sys, datetime
v, notes, out = sys.argv[1:4]
latest = {
    "version": v,
    "notes": notes,
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {},
}
with open(f"{out}/latest.json", "w", encoding="utf-8") as f:
    json.dump(latest, f, indent=2, ensure_ascii=False)
PY
set_platform "$OUT" linux-x86_64 "$LINUX_ASSET" "$VERSION"
set_platform "$OUT" windows-x86_64 "$WINDOWS_ASSET" "$VERSION"

echo "📦 Připraveno v $OUT:"
ls -la "$OUT"

echo "🚀 Zveřejňuji v$VERSION v $RELEASES_REPO…"
gh release create "v$VERSION" \
  --repo "$RELEASES_REPO" \
  --title "ZažijVR Email $VERSION" \
  --notes "$NOTES" \
  --latest \
  "$OUT/$LINUX_ASSET" "$OUT/$WINDOWS_ASSET" "$OUT/latest.json"

echo "✅ Hotovo. Nainstalované aplikace (Linux i Windows) si verzi $VERSION najdou samy."
