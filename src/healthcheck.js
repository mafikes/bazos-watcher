const fs = require("fs");
const { HEARTBEAT_FILE, computeMaxAgeMs } = require("./heartbeat");

function isHealthy() {
  const { mtimeMs } = fs.statSync(HEARTBEAT_FILE);
  return Date.now() - mtimeMs <= computeMaxAgeMs();
}

if (require.main === module) {
  try {
    if (isHealthy()) {
      process.exit(0);
    }
    console.error(`[healthcheck] heartbeat je starsi nez povoleny limit (${computeMaxAgeMs()}ms)`);
    process.exit(1);
  } catch (err) {
    console.error(`[healthcheck] heartbeat soubor chybi nebo neni citelny: ${err.message}`);
    process.exit(1);
  }
}
