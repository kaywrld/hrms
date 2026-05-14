// src/context/DeptPortalContext.jsx
//
// Shared data cache for the Department Admin Portal (HOD role).
// Scoped to a single department — the one assigned to the logged-in HOD.
// Multiple HOD admins from different departments can be logged in at the same time;
// each instance of this provider is completely isolated (separate React tree, separate state).
//
// Data loaded:
//   employees   — only employees in this department (filtered by API for HOD role)
//   attendance  — attendance records for this department
//   department  — the department object (name, description)
//
// Usage:
//   1. Wrap <DeptPortalProvider> at the root of the HOD portal page.
//   2. Inside any child: const { employees, stats, ... } = useDeptPortal();

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { apiFetch, getUser } from "../utils/auth";

const API = "http://127.0.0.1:8000/api";

const DeptPortalContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function DeptPortalProvider({ children }) {
  const user = getUser();
  const deptName = user?.department || "Department";

  // ── Core data ──
  const [employees,   setEmployees]   = useState(null);  // null = not yet loaded
  const [attendance,  setAttendance]  = useState(null);

  // ── Loading / error flags ──
  const [loading, setLoading] = useState({ employees: false, attendance: false });
  const [errors,  setErrors]  = useState({ employees: null,  attendance: null  });

  // Track in-flight fetches — prevents double-firing even if component mounts twice (StrictMode)
  const fetching = useRef({ employees: false, attendance: false });

  // ── Generic fetcher with in-flight guard ──
  const load = useCallback(async (key, url, transform = d => d) => {
    if (fetching.current[key]) return;
    fetching.current[key] = true;
    setLoading(l => ({ ...l, [key]: true }));
    setErrors(e  => ({ ...e, [key]: null  }));
    try {
      const res  = await apiFetch(`${API}${url}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.results || [];
      const setter = { employees: setEmployees, attendance: setAttendance }[key];
      setter(transform(list));
    } catch (err) {
      setErrors(e => ({ ...e, [key]: err.message || "Failed to load" }));
    } finally {
      fetching.current[key] = false;
      setLoading(l => ({ ...l, [key]: false }));
    }
  }, []);

  // ── Load everything on mount ──
  // The backend already filters employees/attendance to the HOD's department
  useEffect(() => {
    load("employees",  "/employees/");
    load("attendance", "/attendance/");
  }, [load]);

  // ── Public invalidation helpers ──
  const refetchEmployees  = useCallback(() => { setEmployees(null);  fetching.current.employees  = false; load("employees",  "/employees/");  }, [load]);
  const refetchAttendance = useCallback(() => { setAttendance(null); fetching.current.attendance = false; load("attendance", "/attendance/"); }, [load]);

  // ── Derived stats (department-scoped) ──
  const stats = employees ? computeStats(employees, attendance || []) : null;

  const value = {
    // Identity
    deptName,
    user,

    // Raw data
    employees,
    attendance,

    // Loading / error
    loading,
    errors,

    // Invalidation
    refetchEmployees,
    refetchAttendance,

    // Derived
    stats,
  };

  return (
    <DeptPortalContext.Provider value={value}>
      {children}
    </DeptPortalContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useDeptPortal() {
  const ctx = useContext(DeptPortalContext);
  if (!ctx) throw new Error("useDeptPortal must be used inside <DeptPortalProvider>");
  return ctx;
}

// ── Internal: derive stats from employees + attendance ────────────────────────
function computeStats(employees, attendance) {
  const statusCount = {};
  employees.forEach(e => {
    statusCount[e.status] = (statusCount[e.status] || 0) + 1;
  });

  // Build a map of employee_id → days attended (present / late / half_day)
  const attendedDays = {};
  attendance.forEach(a => {
    if (["present", "late", "half_day"].includes(a.status)) {
      attendedDays[a.employee] = (attendedDays[a.employee] || 0) + 1;
    }
  });

  return {
    total:         employees.length,
    employed:      employees.filter(e => e.status === "employed").length,
    male:          employees.filter(e => e.gender === "M").length,
    female:        employees.filter(e => e.gender === "F").length,
    other:         employees.filter(e => e.gender === "O").length,
    fullTime:      employees.filter(e => e.employment_type === "full_time").length,
    partTime:      employees.filter(e => e.employment_type === "part_time").length,
    contract:      employees.filter(e => e.employment_type === "contract").length,
    statusCount,
    attendedDays,  // { employee_id: number_of_days }
  };
}