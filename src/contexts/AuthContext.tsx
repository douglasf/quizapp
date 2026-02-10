/**
 * React Auth context and provider.
 *
 * Manages user authentication state for the entire app:
 *   - Stores access token in memory (never localStorage — security best practice)
 *   - Refresh token is handled via httpOnly cookie (sent automatically)
 *   - On mount, tries to restore the session via GET /api/auth/me
 *   - Exposes login / signup / logout actions
 *   - Provides loading state while checking auth
 */

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  login as apiLogin,
  signup as apiSignup,
  logout as apiLogout,
  refreshToken as apiRefresh,
  setAccessToken,
  getAccessTokenExpiresAt,
  type AuthUser,
} from "../utils/apiClient";

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

export interface AuthContextType {
  /** The currently authenticated user, or null if logged out. */
  user: AuthUser | null;
  /** Convenience boolean — true when `user` is not null. */
  isAuthenticated: boolean;
  /** True while the initial auth check is in progress. */
  isLoading: boolean;
  /** Log in with email + password. Throws `ApiError` on failure. */
  login: (email: string, password: string) => Promise<void>;
  /** Create a new account. Throws `ApiError` on failure. */
  signup: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  /** Log out and clear all auth state. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Re-export for the useAuth hook (separate file for react-refresh compat)
export { AuthContext };

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Restore session on mount ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        // Try refreshing the access token first (uses httpOnly cookie).
        // If the cookie is valid we get a fresh access token + user data.
        const result = await apiRefresh();
        if (!cancelled) {
          setUser(result.user);
        }
      } catch {
        // No valid refresh token — user is simply not logged in.
        if (!cancelled) {
          setUser(null);
          setAccessToken(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Proactive token refresh (plan §5.3.2 / §5.3.3, Step 3) ─────────
  // Keeps the access token fresh so the host never hits a 401 delay.
  //  • Schedules a timeout to refresh ~60 s before the JWT expires
  //  • Refreshes on tab-focus if the token is stale
  //  • Refreshes when connectivity returns after being offline
  useEffect(() => {
    if (!user) return; // Not logged in — nothing to keep alive

    const BUFFER_MS = 60_000; // refresh 1 minute before expiry

    /**
     * Silently refresh the access token, updating local user state on
     * success.  Failures are intentionally swallowed — the reactive 401
     * intercept in apiClient is the safety net.
     */
    function silentRefresh() {
      apiRefresh()
        .then((result) => setUser(result.user))
        .catch(() => {
          /* best-effort; 401 intercept handles the fallback */
        });
    }

    /** Returns true when the access token is expired or will expire within BUFFER_MS. */
    function isTokenStale(): boolean {
      const expiresAt = getAccessTokenExpiresAt();
      return !expiresAt || Date.now() > expiresAt - BUFFER_MS;
    }

    // — visibilitychange: refresh when the tab becomes visible (§5.3.2) —
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && isTokenStale()) {
        silentRefresh();
      }
    }

    // — online: refresh when connectivity returns after offline (§5.3.3) —
    function handleOnline() {
      if (isTokenStale()) {
        silentRefresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    // — Scheduled timeout: refresh ~60 s before expiry (§5.3.2) —
    const expiresAt = getAccessTokenExpiresAt();
    const refreshIn = expiresAt
      ? expiresAt - Date.now() - BUFFER_MS
      : 13 * 60 * 1000; // fallback: ~13 min (just under 15 min TTL)
    const timer = setTimeout(silentRefresh, Math.max(refreshIn, 0));

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      clearTimeout(timer);
    };
  }, [user]); // Re-run when user changes (login / logout / refresh updates user)

  // ── Actions ───────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin({ email, password });
    setUser(result.user);
  }, []);

  const signup = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await apiSignup({ email, password, displayName });
      setUser(result.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Best-effort — clear local state regardless
    }
    setUser(null);
    setAccessToken(null);
  }, []);

  // ── Memoised context value ────────────────────────────────────────────

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      signup,
      logout,
    }),
    [user, isLoading, login, signup, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
