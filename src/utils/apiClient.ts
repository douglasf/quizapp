/**
 * API client for the QuizApp backend.
 *
 * Features:
 *   - Automatic `Authorization: Bearer <token>` header injection
 *   - Automatic token refresh on 401 (via httpOnly refresh cookie)
 *   - JSON serialization / deserialization
 *   - Typed error handling
 */

import type { Quiz } from "../types/quiz";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8787";

// ---------------------------------------------------------------------------
// Token storage (in-memory only — never persisted to localStorage)
// ---------------------------------------------------------------------------

let accessToken: string | null = null;

/**
 * Unix-ms timestamp when the current access token expires.
 * Kept in sync with `accessToken` so the UI can schedule proactive refreshes
 * (see plan §5.3.1 – "Track token expiry time").
 */
let accessTokenExpiresAt: number | null = null;

/**
 * Decode the `exp` claim from a JWT **without** verifying the signature.
 * The server already verified the token; we only need the expiry for
 * scheduling purposes (plan §5.3.1).
 */
function extractExpiry(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    return (payload.exp as number) * 1000; // seconds → milliseconds
  } catch {
    // Fallback: assume 14 min from now (just under the 15-min server TTL)
    return Date.now() + 14 * 60 * 1000;
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getAccessTokenExpiresAt(): number | null {
  return accessTokenExpiresAt;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  accessTokenExpiresAt = token ? extractExpiry(token) : null;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/**
 * Track in-flight refresh to prevent parallel refresh requests.
 * Multiple 401s arriving at the same time will share a single refresh call.
 */
let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the httpOnly refresh cookie.
 * Returns `true` if the refresh succeeded, `false` otherwise.
 */
async function attemptTokenRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include", // sends the httpOnly cookie
      });

      if (!res.ok) {
        accessToken = null;
        accessTokenExpiresAt = null;
        return false;
      }

      const data = (await res.json()) as {
        accessToken: string;
        user: { id: string; email: string; displayName: string };
      };

      accessToken = data.accessToken;
      accessTokenExpiresAt = extractExpiry(data.accessToken);
      return true;
    } catch {
      accessToken = null;
      accessTokenExpiresAt = null;
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Low-level request helper. Sends JSON, attaches auth headers, and handles
 * automatic 401 → refresh → retry.
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = new Headers(options.headers);

  // JSON body requests need Content-Type
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Inject access token
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const requestInit: RequestInit = {
    ...options,
    headers,
    credentials: "include", // always send cookies (for refresh token)
  };

  let response = await fetch(url, requestInit);

  // If we got a 401 and have (or might have) a refresh token, try refreshing
  if (response.status === 401 && endpoint !== "/api/auth/refresh") {
    const refreshed = await attemptTokenRefresh();

    if (refreshed) {
      // Retry the original request with the new token
      const retryHeaders = new Headers(options.headers);
      if (options.body && !retryHeaders.has("Content-Type")) {
        retryHeaders.set("Content-Type", "application/json");
      }
      if (accessToken) {
        retryHeaders.set("Authorization", `Bearer ${accessToken}`);
      }

      response = await fetch(url, {
        ...options,
        headers: retryHeaders,
        credentials: "include",
      });
    }
  }

  // 204 No Content — return undefined as T
  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? "Request failed",
      response.status,
      (data as { details?: Record<string, string[]> }).details,
    );
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export async function signup(data: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthResponse> {
  const result = await apiRequest<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });
  accessToken = result.accessToken;
  accessTokenExpiresAt = extractExpiry(result.accessToken);
  return result;
}

export async function login(data: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const result = await apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  accessToken = result.accessToken;
  accessTokenExpiresAt = extractExpiry(result.accessToken);
  return result;
}

export async function logout(): Promise<void> {
  await apiRequest<void>("/api/auth/logout", {
    method: "POST",
  });
  accessToken = null;
  accessTokenExpiresAt = null;
}

export async function refreshToken(): Promise<AuthResponse> {
  const result = await apiRequest<AuthResponse>("/api/auth/refresh", {
    method: "POST",
  });
  accessToken = result.accessToken;
  accessTokenExpiresAt = extractExpiry(result.accessToken);
  return result;
}

export async function getMe(): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>("/api/auth/me");
}

// ---------------------------------------------------------------------------
// Quiz endpoints
// ---------------------------------------------------------------------------

/** Shape returned by POST /api/quizzes */
export interface QuizMeta {
  id: string;
  title: string;
  questionCount: number;
  createdAt: string;
  updatedAt?: string;
}

/** Shape returned by GET /api/quizzes (list) */
export interface QuizListResponse {
  quizzes: QuizMeta[];
  total: number;
  page: number;
  limit: number;
}

/** Shape returned by GET /api/quizzes/:id */
export interface QuizDetailResponse {
  quiz: QuizMeta & { data: Quiz };
}

export async function createQuiz(quiz: Quiz): Promise<{ quiz: QuizMeta }> {
  return apiRequest<{ quiz: QuizMeta }>("/api/quizzes", {
    method: "POST",
    body: JSON.stringify(quiz),
  });
}

export async function updateQuiz(
  id: string,
  quiz: Quiz,
): Promise<{ id: string; title: string; questionCount: number; updatedAt: string }> {
  try {
    return await apiRequest<{
      id: string;
      title: string;
      questionCount: number;
      updatedAt: string;
    }>(`/api/quizzes/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ title: quiz.title, questions: quiz.questions }),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        throw new ApiError(
          "You don't have permission to edit this quiz",
          403,
        );
      }
      if (err.status === 404) {
        throw new ApiError(
          "Quiz not found — it may have been deleted",
          404,
        );
      }
    }
    throw err;
  }
}

export async function listQuizzes(
  page?: number,
  limit?: number,
): Promise<QuizListResponse> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", String(page));
  if (limit !== undefined) params.set("limit", String(limit));

  const qs = params.toString();
  return apiRequest<QuizListResponse>(
    `/api/quizzes${qs ? `?${qs}` : ""}`,
  );
}

export async function getQuiz(id: string): Promise<QuizDetailResponse> {
  // Public endpoint — no auth required
  return apiRequest<QuizDetailResponse>(`/api/quizzes/${encodeURIComponent(id)}`);
}

export async function deleteQuiz(id: string): Promise<void> {
  return apiRequest<void>(`/api/quizzes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
