// src/utils/auth.js

export const getToken   = () => localStorage.getItem("access_token");
export const getRefresh = () => localStorage.getItem("refresh_token");
export const getUser    = () => {
  try { return JSON.parse(localStorage.getItem("user") || "{}"); }
  catch { return {}; }
};

// Clears all session data on logout.
export const clearSession = () => {
  localStorage.clear();
};

// Call this at the top of every portal page
export const requireAuth = (requiredRole = null) => {
  const token = getToken();
  const user  = getUser();

  if (!token || !user?.role) {
    window.location.href = "/";
    return false;
  }
  if (requiredRole && user.role !== requiredRole) {
    window.location.href = "/";
    return false;
  }
  return true;
};

// Automatically refresh token before it expires
export const refreshToken = async () => {
  const refresh = getRefresh();
  if (!refresh) { clearSession(); window.location.href = "/"; return; }
  try {
    const res  = await fetch("http://127.0.0.1:8000/api/auth/token/refresh/", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ refresh }),
    });

    if (!res.ok) {
      throw new Error("refresh_failed");
    }

    const data = await res.json();
    localStorage.setItem("access_token", data.access);
    // When ROTATE_REFRESH_TOKENS=True the backend issues a new refresh token too
    if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
    return data.access;
  } catch {
    clearSession();
    window.location.href = "/";
  }
};

// Fetch wrapper that auto-retries once with refreshed token on 401
export const apiFetch = async (url, options = {}) => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
    ...(options.headers || {}),
  };

  let res = await fetch(url, { ...options, headers });

  // Token expired — try refresh once
  if (res.status === 401) {
    const newToken = await refreshToken();
    if (!newToken) return res;
    const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
    res = await fetch(url, { ...options, headers: retryHeaders });
  }

  // Still 401 after refresh → kick to login
  if (res.status === 401) {
    clearSession();
    window.location.href = "/";
  }

  return res;
};

// ─── Logout helper (calls backend to blacklist token & clear session JTI) ─────
export const performLogout = async (reason = "manual") => {
  const refresh = getRefresh();
  const token   = getToken();

  if (refresh && token) {
    try {
      await fetch("http://127.0.0.1:8000/api/auth/logout/", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({ refresh }),
      });
    } catch {
      // Best-effort — clear locally even if the request fails
    }
  }

  clearSession();

  if (reason === "inactivity") {
    sessionStorage.setItem("logout_reason", "inactivity");
  } else if (reason === "session_invalidated") {
    sessionStorage.setItem("logout_reason", "session_invalidated");
  }

  window.location.href = "/";
};

// ─── Inactivity Auto-Logout ───────────────────────────────────────────────────
// Call `startInactivityTimer()` inside a useEffect on every portal page.
// It returns a cleanup function — return it from the useEffect.
//
// After INACTIVITY_MS of no mouse/keyboard/touch activity the user is
// automatically logged out and redirected to login with a banner message.

const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes

// ── Modal-open suppression ────────────────────────────────────────────────────
// When a modal is open, inactivity logout is suppressed so users can fill in
// forms without being kicked out mid-entry.
let _modalOpenCount = 0;
export const notifyModalOpen  = () => { _modalOpenCount++; };
export const notifyModalClose = () => { _modalOpenCount = Math.max(0, _modalOpenCount - 1); };
export const isModalOpen      = () => _modalOpenCount > 0;

export const startInactivityTimer = () => {
  let timer = null;

  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Don't log out if a modal/form is currently open — user is actively entering data
      if (isModalOpen()) {
        reset(); // reschedule
        return;
      }
      performLogout("inactivity");
    }, INACTIVITY_MS);
  };

  const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
  events.forEach(e => window.addEventListener(e, reset, { passive: true }));

  // Kick off the first countdown
  reset();

  // Return cleanup for useEffect
  return () => {
    clearTimeout(timer);
    events.forEach(e => window.removeEventListener(e, reset));
  };
};

// ─── Proactive Token Refresh ──────────────────────────────────────────────────
// Silently refreshes the access token every 8 minutes while the user is active.
// This keeps last_activity current on the backend (updated on every refresh),
// which prevents the session from being incorrectly flagged as abandoned.
//
// Call `startTokenRefreshTimer()` alongside startInactivityTimer() in every
// portal's useEffect. It returns a cleanup function.
//
// Must NOT run if the user is inactive — so it checks user activity first.

const REFRESH_INTERVAL_MS = 8 * 60 * 1000; // 8 minutes (access token lives 10 min)

export const startTokenRefreshTimer = () => {
  let lastActivity = Date.now();
  let interval = null;

  // Track when user was last active
  const markActive = () => { lastActivity = Date.now(); };
  const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
  events.forEach(e => window.addEventListener(e, markActive, { passive: true }));

  interval = setInterval(async () => {
    // Only refresh if user has been active in the last 10 minutes
    const idleSecs = (Date.now() - lastActivity) / 1000;
    if (idleSecs > 600) return; // they're idle — let the inactivity timer handle logout

    const refreshTokenValue = getRefresh();
    if (!refreshTokenValue) return;

    try {
      const res = await fetch("http://127.0.0.1:8000/api/auth/token/refresh/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: refreshTokenValue }),
      });

      if (!res.ok) {
        return; // Let apiFetch handle retries on next API call
      }

      const data = await res.json();
      localStorage.setItem("access_token", data.access);
      if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
    } catch {
      // Network error — silently ignore, apiFetch will handle the retry
    }
  }, REFRESH_INTERVAL_MS);

  return () => {
    clearInterval(interval);
    events.forEach(e => window.removeEventListener(e, markActive));
  };
};