# ZažijVR - Email & Calendar (Kiosk)

Tento repozitář obsahuje zdrojové kódy pro e-mailový a kalendářový klient pro potřeby Zažij VR. Aplikace běží na nativní vrstvě **Tauri (v2)** nad React/Vite frontendem s neonovým cyberpunkovým "Glassmorphism" vizuálem.

## Jak instalovat a aktualizovat na CachyOS (Arch Linux)

Všechny kroky jsou plně zautomatizovány ve skriptu. Kdykoliv provedete změny na gitu v produkční `main` větvi, na požadovaném linuxovém stroji stačí udělat toto z terminálu:

```bash
# 1. Přejděte do složky repozitáře (pokud už tam nejste)
cd ".../Email & Calendar/email-client"

# 2. Spusťte instalační skript
./install-cachyos.sh
```

**Co skript udělá?**
1. Automaticky detekuje repozitář a stáhne nejnovější verze pomocí `git pull origin main`.
2. S aktualizovaným kódem zkompiluje přes Tauri a Node.js čerstvý `.deb` balíček.
3. Pomocí nástroje `debtap` jej tiše převede do podoby `.pkg.tar.zst`, kterému rozumí správce balíčků Arch Linuxu (`pacman`).
4. Bez ptaní natvrdo zaktualizuje rovnou vaši starší instalaci novou verzí i v systému s obejitím falešných chyb na závislostech (`sudo pacman -Udd`).

### Úpravy a Dev větev
Pro úpravy a nové integrace (jako Microsoft Outlook / Graph API) se primárně používejte větev `dev`:
`git checkout dev`
Před samotnou instalací na "produkční CachyOS stroj" pak stačí do `main` zavolat merge nebo Pull Request z `dev`. 

## Technický stack
- **Frontend:** React + Vite, Tailwind CSS + Custom CSS mikro animace
- **Bezpečnost:** DOMPurify pro sanitisaci příchozích HTML cizích těles
- **Rozhraní:** Nativní Wayland / KWin decorace přes nastavení `decorations: true` v `tauri.conf.json`
