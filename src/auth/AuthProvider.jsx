import { useCallback, useEffect, useMemo, useState } from "react";
import * as cognito from "./cognito";
import { AuthContext } from "./useAuth";

// The signed-in session: { accessToken, idToken, refreshToken, expiresAt }. Kept in
// localStorage so it survives reloads and new tabs (in a private window, until it closes).
const SESSION_KEY = "atomsphere_session";
// Refresh this long before the access token expires, so API calls never carry a stale one.
const REFRESH_MARGIN_MS = 2 * 60 * 1000;
const RETRY_MS = 30 * 1000;

function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return session?.refreshToken ? session : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the session lasts until the page closes.
  }
}

const needsRefresh = (session) => Boolean(session && session.expiresAt - Date.now() < REFRESH_MARGIN_MS);

/**
 * Sign-in inside atomSphere (no redirect to a hosted page), against the Cognito user
 * pool. `useAuth()` (useAuth.js) gives { isLoading, isAuthenticated, user: { access_token, profile:
 * { email } }, signIn, signUp, confirmSignUp, resendCode, forgotPassword, resetPassword,
 * signOut }.
 */
export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(readSession);
  // A session whose token has expired is refreshed before the app renders with it.
  const [refreshing, setRefreshing] = useState(() => needsRefresh(readSession()));
  const [retry, setRetry] = useState(0);

  const setSession = useCallback((next) => {
    writeSession(next);
    setSessionState(next);
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    let retryTimer = null;
    const timer = window.setTimeout(async () => {
      try {
        const next = await cognito.refresh(session.refreshToken);
        if (!cancelled) setSession(next);
      } catch (error) {
        if (cancelled) return;
        // A refresh token that's expired or revoked means signed out; anything else
        // (offline) is tried again shortly.
        if (error.code === "NotAuthorizedException") setSession(null);
        else retryTimer = window.setTimeout(() => setRetry((value) => value + 1), RETRY_MS);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }, Math.max(0, session.expiresAt - Date.now() - REFRESH_MARGIN_MS));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(retryTimer);
    };
  }, [session, setSession, retry]);

  // Signing in or out in one tab does the same in the others.
  useEffect(() => {
    function handleStorage(event) {
      if (event.key === SESSION_KEY) setSessionState(readSession());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const value = useMemo(() => {
    const claims = session ? cognito.tokenClaims(session.idToken) : {};
    return {
      isLoading: refreshing,
      isAuthenticated: Boolean(session),
      user: session
        ? { access_token: session.accessToken, id_token: session.idToken, profile: { email: claims.email, sub: claims.sub } }
        : null,
      // Resolves with the new session, for anything that must use it before the next render.
      signIn: async (username, password) => {
        const next = await cognito.signIn(username.trim(), password);
        setSession(next);
        return next;
      },
      signUp: (email, password) => cognito.signUp(email.trim(), password),
      confirmSignUp: (username, code) => cognito.confirmSignUp(username, code.trim()),
      resendCode: (username) => cognito.resendCode(username),
      forgotPassword: (email) => cognito.forgotPassword(email.trim()),
      resetPassword: (email, code, password) => cognito.confirmForgotPassword(email.trim(), code.trim(), password),
      signOut: () => {
        const token = session?.refreshToken;
        setSession(null);
        if (token) cognito.revoke(token).catch(() => {});
      },
    };
  }, [session, refreshing, setSession]);

  return <AuthContext value={value}>{children}</AuthContext>;
}
