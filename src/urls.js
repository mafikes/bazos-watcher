const fs = require("fs");
const path = require("path");
const config = require("./config");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function autoLabel(url) {
  try {
    const u = new URL(url);
    const keyword = u.searchParams.get("hledat");
    const shortPath = u.pathname.replace(/\/+$/, "") || "/";
    return keyword ? `${keyword} (${u.hostname}${shortPath})` : `${u.hostname}${shortPath}`;
  } catch {
    return url;
  }
}

function normalizeEmailList(value, context) {
  const raw = Array.isArray(value) ? value : [value];
  const emails = raw.map((e) => String(e).trim()).filter(Boolean);

  for (const email of emails) {
    if (!EMAIL_RE.test(email)) {
      console.warn(`[urls] "${email}" v email_to pro ${context} nevypada jako platny email.`);
    }
  }

  return [...new Set(emails)];
}

function normalizeEntry(entry) {
  if (typeof entry === "string") {
    const url = entry.trim();
    return { url, label: autoLabel(url), emailTo: config.smtp.defaultEmailTo };
  }

  if (entry && typeof entry === "object" && entry.url) {
    const url = entry.url.trim();
    const label = entry.label || autoLabel(url);
    const emailTo =
      entry.email_to !== undefined ? normalizeEmailList(entry.email_to, label) : config.smtp.defaultEmailTo;
    return { url, label, emailTo };
  }

  throw new Error(`Neplatna polozka v ${config.urlsFilePath}: ${JSON.stringify(entry)}`);
}

function seedDefaultFile() {
  fs.mkdirSync(path.dirname(config.urlsFilePath), { recursive: true });
  const seed = config.legacySearchUrl ? [config.legacySearchUrl] : [];
  fs.writeFileSync(config.urlsFilePath, JSON.stringify(seed, null, 2), "utf-8");
  return seed;
}

function loadWatchUrls() {
  if (!fs.existsSync(config.urlsFilePath)) {
    console.warn(
      `[urls] ${config.urlsFilePath} neexistuje, zakladam ho${
        config.legacySearchUrl ? " s URL z SEARCH_URL" : " prazdny"
      }.`
    );
    seedDefaultFile();
  }

  const raw = fs.readFileSync(config.urlsFilePath, "utf-8").trim();
  const list = raw ? JSON.parse(raw) : [];

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(
      `V ${config.urlsFilePath} neni zadna URL k sledovani. Priklad obsahu: ` +
        `["https://www.bazos.cz/search.php?...", {"url": "https://pc.bazos.cz/monitor/?hledat=benq...", "label": "BenQ monitory", "email_to": ["a@example.com", "b@example.com"]}]`
    );
  }

  const entries = list.map(normalizeEntry);

  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.url)) {
      throw new Error(`Duplicitni URL v ${config.urlsFilePath}: ${entry.url}`);
    }
    seen.add(entry.url);

    if (entry.emailTo.length === 0) {
      console.warn(`[urls] "${entry.label}" nema zadne email_to ani vychozi SMTP_TO - report se pro ni nikam neposle.`);
    }
  }

  return entries;
}

module.exports = { loadWatchUrls };
