const { CronExpressionParser } = require("cron-parser");
const config = require("./config");

const HEARTBEAT_FILE = process.env.HEARTBEAT_FILE || "/tmp/bazos-watcher.heartbeat";

const LOOKAHEAD_RUNS = 12;
const SAFETY_BUFFER_MS = 5 * 60 * 1000;
const FALLBACK_MAX_AGE_MS = 20 * 60 * 1000;

// Prah pro healthcheck se pocita z CRON_SCHEDULE, ne z pevne dane konstanty -
// jinak by pri retsim behu (napr. jednou denne) healthcheck falesne hlasil
// unhealthy jen proto, ze mezi behy uplynulo vic casu nez pevny default.
function computeMaxAgeMs() {
  if (process.env.HEALTHCHECK_MAX_AGE_SEC) {
    return Number(process.env.HEALTHCHECK_MAX_AGE_SEC) * 1000;
  }
  try {
    const interval = CronExpressionParser.parse(config.cronSchedule);
    const upcoming = interval.take(LOOKAHEAD_RUNS).map((d) => d.getTime());
    let maxGapMs = 0;
    for (let i = 1; i < upcoming.length; i++) {
      maxGapMs = Math.max(maxGapMs, upcoming[i] - upcoming[i - 1]);
    }
    return maxGapMs > 0 ? maxGapMs + SAFETY_BUFFER_MS : FALLBACK_MAX_AGE_MS;
  } catch (err) {
    return FALLBACK_MAX_AGE_MS;
  }
}

module.exports = { HEARTBEAT_FILE, computeMaxAgeMs };
