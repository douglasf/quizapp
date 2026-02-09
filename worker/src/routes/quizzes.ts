/**
 * Quiz CRUD routes for the QuizApp API.
 *
 * Routes:
 *   POST   /api/quizzes      — Create a new quiz (protected)
 *   GET    /api/quizzes       — List quizzes for the authenticated user (protected)
 *   GET    /api/quizzes/:id   — Get a single quiz by ID (public)
 *   DELETE /api/quizzes/:id   — Delete a quiz (protected, owner only)
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { authMiddleware } from "../middleware/auth";
import type { AuthUser } from "../middleware/auth";
import { nanoid } from "../lib/nanoid";
import { validateQuiz } from "../lib/validator";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Quiz IDs are shorter than user IDs for nicer URLs. */
const QUIZ_ID_LENGTH = 12;

/** Pagination defaults */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

type QuizEnv = {
  Bindings: Env;
  Variables: { user: AuthUser };
};

const quizzes = new Hono<QuizEnv>();

// ----------------------------- CREATE --------------------------------------

quizzes.post("/", authMiddleware, async (c) => {
  // Parse body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate quiz data
  const validation = validateQuiz(body);
  if (!validation.valid) {
    return c.json({ error: "Validation failed", details: validation.errors }, 400);
  }

  const quiz = body as { title: string; questions: unknown[] };
  const user = c.get("user");
  const id = nanoid(QUIZ_ID_LENGTH);
  const now = new Date().toISOString();

  try {
    await c.env.DB.prepare(
      `INSERT INTO quizzes (id, user_id, title, question_count, quiz_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        user.id,
        quiz.title.trim(),
        quiz.questions.length,
        JSON.stringify(quiz),
        now,
        now,
      )
      .run();
  } catch (err) {
    console.error("Failed to insert quiz:", err);
    return c.json({ error: "Failed to save quiz" }, 500);
  }

  return c.json(
    {
      quiz: {
        id,
        title: quiz.title.trim(),
        questionCount: quiz.questions.length,
        createdAt: now,
      },
    },
    201,
  );
});

// ----------------------------- LIST ----------------------------------------

quizzes.get("/", authMiddleware, async (c) => {
  const user = c.get("user");

  // Parse pagination params
  const pageParam = Number.parseInt(c.req.query("page") ?? "", 10);
  const limitParam = Number.parseInt(c.req.query("limit") ?? "", 10);

  const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : DEFAULT_PAGE;
  const limit =
    Number.isFinite(limitParam) && limitParam >= 1 && limitParam <= MAX_LIMIT
      ? limitParam
      : DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  try {
    // Count total quizzes for the user
    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM quizzes WHERE user_id = ?",
    )
      .bind(user.id)
      .first<{ total: number }>();

    const total = countRow?.total ?? 0;

    // Fetch the page
    const { results } = await c.env.DB.prepare(
      `SELECT id, title, question_count, created_at, updated_at
       FROM quizzes
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(user.id, limit, offset)
      .all<{
        id: string;
        title: string;
        question_count: number;
        created_at: string;
        updated_at: string;
      }>();

    return c.json({
      quizzes: (results ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        questionCount: row.question_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error("Failed to list quizzes:", err);
    return c.json({ error: "Failed to fetch quizzes" }, 500);
  }
});

// ----------------------------- GET ONE (PUBLIC) -----------------------------

quizzes.get("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const row = await c.env.DB.prepare(
      "SELECT id, user_id, title, question_count, quiz_json, created_at, updated_at FROM quizzes WHERE id = ?",
    )
      .bind(id)
      .first<{
        id: string;
        user_id: string;
        title: string;
        question_count: number;
        quiz_json: string;
        created_at: string;
        updated_at: string;
      }>();

    if (!row) {
      return c.json({ error: "Quiz not found" }, 404);
    }

    let quizData: unknown;
    try {
      quizData = JSON.parse(row.quiz_json);
    } catch {
      console.error("Corrupt quiz_json for quiz:", id);
      return c.json({ error: "Quiz data is corrupted" }, 500);
    }

    return c.json({
      quiz: {
        id: row.id,
        title: row.title,
        questionCount: row.question_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        data: quizData,
      },
    });
  } catch (err) {
    console.error("Failed to get quiz:", err);
    return c.json({ error: "Failed to fetch quiz" }, 500);
  }
});

// ----------------------------- DELETE ---------------------------------------

quizzes.delete("/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  try {
    // Verify the quiz exists and the user owns it
    const row = await c.env.DB.prepare(
      "SELECT user_id FROM quizzes WHERE id = ?",
    )
      .bind(id)
      .first<{ user_id: string }>();

    if (!row) {
      return c.json({ error: "Quiz not found" }, 404);
    }

    if (row.user_id !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await c.env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(id).run();

    return c.body(null, 204);
  } catch (err) {
    console.error("Failed to delete quiz:", err);
    return c.json({ error: "Failed to delete quiz" }, 500);
  }
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default quizzes;
