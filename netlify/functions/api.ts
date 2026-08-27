/**
 * Netlify Function: api.ts
 *
 * Proxies all /api/* requests from the Netlify-hosted frontend to the
 * separately-hosted FastAPI backend (e.g. on Render.com).
 *
 * This avoids CORS issues — the browser talks to the same Netlify origin,
 * and this function forwards the call server-side using the BACKEND_URL
 * environment variable set in the Netlify dashboard.
 *
 * URL mapping:
 *   Browser  → /.netlify/functions/api/<path>
 *   Function → $BACKEND_URL/<path>
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

const BACKEND_URL = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");

const json503 = (msg: string) => ({
  statusCode: 503,
  headers: { "Content-Type": "application/json" } as Record<string, string>,
  body: JSON.stringify({ error: msg }),
});

const json502 = (msg: string) => ({
  statusCode: 502,
  headers: { "Content-Type": "application/json" } as Record<string, string>,
  body: JSON.stringify({ error: msg }),
});

const handler: Handler = async (
  event: HandlerEvent,
  _context: HandlerContext
) => {
  if (!BACKEND_URL) {
    return json503("BACKEND_URL environment variable is not set in Netlify.");
  }

  // Strip the function prefix: /.netlify/functions/api/health → /health
  // Also handle the case where Netlify passes the path without the function prefix
  const rawPath = event.path ?? "/";
  const stripped = rawPath
    .replace(/^\/.netlify\/functions\/api/, "")
    .replace(/^\/api\/api\//, "/api/") // guard against double /api/api/
    || "/";
  const qs = event.rawQuery ? `?${event.rawQuery}` : "";
  const targetUrl = `${BACKEND_URL}${stripped}${qs}`;

  // Log for debugging (visible in Netlify Function logs)
  console.log(`[proxy] ${event.httpMethod} ${rawPath} → ${targetUrl}`);

  // Forward headers — drop host so the backend sees its own host
  const forwardHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (key.toLowerCase() === "host") continue;
    if (value !== undefined) forwardHeaders[key] = value;
  }

  try {
    const hasBody =
      event.body !== null &&
      event.body !== undefined &&
      event.httpMethod !== "GET" &&
      event.httpMethod !== "HEAD";

    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: forwardHeaders,
      body: hasBody
        ? event.isBase64Encoded
          ? Buffer.from(event.body as string, "base64")
          : event.body
        : undefined,
    });

    const responseBody = await response.text();
    const contentType =
      response.headers.get("content-type") ?? "application/json";

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      } as Record<string, string>,
      body: responseBody,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json502(`Proxy error: ${message}`);
  }
};

export { handler };
