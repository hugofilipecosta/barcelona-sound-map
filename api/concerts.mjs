import {
  getConcertPayload,
  isValidRequestRange,
} from "../server/concert-api.mjs";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://so.vercel.app",
  "https://barcelonasoundmap.netlify.app",
  "https://barcelona-sound-map-hugo.netlify.app",
];

const ALLOWED_ORIGINS = new Set(
  (process.env.CONCERT_API_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export default async function handler(req, res) {
  const origin = req.headers.origin;
  applyHeaders(res, withCors(jsonHeaders, origin));

  if (req.method === "OPTIONS") {
    res.status(isAllowedOrigin(origin) ? 204 : 403).end();
    return;
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const params = req.query ?? {};
  const dateStart = firstValue(params.dateStart) ?? firstValue(params.date) ?? today();
  const dateEnd = firstValue(params.dateEnd) ?? dateStart;
  const radiusKm = Number(firstValue(params.radiusKm) ?? 8);

  if (!isValidRequestRange({ dateStart, dateEnd, radiusKm })) {
    res.status(400).json({
      error: "Invalid request. Use YYYY-MM-DD dates and radiusKm between 1 and 50.",
    });
    return;
  }

  const payload = await getConcertPayload({
    dateStart,
    dateEnd,
    radiusKm,
    fast: firstValue(params.fast) === "1",
    refresh: firstValue(params.refresh) === "1",
  });

  res.status(200).json(payload);
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function applyHeaders(res, headers) {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

function withCors(headers, origin) {
  const corsHeaders = {
    ...headers,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (origin && isAllowedOrigin(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
  }

  return corsHeaders;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
