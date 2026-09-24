const cron = require("node-cron");
const config = require("./config");
const { runOnce } = require("./scraper");

console.log(`[index] Bazos watcher startuje. Cron schedule: ${config.cronSchedule}`);

let running = false;

async function tick() {
  if (running) {
    console.log("[index] Predchozi beh jeste probiha, preskakuji tento tick.");
    return;
  }
  running = true;
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
