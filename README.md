# Bazos watcher

Sleduje libovolný počet vypisů na Bazos.cz (i s více stránkami), ukladá si
nalezené inzeráty do lokální JSON databáze (zvlášť pro každou URL) a při
dalším běhu porovnává staré a nové stavy. Pokud se objeví nová nabídka nebo
nabídka zlevní, pošle jeden souhrnný e-mailový report přes SMTP.

Scraper ignoruje `robots.txt` (axios/cheerio ho nijak nevynucují) — jen mezi
requesty (další stránka výpisu, detail inzerátu, další sledovaná URL) čeká
`REQUEST_DELAY_MS`, aby zbytečně nezatěžoval server.

## Jak to funguje

1. Načte seznam sledovaných URL z `data/urls.json`.
2. Pro každou URL stáhne stránku 1, 2, 3... (`.../20/`, `.../40/`, ... nebo `?crz=20`, `?crz=40`, ... podle typu stránky — viz [Stránkování](#stránkování)) a cheeriem projde všechny `.inzeraty.inzeratyflex`.
3. Z `h2.nadpis a` vezme titulek a odkaz (relativní i absolutní), z odkazu (`/inzerat/<ID>/...`) vyparsuje ID inzerátu.
4. Z `.inzeratycena b span` vezme cenu.
5. Pokud je inzerát nový (ID v databázi pro danou URL není), stáhne i popis z detailu (`div.popisdetail`) a uloží ho.
6. Pokud inzerát existuje a nová cena je nižší než uložená, označí ho jako slevu.
7. Vše vypíše do konzole a nové/zlevněné položky napříč všemi URL pošle v jednom e-mailu, seskupené podle URL/labelu (pokud je nastavené SMTP).
8. Aktualizovaná databáze dané URL se uloží zpět do `data/db/<hash>.json`.

## Instalace

```bash
npm install
cp .env.example .env
```

Uprav `data/urls.json` — seznam URL, které chceš sledovat (viz [Více URL](#více-url)).

Uprav `.env`:

- `CRON_SCHEDULE` — jak často se má scraper spouštět, když běží jako démon (node-cron syntax, např. `*/15 * * * *` = každých 15 minut).
- `MAX_PAGES` — pojistka, kolik stránek výpisu se maximálně projde na jednu URL (výchozí 50).
- `SMTP_*` — přístup k tvému SMTP (Gmail apod.). `SMTP_TO` je výchozí příjemce pro URL, které v `urls.json` nemají vlastní `email_to`.

### Gmail SMTP

Gmail nepovolí přihlášení běžným heslem přes SMTP. Je potřeba:

1. Zapnout dvoufázové ověření na Google účtu.
2. Vygenerovat **App Password** (Google účet → Zabezpečení → Ověření ve dvou krocích → Hesla aplikací).
3. Do `SMTP_USER` dát celou e-mailovou adresu, do `SMTP_PASS` vygenerované 16znakové heslo.
4. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`.

## Spuštění

Jednorázový běh (dobré na test):

```bash
npm run run-once
```

Běh na pozadí jako "cron" démon (spustí se hned a pak podle `CRON_SCHEDULE`):

```bash
npm start
```

### Nasazení na server na pozadí

Doporučeno přes [pm2](https://pm2.keymetrics.io/), aby proces přežil odhlášení ze SSH a restartoval se po pádu/restartu serveru:

```bash
npm install -g pm2
pm2 start src/index.js --name bazos-watcher
pm2 logs bazos-watcher      # sledovani konzole (nove/zlevnene nabidky)
pm2 save
pm2 startup                 # nastavi automaticky start po rebootu serveru (spusti se prikaz, ktery ti pm2 vypise)
```

**Alternativa přes systémový crontab** (místo `npm start` s vestavěným node-cronem): pokud chceš, aby o plánování staral systémový cron a script se pokaždé spustil a skončil, použij:

```cron
*/15 * * * * cd /cesta/k/cron-scraper && /usr/bin/node src/scraper.js >> /var/log/bazos-watcher.log 2>&1
```

V tomhle případě `src/index.js` (s node-cronem) nepoužívej — stačí `src/scraper.js`.

## Více URL

Sledované vypisy se nastavují v `data/urls.json` — JSON pole, kde každá
položka je buď holý string s URL, nebo objekt s `url`, volitelným `label` a
volitelným `email_to`:

```json
[
  {
    "url": "https://www.bazos.cz/search.php?hledat=apple+studio+display&rubriky=www&hlokalita=&humkreis=25&cenaod=&cenado=&Submit=Hledat&order=&kitx=ano",
    "label": "Apple Studio Display",
    "email_to": ["muj@email.cz"]
  },
  {
    "url": "https://pc.bazos.cz/monitor/?hledat=benq&hlokalita=&humkreis=25&cenaod=&cenado=&order=",
    "label": "BenQ monitory",
    "email_to": ["muj@email.cz", "kamarad@email.cz"]
  }
]
```

- `label` — jen pro přehlednost v konzoli/emailu; když ho nedáš, dopočítá se automaticky z hostname a parametru `hledat`.
- `email_to` — pole emailových adres, kterým se mají posílat reporty (nové/zlevněné nabídky) **jen pro tuhle URL**. Report na danou URL se vždy pošle úplně všem, kdo je tam uvedený. Když `email_to` u položky nedáš vůbec, použije se výchozí `SMTP_TO` z `.env`. Když tam dáš prázdné pole `[]`, pro tuhle URL se neodešle žádný email (jen se to zapíše do konzole a databáze).
- Prostý string místo objektu (jen URL) funguje taky — chová se jako `{"url": "..."}` bez labelu a s výchozím `email_to` ze `SMTP_TO`.

Klidně přidej další URL do pole — scraper je projde postupně (s prodlevou
`REQUEST_DELAY_MS` mezi nimi), každou s vlastní databází a vlastním
stránkováním. Jeden a tentýž email adresát, který je uvedený u víc URL,
dostane jeden souhrnný email se všemi svými nabídkami (ne email za každou URL
zvlášť); email s nabídkami rozdělenými podle URL/labelu dostane vždy jen ten,
kdo je u dané URL v `email_to` uvedený.

Pokud `data/urls.json` neexistuje, scraper ho při prvním spuštění založí — buď
s jedinou URL ze `SEARCH_URL` v `.env` (pokud je nastavená), nebo prázdný (a
pak skončí s chybou, dokud tam nějakou URL nepřidáš).

## Stránkování

Bazos stránkuje dvěma způsoby a scraper si sám podle tvaru URL vybere ten
správný:

- **Kategorie/podskupiny** (např. `pc.bazos.cz/monitor/...`) — offset se vkládá
  do cesty: `/monitor/` (strana 1), `/monitor/20/` (strana 2), `/monitor/40/`
  (strana 3) atd.
- **Obecné hledání** (`www.bazos.cz/search.php?...`) — offset jde přes query
  parametr `&crz=20`, `&crz=40` atd.

Scraper stahuje stránky jednu po druhé (`PAGE_SIZE` inzerátů na stránku, výchozí 20) a končí, jakmile nastane jedna ze dvou situací:

1. Stránka vrátí 0 inzerátů (typicky "Stránka nenalezena" za koncem výsledků), nebo
2. Stránka vrátí naprosto stejnou sadu ID inzerátů jako ta předchozí (nekdy Bazos místo konce výsledků zopakuje poslední platnou stránku) — v tomhle případě se data z ní znovu nezpracovávají.

`MAX_PAGES` je jen bezpečnostní pojistka proti nekonečné smyčce, kdyby se
chování webu změnilo.

## Databáze

Lokální stav se ukládá do `data/db/` — každá sledovaná URL má vlastní soubor
`<hash>.json`, kde `<hash>` je prvních 12 znaků SHA-1 hashe té URL (`DB_DIR`
jde změnit v `.env`). Když URL v `urls.json` upravíš (i jen o jeden znak),
vygeneruje se pro ni nový hash, tedy nový (prázdný) databázový soubor — starý
zůstane na disku nepoužitý, můžeš ho smazat.

V každém souboru je klíč ID inzerátu, hodnota obsahuje titulek, URL, cenu,
popis a časy prvního/posledního nalezení. Smazáním souboru (nebo konkrétního
klíče v něm) donutíš scraper, aby danou nabídku příště vyhodnotil znovu jako
"novou".

`data/db/_index.json` mapuje hash → původní URL/label/čas posledního běhu,
aby bylo z názvu souboru poznat, ke které sledované URL patří.
