// src/utils/auth.js

export const getToken = () => localStorage.getItem("access_token");
export const getUser  = () => {
  try { return JSON.parse(localStorage.getItem("user") || "{}"); }
  catch { return {}; }
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
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) { window.location.href = "/"; return; }
  try {
    const res  = await fetch("http://127.0.0.1:8000/api/auth/token/refresh/", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ refresh }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    localStorage.setItem("access_token", data.access);
    return data.access;
  } catch {
    localStorage.clear();
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
    localStorage.clear();
    window.location.href = "/";
  }

  return res;
};