# Instalační manuál: ZažijVR E-mail & Kalendář

## Linux (CachyOS / Arch i ostatní)

Aplikace se instaluje jako **AppImage** do domovské složky – bez `sudo` a bez `debtap`.
Nové verze si pak **stahuje a instaluje sama** (Nastavení → Verze aplikace, nebo nabídka po spuštění).
Každá aktualizace je podepsaná, aplikace nainstaluje jen balíček s platným podpisem.

Instalace nebo přeinstalace jedním příkazem (stáhne poslední verzi z veřejného repozitáře s vydáními):

```bash
curl -fsSL https://raw.githubusercontent.com/zazijvr/Zazij-VR-Email-releases/main/install-appimage.sh | bash
```

Případně z klonu projektu: `scripts/install-appimage.sh` (nebo `scripts/install-appimage.sh soubor.AppImage`).

Aplikace se uloží do `~/Applications/ZazijVR-Email.AppImage` a objeví se v nabídce jako **„ZažijVR Email“**.

Přechod ze staré verze (balíček přes pacman): `sudo pacman -R zažij-vr-email`.

## Vydání nové verze (správce)

```bash
scripts/release.sh 1.4.0 "Co je nového…"
```

Skript nastaví číslo verze, sestaví a podepíše AppImage (klíč `~/.tauri/zazijvr.key`),
vytvoří `latest.json` a zveřejní vydání v `zazijvr/Zazij-VR-Email-releases`.
Potřebuje přihlášené GitHub CLI (`gh auth login`). Podpisový klíč **nikdy nedávejte do gitu**
a mějte ho zálohovaný – bez něj už nainstalované aplikace žádnou další aktualizaci nepřijmou.
