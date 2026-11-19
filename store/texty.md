# ZažijVR E-mail & Kalendář – texty pro Google Play

## Název aplikace (max. 30 znaků)

```
ZažijVR E-mail & Kalendář
```

## Stručný popis (max. 80 znaků)

```
Neonová pošta a kalendář v jednom: Gmail, Seznam i vlastní doména.
```

## Úplný popis (max. 4000 znaků)

```
ZažijVR E-mail & Kalendář spojuje poštu a diář do jedné přehledné aplikace v neonovém stylu Zažij VR. Všechny schránky i schůzky máš po ruce na jednom místě – rychle, přehledně a bez reklam.

📬 VŠECHNY SCHRÁNKY NA JEDNOM MÍSTĚ
• Gmail – bezpečné přihlášení přes Google
• Seznam.cz, vlastní doména a další schránky přes IMAP/SMTP
• Více účtů najednou a rychlé přepínání mezi nimi
• Upozornění na nové e-maily – klepnutím otevřeš správný účet

✉️ PŘEHLEDNÁ POŠTA
• Konverzace seskupené do vláken
• Doručené, Důležité, Odeslané, Rozepsané, Spam, Koš i vlastní složky
• Vyhledávání v e-mailech
• Hvězdičky, označení přečtení, přesun a mazání
• Přílohy – otevřeš je přímo z aplikace

📝 PSANÍ BEZ STAROSTÍ
• Editor s formátováním: tučné písmo, seznamy, odkazy, obrázky, barvy
• Podpisy a šablony pro opakované odpovědi
• Rozepsané zprávy se ukládají
• Našeptávání adres

📅 KALENDÁŘ
• Propojený s Google Kalendářem
• „Co mě čeká?“ – přehled nejbližších událostí den po dni
• Měsíční přehled
• Vytváření a úprava událostí, opakování, připomínky
• České státní svátky

🎨 VYBER SI VZHLED
• ZažijVR – neonový, tmavě modrý
• Světlý – na sluníčko
• Tmavý – klidný grafit
• Sakura – pastelová, s kvetoucí větvičkou
• Vánoční – v prosinci se zasněžený

🔒 SOUKROMÍ NA PRVNÍM MÍSTĚ
Aplikace komunikuje přímo s tvým poskytovatelem pošty (Google, Seznam, tvůj server) – žádný mezičlánek. Přihlašovací údaje zůstávají jen v telefonu. Bez reklam a bez sledování.

Vytvořilo Zažij VR – pojízdná virtuální realita.
```

## Co je nového ve verzi 1.5.7 (max. 500 znaků)

```
• Nová ikona aplikace s neonovou obálkou
• Motivy vzhledu: ZažijVR, Světlý, Tmavý, Sakura a Vánoční
• Klepnutí na upozornění otevře správný účet
• Drobné opravy a vylepšení
```

---

## Grafika (složka `store/`)

| Položka v Play Console     | Soubor                          | Rozměr        |
|----------------------------|---------------------------------|---------------|
| Ikona aplikace             | `icon-512.png`                  | 512 × 512     |
| Hlavní grafika             | `feature-graphic.png`           | 1024 × 500    |
| Snímky obrazovky – telefon | `screenshots/01–08-*.png`       | 1080 × 1920   |

Snímky jsou ze skutečné aplikace s vymyšleným ukázkovým účtem (jana.novakova@example.com),
vymyšlenými e-maily a událostmi – žádná skutečná data. Je jich 8 (maximum v Play Console).

Ikonu a hlavní grafiku lze přegenerovat: `python3 scripts/gen-store-assets.py`

## Bezpečnost dat (formulář „Data safety“) – podklady

Aplikace pracuje s e-maily a kalendářem uživatele, ale **neposílá je vývojáři ani třetím stranám** –
komunikuje jen přímo s poskytovatelem pošty (Google API, IMAP/SMTP server uživatele).

- Shromažďuje data? Play bere za „shromažďování“ jen přenos z telefonu k vývojáři / třetí straně.
  Data jdou jen k poskytovateli služby, kterou si uživatel sám připojil → typicky **Ne**.
  (Pokud si nejsi jistý, je bezpečnější uvést „E-maily“, „Kalendář“ a „E-mailová adresa“
  jako zpracovávané na zařízení, nesdílené.)
- Sdílí data s třetími stranami? **Ne**
- Šifrování při přenosu? **Ano** (HTTPS, IMAP/SMTP přes TLS)
- Lze požádat o smazání dat? Účet se odebere v aplikaci, data zůstávají jen u poskytovatele pošty.

⚠️ Gmail: aplikace používá citlivé Google oprávnění (Gmail API). Pro zveřejnění v Play to Google
nevyžaduje, ale pro **veřejné** přihlašování cizích Google účtů je nutné ověření OAuth aplikace
u Googlu (Google Cloud Console → OAuth consent screen). Do té doby se přihlásí jen testovací uživatelé.
Play Console také vyžaduje odkaz na **zásady ochrany soukromí** (privacy policy).

## Skládací telefony a tablety (`store/screenshots-skladaci/`)

Play Console chce u skládacích zařízení aspoň 1 snímek rozloženého displeje v poměru 1:1 a 4:3
a 1 snímek složeného telefonu na výšku v poměru 10:16:

| Poměr | Soubory | Rozměr |
|-------|---------|--------|
| 1:1 (rozložený) | `1x1-*.png` | 1760 × 1760 |
| 4:3 (rozložený) | `4x3-*.png` | 2048 × 1536 |
| 10:16 (složený, na výšku) | `10x16-*.png` | 1080 × 1728 |
