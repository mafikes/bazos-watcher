const fs = require("fs");
const cron = require("node-cron");
const config = require("./config");
const { runOnce } = require("./scraper");
const { HEARTBEAT_FILE } = require("./heartbeat");

console.log(`[index] Bazos watcher startuje. Cron schedule: ${config.cronSchedule}`);

let running = false;

function touchHeartbeat() {
  try {
    fs.writeFileSync(HEARTBEAT_FILE, String(Date.now()));
  } catch (err) {
    console.error("[index] Nepodarilo se zapsat heartbeat:", err.message);
  }
}

async function tick() {
  if (running) {
    console.log("[index] Predchozi beh jeste probiha, preskakuji tento tick.");
    return;
  }
  running = true;
  // heartbeat se zapisuje jen pri skutecnem behu (ne preskocenem) - pokud
  // runOnce zatuhne, dalsi tiky se preskocuji a heartbeat zestárne, coz
  // healthcheck vyhodnoti jako unhealthy a kontejner se restartuje
  touchHeartbeat();
  try {
    await runOnce();
  } catch (err) {
    console.error("[index] Chyba pri behu scraperu:", err);
  } finally {
    running = false;
  }
}

// prvni beh hned po startu, dalsi podle cron schedule
tick();
cron.schedule(config.cronSchedule, tick);
