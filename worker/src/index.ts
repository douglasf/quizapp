/**
 * QuizApp API — Cloudflare Worker powered by Hono
 *
 * Routes:
 *   GET  /api/health            — Health check
 *   POST /api/upload            — Upload an image to R2
 *   GET  /images/:key           — Serve an image from R2
 *   POST /api/auth/signup       — Create a new account
 *   POST /api/auth/login        — Log in with email + password
 *   POST /api/auth/refresh      — Rotate refresh token
 *   POST /api/auth/logout       — Revoke refresh token
 *   GET  /api/auth/me           — Get current user
 *   POST /api/quizzes           — Create a new quiz (protected)
 *   GET  /api/quizzes           — List user's quizzes (protected)
 *   GET  /api/quizzes/:id       — Get a quiz by ID (public)
 *   DELETE /api/quizzes/:id     — Delete a quiz (protected, owner only)
 *   GET  /q/:id                 — Short link redirect to SPA
 */

import { Hono } from "hono";
import type { Env } from "./types";
import { cors } from "./middleware/cors";
import authRoutes from "./routes/auth";
import quizRoutes from "./routes/quizzes";
import shortlinkRoutes from "./routes/shortlinks";

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use("*", cors);

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

app.route("/api/auth", authRoutes);
app.route("/api/quizzes", quizRoutes);
app.route("/q", shortlinkRoutes);

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Image upload
// ---------------------------------------------------------------------------

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/webp",
  "image/png",
  "image/gif",
]);

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
  "image/gif": "gif",
};

const DEFAULT_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000"; // 1 year

function getMaxSize(env: Env): number {
  const parsed = Number.parseInt(env.MAX_IMAGE_SIZE, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SIZE;
}

app.post("/api/upload", async (c) => {
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Content-Type must be multipart/form-data" }, 400);
  }

  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json({ error: "Failed to parse multipart form data" }, 400);
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return c.json({ error: 'Missing or invalid "file" field in form data' }, 400);
  }
  const file: File = fileEntry;

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return c.json(
      {
        error: `Unsupported file type "${file.type}". Allowed: ${[...ALLOWED_CONTENT_TYPES].join(", ")}`,
      },
      400,
    );
  }

  const maxSize = getMaxSize(c.env);
  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
    return c.json(
      {
        error: `File too large (${file.size} bytes). Maximum: ${maxSize} bytes (${maxMB} MB)`,
      },
      413,
    );
  }

  const ext = CONTENT_TYPE_TO_EXT[file.type];
  const key = `${crypto.randomUUID()}.${ext}`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    await c.env.R2.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      },
    });
  } catch (err) {
    console.error("R2 put failed:", err);
    return c.json({ error: "Failed to store image" }, 500);
  }

  const workerUrl = new URL(c.req.url);
  const imageUrl = `${workerUrl.origin}/images/${key}`;

  return c.json({ url: imageUrl });
});

// ---------------------------------------------------------------------------
// Image serving
// ---------------------------------------------------------------------------

app.get("/images/:key", async (c) => {
  const key = c.req.param("key");

  // Sanitize key: only allow alphanumeric, hyphens, underscores, dots
  if (!/^[\w-]+\.\w+$/.test(key)) {
    return c.json({ error: "Invalid image key" }, 400);
  }

  try {
    const object = await c.env.R2.get(key);

    if (!object) {
      return c.json({ error: "Image not found" }, 404);
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType ?? "application/octet-stream",
    );
    headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    headers.set("ETag", object.httpEtag);

    return new Response(object.body, { headers });
  } catch (err) {
    console.error("R2 get failed:", err);
    return c.json({ error: "Failed to retrieve image" }, 500);
  }
});

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default app;
