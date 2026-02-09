/**
 * Short link redirect route for the QuizApp API.
 *
 * Routes:
 *   GET /q/:id — Redirect to the SPA with the quiz loaded for hosting
 */

import { Hono } from "hono";
import type { Env } from "../types";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const shortlinks = new Hono<{ Bindings: Env }>();

// ----------------------------- REDIRECT ------------------------------------

shortlinks.get("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const row = await c.env.DB.prepare(
      "SELECT id FROM quizzes WHERE id = ?",
    )
      .bind(id)
      .first<{ id: string }>();

    if (!row) {
      return c.html(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quiz Not Found</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
      color: #333;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    p { font-size: 1.1rem; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Quiz Not Found</h1>
    <p>The link may be expired or incorrect.</p>
  </div>
</body>
</html>`,
        404,
      );
    }

    // Build the SPA redirect URL from the configured CORS origin
    const spaOrigin = c.env.CORS_ORIGIN;
    const redirectUrl = `${spaOrigin}/#/import?quizId=${row.id}`;

    // Use 302 (temporary) so the target URL can change later.
    // Prevent browsers from caching the redirect.
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Short link lookup failed:", err);
    return c.html(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
      color: #333;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    p { font-size: 1.1rem; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Something Went Wrong</h1>
    <p>Please try again later.</p>
  </div>
</body>
</html>`,
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default shortlinks;
