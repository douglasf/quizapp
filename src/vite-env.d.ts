/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Worker URL for image uploads (leave empty to disable) */
  readonly VITE_IMAGE_WORKER_URL?: string;
  /** QuizApp API URL for auth & quiz CRUD (defaults to http://localhost:8787) */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
