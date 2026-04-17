#!/bin/bash
# Extrémně rychlý instalační Cloud skript pro CachyOS / Arch Linux
# Tento skript přeskočí veškeré lokální kompilace a stáhne si nejnovější vytvořenou verzi přímo z cloudu.

set -e # Skript se zastaví při jakékoliv chybě

echo "☁️ Začínám bleskovou Cloud instalaci Zažij VR Email & Calendar"
echo "------------------------------------------------"

# 1. Stáhnutí vytvořeného balíčku z Cloudu (GitHub Releases)
echo "📥 Stahuji plně sestavenou a nakonfigurovanou aplikaci ze serveru..."
wget -q --show-progress -O zazijvr-email.deb https://github.com/zazijvr/Zazij-VR-Email/releases/download/latest-build/zazijvr-email-latest.deb

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
