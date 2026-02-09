import type { Context, Next } from "hono";
import type { Env } from "../types";

/**
 * CORS middleware for the Hono app.
 *
 * - Handles OPTIONS preflight requests with a 204 response.
 * - Attaches CORS headers to all other responses.
 * - Only allows the configured CORS_ORIGIN (the SPA host).
 * - Also allows localhost origins during development.
 */
export async function cors(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header("Origin") ?? "";
  const allowed = c.env.CORS_ORIGIN;

  // Allow the configured production origin and common local dev origins
  const isAllowed =
    origin === allowed ||
    origin === "http://localhost:5173" ||
    origin === "http://localhost:3000";

  const corsOrigin = isAllowed ? origin : "";

  // Handle preflight
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  await next();

  // Attach CORS headers to the response
  if (corsOrigin) {
    c.res.headers.set("Access-Control-Allow-Origin", corsOrigin);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
  }
}
