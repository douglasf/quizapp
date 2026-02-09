// Fetch quiz JSON from a URL with error handling, timeout, size limits, and CORS detection.

import { normalizeQuizUrl, extractJsonFromGistApi } from './urlNormalizer';

// ── Result type ──────────────────────────────────────────────────────────────

export type FetchQuizResult =
  | { success: true; json: string }
  | { success: false; error: string };

// ── Constants ────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10_000;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Dangerous protocols that must be rejected ────────────────────────────────

const BLOCKED_PROTOCOLS = new Set([
  'javascript:',
  'data:',
  'blob:',
  'file:',
  'ftp:',
  'vbscript:',
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function fail(error: string): FetchQuizResult {
  return { success: false, error };
}

function ok(json: string): FetchQuizResult {
  return { success: true, json };
}

/**
 * Validate the raw URL string before attempting to fetch.
 *
 * Returns an error message if the URL is invalid, or `null` if it's acceptable.
 */
function validateUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'Please enter a valid HTTPS URL';
  }

  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    return 'Please enter a valid HTTPS URL';
  }

  if (parsed.protocol === 'http:') {
    return 'Only HTTPS URLs are supported for security';
  }

  if (parsed.protocol !== 'https:') {
    return 'Please enter a valid HTTPS URL';
  }

  return null;
}

/**
 * Map HTTP status codes to user-friendly error messages.
 */
function errorForStatus(status: number): string {
  if (status === 404) {
    return 'URL not found (404). Check the link and try again.';
  }
  if (status === 403) {
    return 'Access denied (403). The resource may be private.';
  }
  if (status >= 500) {
    return 'Server error. Try again later.';
  }
  return `Unexpected HTTP error (${status}).`;
}

/**
 * Detect whether a parsed JSON object looks like a Gist API response.
 *
 * The Gist API returns `{ files: { ... }, ... }` — we check for the `files`
 * object whose values each have a `content` string.
 */
function looksLikeGistApiResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (!obj.files || typeof obj.files !== 'object') return false;

  const files = obj.files as Record<string, unknown>;
  const keys = Object.keys(files);
  if (keys.length === 0) return false;

  // Check that at least one file entry has a `content` string
  return keys.some((key) => {
    const file = files[key];
    return (
      file !== null &&
      typeof file === 'object' &&
      typeof (file as Record<string, unknown>).content === 'string'
    );
  });
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Fetch quiz JSON from a URL.
 *
 * - Validates the URL (HTTPS-only)
 * - Normalizes GitHub / Gist URLs to their raw/API equivalents
 * - Fetches with a 10-second timeout and no credentials
 * - Rejects responses larger than 5 MB
 * - Detects Gist API responses and extracts file content automatically
 * - Returns the raw JSON string on success for downstream parsing/validation
 */
export async function fetchQuizFromUrl(
  url: string,
): Promise<FetchQuizResult> {
  // ── 1. Validate ────────────────────────────────────────────────────────
  const trimmed = url.trim();

  const validationError = validateUrl(trimmed);
  if (validationError) {
    return fail(validationError);
  }

  // ── 2. Normalize ───────────────────────────────────────────────────────
  const { url: fetchUrl, type } = normalizeQuizUrl(trimmed);

  // ── 3. Fetch ───────────────────────────────────────────────────────────
  let response: Response;
  try {
    response = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
  } catch (error: unknown) {
    // AbortSignal.timeout() throws a TimeoutError (DOMException with name "TimeoutError")
    if (
      error instanceof DOMException &&
      error.name === 'TimeoutError'
    ) {
      return fail(
        'Request timed out. The server took too long to respond.',
      );
    }

    // CORS errors and network failures both surface as TypeError in fetch
    if (error instanceof TypeError) {
      // Heuristic: if the browser is online the cause is most likely CORS
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return fail(
          'Could not reach the URL. Check your connection and try again.',
        );
      }

      return fail(
        "This URL doesn't allow cross-origin requests. Try using the raw/direct link instead.",
      );
    }

    // Fallback for any other unexpected errors
    return fail(
      'Could not reach the URL. Check your connection and try again.',
    );
  }

  // ── 4. Check HTTP status ───────────────────────────────────────────────
  if (!response.ok) {
    return fail(errorForStatus(response.status));
  }

  // ── 5. Check size via Content-Length (if available) ────────────────────
  const contentLength = response.headers.get('Content-Length');
  if (contentLength) {
    const size = Number(contentLength);
    if (!Number.isNaN(size) && size > MAX_SIZE_BYTES) {
      return fail(
        'Response is too large (> 5 MB). Quiz files should be under 5 MB.',
      );
    }
  }

  // ── 6. Read body as text ───────────────────────────────────────────────
  let text: string;
  try {
    text = await response.text();
  } catch {
    return fail(
      'Could not reach the URL. Check your connection and try again.',
    );
  }

  // Guard against responses that exceeded the limit without a Content-Length header
  if (text.length > MAX_SIZE_BYTES) {
    return fail(
      'Response is too large (> 5 MB). Quiz files should be under 5 MB.',
    );
  }

  // ── 7. Handle Gist API responses ──────────────────────────────────────
  if (type === 'gist_api') {
    try {
      const parsed = JSON.parse(text);

      if (looksLikeGistApiResponse(parsed)) {
        const content = extractJsonFromGistApi(parsed);
        return ok(content);
      }

      // If it was supposed to be a Gist API response but doesn't look like
      // one, return the raw text so the caller can attempt to parse it.
      return ok(text);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown error';
      return fail(`Failed to extract quiz from Gist: ${message}`);
    }
  }

  // For raw / direct URLs, detect Gist-like structures even if the URL
  // wasn't explicitly categorised as gist_api (belt-and-suspenders).
  try {
    const parsed = JSON.parse(text);
    if (looksLikeGistApiResponse(parsed)) {
      const content = extractJsonFromGistApi(parsed);
      return ok(content);
    }
  } catch {
    // Not valid JSON at this stage — that's fine, the downstream parser
    // will handle it. We just wanted to check for accidental Gist wrapping.
  }

  // ── 8. Return raw JSON string ──────────────────────────────────────────
  return ok(text);
}
