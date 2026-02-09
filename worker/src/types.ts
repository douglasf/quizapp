/**
 * Cloudflare Worker environment bindings.
 *
 * These are configured in wrangler.toml and injected at runtime.
 */
export interface Env {
  /** D1 database for quizzes, users, sessions */
  DB: D1Database;

  /** R2 bucket for quiz image storage */
  R2: R2Bucket;

  /** Secret used to sign and verify JWT tokens */
  JWT_SECRET: string;

  /** Allowed CORS origin (the SPA URL) */
  CORS_ORIGIN: string;

  /** Maximum image upload size in bytes (string from wrangler vars) */
  MAX_IMAGE_SIZE: string;
}
