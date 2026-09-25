# Bazos watcher

Sleduje libovolný počet vypisů na Bazos.cz (i s více stránkami), ukladá si
nalezené inzeráty do lokální JSON databáze (zvlášť pro každou URL) a při
dalším běhu porovnává staré a nové stavy. Pokud se objeví nová nabídka nebo
nabídka zlevní, pošle e-mailový report přes SMTP — každému příjemci z
`email_to` dané URL (viz [Více URL](#více-url)).

Scraper ignoruje `robots.txt` (axios/cheerio ho nijak nevynucují) — jen mezi
requesty (další stránka výpisu, další sledovaná URL) čeká `REQUEST_DELAY_MS`,
aby zbytečně nezatěžoval server. Detail jednotlivého inzerátu se nikdy
nestahuje (viz bod 4 níže), takže jediné requesty jsou na stránky výpisu.

Repo obsahuje `Dockerfile` + `docker-compose.yml` a dá se rovnou nasadit přes
[Coolify](https://coolify.io/) (viz [Nasazení přes Coolify](#nasazení-přes-coolify-docker-compose))
— stačí založit službu typu "Docker Compose" nad tímhle repem, Environment
Variables i Persistent Storage se předvyplní automaticky z compose souboru.

## Jak to funguje

1. Načte seznam sledovaných URL z `data/urls.json`.
2. Pro každou URL stáhne stránku 1, 2, 3... (`.../20/`, `.../40/`, ... nebo `?crz=20`, `?crz=40`, ... podle typu stránky — viz [Stránkování](#stránkování)) a cheeriem projde všechny `.inzeraty.inzeratyflex`.
3. Z `h2.nadpis a` vezme titulek a odkaz (relativní i absolutní), z odkazu (`/inzerat/<ID>/...`) vyparsuje ID inzerátu.
4. Z `.inzeratycena b span` vezme cenu — je rovnou ve výpisu, takže se **nikdy nestahuje detail jednotlivého inzerátu** (proto to jede rychle i na první běh s desítkami nových nabídek).
5. Pokud je inzerát nový (ID v databázi pro danou URL není), uloží ho.
6. Pokud inzerát existuje a nová cena je nižší než uložená, označí ho jako slevu.
7. Vše vypíše do konzole a nové/zlevněné položky rozešle e-mailem — každý příjemce z `email_to` dostane jeden souhrnný e-mail se všemi nabídkami ze všech URL, kde je uvedený (pokud je nastavené SMTP).
8. Aktualizovaná databáze dané URL se uloží zpět do `data/db/<hash>.json`.

## Instalace

```bash
npm install
cp .env.example .env
```

Zkopíruj vzorový soubor a uprav ho podle svého:

```bash
cp data/urls.example.json data/urls.json
```

`data/urls.example.json` obsahuje ukázkovou položku (jedno sledované URL na
Bazosu s jedním e-mailovým příjemcem) — v `data/urls.json` ji uprav nebo
přepiš vlastními URL a e-maily (viz [Více URL](#více-url)). `data/urls.json`
je v `.gitignore` (obsahuje tvoje osobní e-maily), takže se do gitu necommitne
— `data/urls.example.json` zůstává v repu jako šablona pro každého, kdo si
projekt nastavuje. Soubor `data/urls.json` je povinný, bez něj scraper hned na
startu skončí chybou.

Uprav `.env`:

- `CRON_SCHEDULE` — jak často se má scraper spouštět, když běží jako démon (node-cron syntax, např. `*/15 * * * *` = každých 15 minut).
- `MAX_PAGES` — pojistka, kolik stránek výpisu se maximálně projde na jednu URL (výchozí 50).
- `SMTP_*` — přístup k tvému SMTP (Gmail apod.). Příjemci se nenastavují tady, ale u každé URL zvlášť v `data/urls.json` (pole `email_to`).

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

### Nasazení přes Coolify (Docker Compose)

Projekt obsahuje `docker-compose.yml` (staví se z `Dockerfile` v repu) — v
Coolify založ novou službu typu **Docker Compose** nad tímhle repem. Díky
compose souboru Coolify automaticky detekuje a předvyplní jak Environment
Variables, tak Persistent Storage — nic z toho není potřeba klikat ručně po
jednom.

> Coolify si při zakládání služby sám nastaví "Docker Compose Location"
> (Configuration → General) — někdy defaultně na `/docker-compose.yaml`. Naše
> repo má `.yml`, takže pokud Coolify hlásí chybu "Docker Compose file not
> found at: /docker-compose.yaml", jdi do Configuration → General a přepiš
> "Docker Compose Location" na `/docker-compose.yml`. Přípona samotná
> (`.yml` vs `.yaml`) je funkčně jedno, Coolify jen nezkouší obě automaticky
> — musí přesně sedět s tím, co je nastavené v tomhle poli.

**Ruční spuštění přes Docker (bez Coolify)** — pro test lokálně nebo nasazení
na vlastní server bez Coolify. `docker-compose.yml` v repu kvůli `content:`
rozšíření (viz níže) mimo Coolify nejede, takže se použije přímo `Dockerfile`:

```bash
docker build -t bazos-watcher .

cp .env.example .env               # a uprav si hodnoty
cp data/urls.example.json data/urls.json   # a uprav si URL/email_to

docker run -d \
  --name bazos-watcher \
  --restart unless-stopped \
  --env-file .env \
  -v "$(pwd)/data/urls.json:/app/data/urls.json" \
  -v bazos-db:/app/data/db \
  bazos-watcher
```

```bash
docker logs -f bazos-watcher                                  # sledovani konzole
docker inspect --format='{{json .State.Health}}' bazos-watcher | jq   # stav healthchecku
docker stop bazos-watcher && docker rm bazos-watcher           # zastaveni/smazani
```

`-v bazos-db:/app/data/db` vytvoří pojmenovaný Docker volume (přežije
`docker rm`/redeploy, dokud ho sám nesmažeš přes `docker volume rm`);
`data/urls.json` se mountuje přímo jako bind mount z hostitele, takže ho
můžeš normálně editovat v editoru na disku bez zásahu do kontejneru.

**Environment variables** — `docker-compose.yml` referencuje proměnné jako
`${SMTP_USER}`, `${SMTP_PASS}` atd. Coolify je z compose souboru přečte a
zobrazí v záložce Environment Variables rovnou po založení služby, stačí
doplnit hodnoty. `SMTP_USER` a `SMTP_PASS` jsou označené jako povinné
(`:?`) — bez nich Coolify deploy odmítne spustit. Ostatní (`CRON_SCHEDULE`,
`SMTP_HOST`, `MAX_PAGES`, ...) mají rozumné výchozí hodnoty stejné jako
`.env.example`, není potřeba je nastavovat, pokud nechceš něco změnit.

**Persistent storage** — taky se detekuje z compose souboru automaticky a
objeví se v záložce Persistent Storage:

- **`bazos-db` volume** na `/app/data/db` — historie nalezených inzerátů,
  přežije redeploy i restart.
- **File mount `urls.json`** na `/app/data/urls.json` — compose soubor mu dal
  počáteční obsah (ukázková URL, stejná jako v `data/urls.example.json`),
  Coolify z něj soubor při prvním deployi rovnou vytvoří. Dál ho uprav přímo
  v Coolify UI (Persistent Storage → daný file mount → Content), vlož si
  vlastní URL a `email_to` (viz [Více URL](#více-url)) a ulož. Po uložení
  službu restartuj, ať si scraper přečte nový obsah (bere se jen při startu
  kontejneru, ne za běhu).

> `content:` u bind mountu v `docker-compose.yml` je Coolify-specifické
> rozšíření (Coolify si tím řekne, aby soubor sám vytvořil) — validní
> docker-compose podle standardní specifikace to není, takže `docker compose
> up`/`docker compose config` mimo Coolify tenhle soubor odmítnou schema
> chybou (`additional properties 'content' not allowed`). Pro lokální test
> v Dockeru bez Coolify použij rovnou `docker build .` + `docker run` (viz
> výš), ne `docker compose up`.

**Proč v Dockeru není pm2** — na baremetal/VM (viz
[Nasazení na server na pozadí](#nasazení-na-server-na-pozadí)) řeší pm2 dvě
věci: přežití procesu po odhlášení ze SSH a restart po pádu/rebootu. V
Dockeru dělá obojí kontejner sám (`restart: unless-stopped` + healthcheck
níže), takže `node src/index.js` běží rovnou jako hlavní proces kontejneru
— přidávat tam pm2 by byla zbytečná vrstva navíc.

**Healthcheck** — `index.js` si při každém skutečném běhu (ne přeskočeném
kvůli překryvu, viz [Jak to funguje](#jak-to-funguje)) zapíše timestamp do
heartbeat souboru. `docker-compose.yml` i `Dockerfile` mají nastavený
`healthcheck`, který každou minutu spouští `node src/healthcheck.js` — ten
porovná stáří heartbeatu s povoleným prahem. Pokud je moc starý (proces
spadl nebo scraper zatuhl a heartbeat se dál nezapisuje), healthcheck po
pár neúspěšných pokusech (`retries: 3`) nahlásí kontejner jako unhealthy a
Coolify/Docker ho restartuje.

Práh se **počítá automaticky z `CRON_SCHEDULE`** (`src/heartbeat.js`, pomocí
knihovny `cron-parser`) — vezme nejdelší mezeru mezi několika nadcházejícími
běhy a přidá 5minutovou rezervu. Díky tomu healthcheck funguje správně i při
řídkém plánu (`CRON_SCHEDULE=0 * * * *` jednou za hodinu, `0 3 * * *` jednou
denně...) — s pevně danou konstantou (např. 20 minut) by u takového plánu
healthcheck mezi jednotlivými běhy pořád falešně hlásil unhealthy a kontejner
by se donekonečna zbytečně restartoval. Pokud bys přesto chtěl práh přebít
ručně, jde nastavit `HEALTHCHECK_MAX_AGE_SEC` (v sekundách) — pak se
automatický výpočet z `CRON_SCHEDULE` ignoruje.

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
- `email_to` — pole emailových adres, kterým se mají posílat reporty (nové/zlevněné nabídky) **jen pro tuhle URL**. Report na danou URL se vždy pošle úplně všem, kdo je tam uvedený. Jiné nastavení příjemců v projektu není — když `email_to` u položky nedáš (nebo dáš prázdné pole `[]`), pro tuhle URL se neodešle žádný email, jen se zapíše do konzole a databáze.
- Prostý string místo objektu (jen URL) funguje taky — chová se jako `{"url": "..."}` bez labelu a bez `email_to` (tedy se nikam neposílá, dokud URL nepřepíšeš na objekt s `email_to`).

Klidně přidej další URL do pole — scraper je projde postupně (s prodlevou
`REQUEST_DELAY_MS` mezi nimi), každou s vlastní databází a vlastním
stránkováním. Jeden a tentýž email adresát, který je uvedený u víc URL,
dostane jeden souhrnný email se všemi svými nabídkami (ne email za každou URL
zvlášť); email s nabídkami rozdělenými podle URL/labelu dostane vždy jen ten,
kdo je u dané URL v `email_to` uvedený.

Pokud `data/urls.json` neexistuje (nebo je prázdný/bez URL), scraper skončí
chybou — soubor si musíš založit ručně podle `data/urls.example.json` (viz
[Instalace](#instalace)).

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

V každém souboru je klíč ID inzerátu, hodnota obsahuje titulek, URL, cenu a
časy prvního/posledního nalezení. Smazáním souboru (nebo konkrétního klíče
v něm) donutíš scraper, aby danou nabídku příště vyhodnotil znovu jako
"novou".

`data/db/_index.json` mapuje hash → původní URL/label/čas posledního běhu,
aby bylo z názvu souboru poznat, ke které sledované URL patří.
