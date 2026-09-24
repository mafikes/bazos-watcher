const crypto = require("crypto");

function hashUrl(url) {
  return crypto.createHash("sha1").update(url.trim()).digest("hex").slice(0, 12);
}

module.exports = { hashUrl };
