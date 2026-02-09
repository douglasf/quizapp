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
