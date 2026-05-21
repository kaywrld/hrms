// src/context/MDPortalContext.jsx
//
// CACHING STRATEGY
// employees    — fetched once on mount, cached in context for entire session
// departments  — fetched once on mount
// attendance   — fetched once on mount (today's records for dashboard stats)
// locations    — fetched once, derived from attendance location field
// employeeDetails — Map cache: empId → full detail object (lazy, on demand)
// All heavy data lives here so switching pages never re-fetches from the server.

import {
    createContext, useContext, useState, useEffect,
    useCallback, useRef, useMemo,
  } from "react";
  import { apiFetch, getUser } from "../utils/auth";
  
  const API = "http://127.0.0.1:8000/api";
  const MDPortalContext = createContext(null);
  
  export function MDPortalProvider({ children }) {
    const user = getUser();
  
    // ── Core data ──────────────────────────────────────────────────────────────
    const [employees,   setEmployees]   = useState(null);
    const [departments, setDepartments] = useState(null);
    const [attendance,  setAttendance]  = useState(null); // today
    const [payroll,     setPayroll]     = useState(null);
  
    const [loading, setLoading] = useState({
      employees: false, departments: false, attendance: false, payroll: false,
    });
    const [errors, setErrors] = useState({
      employees: null, departments: null, attendance: null, payroll: null,
    });
  
    const fetching = useRef({
      employees: false, departments: false, attendance: false, payroll: false,
    });
  
    // ── Employee detail cache (lazy) ───────────────────────────────────────────
    const detailCache = useRef(new Map()); // Map<id, employeeObject>
  
    const load = useCallback(async (key, url, transform = d => d) => {
      if (fetching.current[key]) return;
      fetching.current[key] = true;
      setLoading(l => ({ ...l, [key]: true }));
      setErrors(e  => ({ ...e, [key]: null  }));
      const setterMap = {
        employees: setEmployees, departments: setDepartments,
        attendance: setAttendance, payroll: setPayroll,
      };
      try {
        const res  = await apiFetch(`${API}${url}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.results || []);
        setterMap[key](transform(list));
      } catch (err) {
        setErrors(e => ({ ...e, [key]: err.message || "Failed to load" }));
      } finally {
        fetching.current[key] = false;
        setLoading(l => ({ ...l, [key]: false }));
      }
    }, []);
  
    const today = new Date().toISOString().slice(0, 10);
  
    useEffect(() => {
      load("employees",   "/employees/");
      load("departments", "/employees/departments/");
      load("attendance",  `/attendance/?date=${today}`);
    }, [load, today]);
  
    // ── Derived: unique sites from attendance records ──────────────────────────
    // Sites are the "location" field set by HODs when marking attendance.
    // We pull ALL attendance (not just today) once to collect every site name.
    const [allAttendance, setAllAttendance] = useState(null);
    const fetchingAllAtt = useRef(false);
  
    const loadAllAttendance = useCallback(async () => {
      if (fetchingAllAtt.current || allAttendance !== null) return;
      fetchingAllAtt.current = true;
      try {
        const res  = await apiFetch(`${API}/attendance/`);
        if (!res.ok) return;
        const data = await res.json();
        setAllAttendance(Array.isArray(data) ? data : (data.results || []));
      } catch (_) {
        setAllAttendance([]);
      } finally {
        fetchingAllAtt.current = false;
      }
    }, [allAttendance]);
  
    useEffect(() => { loadAllAttendance(); }, [loadAllAttendance]);
  
    // ── Also fetch location registry (DeptPortal stores these) ─────────────────
    const [locationRegistry, setLocationRegistry] = useState([]);
    useEffect(() => {
      apiFetch(`${API}/attendance/locations/`)
        .then(r => r.ok ? r.json() : [])
        .then(d => {
          const list = Array.isArray(d) ? d : (d.results || []);
          if (list.length > 0) setLocationRegistry(list);
        })
        .catch(() => {});
    }, []);
  
    // Merge both sources for the final site list
    const sites = useMemo(() => {
      const fromRegistry = locationRegistry.filter(Boolean);
      const fromAtt = (allAttendance || [])
        .map(a => a.location || a.site || "")
        .filter(Boolean);
      const combined = [...new Set([...fromRegistry, ...fromAtt])].sort();
      return combined;
    }, [locationRegistry, allAttendance]);
  
    // ── Computed stats ─────────────────────────────────────────────────────────
    const stats = useMemo(() => {
      if (!employees || !departments) return null;
      return computeStats(employees, departments, attendance || [], sites);
    }, [employees, departments, attendance, sites]);
  
    // ── Fetch full employee detail (lazy, cached) ──────────────────────────────
    const fetchEmployeeDetail = useCallback(async (empId) => {
      if (detailCache.current.has(empId)) return detailCache.current.get(empId);
      try {
        const empRes = await apiFetch(`${API}/employees/${empId}/`);
        if (!empRes.ok) throw new Error(`${empRes.status}`);
        const empData = await empRes.json();
  
        // Also try to get payroll
        let payrollRecord = null;
        try {
          const prRes = await apiFetch(`${API}/payroll/employee/${empId}/`);
          if (prRes.ok) payrollRecord = await prRes.json();
        } catch (_) {}
  
        const full = payrollRecord
          ? {
              ...empData,
              bank_name:    payrollRecord.bank_name    || null,
              bank_account: payrollRecord.bank_account || null,
              basic_salary: payrollRecord.basic_salary || null,
              allowances:   payrollRecord.allowances,
              deductions:   payrollRecord.deductions,
              currency:     payrollRecord.currency || "USD",
              payroll,
            }
          : empData;
  
        detailCache.current.set(empId, full);
        return full;
      } catch (err) {
        console.error("fetchEmployeeDetail:", err);
        return null;
      }
    }, [payroll]);
  
    const value = {
      user,
      employees, departments, attendance, allAttendance, payroll,
      loading, errors,
      stats, today,
      sites,
      fetchEmployeeDetail,
    };
  
    return (
      <MDPortalContext.Provider value={value}>
        {children}
      </MDPortalContext.Provider>
    );
  }
  
  export function useMDPortal() {
    const ctx = useContext(MDPortalContext);
    if (!ctx) throw new Error("useMDPortal must be used inside <MDPortalProvider>");
    return ctx;
  }
  
  // ── Compute stats ─────────────────────────────────────────────────────────────
  function computeStats(employees, departments, todayAttendance, sites) {
    const now   = new Date();
    const thisM = now.getMonth();
    const thisY = now.getFullYear();
  
    const employed   = employees.filter(e => e.status === "employed").length;
    const male       = employees.filter(e => e.gender === "M").length;
    const female     = employees.filter(e => e.gender === "F").length;
    const other      = employees.filter(e => e.gender === "O").length;
    const fullTime   = employees.filter(e => e.employment_type === "full_time").length;
    const partTime   = employees.filter(e => e.employment_type === "part_time").length;
    const contract   = employees.filter(e => e.employment_type === "contract").length;
  
    // Employees joined this month
    const newThisMonth = employees.filter(e => {
      if (!e.date_joined) return false;
      const [y, m] = String(e.date_joined).split("-").map(Number);
      return y === thisY && (m - 1) === thisM;
    }).length;
  
    const presentStatuses = ["present", "late", "half_day"];
    const presentToday = todayAttendance.filter(a => presentStatuses.includes(a.status)).length;
    const absentToday  = todayAttendance.filter(a => a.status === "absent").length;
  
    const byDeptMap = {};
    employees.forEach(e => {
      const d = e.department_name || "Unknown";
      byDeptMap[d] = (byDeptMap[d] || 0) + 1;
    });
    const byDept = Object.entries(byDeptMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  
    const monthlyJoins = buildMonthlyJoinTrend(employees, 6);
  
    return {
      total: employees.length,
      employed, newThisMonth,
      totalDepts: departments.length,
      totalSites: sites.length,
      male, female, other,
      fullTime, partTime, contract,
      presentToday, absentToday,
      notMarkedToday: Math.max(0, employed - todayAttendance.length),
      byDept, monthlyJoins,
    };
  }
  
  function buildMonthlyJoinTrend(employees, monthsBack) {
    const now = new Date();
    return Array.from({ length: monthsBack }, (_, i) => {
      const d     = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
      const yr    = d.getFullYear();
      const mo    = d.getMonth();
      const label = d.toLocaleString("default", { month: "short" });
      const count = employees.filter(e => {
        if (!e.date_joined) return false;
        const [jYr, jMo] = String(e.date_joined).split("-").map(Number);
        return jYr === yr && (jMo - 1) === mo;
      }).length;
      return { label, count };
    });
  }