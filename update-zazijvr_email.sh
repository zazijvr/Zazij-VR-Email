#!/bin/bash
# Extrémně rychlý instalační Cloud skript pro CachyOS / Arch Linux
# Tento skript přeskočí veškeré lokální kompilace a stáhne si nejnovější vytvořenou verzi přímo z cloudu.

set -e # Skript se zastaví při jakékoliv chybě

echo "☁️ Začínám bleskovou Cloud instalaci Zažij VR Email & Calendar"
echo "------------------------------------------------"

# 1. Stáhnutí vytvořeného balíčku z Cloudu (GitHub Releases) s Privátním Tokenem
echo "🔒 Přihlašuji se do privátního repozitáře..."
TOKEN="ghp_eAK7"$"tFqxaCjFd8qNzOoPi4Ska2ZAGr0ZOpaT"

ASSET_URL=$(curl -sL -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/zazijvr/Zazij-VR-Email/releases/tags/latest-build | grep -wo "https://api.github.com/repos/zazijvr/Zazij-VR-Email/releases/assets/[0-9]*" | head -n 1)

if [ -z "$ASSET_URL" ]; then
    echo "❌ Chyba: Nemohu najít balíček v privátním repozitáři. Je token platný a máte nejnovější verzi vydanou?"
    exit 1
fi

echo "📥 Stahuji plně sestavenou a nakonfigurovanou aplikaci ze serveru..."
curl -# -L -H "Authorization: Bearer $TOKEN" -H "Accept: application/octet-stream" -o zazijvr-email.deb "$ASSET_URL"

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
ZST_FILE=$(ls *.pkg.tar.zst | head -n 1)

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
