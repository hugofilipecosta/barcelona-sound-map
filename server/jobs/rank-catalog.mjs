import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../env.mjs";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");
const CATALOG_PATH = resolve(DATA_DIR, "catalog.json");
const RECOMMENDATIONS_PATH = resolve(DATA_DIR, "recommendations.json");

const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
const concerts = Array.isArray(catalog.concerts) ? catalog.concerts : [];

let mode = "local";
let recommendations = rankLocally(concerts);

if (process.env.OPENAI_API_KEY) {
  try {
    recommendations = await rankWithModel(concerts);
    mode = "model";
  } catch (error) {
    console.warn(
      `Model ranking failed; using local scoring instead. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

await writeFile(
  RECOMMENDATIONS_PATH,
  `${JSON.stringify(
    {
      city: catalog.city,
      rankedAt: new Date().toISOString(),
      mode,
      recommendations,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Ranked ${recommendations.length} recommendations into ${RECOMMENDATIONS_PATH}`,
);

async function rankWithModel(concerts) {
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "Rank Barcelona music events for a local discovery app. Prefer source freshness, clear venue data, music specificity, and practical night-out value. Return strict JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({ concerts: concerts.slice(0, 80) }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "concert_recommendations",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    score: { type: "number" },
                    mood: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["id", "score", "mood", "reason"],
                },
              },
            },
            required: ["recommendations"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ranking failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const text = payload.output_text ?? payload.output?.[0]?.content?.[0]?.text;
  const parsed = JSON.parse(text);
  return hydrateRecommendations(parsed.recommendations ?? [], concerts);
}

function rankLocally(concerts) {
  return concerts
    .map((concert) => ({
      id: concert.id,
      score: localScore(concert),
      mood: concert.moods?.[0] ?? "Any mood",
      reason: `${concert.source} · ${concert.freshness} · ${concert.neighborhood}`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((item) => ({
      ...item,
      event: concerts.find((concert) => concert.id === item.id),
    }));
}

function hydrateRecommendations(items, concerts) {
  return items
    .map((item) => ({
      ...item,
      event: concerts.find((concert) => concert.id === item.id),
    }))
    .filter((item) => item.event);
}

function localScore(concert) {
  const freshness = concert.freshness === "Live API" ? 40 : 0;
  const source = ["Ticketmaster", "Eventbrite", "DICE"].includes(concert.source)
    ? 20
    : 10;
  const distance = Math.max(0, 20 - Number(concert.distanceKm ?? 8) * 2);
  const detail = concert.venue && concert.ticketUrl ? 20 : 0;
  return freshness + source + distance + detail;
}
