#!/bin/bash
# Automatický instalační skript pro CachyOS / Arch Linux
# Zkompiluje projekt ze zdrojových kódů (Git -> Main) a nainstaluje ho přes debtap a pacman.

set -e # Skript se zastaví při jakékoliv chybě

echo "🚀 Začínám instalaci Zažij VR Email & Calendar"
echo "------------------------------------------------"

# 1. Stáhnutí nejnovějších změn z gitu (pokud jsme v git repozitáři)
if [ -d ".git" ]; then
    echo "📦 Stahuji nejnovější verze z větve main..."
    git checkout main
    git pull origin main
else
    echo "⚠️ Pozor: Nejsme v git repozitáři, použijí se aktuální soubory."
fi

# 2. Kontrola a příprava debtapu
if ! command -v debtap &> /dev/null; then
    echo "❌ Nástroj 'debtap' není nainstalován. Nainstalujte jej přes AUR: yay -S debtap"
    exit 1
fi

echo "🔄 Aktualizuji databázi debtapu (pokud je potřeba)..."
sudo debtap -u

# 3. Instalace node závislostí
echo "📦 Instaluji NPM závislosti..."
npm install

# 4. Sestavení aplikace v Tauri (Debian balíček jako základ)
echo "🔨 Kompiluji produkční verzi aplikace přes Tauri..."
export WEBKIT_DISABLE_DMABUF_RENDERER=1
npx tauri build --bundles deb

# Odstraníme staré balíčky, ať se neinstaluje zastaralá verze
echo "🧹 Čistím staré balíčky ze složky..."
rm -f *.zst
rm -f zazijvr-email.deb

# 5. Převedení na Arch Linux balíček (.zst)
DEB_FILE=$(find src-tauri/target/release/bundle/deb -name "*.deb" | head -n 1)

if [ -z "$DEB_FILE" ]; then
    echo "❌ Chyba: Generování .deb balíčku selhalo."
    exit 1
fi

echo "🔄 Kopíruji čerstvý .deb balíček..."
cp "$DEB_FILE" zazijvr-email.deb

echo "⚙️  Převádím balíček pro Arch Linux (debtap)..."
# -q přeskočí dotazy na editaci souborů
debtap -q zazijvr-email.deb

# 6. Instalace do systému
ZST_FILE=$(ls *.pkg.tar.zst | head -n 1)

if [ -z "$ZST_FILE" ]; then
    echo "❌ Chyba: Generování .zst balíčku přes debtap selhalo."
    exit 1
fi

echo "🚀 Spouštím instalaci přes Pacman (vynucené přeskočení špatně přeložených závislostí)..."
sudo pacman -Udd "$ZST_FILE" --noconfirm

echo "✅ HOTOVO! Aplikace je plně nainstalována do vašeho systému."
echo "👉 Můžete ji nyní najít ve start menu pod názvem 'ZažijVR Email' nebo 'Zažij VR Email'."
