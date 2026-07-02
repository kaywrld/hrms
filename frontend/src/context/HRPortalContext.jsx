// src/context/HRPortalContext.jsx
import {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from "react";
import { apiFetch, getUser } from "../utils/auth";

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;
const HRPortalContext = createContext(null);

export function HRPortalProvider({ children }) {
  const user = getUser();

  const [employees,   setEmployees]   = useState(null);
  const [departments, setDepartments] = useState(null);
  const [attendance,  setAttendance]  = useState(null);
  const [payroll,     setPayroll]     = useState(null);

  const [loading, setLoading] = useState({ employees: false, departments: false, attendance: false, payroll: false });
  const [errors,  setErrors]  = useState({ employees: null,  departments: null,  attendance: null,  payroll: null  });

  const fetching = useRef({ employees: false, departments: false, attendance: false, payroll: false });

  const load = useCallback(async (key, url, transform = (d) => d) => {
    if (fetching.current[key]) return;
    fetching.current[key] = true;
    setLoading((l) => ({ ...l, [key]: true }));
    setErrors((e)  => ({ ...e, [key]: null  }));
    const setterMap = { employees: setEmployees, departments: setDepartments, attendance: setAttendance, payroll: setPayroll };
    try {
      const res  = await apiFetch(`${API}${url}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.results || [];
      setterMap[key](transform(list));
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err.message || "Failed to load" }));
    } finally {
      fetching.current[key] = false;
      setLoading((l) => ({ ...l, [key]: false }));
    }
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    load("employees",   "/employees/");
    load("departments", "/employees/departments/");
    load("attendance",  `/attendance/?date=${today}`);
  }, [load, today]);

  // ── Fetch FULL employee detail + payroll from dedicated endpoints ──────────
  const fetchEmployeeDetail = useCallback(async (empId) => {
    try {
      // Fetch full employee (EmployeeSerializer — has ALL fields including NOK, DOB, address, docs…)
      const empRes = await apiFetch(`${API}/employees/${empId}/`);
      if (!empRes.ok) throw new Error(`Employee fetch failed: ${empRes.status}`);
      const empData = await empRes.json();

      // Fetch payroll list and find this employee's record
      let payrollRecord = null;
      try {
        const prRes = await apiFetch(`${API}/payroll/`);
        if (prRes.ok) {
          const prData = await prRes.json();
          const records = Array.isArray(prData) ? prData : prData.results || [];
          payrollRecord = records.find((p) => p.employee === empId) || null;
        }
      } catch (_) { /* payroll not critical */ }

      if (payrollRecord) {
        return {
          ...empData,
          bank_name_usd:    payrollRecord.bank_name_usd    || empData.bank_name_usd    || null,
          bank_account_usd: payrollRecord.bank_account_usd || empData.bank_account_usd || null,
          bank_name_zig:    payrollRecord.bank_name_zig    || empData.bank_name_zig    || null,
          bank_account_zig: payrollRecord.bank_account_zig || empData.bank_account_zig || null,
          basic_salary: payrollRecord.basic_salary || empData.basic_salary || null,
          allowances:   payrollRecord.allowances,
          deductions:   payrollRecord.deductions,
          net_salary:   payrollRecord.net_salary,
          currency:     payrollRecord.currency || "USD",
          payroll_months_saved: payrollRecord.id ? 1 : 0,
        };
      }
      return empData;
    } catch (err) {
      console.error("fetchEmployeeDetail:", err);
      return null;
    }
  }, []);

  const refetchEmployees   = useCallback(() => { setEmployees(null);   fetching.current.employees   = false; load("employees",   "/employees/");   }, [load]);
  const refetchDepartments = useCallback(() => { setDepartments(null); fetching.current.departments = false; load("departments", "/employees/departments/"); }, [load]);
  const refetchAttendance  = useCallback((date = today) => { setAttendance(null); fetching.current.attendance = false; load("attendance", `/attendance/?date=${date}`); }, [load, today]);
  const refetchPayroll     = useCallback(() => { setPayroll(null);     fetching.current.payroll     = false; load("payroll",     "/payroll/");     }, [load]);

  const addEmployee    = useCallback((emp) => setEmployees((prev) => (prev ? [emp, ...prev] : [emp])), []);
  const updateEmployee = useCallback((emp) => setEmployees((prev) => prev ? prev.map((e) => e.id === emp.id ? { ...e, ...emp } : e) : prev), []);
  const removeEmployee = useCallback((id)  => setEmployees((prev) => prev ? prev.filter((e) => e.id !== id) : prev), []);

  const stats = employees && departments && attendance ? computeStats(employees, departments, attendance) : null;

  const isHRM = user?.role === "HRM";
  const isHR  = user?.role === "HR";

  const value = {
    user, isHRM, isHR,
    employees, departments, attendance, payroll,
    loading, errors,
    refetchEmployees, refetchDepartments, refetchAttendance, refetchPayroll,
    fetchEmployeeDetail,
    addEmployee, updateEmployee, removeEmployee,
    stats, today,
  };

  return <HRPortalContext.Provider value={value}>{children}</HRPortalContext.Provider>;
}

export function useHRPortal() {
  const ctx = useContext(HRPortalContext);
  if (!ctx) throw new Error("useHRPortal must be used inside <HRPortalProvider>");
  return ctx;
}

function computeStats(employees, departments, todayAttendance) {
  const employed   = employees.filter((e) => e.status === "employed").length;
  const terminated = employees.filter((e) => e.status === "terminated").length;
  const onLeave    = employees.filter((e) => e.status === "on_leave").length;
  const male   = employees.filter((e) => e.gender === "M").length;
  const female = employees.filter((e) => e.gender === "F").length;
  const other  = employees.filter((e) => e.gender === "O").length;
  const fullTime = employees.filter((e) => e.employment_type === "full_time").length;
  const partTime = employees.filter((e) => e.employment_type === "part_time").length;
  const contract = employees.filter((e) => e.employment_type === "contract").length;
  const presentStatuses = ["present", "late", "half_day"];
  const presentToday = todayAttendance.filter((a) => presentStatuses.includes(a.status)).length;
  const absentToday  = todayAttendance.filter((a) => a.status === "absent").length;
  const byDept = {};
  employees.forEach((e) => { const d = e.department_name || "Unknown"; byDept[d] = (byDept[d] || 0) + 1; });
  const byDeptArray = Object.entries(byDept).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  const monthlyJoins = buildMonthlyJoinTrend(employees, 6);
  return {
    total: employees.length, employed, terminated, onLeave, totalDepts: departments.length,
    male, female, other, fullTime, partTime, contract,
    presentToday, absentToday,
    notMarkedToday: employed - todayAttendance.filter((a) => a.status !== null).length,
    byDept: byDeptArray, monthlyJoins,
  };
}

function buildMonthlyJoinTrend(employees, monthsBack) {
  const now = new Date();
  const result = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear(), mo = d.getMonth();
    const label = d.toLocaleString("default", { month: "short" });
    const count = employees.filter((e) => {
      if (!e.date_joined) return false;
      // Parse as local date (split string) to avoid UTC midnight shifting month
      const [jYr, jMo] = String(e.date_joined).split("-").map(Number);
      return jYr === yr && (jMo - 1) === mo;
    }).length;
    result.push({ label, count, year: yr, month: mo + 1 });
  }
  return result;
}