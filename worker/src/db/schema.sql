-- QuizApp D1 Database Schema
-- ============================================================================
-- This file is the canonical reference for the full database schema.
-- Each migration in ./migrations/ should keep this file in sync.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id TEXT PRIMARY KEY,                                    -- nanoid (21 chars)
  email TEXT UNIQUE NOT NULL,                             -- lowercase, trimmed
  password_hash TEXT NOT NULL,                            -- bcrypt hash
  display_name TEXT NOT NULL,                             -- user-chosen display name
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users(email);

-- ---------------------------------------------------------------------------
-- Quizzes
-- ---------------------------------------------------------------------------

CREATE TABLE quizzes (
  id TEXT PRIMARY KEY,                                    -- nanoid (12 chars, shorter for URLs)
  user_id TEXT NOT NULL,                                  -- FK to users.id
  title TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  quiz_json TEXT NOT NULL,                                -- full Quiz JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_quizzes_user_id ON quizzes(user_id);
CREATE INDEX idx_quizzes_created_at ON quizzes(created_at);

-- ---------------------------------------------------------------------------
-- Refresh tokens
-- ---------------------------------------------------------------------------

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,                                    -- nanoid
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,                               -- SHA-256 hash of refresh token
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
