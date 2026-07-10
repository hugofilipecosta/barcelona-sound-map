import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../env.mjs";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");
const CATALOG_PATH = resolve(DATA_DIR, "catalog.json");

export async function refreshCatalog({
  apiUrl = "http://127.0.0.1:8787/api/concerts",
  days = 14,
} = {}) {
  const dates = upcomingDates(days);
  const runs = [];

  for (const date of dates) {
    const url = new URL(apiUrl);
    url.searchParams.set("date", date);
    url.searchParams.set("radiusKm", "8");

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      runs.push({
        date,
        ok: true,
        providerStatus: payload.providerStatus ?? {},
        concerts: payload.concerts ?? [],
        stores: payload.stores ?? [],
      });
    } catch (error) {
      runs.push({
        date,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        providerStatus: {},
        concerts: [],
        stores: [],
      });
    }
  }

  const concerts = dedupeConcerts(runs.flatMap((run) => run.concerts));
  const stores = dedupeStores(runs.flatMap((run) => run.stores));
  const catalog = {
    city: "Barcelona",
    refreshedAt: new Date().toISOString(),
    days,
    totalConcerts: concerts.length,
    totalStores: stores.length,
    concerts,
    stores,
    runs,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const days = Number(readArg("--days") ?? 14);
  const apiUrl = readArg("--api") ?? process.env.CONCERT_API_URL;
  const catalog = await refreshCatalog({ apiUrl, days });
  console.log(
    `Refreshed ${catalog.totalConcerts} concerts into ${CATALOG_PATH}`,
  );
}

function upcomingDates(days) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function dedupeConcerts(concerts) {
  const seen = new Set();
  return concerts.filter((concert) => {
    const key = [
      concert.name?.toLowerCase(),
      concert.date,
      concert.venue?.toLowerCase(),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeStores(stores) {
  const seen = new Set();
  return stores.filter((store) => {
    const key = [
      store.name?.toLowerCase(),
      store.address?.toLowerCase(),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
