/**
 * Quiz Image Worker
 *
 * Handles image upload, storage, and serving via Cloudflare R2.
 *
 * Routes:
 *   POST /api/upload    — Upload an image to R2
 *   GET  /api/health    — Health check
 *   GET  /images/:key   — Serve an image from R2
 */

export interface Env {
  IMAGES_BUCKET: R2Bucket;
  ALLOWED_ORIGINS: string;
  MAX_IMAGE_SIZE: string;
}

// ---------------------------------------------------------------------------
// Constants
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

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function getAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
}

function getCorsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = getAllowedOrigins(env);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function handleOptions(request: Request, env: Env): Response {
  const origin = getCorsOrigin(request, env);
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the configured max image size in bytes. */
function getMaxSize(env: Env): number {
  const parsed = Number.parseInt(env.MAX_IMAGE_SIZE, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SIZE;
}

/** Generate a UUID v4 using the Web Crypto API (available in Workers). */
function generateUUID(): string {
  return crypto.randomUUID();
}

/** Build a JSON error response with CORS headers. */
function jsonError(
  message: string,
  status: number,
  origin: string | null,
): Response {
  return Response.json({ error: message }, { status, headers: corsHeaders(origin) });
}

/** Build a JSON success response with CORS headers. */
function jsonOk(data: unknown, origin: string | null): Response {
  return Response.json(data, { headers: corsHeaders(origin) });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleHealth(request: Request, env: Env): Response {
  const origin = getCorsOrigin(request, env);
  return jsonOk(
    { status: "ok", timestamp: new Date().toISOString() },
    origin,
  );
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const origin = getCorsOrigin(request, env);

  // 1. Validate request content-type is multipart/form-data
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError(
      "Content-Type must be multipart/form-data",
      400,
      origin,
    );
  }

  // 2. Parse the form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Failed to parse multipart form data", 400, origin);
  }

  // 3. Extract the file field
  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return jsonError(
      'Missing or invalid "file" field in form data',
      400,
      origin,
    );
  }
  const file: File = fileEntry;

  // 4. Validate content type
  const fileType = file.type;
  if (!ALLOWED_CONTENT_TYPES.has(fileType)) {
    return jsonError(
      `Unsupported file type "${fileType}". Allowed: ${[...ALLOWED_CONTENT_TYPES].join(", ")}`,
      400,
      origin,
    );
  }

  // 5. Validate file size
  const maxSize = getMaxSize(env);
  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
    return jsonError(
      `File too large (${file.size} bytes). Maximum allowed: ${maxSize} bytes (${maxMB} MB)`,
      413,
      origin,
    );
  }

  // 6. Generate unique key with proper extension
  const ext = CONTENT_TYPE_TO_EXT[fileType];
  const uuid = generateUUID();
  const key = `${uuid}.${ext}`;

  // 7. Read file bytes and store in R2
  try {
    const arrayBuffer = await file.arrayBuffer();
    await env.IMAGES_BUCKET.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: fileType,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      },
    });
  } catch (err) {
    console.error("R2 put failed:", err);
    return jsonError("Failed to store image", 500, origin);
  }

  // 8. Build the public URL
  //    The worker serves images at /images/<key>, so we use the request URL's origin.
  const workerUrl = new URL(request.url);
  const imageUrl = `${workerUrl.origin}/images/${key}`;

  return jsonOk({ url: imageUrl }, origin);
}

async function handleGetImage(
  key: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = getCorsOrigin(request, env);

  // Sanitize key: only allow alphanumeric, hyphens, dots (prevent path traversal)
  if (!/^[\w-]+\.\w+$/.test(key)) {
    return jsonError("Invalid image key", 400, origin);
  }

  try {
    const object = await env.IMAGES_BUCKET.get(key);

    if (!object) {
      return jsonError("Image not found", 404, origin);
    }

    const headers = new Headers(corsHeaders(origin));
    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType ?? "application/octet-stream",
    );
    headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    // ETag for conditional requests
    headers.set("ETag", object.httpEtag);

    return new Response(object.body, { headers });
  } catch (err) {
    console.error("R2 get failed:", err);
    return jsonError("Failed to retrieve image", 500, origin);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function matchRoute(
  method: string,
  pathname: string,
): { handler: string; params?: Record<string, string> } | null {
  if (method === "GET" && pathname === "/api/health") {
    return { handler: "health" };
  }
  if (method === "POST" && pathname === "/api/upload") {
    return { handler: "upload" };
  }
  if (method === "GET" && pathname.startsWith("/images/")) {
    const key = pathname.slice("/images/".length);
    if (key) return { handler: "image", params: { key } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    const url = new URL(request.url);
    const route = matchRoute(request.method, url.pathname);
    const origin = getCorsOrigin(request, env);

    if (!route) {
      return jsonError("Not found", 404, origin);
    }

    try {
      switch (route.handler) {
        case "health":
          return handleHealth(request, env);
        case "upload":
          return handleUpload(request, env);
        case "image": {
          const key = route.params?.key;
          if (!key) {
            return jsonError("Missing image key", 400, origin);
          }
          return handleGetImage(key, request, env);
        }
        default:
          return new Response("Internal error", { status: 500 });
      }
    } catch (err) {
      console.error("Unhandled error:", err);
      return jsonError("Internal server error", 500, origin);
    }
  },
} satisfies ExportedHandler<Env>;
