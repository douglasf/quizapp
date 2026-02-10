/**
 * Authentication routes for the QuizApp API.
 *
 * Routes:
 *   POST /api/auth/signup   — Create a new account
 *   POST /api/auth/login    — Log in with email + password
 *   POST /api/auth/refresh  — Rotate refresh token and get a new access token
 *   POST /api/auth/logout   — Revoke refresh token and clear cookie
 *   GET  /api/auth/me       — Get the current authenticated user
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../types";
import { signJWT } from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/password";
import { nanoid } from "../lib/nanoid";
import { authMiddleware } from "../middleware/auth";
import type { AuthUser } from "../middleware/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Access tokens live 15 minutes */
const ACCESS_TOKEN_EXPIRY = "15m";

/** Refresh tokens live 7 days */
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/** Cookie name for the refresh token */
const REFRESH_COOKIE_NAME = "refresh_token";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const signupSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).transform((v) => v.trim()),
});

const loginSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Hash a refresh token value using SHA-256 for storage in D1.
 */
async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = "";
  for (const b of hashArray) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Determine whether the request originates from localhost (local dev).
 */
function isLocalDev(origin: string | undefined): boolean {
  return origin?.includes("localhost") === true || origin?.includes("127.0.0.1") === true;
}

/**
 * Build a Set-Cookie header value for the refresh token.
 *
 * In local development (localhost) we omit the `Secure` flag so cookies work
 * over plain HTTP, and use `SameSite=Lax` so cross-port requests succeed.
 *
 * In production we use `SameSite=None; Secure` so the cookie is sent on
 * cross-origin requests from the SPA (GitHub Pages) to the API (Workers).
 */
function buildRefreshCookie(token: string, maxAgeSec: number, origin: string | undefined): string {
  const secure = !isLocalDev(origin);
  const parts = [
    `${REFRESH_COOKIE_NAME}=${token}`,
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    `SameSite=${secure ? "None" : "Lax"}`,
    "Path=/api/auth",
    `Max-Age=${maxAgeSec}`,
  ];
  return parts.join("; ");
}

/**
 * Build a Set-Cookie header that clears the refresh cookie.
 */
function clearRefreshCookie(origin: string | undefined): string {
  const secure = !isLocalDev(origin);
  const parts = [
    `${REFRESH_COOKIE_NAME}=`,
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    `SameSite=${secure ? "None" : "Lax"}`,
    "Path=/api/auth",
    "Max-Age=0",
  ];
  return parts.join("; ");
}

/**
 * Extract a named cookie value from the Cookie header.
 */
function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Generate a new refresh token, store its hash in D1, and return
 * the raw token value (to send in the cookie).
 */
async function createRefreshToken(db: D1Database, userId: string): Promise<string> {
  const rawToken = nanoid(48); // Long random string
  const tokenHash = await hashToken(rawToken);
  const id = nanoid();

  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  await db
    .prepare(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id, userId, tokenHash, expiresAt)
    .run();

  return rawToken;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

type AuthEnv = {
  Bindings: Env;
  Variables: { user: AuthUser };
};

const auth = new Hono<AuthEnv>();

// ----------------------------- SIGNUP --------------------------------------

auth.post(
  "/signup",
  zValidator("json", signupSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Validation failed", details: result.error.flatten().fieldErrors },
        400,
      );
    }
  }),
  async (c) => {
    const { email, password, displayName } = c.req.valid("json");

    // Check for existing user
    const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();

    if (existing) {
      return c.json({ error: "An account with this email already exists" }, 409);
    }

    // Create user
    const userId = nanoid();
    const passwordHash = await hashPassword(password);

    await c.env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)",
    )
      .bind(userId, email, passwordHash, displayName)
      .run();

    // Generate tokens
    const accessToken = await signJWT({ sub: userId }, c.env.JWT_SECRET, ACCESS_TOKEN_EXPIRY);
    const refreshToken = await createRefreshToken(c.env.DB, userId);

    const maxAge = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

    return c.json(
      {
        user: { id: userId, email, displayName },
        accessToken,
      },
      201,
      {
        "Set-Cookie": buildRefreshCookie(refreshToken, maxAge, c.req.header("origin")),
      },
    );
  },
);

// ----------------------------- LOGIN ---------------------------------------

auth.post(
  "/login",
  zValidator("json", loginSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Validation failed", details: result.error.flatten().fieldErrors },
        400,
      );
    }
  }),
  async (c) => {
    const { email, password } = c.req.valid("json");

    const user = await c.env.DB.prepare(
      "SELECT id, email, password_hash, display_name FROM users WHERE email = ?",
    )
      .bind(email)
      .first<{ id: string; email: string; password_hash: string; display_name: string }>();

    if (!user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Generate tokens
    const accessToken = await signJWT({ sub: user.id }, c.env.JWT_SECRET, ACCESS_TOKEN_EXPIRY);
    const refreshToken = await createRefreshToken(c.env.DB, user.id);

    const maxAge = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

    return c.json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
        },
        accessToken,
      },
      200,
      {
        "Set-Cookie": buildRefreshCookie(refreshToken, maxAge, c.req.header("origin")),
      },
    );
  },
);

// ----------------------------- REFRESH -------------------------------------

auth.post("/refresh", async (c) => {
  const cookieHeader = c.req.header("Cookie");
  const origin = c.req.header("origin");
  const rawToken = getCookie(cookieHeader, REFRESH_COOKIE_NAME);

  if (!rawToken) {
    return c.json({ error: "No refresh token provided" }, 401);
  }

  const tokenHash = await hashToken(rawToken);

  // Look up the refresh token in D1
  const storedToken = await c.env.DB.prepare(
    "SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; expires_at: string }>();

  if (!storedToken) {
    // Clear the cookie since the token is invalid
    return c.json({ error: "Invalid refresh token" }, 401, {
      "Set-Cookie": clearRefreshCookie(origin),
    });
  }

  // Check expiration
  if (new Date(storedToken.expires_at) < new Date()) {
    // Delete expired token
    await c.env.DB.prepare("DELETE FROM refresh_tokens WHERE id = ?")
      .bind(storedToken.id)
      .run();
    return c.json({ error: "Refresh token has expired" }, 401, {
      "Set-Cookie": clearRefreshCookie(origin),
    });
  }

  // Rotate: delete old token, create new one
  await c.env.DB.prepare("DELETE FROM refresh_tokens WHERE id = ?")
    .bind(storedToken.id)
    .run();

  // Verify user still exists
  const user = await c.env.DB.prepare(
    "SELECT id, email, display_name FROM users WHERE id = ?",
  )
    .bind(storedToken.user_id)
    .first<{ id: string; email: string; display_name: string }>();

  if (!user) {
    return c.json({ error: "User not found" }, 401, {
      "Set-Cookie": clearRefreshCookie(origin),
    });
  }

  // Generate new tokens
  const accessToken = await signJWT({ sub: user.id }, c.env.JWT_SECRET, ACCESS_TOKEN_EXPIRY);
  const newRefreshToken = await createRefreshToken(c.env.DB, user.id);

  const maxAge = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

  return c.json(
    {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      },
      accessToken,
    },
    200,
    {
      "Set-Cookie": buildRefreshCookie(newRefreshToken, maxAge, origin),
    },
  );
});

// ----------------------------- LOGOUT --------------------------------------

auth.post("/logout", async (c) => {
  const cookieHeader = c.req.header("Cookie");
  const rawToken = getCookie(cookieHeader, REFRESH_COOKIE_NAME);

  if (rawToken) {
    const tokenHash = await hashToken(rawToken);
    // Delete the refresh token from D1 (best effort, ignore errors)
    await c.env.DB.prepare("DELETE FROM refresh_tokens WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
  }

  return c.body(null, 204, {
    "Set-Cookie": clearRefreshCookie(c.req.header("origin")),
  });
});

// ----------------------------- ME ------------------------------------------

auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default auth;
