// src/context/DeptPortalContext.jsx
//
// CACHING STRATEGY
// employees        — fetched once on mount, never re-fetched unless forced
// attendanceCache  — Map keyed by date. Stale-while-revalidate (5 min TTL).
//                    Switching back to a date you already opened = zero network.
// locationRegistry — loaded once, warm-cached in localStorage across sessions.
//                    New locations optimistically added locally then synced.

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { apiFetch, getUser } from "../utils/auth";

const API = "http://127.0.0.1:8000/api";
const ATTENDANCE_TTL_MS = 5 * 60 * 1000; // 5 min
const LOC_CACHE_KEY = "hrms_location_registry";

const DeptPortalContext = createContext(null);

export function DeptPortalProvider({ children }) {
  const user     = getUser();
  const deptName = user?.department || "Department";

  // ── Employees (load once) ──────────────────────────────────────────────────
  const [employees, setEmployees] = useState(null);
  const [loading,   setLoading]   = useState({ employees: false });
  const [errors,    setErrors]    = useState({ employees: null  });
  const fetchingEmp = useRef(false);

  const loadEmployees = useCallback(async () => {
    if (fetchingEmp.current) return;
    fetchingEmp.current = true;
    setLoading(l => ({ ...l, employees: true }));
    setErrors(e  => ({ ...e, employees: null  }));
    try {
      const res  = await apiFetch(`${API}/employees/`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setErrors(e => ({ ...e, employees: err.message || "Failed to load" }));
    } finally {
      fetchingEmp.current = false;
      setLoading(l => ({ ...l, employees: false }));
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const refetchEmployees = useCallback(() => {
    fetchingEmp.current = false;
    setEmployees(null);
    loadEmployees();
  }, [loadEmployees]);

  // ── Attendance date cache ──────────────────────────────────────────────────
  // Map<dateStr, { records: {empId: record}, fetchedAt: number }>
  const attendanceCache = useRef(new Map());
  const [attendance, setAttendance] = useState(null); // flat list for stats
  const fetchingAllAtt = useRef(false);

  // Fetch ALL attendance records once on mount so the dashboard's
  // "Days Attended" column is populated immediately without visiting
  // the Attendance page first.
  const loadAllAttendance = useCallback(async () => {
    if (fetchingAllAtt.current) return;
    fetchingAllAtt.current = true;
    try {
      const res  = await apiFetch(`${API}/attendance/`);
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results || []);

      // Populate the date cache so per-date fetches are instant on first visit
      const byDate = {};
      list.forEach(r => {
        if (!byDate[r.date]) byDate[r.date] = {};
        byDate[r.date][r.employee] = r;
      });
      const now = Date.now();
      Object.entries(byDate).forEach(([date, records]) => {
        // Only seed; don't overwrite entries already fetched by the Attendance page
        if (!attendanceCache.current.has(date)) {
          attendanceCache.current.set(date, { records, fetchedAt: now });
        }
      });

      setAttendance(list);
    } catch { /* non-fatal \u2014 dashboard will show 0 until corrected */ }
  }, []);

  useEffect(() => { loadAllAttendance(); }, [loadAllAttendance]);

  const getAttendanceForDate = useCallback(async (dateStr) => {
    const cached = attendanceCache.current.get(dateStr);
    const now    = Date.now();

    if (cached && (now - cached.fetchedAt) < ATTENDANCE_TTL_MS) {
      return { records: cached.records, fromCache: true };
    }

    try {
      const res  = await apiFetch(`${API}/attendance/?date=${dateStr}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results || []);

      const records = {};
      list.forEach(r => { records[r.employee] = r; });
      attendanceCache.current.set(dateStr, { records, fetchedAt: Date.now() });

      // Keep flat list in sync for Dashboard stats
      setAttendance(prev => {
        const others = (prev || []).filter(r => r.date !== dateStr);
        return [...others, ...list];
      });

      return { records, fromCache: false };
    } catch {
      return { records: cached?.records || {}, fromCache: !!cached, error: true };
    }
  }, []);

  const upsertAttendanceRecord = useCallback((savedRecord) => {
    const dateStr = savedRecord.date;
    const cached  = attendanceCache.current.get(dateStr);
    if (cached) {
      cached.records[savedRecord.employee] = savedRecord;
    }
    setAttendance(prev => {
      if (!prev) return [savedRecord];
      const idx = prev.findIndex(r => r.employee === savedRecord.employee && r.date === dateStr);
      if (idx !== -1) { const next = [...prev]; next[idx] = savedRecord; return next; }
      return [savedRecord, ...prev];
    });
  }, []);

  const invalidateDate = useCallback((dateStr) => {
    attendanceCache.current.delete(dateStr);
  }, []);

  // ── Location registry ──────────────────────────────────────────────────────
  const [locationRegistry, setLocationRegistry] = useState(() => {
    try {
      const cached = localStorage.getItem(LOC_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const locFetched = useRef(false);

  const fetchLocationRegistry = useCallback(async () => {
    try {
      const res  = await apiFetch(`${API}/attendance/locations/`);
      if (!res.ok) return;
      const data = await res.json();
      const list = (Array.isArray(data) ? data : (data.results || [])).map(l => l.name);
      setLocationRegistry(list);
      localStorage.setItem(LOC_CACHE_KEY, JSON.stringify(list));
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (locFetched.current) return;
    locFetched.current = true;
    fetchLocationRegistry(); // warm cache already showing, this refreshes in background
  }, [fetchLocationRegistry]);

  const registerLocation = useCallback(async (name) => {
    if (!name?.trim()) return;
    const trimmed = name.trim();
    if (locationRegistry.some(l => l.toLowerCase() === trimmed.toLowerCase())) return;

    // Optimistic: add locally right away
    const updated = [...locationRegistry, trimmed].sort((a, b) => a.localeCompare(b));
    setLocationRegistry(updated);
    localStorage.setItem(LOC_CACHE_KEY, JSON.stringify(updated));

    try {
      const res = await apiFetch(`${API}/attendance/locations/`, {
        method: "POST",
        body:   JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const saved = await res.json();
        setLocationRegistry(prev => {
          const without = prev.filter(l => l.toLowerCase() !== saved.name.toLowerCase());
          const final   = [...without, saved.name].sort((a, b) => a.localeCompare(b));
          localStorage.setItem(LOC_CACHE_KEY, JSON.stringify(final));
          return final;
        });
      }
    } catch { /* optimistic update stays */ }
  }, [locationRegistry]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = employees ? computeStats(employees, attendance || []) : null;

  const value = {
    deptName, user,
    employees, loading, errors, refetchEmployees,
    attendance, getAttendanceForDate, upsertAttendanceRecord, invalidateDate,
    locationRegistry, registerLocation, refetchLocationRegistry: fetchLocationRegistry,
    stats,
  };

  return (
    <DeptPortalContext.Provider value={value}>
      {children}
    </DeptPortalContext.Provider>
  );
}

export function useDeptPortal() {
  const ctx = useContext(DeptPortalContext);
  if (!ctx) throw new Error("useDeptPortal must be used inside <DeptPortalProvider>");
  return ctx;
}

function computeStats(employees, attendance) {
  const attendedDays = {};
  attendance.forEach(a => {
    if (["present", "late", "half_day"].includes(a.status)) {
      attendedDays[a.employee] = (attendedDays[a.employee] || 0) + 1;
    }
  });
  return {
    total:      employees.length,
    employed:   employees.filter(e => e.status === "employed").length,
    male:       employees.filter(e => e.gender === "M").length,
    female:     employees.filter(e => e.gender === "F").length,
    other:      employees.filter(e => e.gender === "O").length,
    fullTime:   employees.filter(e => e.employment_type === "full_time").length,
    partTime:   employees.filter(e => e.employment_type === "part_time").length,
    contract:   employees.filter(e => e.employment_type === "contract").length,
    statusCount: employees.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1; return acc;
    }, {}),
    attendedDays,
  };
}