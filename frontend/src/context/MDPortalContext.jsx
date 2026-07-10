// src/context/MDPortalContext.jsx
//
// CACHING STRATEGY
// employees    — fetched once on mount, cached in context for entire session
// departments  — fetched once on mount
// sites        — fetched once on mount from /employees/sites/, the same
//                HR-managed Site registry used on the Sites & Departments page
// attendance   — fetched once on mount (today's records for dashboard stats)
// employeeDetails — Map cache: empId → full detail object (lazy, on demand)
// All heavy data lives here so switching pages never re-fetches from the server.

import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, useMemo,
} from "react";
import { apiFetch, getUser } from "../utils/auth";

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;
const MDPortalContext = createContext(null);

export function MDPortalProvider({ children }) {
  const user = getUser();

  // ── Core data ──────────────────────────────────────────────────────────────
  const [employees,   setEmployees]   = useState(null);
  const [departments, setDepartments] = useState(null);
  const [sites,       setSites]       = useState(null); // real HR-managed Site records
  const [attendance,  setAttendance]  = useState(null); // today
  const [payroll,     setPayroll]     = useState(null);

  const [loading, setLoading] = useState({
    employees: false, departments: false, sites: false, attendance: false, payroll: false,
  });
  const [errors, setErrors] = useState({
    employees: null, departments: null, sites: null, attendance: null, payroll: null,
  });

  const fetching = useRef({
    employees: false, departments: false, sites: false, attendance: false, payroll: false,
  });

  // ── Employee detail cache (lazy) ───────────────────────────────────────────
  const detailCache = useRef(new Map()); // Map<id, employeeObject>

  const load = useCallback(async (key, url, transform = d => d) => {
    if (fetching.current[key]) return;
    fetching.current[key] = true;
    setLoading(l => ({ ...l, [key]: true }));
    setErrors(e  => ({ ...e, [key]: null  }));
    const setterMap = {
      employees: setEmployees, departments: setDepartments, sites: setSites,
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
    // Sites are managed by HR (Sites & Departments page) — this is the
    // same registry HR assigns employees to, and the single source of
    // truth for the site filter everywhere in the MD Portal.
    load("sites",       "/employees/sites/");
    load("attendance",  `/attendance/?date=${today}`);
  }, [load, today]);

  const refetchSites = useCallback(() => {
    setSites(null);
    fetching.current.sites = false;
    load("sites", "/employees/sites/");
  }, [load]);

  // ── Full attendance history (used for payroll calcs & totals) ──────────────
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

  // ── Computed stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!employees || !departments) return null;
    return computeStats(employees, departments, attendance || [], sites || []);
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
            bank_name_usd:    payrollRecord.bank_name_usd    || null,
            bank_account_usd: payrollRecord.bank_account_usd || null,
            bank_name_zig:    payrollRecord.bank_name_zig    || null,
            bank_account_zig: payrollRecord.bank_account_zig || null,
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
    sites, refetchSites,
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