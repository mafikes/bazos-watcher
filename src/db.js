const fs = require("fs");
const path = require("path");
const config = require("./config");
const { hashUrl } = require("./hash");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[db] Nepodarilo se naparsovat ${filePath}: ${err.message}`);
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// kazda sledovana URL ma svuj vlastni soubor data/db/<hash>.json
// kdyz se URL zmeni (jiny hash), zalozi se novy soubor a stary zustane osiraly na disku
function dbPathForUrl(url) {
  return path.join(config.dbDir, `${hashUrl(url)}.json`);
}

function loadForUrl(url) {
  return readJson(dbPathForUrl(url)) || {};
}

function saveForUrl(url, data) {
  writeJson(dbPathForUrl(url), data);
}

// index.json mapuje hash -> puvodni URL/label, at je videt ktery db soubor patri k cemu
const indexPath = () => path.join(config.dbDir, "_index.json");

function updateIndex(entries) {
  const index = readJson(indexPath()) || {};
  for (const { url, label, emailTo } of entries) {
    index[hashUrl(url)] = { url, label, emailTo, lastRun: new Date().toISOString() };
  }
  writeJson(indexPath(), index);
}

module.exports = { loadForUrl, saveForUrl, updateIndex, dbPathForUrl };
