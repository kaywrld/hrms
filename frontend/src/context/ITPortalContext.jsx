// src/context/ITPortalContext.jsx
//
// Shared data cache for the IT Portal.
// Pre-fetches employees, admins, and departments once on mount.
// Any page inside ITPortal reads from here — no duplicate network calls.
// When other portals are built, create their own context (HRMPortalContext, etc.)

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../utils/auth";

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;

const ITPortalContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function ITPortalProvider({ children }) {
  // ── Core data ──
  const [employees,    setEmployees]    = useState(null);   // null = not yet loaded
  const [admins,       setAdmins]       = useState(null);
  const [departments,  setDepartments]  = useState(null);

  // ── Loading / error flags per resource ──
  const [loading, setLoading] = useState({ employees: false, admins: false, departments: false });
  const [errors,  setErrors]  = useState({ employees: null,  admins: null,  departments: null  });

  // Track in-flight fetches so we never double-fire
  const fetching = useRef({ employees: false, admins: false, departments: false });

  // ── Generic fetcher with in-flight guard ──
  const load = useCallback(async (key, url, transform = d => d) => {
    if (fetching.current[key]) return;           // already in-flight
    fetching.current[key] = true;
    setLoading(l => ({ ...l, [key]: true }));
    setErrors(e  => ({ ...e, [key]: null  }));
    try {
      const res  = await apiFetch(`${API}${url}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.results || [];
      const setter = { employees: setEmployees, admins: setAdmins, departments: setDepartments }[key];
      setter(transform(list));
    } catch (err) {
      setErrors(e => ({ ...e, [key]: err.message || "Failed to load" }));
    } finally {
      fetching.current[key] = false;
      setLoading(l => ({ ...l, [key]: false }));
    }
  }, []);

  // ── Load everything on mount ──
  useEffect(() => {
    load("employees",   "/employees/");
    load("admins",      "/auth/admins/");
    load("departments", "/employees/departments/");
  }, [load]);

  // ── Public invalidation helpers (call after CUD operations) ──
  const refetchEmployees   = useCallback(() => { setEmployees(null);   fetching.current.employees   = false; load("employees",   "/employees/");   }, [load]);
  const refetchAdmins      = useCallback(() => { setAdmins(null);      fetching.current.admins      = false; load("admins",      "/auth/admins/"); }, [load]);
  const refetchDepartments = useCallback(() => { setDepartments(null); fetching.current.departments = false; load("departments", "/employees/departments/"); }, [load]);

  // ── Optimistic helpers (instant UI update, no re-fetch needed) ──
  const addEmployee    = useCallback(emp  => setEmployees(prev => prev ? [emp,  ...prev] : [emp]),  []);
  const updateEmployee = useCallback(emp  => setEmployees(prev => prev ? prev.map(e => e.id === emp.id  ? { ...e, ...emp  } : e) : prev), []);
  const removeEmployee = useCallback(id   => setEmployees(prev => prev ? prev.filter(e => e.id !== id)  : prev), []);

  const addAdmin    = useCallback(adm  => setAdmins(prev => prev ? [adm,  ...prev] : [adm]),  []);
  const updateAdmin = useCallback(adm  => setAdmins(prev => prev ? prev.map(a => a.id === adm.id  ? { ...a, ...adm  } : a) : prev), []);
  const removeAdmin = useCallback(id   => setAdmins(prev => prev ? prev.filter(a => a.id !== id)  : prev), []);

  // ── Derived dashboard stats (computed, never fetched separately) ──
  const stats = employees && admins ? computeStats(employees, admins) : null;

  const value = {
    // Raw data
    employees, admins, departments,
    // Loading / error states
    loading, errors,
    // Refetch (after create/update/delete)
    refetchEmployees, refetchAdmins, refetchDepartments,
    // Optimistic updates
    addEmployee, updateEmployee, removeEmployee,
    addAdmin, updateAdmin, removeAdmin,
    // Derived
    stats,
  };

  return (
    <ITPortalContext.Provider value={value}>
      {children}
    </ITPortalContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useITPortal() {
  const ctx = useContext(ITPortalContext);
  if (!ctx) throw new Error("useITPortal must be used inside <ITPortalProvider>");
  return ctx;
}

// ── Internal: derive stats from raw arrays ────────────────────────────────────
function computeStats(employees, admins) {
  const byDept = {}, statusCount = {};
  employees.forEach(e => {
    const d = e.department_name || "Unknown";
    byDept[d]          = (byDept[d]          || 0) + 1;
    statusCount[e.status] = (statusCount[e.status] || 0) + 1;
  });
  return {
    total:    employees.length,
    employed: employees.filter(e => e.status === "employed").length,
    admins:   admins.length,
    depts:    Object.keys(byDept).length,
    male:     employees.filter(e => e.gender === "M").length,
    female:   employees.filter(e => e.gender === "F").length,
    other:    employees.filter(e => e.gender === "O").length,
    byDept:   Object.entries(byDept).slice(0, 7),
    statusCount,
  };
}