# Instalační manuál: ZažijVR E-mail & Kalendář (Kiosk Edition)

Tento manuál popisuje kompletní stažení a nasazení před-kompilované aplikace ZažijVR z neveřejného firemního repozitáře pro klientské instalace (CachyOS / Arch Linux).

## Prerekvizity (První instalace)

Aby mohl systém automaticky přežvýkat vydané Debian balíčky (.deb) na nativní Arch linux balíčky, musí na zařízení běžet podpůrný nástroj `debtap`. Pokud se jedná o zcela nový Kiosk PC, ujistěte se, že máte tento nástroj nainstalovaný a aktualizovaný pomocí následujících příkazů:

```bash
# 1. Instalace překladače debtap
yay -S debtap --noconfirm

# 2. Inicializace databáze balíčků (Toto zabere asi minutu, provádí se jen poprvé v životě PC)
sudo debtap -u 
```

## Následná Instalace a Update aplikace

Aplikace sídlí v privátním repozitáři na GitHubu. Ke stažení je potřeba GitHub token pouze pro čtení (fine-grained token, přístup jen k repozitáři `zazijvr/Zazij-VR-Email`, oprávnění *Contents: Read-only*). Token **nikdy nevkládejte do souborů v repozitáři** – předá vám ho správce.

Token se na PC uloží jednou (soubor čte jen přihlášený uživatel):

```bash
mkdir -p ~/.config/zazijvr && (umask 077; read -r -s -p "Token: " T && printf '%s' "$T" > ~/.config/zazijvr/github-token); echo
```

Instalace nebo aktualizace aplikace je pak jediný příkaz do jakékoliv složky:

```bash
curl -sL -H "Authorization: token $(cat ~/.config/zazijvr/github-token)" https://raw.githubusercontent.com/zazijvr/Zazij-VR-Email/main/update-zazijvr_email.sh | bash
```

**Co tento příkaz vytvoří?**
1. Potichu se autentizuje na Githubu.
2. Stáhne si exkluzivní instalační skript `update-zazijvr_email.sh`.
3. Skript sám zkontroluje nejnovější stabilní Release.
4. Následně stáhne .deb aplikaci s předpřipravenými produkčními hesly (OAuth2).
5. Převede aplikaci na interní Arch balíček (.zst) a spustí Pacman instalaci.

## Spuštění Aplikace

Aplikace vygeneruje systémovou zkratku. Po úspěšné bleskové instalaci můžete aplikaci okamžitě začít využívat buď z postranního panelu, případně ji najdete v aplikacích jako **"ZažijVR Email"**.
