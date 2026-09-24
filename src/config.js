require("dotenv").config();
const path = require("path");

module.exports = {
  // legacy jednoduche nastaveni jedne URL - pouzije se jen pri zakladani noveho urls.json
  legacySearchUrl: process.env.SEARCH_URL || null,

  urlsFilePath: path.resolve(process.cwd(), process.env.URLS_FILE || "./data/urls.json"),
  dbDir: path.resolve(process.cwd(), process.env.DB_DIR || "./data/db"),

  cronSchedule: process.env.CRON_SCHEDULE || "*/15 * * * *",
  requestDelayMs: Number(process.env.REQUEST_DELAY_MS || 1500),
  maxPages: Number(process.env.MAX_PAGES || 50),
  pageSize: Number(process.env.PAGE_SIZE || 20),

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || "true") === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  },
};
