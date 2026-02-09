// URL normalization for importing quizzes from GitHub, Gist, and arbitrary URLs.

export interface NormalizedUrl {
  url: string;
  type: 'gist_api' | 'raw' | 'direct';
}

/**
 * Strip query parameters and fragment identifiers from a URL string,
 * then remove any trailing slashes from the path.
 */
function cleanUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.search = '';
    parsed.hash = '';
    // Remove trailing slashes from the pathname (but keep the root "/")
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    // If it's not a valid URL, return as-is and let the caller deal with it
    return raw.trim();
  }
}

/**
 * Case-insensitive hostname check.
 */
function hostnameIs(url: URL, expected: string): boolean {
  return url.hostname.toLowerCase() === expected.toLowerCase();
}

/**
 * Transform a user-provided URL into a fetchable URL with type metadata.
 *
 * Transformation rules:
 *  - Gist page URL → Gist API endpoint
 *  - Gist raw URLs → kept as raw
 *  - GitHub blob URLs → raw.githubusercontent.com
 *  - Raw GitHub URLs → kept as raw
 *  - Gist API URLs → kept as-is
 *  - Everything else → kept as-is (direct fetch)
 */
export function normalizeQuizUrl(input: string): NormalizedUrl {
  const cleaned = cleanUrl(input.trim());

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    // Not a valid URL — return it as a direct attempt
    return { url: cleaned, type: 'direct' };
  }

  // ── Gist API endpoint (already correct) ──────────────────────────────
  // https://api.github.com/gists/<id>
  if (hostnameIs(parsed, 'api.github.com')) {
    const gistApiMatch = parsed.pathname.match(/^\/gists\/([a-f0-9]+)$/i);
    if (gistApiMatch) {
      return { url: parsed.toString(), type: 'gist_api' };
    }
  }

  // ── Gist raw content (already fetchable) ─────────────────────────────
  // https://gist.githubusercontent.com/...
  if (hostnameIs(parsed, 'gist.githubusercontent.com')) {
    return { url: parsed.toString(), type: 'raw' };
  }

  // ── Gist page URLs ───────────────────────────────────────────────────
  // https://gist.github.com/<user>/<id>/raw  → already raw, keep as-is
  // https://gist.github.com/<user>/<id>      → transform to API
  if (hostnameIs(parsed, 'gist.github.com')) {
    // Check for /raw suffix — these redirect to raw content
    const rawGistMatch = parsed.pathname.match(
      /^\/[^/]+\/([a-f0-9]+)\/raw$/i,
    );
    if (rawGistMatch) {
      return { url: parsed.toString(), type: 'raw' };
    }

    // Standard gist page → convert to API
    const gistPageMatch = parsed.pathname.match(
      /^\/[^/]+\/([a-f0-9]+)$/i,
    );
    if (gistPageMatch) {
      const gistId = gistPageMatch[1];
      return {
        url: `https://api.github.com/gists/${gistId}`,
        type: 'gist_api',
      };
    }
  }

  // ── Raw GitHub content (already fetchable) ───────────────────────────
  // https://raw.githubusercontent.com/...
  if (hostnameIs(parsed, 'raw.githubusercontent.com')) {
    return { url: parsed.toString(), type: 'raw' };
  }

  // ── GitHub blob URLs ─────────────────────────────────────────────────
  // https://github.com/<owner>/<repo>/blob/<branch>/<path>
  // → https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>
  if (hostnameIs(parsed, 'github.com')) {
    const blobMatch = parsed.pathname.match(
      /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/,
    );
    if (blobMatch) {
      const [, owner, repo, rest] = blobMatch;
      return {
        url: `https://raw.githubusercontent.com/${owner}/${repo}/${rest}`,
        type: 'raw',
      };
    }
  }

  // ── Fallback: direct fetch ───────────────────────────────────────────
  return { url: parsed.toString(), type: 'direct' };
}

// ── Gist API response helpers ────────────────────────────────────────────

interface GistFile {
  content?: string;
  filename?: string;
}

interface GistApiResponse {
  files?: Record<string, GistFile>;
}

/**
 * Extract quiz JSON content from a Gist API response.
 *
 * The Gist API returns an object like:
 * ```json
 * {
 *   "files": {
 *     "quiz.json": { "content": "{ ... }", "filename": "quiz.json" }
 *   }
 * }
 * ```
 *
 * This function grabs the `content` of the first file in the `files` object.
 * Throws if no files are present or the content is empty.
 */
export function extractJsonFromGistApi(response: unknown): string {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid Gist API response: expected an object');
  }

  const gist = response as GistApiResponse;

  if (!gist.files || typeof gist.files !== 'object') {
    throw new Error('Gist API response has no "files" field');
  }

  const fileNames = Object.keys(gist.files);
  if (fileNames.length === 0) {
    throw new Error('Gist contains no files');
  }

  // Prefer a .json file if one exists; otherwise take the first file.
  const jsonFileName = fileNames.find((name) =>
    name.toLowerCase().endsWith('.json'),
  );
  const targetName = jsonFileName ?? fileNames[0];
  const file = gist.files[targetName];

  if (!file || typeof file.content !== 'string' || file.content.trim() === '') {
    throw new Error(
      `Gist file "${targetName}" has no content`,
    );
  }

  return file.content;
}
