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
      // 401 from our ValidatedTokenRefreshView means the session was
      // invalidated (another device logged in and took over the session).
      if (res.status === 401) {
        let reason = "session_invalidated";
        try {
          const body = await res.json();
          if (body?.code === "session_invalidated") reason = "session_invalidated";
        } catch { /* ignore */ }
        clearSession();
        sessionStorage.setItem("logout_reason", reason);
        window.location.href = "/";
        return;
      }
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

export const startInactivityTimer = () => {
  let timer = null;

  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
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