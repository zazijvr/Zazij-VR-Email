#!/bin/bash
# Extrémně rychlý instalační Cloud skript pro CachyOS / Arch Linux
# Tento skript přeskočí veškeré lokální kompilace a stáhne si nejnovější vytvořenou verzi přímo z cloudu.

set -e # Skript se zastaví při jakékoliv chybě

echo "☁️ Začínám bleskovou Cloud instalaci Zažij VR Email & Calendar"
echo "------------------------------------------------"

# 1. Stáhnutí vytvořeného balíčku z Cloudu (GitHub Releases) s Privátním Tokenem
echo "🔒 Přihlašuji se do privátního repozitáře..."
# Token se do skriptu nepíše – načte se z proměnné ZAZIJVR_GITHUB_TOKEN
# nebo ze souboru ~/.config/zazijvr/github-token (stačí uložit jednou)
TOKEN_FILE="$HOME/.config/zazijvr/github-token"
TOKEN="${ZAZIJVR_GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "$TOKEN_FILE" ]; then
    TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
fi
if [ -z "$TOKEN" ]; then
    read -r -s -p "🔑 Zadejte GitHub token pro stažení aplikace: " TOKEN < /dev/tty
    echo
    if [ -n "$TOKEN" ]; then
        mkdir -p "$(dirname "$TOKEN_FILE")"
        ( umask 077; printf '%s' "$TOKEN" > "$TOKEN_FILE" )
        echo "💾 Token uložen do $TOKEN_FILE (příště se už nebude ptát)"
    fi
fi
if [ -z "$TOKEN" ]; then
    echo "❌ Chybí GitHub token."
    exit 1
fi

# Získáme ID konkrétně .deb souboru (ne APK nebo .exe)
ASSET_ID=$(curl -sL -H "Authorization: Bearer $TOKEN" \
    "https://api.github.com/repos/zazijvr/Zazij-VR-Email/releases/tags/latest-build" \
    | python3 -c "
import json, sys
data = json.load(sys.stdin)
for asset in data.get('assets', []):
    if asset['name'].endswith('.deb'):
        print(asset['id'])
        break
")

if [ -z "$ASSET_ID" ]; then
    echo "❌ Chyba: Nemohu najít .deb balíček v privátním repozitáři. Je token platný a byl dokončen Linux build?"
    exit 1
fi

ASSET_URL="https://api.github.com/repos/zazijvr/Zazij-VR-Email/releases/assets/${ASSET_ID}"

echo "📥 Stahuji plně sestavenou a nakonfigurovanou aplikaci ze serveru..."
curl -# -L \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/octet-stream" \
    -o zazijvr-email.deb \
    "$ASSET_URL"

# Ověřit že je to opravdu deb soubor
if ! file zazijvr-email.deb | grep -q "Debian binary package"; then
    echo "❌ Stažený soubor není platný .deb balíček. Zkuste to znovu."
    rm -f zazijvr-email.deb
    exit 1
fi

# 2. Kontrola debtapu
if ! command -v debtap &> /dev/null; then
    echo "❌ Nástroj 'debtap' není nainstalován. Nainstalujte jej přes komunitu: yay -S debtap"
    exit 1
fi

# 3. Převod na CachyOS package
echo "⚙️ Přebaluji Debianí kontejner do Arch formátu (tohle zabere cca 20 sekund)..."
rm -f *.zst
debtap -q zazijvr-email.deb

# 4. Samotná instalace
ZST_FILE=$(ls *.pkg.tar.zst 2>/dev/null | head -n 1)

if [ -z "$ZST_FILE" ]; then
    echo "❌ Chyba: Převod balíčku přes debtap selhal."
    exit 1
fi

echo "🚀 Spouštím nativní instalaci přes Pacman..."
sudo pacman -Udd "$ZST_FILE" --noconfirm

# Úklid
rm -f zazijvr-email.deb
rm -f *.zst

echo "✅ HOTOVO! Aplikace byla úspěšně stažena z Cloudu a nainstalována."
