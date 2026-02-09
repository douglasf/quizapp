/**
 * JWT authentication middleware for Hono.
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it, and sets the authenticated user in the context.
 */

import type { Context, Next } from "hono";
import type { Env } from "../types";
import { verifyJWT } from "../lib/jwt";
import type { JWTPayload } from "../lib/jwt";

/**
 * The shape of the authenticated user stored in the Hono context.
 */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * Hono middleware that verifies the JWT access token.
 *
 * On success, sets `c.set("user", authUser)` for downstream handlers.
 * On failure, returns a 401 JSON response.
 */
export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7); // Strip "Bearer "

  let payload: JWTPayload;
  try {
    payload = await verifyJWT(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  if (!payload.sub) {
    return c.json({ error: "Invalid token payload" }, 401);
  }

  // Look up the user in D1 to ensure they still exist
  const row = await c.env.DB.prepare(
    "SELECT id, email, display_name FROM users WHERE id = ?",
  )
    .bind(payload.sub)
    .first<{ id: string; email: string; display_name: string }>();

  if (!row) {
    return c.json({ error: "User not found" }, 401);
  }

  c.set("user", {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
  });

  await next();
}
