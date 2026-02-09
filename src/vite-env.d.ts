/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Worker URL for image uploads (leave empty to disable) */
  readonly VITE_IMAGE_WORKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
