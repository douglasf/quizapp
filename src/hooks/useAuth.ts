/**
 * Convenience hook to access the auth context.
 *
 * Must be used inside `<AuthProvider>`.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, login, logout } = useAuth();
 * ```
 */

import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext";
import type { AuthContextType } from "../contexts/AuthContext";

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
