// Encode/decode quiz data for shareable URL fragments using gzip + base64url.

import type { Quiz } from '../types/quiz';

// ── Base64url helpers ────────────────────────────────────────────────────────

/**
 * Encode a Uint8Array to a base64url string (URL-safe, no padding).
 *
 * Uses the standard `btoa` function and then replaces `+` → `-`, `/` → `_`,
 * and strips trailing `=` padding characters.
 */
function toBase64url(bytes: Uint8Array): string {
  // Convert Uint8Array to a binary string for btoa
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 = btoa(binary);

  // Make URL-safe: + → -, / → _, strip =
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a base64url string back to a Uint8Array.
 *
 * Restores standard base64 characters (`-` → `+`, `_` → `/`) and re-adds
 * `=` padding so `atob` can decode it.
 */
function fromBase64url(encoded: string): Uint8Array {
  // Restore standard base64 chars
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');

  // Re-add padding
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Compression helpers ──────────────────────────────────────────────────────

/** Whether the browser supports the Compression Streams API. */
function supportsCompressionStreams(): boolean {
  return typeof CompressionStream !== 'undefined';
}

/**
 * Compress a Uint8Array using gzip via the Compression Streams API.
 */
async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  // Concatenate chunks into a single Uint8Array
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Decompress a gzipped Uint8Array via the Decompression Streams API.
 */
async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(data);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Encode a Quiz object into a base64url string suitable for use as a URL
 * fragment.
 *
 * Pipeline:
 * 1. JSON.stringify → string
 * 2. TextEncoder → Uint8Array
 * 3. gzip compress (if available) → compressed Uint8Array
 * 4. base64url encode → string
 *
 * When `CompressionStream` is unavailable the compression step is skipped and
 * plain base64url encoding is used. The result will be larger but still
 * functional for small quizzes.
 */
export async function encodeQuizToFragment(quiz: Quiz): Promise<string> {
  try {
    const json = JSON.stringify(quiz);
    const raw = new TextEncoder().encode(json);

    if (supportsCompressionStreams()) {
      const compressed = await gzipCompress(raw);
      return toBase64url(compressed);
    }

    // Fallback: plain base64url (no compression)
    return toBase64url(raw);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to encode quiz for sharing: ${message}`);
  }
}

/**
 * Decode a base64url-encoded quiz fragment back into a JSON string.
 *
 * Pipeline (reverse of encoding):
 * 1. base64url decode → Uint8Array
 * 2. gzip decompress (if gzip header detected) → decompressed Uint8Array
 * 3. TextDecoder → JSON string
 *
 * The function detects whether the payload is gzip-compressed by checking for
 * the gzip magic bytes (`0x1f 0x8b`). If the payload is uncompressed (plain
 * base64url), it is decoded directly.
 *
 * @returns The decoded JSON string (caller is responsible for parsing/validating).
 */
export async function decodeQuizFromFragment(
  encoded: string,
): Promise<string> {
  let bytes: Uint8Array;

  // ── Step 1: Base64url decode ──────────────────────────────────────────
  try {
    bytes = fromBase64url(encoded);
  } catch {
    throw new Error(
      'Invalid share link: the encoded data is not valid base64url.',
    );
  }

  if (bytes.length === 0) {
    throw new Error('Invalid share link: the encoded data is empty.');
  }

  // ── Step 2: Decompress if gzip ────────────────────────────────────────
  // Gzip magic bytes: 0x1f 0x8b
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (isGzip) {
    if (!supportsCompressionStreams()) {
      throw new Error(
        'This share link uses compression, but your browser does not support decompression. Please use a modern browser (Chrome 80+, Firefox 113+, Safari 16.4+).',
      );
    }

    try {
      bytes = await gzipDecompress(bytes);
    } catch {
      throw new Error(
        'Invalid share link: failed to decompress the quiz data.',
      );
    }
  }

  // ── Step 3: Decode UTF-8 ──────────────────────────────────────────────
  let json: string;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    json = decoder.decode(bytes);
  } catch {
    throw new Error(
      'Invalid share link: the decoded data is not valid UTF-8 text.',
    );
  }

  return json;
}
