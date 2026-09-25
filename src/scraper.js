const axios = require("axios");
const cheerio = require("cheerio");
const config = require("./config");
const db = require("./db");
const { loadWatchUrls } = require("./urls");
const { sendReports, formatPrice } = require("./mailer");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePrice(text) {
  if (!text) return null;
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function extractIdFromUrl(url) {
  const match = url.match(/\/inzerat\/(\d+)\//);
  return match ? match[1] : null;
}

async function fetchHtml(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  return res.data;
}

function parseListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];

  $(".inzeraty.inzeratyflex").each((_, el) => {
    const $el = $(el);
    const link = $el.find("h2.nadpis a").first();
    const title = link.text().trim();
    const href = link.attr("href");
    if (!title || !href) return;
    // na nekterych kategoriich (napr. pc.bazos.cz/monitor/...) je href relativni
    const detailUrl = new URL(href, pageUrl).toString();

    const id = extractIdFromUrl(detailUrl);
    if (!id) return;

    const priceText = $el.find(".inzeratycena b span").first().text().trim();
    const price = parsePrice(priceText);

    items.push({ id, title, url: detailUrl, price });
  });

  return items;
}

// bazos strankuje bud pres cestu (.../monitor/20/?...) u kategorii, nebo pres
// query parametr crz (search.php?...&crz=20) u obecneho vyhledavani
function buildPageUrl(baseUrl, offset) {
  if (offset === 0) return baseUrl;

  const u = new URL(baseUrl);
  if (/\.php$/i.test(u.pathname)) {
    u.searchParams.set("crz", String(offset));
    return u.toString();
  }

  let pathname = u.pathname;
  if (!pathname.endsWith("/")) pathname += "/";
  pathname += `${offset}/`;
  u.pathname = pathname;
  return u.toString();
}

// stahuje strany dokud nejsou zadne vysledky, nebo dokud stranka nevrati
// uplne stejna data jako ta predchozi (nekdy bazos misto konce vysledku
// zopakuje posledni platnou stranku)
async function fetchAllPages(baseUrl, label) {
  const allItems = [];
  let prevKey = null;

  for (let page = 0; page < config.maxPages; page++) {
    const offset = page * config.pageSize;
    const pageUrl = buildPageUrl(baseUrl, offset);

    let html;
    try {
      html = await fetchHtml(pageUrl);
    } catch (err) {
      console.error(`[scraper] [${label}] Chyba pri stahovani stranky ${pageUrl}: ${err.message}`);
      break;
    }

    const items = parseListingHtml(html, pageUrl);

    if (items.length === 0) {
      console.log(`[scraper] [${label}] strana ${page + 1}: 0 inzeratu, konec strankovani.`);
      break;
    }

    const key = items.map((i) => i.id).join(",");
    if (key === prevKey) {
      console.log(`[scraper] [${label}] strana ${page + 1}: stejna data jako predchozi strana, konec strankovani.`);
      break;
    }

    console.log(`[scraper] [${label}] strana ${page + 1}: ${items.length} inzeratu.`);
    allItems.push(...items);
    prevKey = key;

    if (page + 1 < config.maxPages) {
      await sleep(config.requestDelayMs);
    }
  }

  return allItems;
}

function processItems(items, store, label) {
  const newListings = [];
  const cheaperListings = [];

  for (const item of items) {
    const existing = store[item.id];
    const tagged = { ...item, sourceLabel: label };

    if (!existing) {
      store[item.id] = {
        title: item.title,
        url: item.url,
        price: item.price,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      };

      newListings.push(tagged);
      console.log(`[NOVA] [${label}] ${item.title} - ${formatPrice(item.price)} - ${item.url}`);
      continue;
    }

    existing.lastSeen = new Date().toISOString();
    existing.title = item.title;

    if (
      item.price !== null &&
      existing.price !== null &&
      existing.price !== undefined &&
      item.price < existing.price
    ) {
      cheaperListings.push({ ...tagged, oldPrice: existing.price });
      console.log(
        `[SLEVA] [${label}] ${item.title} - ${formatPrice(existing.price)} -> ${formatPrice(item.price)} - ${item.url}`
      );
      existing.price = item.price;
    } else {
      console.log(`[BEZE ZMENY] [${label}] ${item.title} - ${formatPrice(item.price)}`);
      existing.price = item.price;
    }
  }

  return { newListings, cheaperListings };
}

async function runOnce() {
  const watchUrls = loadWatchUrls();
  console.log(`[scraper] ${new Date().toISOString()} Sleduji ${watchUrls.length} URL.`);

  const allNew = [];
  const allCheaper = [];
  // email -> { newListings: [], cheaperListings: [] }, aby kazdy prijemce dostal
  // jeden email jen s nabidkami z URL, kde je v jejim email_to
  const recipientReports = new Map();

  for (const { url, label, emailTo } of watchUrls) {
    console.log(`\n[scraper] === ${label} ===\n${url}`);
    if (emailTo.length) {
      console.log(`[scraper] [${label}] email_to: ${emailTo.join(", ")}`);
    }

    let listingItems;
    try {
      listingItems = await fetchAllPages(url, label);
    } catch (err) {
      console.error(`[scraper] [${label}] Chyba pri zpracovani: ${err.message}`);
      continue;
    }

    console.log(`[scraper] [${label}] celkem ${listingItems.length} inzeratu pres vsechny stranky.`);

    const store = db.loadForUrl(url);
    const { newListings, cheaperListings } = processItems(listingItems, store, label);
    db.saveForUrl(url, store);

    allNew.push(...newListings);
    allCheaper.push(...cheaperListings);

    if (newListings.length || cheaperListings.length) {
      for (const email of emailTo) {
        if (!recipientReports.has(email)) {
          recipientReports.set(email, { newListings: [], cheaperListings: [] });
        }
        const bucket = recipientReports.get(email);
        bucket.newListings.push(...newListings);
        bucket.cheaperListings.push(...cheaperListings);
      }
    }

    await sleep(config.requestDelayMs);
  }

  db.updateIndex(watchUrls);

  if (recipientReports.size) {
    await sendReports(recipientReports);
  } else {
    console.log("[scraper] Zadne nove ani zlevnene nabidky napric vsemi URL, email se neposila.");
  }

  return { newListings: allNew, cheaperListings: allCheaper };
}

module.exports = { runOnce, buildPageUrl, parseListingHtml };

if (require.main === module) {
  runOnce()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[scraper] Chyba pri behu:", err);
      process.exit(1);
    });
}
