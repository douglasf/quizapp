/**
 * Client-side image upload service for Cloudflare R2 storage.
 *
 * POSTs compressed image Blobs to the quiz-images Worker and returns
 * CDN URLs. Falls back gracefully when the Worker URL is not configured
 * or the Worker is unreachable.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ImageUploadResult =
  | { success: true; url: string }
  | { success: false; error: string; fallbackDataUrl?: string };

export interface UploadOptions {
  /** AbortSignal for cancelling the upload */
  signal?: AbortSignal;
}

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * Worker base URL from environment. Empty string disables cloud upload.
 *
 * Set via `VITE_IMAGE_WORKER_URL` in `.env` or `.env.local`.
 */
const WORKER_URL: string = import.meta.env.VITE_IMAGE_WORKER_URL ?? '';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a base64 data URL to a Blob.
 *
 * Parses the MIME type from the `data:<mime>;base64,` prefix, decodes the
 * base64 payload to binary, and returns a typed Blob.
 *
 * @example
 * ```ts
 * const blob = dataUrlToBlob('data:image/jpeg;base64,/9j/4AAQ...');
 * blob.type; // "image/jpeg"
 * ```
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL: must start with "data:"');
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('Invalid data URL: missing comma separator');
  }

  // Extract MIME type from "data:<mime>;base64" prefix
  const prefix = dataUrl.slice(0, commaIndex); // e.g. "data:image/jpeg;base64"
  const mimeMatch = prefix.match(/^data:([^;,]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

  // Decode base64 → binary
  const base64 = dataUrl.slice(commaIndex + 1);
  const binaryString = atob(base64);

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

// ── Health check ─────────────────────────────────────────────────────────────

/**
 * Check whether the image upload Worker is reachable and healthy.
 *
 * GETs `<WORKER_URL>/api/health` and returns `true` only when the response
 * is OK and the body contains `{ status: "ok" }`.
 *
 * Returns `false` if the Worker URL is not configured, the request fails,
 * or the response indicates an unhealthy state.
 */
export async function checkWorkerHealth(): Promise<boolean> {
  if (!WORKER_URL) {
    return false;
  }

  try {
    const response = await fetch(`${WORKER_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
      credentials: 'omit',
    });

    if (!response.ok) {
      return false;
    }

    const data: unknown = await response.json();
    if (
      data !== null &&
      typeof data === 'object' &&
      (data as Record<string, unknown>).status === 'ok'
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload an image Blob to the Cloudflare R2 Worker.
 *
 * Sends a `multipart/form-data` POST to `<WORKER_URL>/api/upload` with the
 * Blob attached as the `file` field. On success returns the CDN URL from the
 * Worker response; on failure returns a descriptive error string.
 *
 * Supports an optional `AbortSignal` for cancellation (e.g. when the user
 * navigates away mid-upload).
 *
 * @param blob  The image Blob to upload (e.g. from `compressImageToBlob`)
 * @param options  Optional settings — currently only `signal` for cancellation
 * @returns An `ImageUploadResult` indicating success (with URL) or failure
 */
export async function uploadImageToR2(
  blob: Blob,
  options?: UploadOptions,
): Promise<ImageUploadResult> {
  // ── Guard: Worker URL must be configured ─────────────────────────────
  if (!WORKER_URL) {
    return {
      success: false,
      error: 'Image upload is not configured (VITE_IMAGE_WORKER_URL is empty)',
    };
  }

  // ── Build multipart form data ────────────────────────────────────────
  const formData = new FormData();
  formData.append('file', blob);

  // ── POST to Worker ───────────────────────────────────────────────────
  let response: Response;
  try {
    response = await fetch(`${WORKER_URL}/api/upload`, {
      method: 'POST',
      body: formData,
      signal: options?.signal,
      credentials: 'omit',
    });
  } catch (error: unknown) {
    // Abort / cancellation
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { success: false, error: 'Upload was cancelled' };
    }

    // Network failure
    if (error instanceof TypeError) {
      return {
        success: false,
        error: 'Network error: could not reach the image upload service',
      };
    }

    return {
      success: false,
      error: 'Unexpected error during image upload',
    };
  }

  // ── Handle non-OK responses ──────────────────────────────────────────
  if (!response.ok) {
    let detail = `Upload failed (HTTP ${response.status})`;

    try {
      const body: unknown = await response.json();
      if (
        body !== null &&
        typeof body === 'object' &&
        typeof (body as Record<string, unknown>).error === 'string'
      ) {
        detail = (body as Record<string, unknown>).error as string;
      }
    } catch {
      // Body wasn't JSON — use the generic message
    }

    return { success: false, error: detail };
  }

  // ── Parse success response ───────────────────────────────────────────
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { success: false, error: 'Invalid response from upload service' };
  }

  if (
    data !== null &&
    typeof data === 'object' &&
    typeof (data as Record<string, unknown>).url === 'string'
  ) {
    return {
      success: true,
      url: (data as Record<string, unknown>).url as string,
    };
  }

  return {
    success: false,
    error: 'Upload service returned an unexpected response format',
  };
}
