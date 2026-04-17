# Podrobný průvodce instalací (ZažijVR Email & Kalendář)

Tento návod vás provede **úplně od nuly** až k plně funkční aplikaci na čistém systému Arch Linux / CachyOS. Nemusíte nic hádat – pokud půjdete krok za krokem, instalace zaručeně proběhne bez chyb.

Aplikace je stavěná velmi moderně (React + Vite uvnitř odlehčeného kontejneru napsaného v jazyce Rust přes framework Tauri). Proto systém před samotným sestavením potřebuje sadu profesionálních vývojářských nástrojů.

---

## 1. Instalace nezbytných prerekvizit (Závislosti)
Než vůbec začneme stahovat náš kód, musíme "vybavit" váš prázdný Linuxový počítač vším potřebným pro kompilaci.

Otevřete terminál a postupně proveďte tyto 3 kroky:

### A) Základní balíčky, Node.js a knihovny pro zobrazení
Zde instalujeme samotné překladače, stahovací programy a grafické knihovny WebKit, aby Tauri mělo přes co vykreslit naši okenní aplikaci.
```bash
sudo pacman -S --needed base-devel git nodejs npm rust cargo curl wget file openssl webkit2gtk libappindicator-gtk3 librsvg
```
*(Po zadání hesla a odentrování jednoduše všechny případné dotazy odklikejte klávesou `Enter` jako výchozí)*

### B) Nástroje z AUR (Yay a Debtap)
Náš systém funguje tak, že Tauri sestaví standardní `.deb` soubor, který následně přeskládáme pro Arch Linux pomocí programu `debtap`.
V CachyOS a EndeavourOS bývá program `yay` už předinstalován. Pokud by náhodou nebyl, doinstalujte ho pomocí `sudo pacman -S yay`. Následně nainstalujte `debtap`:
```bash
yay -S debtap
```

### C) Prvotní inicializace Debtapu
Aby `debtap` uměl správně překládat balíčky, musíme alespoň jednou zrcadlit jeho databázi se serverem. Tento krok je **velmi důležitý** a může trvat pár minut.
```bash
sudo debtap -u
```

---

## 2. Stažení zdrojových kódů (Klonování)
Nyní máme operační systém plně připravený. Jdeme si na pevný disk stáhnout samotnou aplikaci. 
Doporučuji zůstat v domovském adresáři (ve výchozím nastavení terminálu tam už jste, tilda `~`).

```bash
# Stáhneme celý depozitář pod názvem složky vr-email
git clone https://github.com/zazijvr/Zazij-VR-Email.git vr-email

# Vlezeme přímo dovnitř do struktury naší aplikace
cd vr-email/email-client
```

---

## 3. Automatická kompilace a instalace aplikce
A jsme ve finále. Od teď všechnu těžkou práci převezme automatizační skript, který vyřeší všechny závislosti na pozadí, zkompiluje projekt a vloží ho do menu vašeho start panelu.

Stále ze složky `vr-email/email-client` pusťte toto:

```bash
# Dáme systému svolení, aby mohl skript spustit
chmod +x install-cachyos.sh

# Odpálíme skript!
./install-cachyos.sh
```

**Co teď skript dělá?**
1. Stáhne chybějící moduly pro Node (`npm install`).
2. Nastartuje jazyk Rust, který postaví nativní kontejner vaší apky (`npx tauri build...`). Během tohoto procesu bude chvíli svítit *Compiling...* a váš procesor pojede naplno.
3. Promění kontejner přes zprovozněný `debtap` na Arch Linux instanci a okamžitě ji nainstaluje natvrdo do vašeho systému.

🎉 **HOTOVO!**
Po dokončení byste měli najít **ZažijVR Email** normálně vyhledáním v aplikačním menu (startu) vašeho Linuxu i s hezkou ikonkou.

---

## Jak provádět aktualizace v budoucnu?
Otevřeli jsme GitHub, přidali jsme nějaké nové vylepšené funkce a vy na tomto PC chcete nejnovější verzi? Zůstává to absolutně jednoduché:

```bash
# Vlezete do dříve stažené složky
cd ~/vr-email/email-client

# A prostě znovu odpálíte náš inteligentní skript
./install-cachyos.sh
```
Skript už si díky vnitřním mechanismům sám stáhne novinky z cloudu pomocí příkazu `git pull` a zkompiluje a nahradí starou verzi novou. Nikdy tak neklikáte a neřešíte nic navíc!
