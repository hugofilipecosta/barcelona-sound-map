import {
  getConcertPayload,
  isValidRequestRange,
} from "../../server/concert-api.mjs";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
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

export async function handler(event) {
  const origin = event.headers?.origin ?? event.headers?.Origin;
  const headers = withCors(jsonHeaders, origin);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: isAllowedOrigin(origin) ? 204 : 403,
      headers,
      body: "",
    };
  }

  if (!isAllowedOrigin(origin)) {
    return json(403, { error: "Origin not allowed" }, headers);
  }

  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" }, headers);
  }

  const params = event.queryStringParameters ?? {};
  const dateStart = params.dateStart ?? params.date ?? today();
  const dateEnd = params.dateEnd ?? dateStart;
  const radiusKm = Number(params.radiusKm ?? 8);

  if (!isValidRequestRange({ dateStart, dateEnd, radiusKm })) {
    return json(
      400,
      { error: "Invalid request. Use YYYY-MM-DD dates and radiusKm between 1 and 50." },
      headers,
    );
  }

  const payload = await getConcertPayload({
    dateStart,
    dateEnd,
    radiusKm,
    fast: params.fast === "1",
    refresh: params.refresh === "1",
  });

  return json(200, payload, headers);
}

function json(statusCode, payload, headers) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(payload),
  };
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
