import { loadEnv } from "../env.mjs";
import { refreshCatalog } from "./refresh-catalog.mjs";

loadEnv();

const intervalMinutes = Number(process.env.REFRESH_INTERVAL_MINUTES ?? 180);
const intervalMs = intervalMinutes * 60 * 1000;

async function runOnce() {
  const catalog = await refreshCatalog();
  console.log(
    `[${catalog.refreshedAt}] catalog refreshed: ${catalog.totalConcerts} concerts`,
  );
}

await runOnce();
setInterval(runOnce, intervalMs);
