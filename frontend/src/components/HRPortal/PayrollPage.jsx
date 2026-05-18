// src/components/HRPortal/PayrollPage.jsx
//
// HR Payroll Page — Monthly payroll management
// Features:
//  - Month navigation (current month shown with prev/next arrows)
//  - Stat cards at top (total payable, employees, avg attendance, etc.)
//  - Search bar + department/type/status filters
//  - Currency switcher: USD ↔ ZIG with custom rate input
//  - Table: Full Name, Job Title, Department, Net Salary (attendance-based),
//           Deduction (editable, saved), Bonus (editable, saved)
//  - Download (CSV / PDF)
//  - Uses HRPortalContext for employees + departments (no duplicate DB calls)
//  - localStorage for deduction/bonus persistence per employee per month

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { apiFetch } from "../../utils/auth";
import { useHRPortal } from "../../context/HRPortalContext";

const API = "http://127.0.0.1:8000/api";

// ── Zimbabwe Public Holidays (same logic as EmployeesPage) ────────────────────
const ZW_PUBLIC_HOLIDAYS_RECURRING = [
  "01-01", "02-21", "04-18", "05-01", "05-25",
  "08-11", "08-12", "12-22", "12-25", "12-26",
];

function getZwPublicHolidays(year, month) {
  const holidays = new Set();
  for (const mmdd of ZW_PUBLIC_HOLIDAYS_RECURRING) {
    const [m, d] = mmdd.split("-").map(Number);
    if (m - 1 === month) {
      const dt = new Date(year, month, d);
      const dow = dt.getDay();
      if (dow !== 0 && dow !== 6) {
        holidays.add(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      }
    }
  }
  // Easter calculation
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d2 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d2 - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m2 = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m2 + 114) / 31) - 1;
  const easterDay = ((h + l - 7 * m2 + 114) % 31) + 1;
  const goodFriday = new Date(year, easterMonth, easterDay - 2);
  if (goodFriday.getMonth() === month) {
    holidays.add(`${year}-${String(goodFriday.getMonth() + 1).padStart(2, "0")}-${String(goodFriday.getDate()).padStart(2, "0")}`);
  }
  const easterMonday = new Date(year, easterMonth, easterDay + 1);
  if (easterMonday.getMonth() === month) {
    holidays.add(`${year}-${String(easterMonday.getMonth() + 1).padStart(2, "0")}-${String(easterMonday.getDate()).padStart(2, "0")}`);
  }
  return holidays;
}

function getWorkingDaysInMonth(year, month) {
  const holidays = getZwPublicHolidays(year, month);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (holidays.has(key)) continue;
    count++;
  }
  return count;
}

function isWorkingDay(dateStr) {
  const dt = new Date(dateStr);
  const dow = dt.getDay();
  if (dow === 0 || dow === 6) return false;
  const year = dt.getFullYear(), month = dt.getMonth();
  const holidays = getZwPublicHolidays(year, month);
  return !holidays.has(dateStr);
}

// ── Storage helpers ───────────────────────────────────────────────────────────
function getStorageKey(empId, year, month) {
  return `payroll_${empId}_${year}_${String(month + 1).padStart(2, "0")}`;
}

function loadPayrollEntry(empId, year, month) {
  try {
    const key = getStorageKey(empId, year, month);
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : { deduction: "", bonus: "" };
  } catch {
    return { deduction: "", bonus: "" };
  }
}

function savePayrollEntry(empId, year, month, data) {
  try {
    const key = getStorageKey(empId, year, month);
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtAmount(amount, currency, zigRate) {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  const num = Number(amount);
  if (currency === "ZIG") {
    const zig = num * (parseFloat(zigRate) || 1);
    return `ZiG ${zig.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtUSD(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Shared input style (matching EmployeesPage design system) ─────────────────
const inputStyle = {
  width: "100%", padding: "10px 13px",
  border: "1.5px solid #e2e8f0", borderRadius: 9,
  fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
  color: "#0f172a", background: "#fafbff", outline: "none",
  boxSizing: "border-box",
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, accent = "#1557b0", bg = "#eff6ff" }) {
  return (
    <div
      style={{
        background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
        borderLeft: `4px solid ${accent}`,
        padding: "18px 20px", display: "flex", alignItems: "center", gap: 14,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)", flex: "1 1 160px", minWidth: 150,
        transition: "box-shadow 0.2s, transform 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 6px 24px ${accent}22`; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2, fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0a2a5e", lineHeight: 1, fontFamily: "'Playfair Display',serif" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function EmpAvatar({ name, size = 34, photo = null }) {
  const initials = (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.27),
      background: "linear-gradient(135deg,#0e3d82,#1a6fd4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.34, fontWeight: 700, color: "#fff",
      flexShrink: 0, overflow: "hidden",
    }}>
      {photo
        ? <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
        : <span style={{ fontFamily: "'DM Sans',sans-serif" }}>{initials}</span>
      }
    </div>
  );
}

// ── Editable inline cell ──────────────────────────────────────────────────────
function EditableCell({ value, onChange, onBlur, placeholder = "0.00", prefix = "$" }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const inputRef = useRef();

  useEffect(() => { setLocal(value); }, [value]);

  const commit = () => {
    setEditing(false);
    onChange(local);
    onBlur && onBlur(local);
  };

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>{prefix}</span>
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.01"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setLocal(value); } }}
          style={{
            width: 80, padding: "4px 7px",
            border: "1.5px solid #1557b0", borderRadius: 7,
            fontSize: 12.5, fontFamily: "'DM Sans',sans-serif",
            outline: "none", background: "#fff", color: "#0f172a",
            boxShadow: "0 0 0 3px rgba(21,87,176,0.1)",
          }}
          autoFocus
        />
      </div>
    );
  }

  const numVal = parseFloat(local);
  const hasValue = !isNaN(numVal) && numVal > 0;

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        cursor: "pointer", borderRadius: 7,
        padding: "4px 8px",
        border: `1.5px dashed ${hasValue ? "#e2e8f0" : "#e2e8f0"}`,
        background: hasValue ? "#fff" : "#fafbff",
        transition: "border-color 0.15s, background 0.15s",
        minWidth: 70,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.background = "#eff6ff"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = hasValue ? "#e2e8f0" : "#e2e8f0"; e.currentTarget.style.background = hasValue ? "#fff" : "#fafbff"; }}
    >
      {hasValue ? (
        <span style={{ fontSize: 12.5, fontFamily: "monospace", color: "#0f172a", fontWeight: 600 }}>
          {prefix}{numVal.toFixed(2)}
        </span>
      ) : (
        <span style={{ fontSize: 11.5, color: "#cbd5e1", fontFamily: "'DM Sans',sans-serif", fontStyle: "italic" }}>
          {placeholder}
        </span>
      )}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </div>
  );
}

// ── Attendance bar ─────────────────────────────────────────────────────────────
function AttBar({ attended, total }) {
  if (!total) return <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>;
  const pct = Math.min(100, (attended / total) * 100);
  const color = pct >= 90 ? "#16a34a" : pct >= 70 ? "#f59e0b" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 100 }}>
      <div style={{ flex: 1, height: 5, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.6s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>
        {attended}/{total}
      </span>
    </div>
  );
}

// ── Currency rate modal ───────────────────────────────────────────────────────
function ZigRateModal({ currentRate, onClose, onSave }) {
  const [rate, setRate] = useState(currentRate || "");

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,26,80,0.52)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 400, boxShadow: "0 28px 72px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(135deg,#0a2a5e,#1557b0)", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>Set ZiG Exchange Rate</span>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, fontFamily: "'DM Sans',sans-serif" }}>1 USD = ? ZiG</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#92400e", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.55 }}>
              <strong>Note:</strong> The ZiG exchange rate fluctuates daily. Enter today's rate to convert employee salaries from USD to ZiG. This rate is not stored permanently and must be re-entered each session.
            </div>
          </div>
          <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#64748b", marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>
            Exchange Rate (1 USD = ___ ZiG)
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontWeight: 700, color: "#1557b0", pointerEvents: "none", fontFamily: "'DM Sans',sans-serif" }}>
              1 USD =
            </span>
            <input
              style={{ ...inputStyle, paddingLeft: 68 }}
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder="e.g. 30.23"
              autoFocus
              onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
              onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
              onKeyDown={e => { if (e.key === "Enter" && rate && parseFloat(rate) > 0) { onSave(rate); onClose(); } }}
            />
            <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontWeight: 700, color: "#64748b", pointerEvents: "none", fontFamily: "'DM Sans',sans-serif" }}>
              ZiG
            </span>
          </div>
          {rate && parseFloat(rate) > 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 9 }}>
              <div style={{ fontSize: 12, color: "#0891b2", fontFamily: "'DM Sans',sans-serif" }}>
                Preview: <strong>$400 USD</strong> → <strong>ZiG {(400 * parseFloat(rate)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
            <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#0f172a", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
            <button
              onClick={() => { if (rate && parseFloat(rate) > 0) { onSave(rate); onClose(); } }}
              disabled={!rate || parseFloat(rate) <= 0}
              style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: (!rate || parseFloat(rate) <= 0) ? "not-allowed" : "pointer", opacity: (!rate || parseFloat(rate) <= 0) ? 0.5 : 1 }}
            >
              Apply Rate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Download helpers ──────────────────────────────────────────────────────────
function downloadCSV(rows, filename, currency, zigRate) {
  const currLabel = currency === "ZIG" ? "ZiG" : "USD";
  const headers = ["Full Name", "Job Title", "Department", "Days Attended", "Working Days", `Base Salary (${currLabel})`, `Net Salary (${currLabel})`, `Deduction (${currLabel})`, `Bonus (${currLabel})`, `Final Pay (${currLabel})`];
  const lines = [headers.join(","), ...rows.map(r =>
    [
      `"${r.fullName}"`,
      `"${r.jobTitle}"`,
      `"${r.dept}"`,
      r.daysAttended,
      r.workingDays,
      r.baseSalary.toFixed(2),
      r.netSalary.toFixed(2),
      r.deduction.toFixed(2),
      r.bonus.toFixed(2),
      r.finalPay.toFixed(2),
    ].join(",")
  )];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadPDF(rows, monthLabel, currency, zigRate) {
  const currSymbol = currency === "ZIG" ? "ZiG " : "$";
  const rate = parseFloat(zigRate) || 1;
  const conv = (v) => currency === "ZIG" ? v * rate : v;
  const fmtN = (v) => `${currSymbol}${conv(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const html = `
    <html><head><title>Payroll Report — ${monthLabel}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #0f172a; }
      h1 { font-size: 18px; color: #0a2a5e; margin-bottom: 4px; }
      .sub { color: #64748b; font-size: 11px; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #0e3d82; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
      tr:nth-child(even) td { background: #f8faff; }
      .money { text-align: right; font-family: monospace; }
      .final { font-weight: bold; color: #059669; }
    </style></head>
    <body>
      <h1>Payroll Report</h1>
      <div class="sub">Month: ${monthLabel} &nbsp;|&nbsp; Currency: ${currency === "ZIG" ? `ZiG (1 USD = ${rate} ZiG)` : "USD"} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString("en-GB")}</div>
      <table>
        <thead><tr>
          <th>Full Name</th><th>Job Title</th><th>Dept</th>
          <th>Attendance</th><th>Base Salary</th>
          <th class="money">Net Salary</th><th class="money">Deduction</th>
          <th class="money">Bonus</th><th class="money">Final Pay</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td>${r.fullName}</td><td>${r.jobTitle}</td><td>${r.dept}</td>
            <td>${r.daysAttended}/${r.workingDays} days</td>
            <td class="money">${fmtN(r.baseSalaryUSD)}</td>
            <td class="money">${fmtN(r.netSalaryUSD)}</td>
            <td class="money">${fmtN(r.deductionUSD)}</td>
            <td class="money">${fmtN(r.bonusUSD)}</td>
            <td class="money final">${fmtN(r.finalPayUSD)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </body></html>
  `;
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HRPayrollPage({ showToast }) {
  // ── Context data ──────────────────────────────────────────────────────────
  const {
    employees: ctxEmployees,
    departments: ctxDepartments,
    loading: ctxLoading,
  } = useHRPortal();

  // ── Month navigation ──────────────────────────────────────────────────────
  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });

  const goBack = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else { setViewMonth(m => m - 1); }
  };
  const goForward = () => {
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear  = viewMonth === 11 ? viewYear + 1 : viewYear;
    const now2 = new Date();
    if (nextYear > now2.getFullYear() || (nextYear === now2.getFullYear() && nextMonth > now2.getMonth())) return;
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };
  const isAtLatest = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  // ── Currency state ────────────────────────────────────────────────────────
  const [currency, setCurrency] = useState("USD");
  const [zigRate,  setZigRate]  = useState("");
  const [showZigModal, setShowZigModal] = useState(false);

  const handleCurrencyChange = (val) => {
    if (val === "ZIG" && !zigRate) {
      setShowZigModal(true);
    }
    setCurrency(val);
  };

  // ── Data: payroll + attendance ────────────────────────────────────────────
  const [payrolls,      setPayrolls]      = useState([]);
  const [attendanceAll, setAttendanceAll] = useState([]);
  const [payrollLoading, setPayrollLoading] = useState(true);

  const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
  const lastDay    = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthEnd   = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  useEffect(() => {
    let cancelled = false;
    setPayrollLoading(true);
    // Immediately zero out attendance so stale data never shows for the wrong month
    setAttendanceAll([]);

    const run = async () => {
      try {
        const [prRes, attRes] = await Promise.all([
          apiFetch(`${API}/payroll/`),
          apiFetch(`${API}/attendance/?date_after=${monthStart}&date_before=${monthEnd}&page_size=5000`),
        ]);
        if (cancelled) return;
        const [prData, attData] = await Promise.all([
          prRes.ok  ? prRes.json()  : [],
          attRes.ok ? attRes.json() : [],
        ]);
        if (cancelled) return;
        setPayrolls(Array.isArray(prData)  ? prData  : prData.results  || []);
        setAttendanceAll(Array.isArray(attData) ? attData : attData.results || []);
      } catch (e) {
        if (!cancelled) console.error("PayrollPage fetchData:", e);
      } finally {
        if (!cancelled) setPayrollLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [monthStart, monthEnd]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState("");
  const [deptFilter,   setDeptFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const dlRef = useRef();

  useEffect(() => {
    const fn = e => { if (dlRef.current && !dlRef.current.contains(e.target)) setDownloadOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // ── Per-employee editable payroll data (deduction + bonus) ────────────────
  // Keyed by empId → { deduction: string, bonus: string }
  const [payrollEdits, setPayrollEdits] = useState({});

  // Load from localStorage when month/employees change
  useEffect(() => {
    if (!ctxEmployees) return;
    const loaded = {};
    ctxEmployees.forEach(emp => {
      loaded[emp.id] = loadPayrollEntry(emp.id, viewYear, viewMonth);
    });
    setPayrollEdits(loaded);
  }, [ctxEmployees, viewYear, viewMonth]);

  const updateEdit = useCallback((empId, field, value) => {
    setPayrollEdits(prev => {
      const updated = { ...prev, [empId]: { ...(prev[empId] || {}), [field]: value } };
      savePayrollEntry(empId, viewYear, viewMonth, updated[empId]);
      return updated;
    });
  }, [viewYear, viewMonth]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const departments = ctxDepartments || [];
  const workingDays = getWorkingDaysInMonth(viewYear, viewMonth);

  const payrollMap = useMemo(() => {
    const m = {};
    payrolls.forEach(p => { m[p.employee] = parseFloat(p.basic_salary) || 0; });
    return m;
  }, [payrolls]);

  const attendanceMap = useMemo(() => {
    const m = {};
    attendanceAll.forEach(rec => {
      if (rec.status !== "present" && rec.status !== "late" && rec.status !== "half_day") return;
      if (!isWorkingDay(rec.date)) return;
      // Guard: only count records that belong to the currently viewed month
      const recDate = new Date(rec.date);
      if (recDate.getFullYear() !== viewYear || recDate.getMonth() !== viewMonth) return;
      const empId = typeof rec.employee === "object" ? rec.employee.id : rec.employee;
      m[empId] = (m[empId] || 0) + (rec.status === "half_day" ? 0.5 : 1);
    });
    return m;
  }, [attendanceAll, viewYear, viewMonth]);

  const enriched = useMemo(() => {
    if (!ctxEmployees) return [];
    return ctxEmployees.map(emp => {
      const monthlySalary = payrollMap[emp.id] || 0;
      const dailyRate     = workingDays > 0 ? monthlySalary / workingDays : 0;
      const daysAttended  = attendanceMap[emp.id] || 0;
      const netSalary     = dailyRate * daysAttended;
      const edits         = payrollEdits[emp.id] || {};
      const deduction     = parseFloat(edits.deduction) || 0;
      const bonus         = parseFloat(edits.bonus) || 0;
      const finalPay      = Math.max(0, netSalary - deduction + bonus);
      const fullName      = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
      const deptName      = emp.department_name || departments.find(d => d.id === emp.department)?.name || "—";
      return {
        ...emp, fullName, deptName,
        monthlySalary, dailyRate, daysAttended,
        netSalary, deduction, bonus, finalPay,
        deductionStr: edits.deduction || "",
        bonusStr:     edits.bonus || "",
      };
    });
  }, [ctxEmployees, payrollMap, attendanceMap, workingDays, departments, payrollEdits]);

  const filtered = useMemo(() => {
    return enriched.filter(e => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        e.fullName.toLowerCase().includes(q) ||
        (e.job_title || "").toLowerCase().includes(q) ||
        e.deptName.toLowerCase().includes(q);
      const matchDept = deptFilter === "all" ||
        String(e.department) === deptFilter ||
        (e.department_name || "").toLowerCase() === deptFilter.toLowerCase();
      const matchStatus = statusFilter === "all" || e.status === statusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [enriched, search, deptFilter, statusFilter]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalNetPayable = filtered.reduce((s, e) => s + e.finalPay, 0);
  const totalDeductions = filtered.reduce((s, e) => s + e.deduction, 0);
  const totalBonuses    = filtered.reduce((s, e) => s + e.bonus, 0);
  const avgAttendance   = enriched.length > 0
    ? Math.round(enriched.reduce((s, e) => s + e.daysAttended, 0) / enriched.length * 10) / 10
    : 0;

  // ── Download rows ─────────────────────────────────────────────────────────
  const tableRows = filtered.map(e => ({
    fullName: e.fullName,
    jobTitle: e.job_title || "—",
    dept: e.deptName,
    daysAttended: e.daysAttended,
    workingDays,
    baseSalary: currency === "ZIG" ? e.monthlySalary * (parseFloat(zigRate) || 1) : e.monthlySalary,
    netSalary:  currency === "ZIG" ? e.netSalary  * (parseFloat(zigRate) || 1) : e.netSalary,
    deduction:  currency === "ZIG" ? e.deduction  * (parseFloat(zigRate) || 1) : e.deduction,
    bonus:      currency === "ZIG" ? e.bonus       * (parseFloat(zigRate) || 1) : e.bonus,
    finalPay:   currency === "ZIG" ? e.finalPay   * (parseFloat(zigRate) || 1) : e.finalPay,
    // Raw USD for PDF template
    baseSalaryUSD: e.monthlySalary,
    netSalaryUSD:  e.netSalary,
    deductionUSD:  e.deduction,
    bonusUSD:      e.bonus,
    finalPayUSD:   e.finalPay,
  }));

  const loading = ctxLoading?.employees || payrollLoading || !ctxEmployees;

  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, animation: "fadeInUp 0.3s ease" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif" }}>
              Payroll
            </h1>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>{today}</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>

            {/* ── Currency switcher ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", fontFamily: "'DM Sans',sans-serif" }}>Currency</span>
              <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                {["USD", "ZIG"].map(curr => (
                  <button
                    key={curr}
                    onClick={() => handleCurrencyChange(curr)}
                    style={{
                      padding: "5px 12px", border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                      background: currency === curr ? "linear-gradient(135deg,#0a2a5e,#1557b0)" : "#fafbff",
                      color: currency === curr ? "#fff" : "#64748b",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {curr}
                  </button>
                ))}
              </div>
              {currency === "ZIG" && (
                <button
                  onClick={() => setShowZigModal(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 7,
                    border: `1.5px solid ${zigRate ? "#1557b0" : "#f59e0b"}`,
                    background: zigRate ? "#eff6ff" : "#fff7ed",
                    color: zigRate ? "#1557b0" : "#92400e",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  {zigRate ? `1 USD = ${parseFloat(zigRate).toFixed(2)} ZiG` : "Set Rate"}
                </button>
              )}
            </div>

            {/* ── Download ── */}
            <div style={{ position: "relative" }} ref={dlRef}>
              <button
                onClick={() => setDownloadOpen(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 16px", borderRadius: 10,
                  border: "1.5px solid #e2e8f0", background: "#fff",
                  fontSize: 13, fontWeight: 600, color: "#475569",
                  fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.color = "#1557b0"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#475569"; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {downloadOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0,
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.1)", minWidth: 190,
                  overflow: "hidden", zIndex: 200,
                }}>
                  {[
                    { label: "Download as CSV", icon: "📊", action: () => { downloadCSV(tableRows, `payroll-${monthLabel.replace(/ /g, "-")}.csv`, currency, zigRate); setDownloadOpen(false); } },
                    { label: "Download as PDF", icon: "📄", action: () => { downloadPDF(tableRows, monthLabel, currency, zigRate); setDownloadOpen(false); } },
                  ].map(item => (
                    <button key={item.label} onClick={item.action} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 16px", fontSize: 13, color: "#0f172a",
                      cursor: "pointer", border: "none", background: "none",
                      width: "100%", textAlign: "left", fontFamily: "'DM Sans',sans-serif",
                      transition: "background 0.1s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8faff"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <span style={{ fontSize: 16 }}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Month navigator ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 16,
        }}>
          <button
            onClick={goBack}
            style={{
              width: 36, height: 36, borderRadius: 9,
              border: "1.5px solid #e2e8f0", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#64748b",
              transition: "border-color 0.15s, color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.color = "#1557b0"; e.currentTarget.style.background = "#eff6ff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; e.currentTarget.style.background = "#fff"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: "#0a2a5e" }}>
              {monthLabel}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
              {workingDays} working days · excl. weekends & ZW holidays
              {isCurrentMonth && (
                <span style={{ marginLeft: 6, background: "#dcfce7", color: "#166534", borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>
                  Current Month
                </span>
              )}
            </div>
          </div>

          <button
            onClick={goForward}
            disabled={isAtLatest}
            style={{
              width: 36, height: 36, borderRadius: 9,
              border: "1.5px solid #e2e8f0", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: isAtLatest ? "not-allowed" : "pointer",
              color: isAtLatest ? "#cbd5e1" : "#64748b",
              opacity: isAtLatest ? 0.5 : 1,
              transition: "border-color 0.15s, color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => { if (!isAtLatest) { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.color = "#1557b0"; e.currentTarget.style.background = "#eff6ff"; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = isAtLatest ? "#cbd5e1" : "#64748b"; e.currentTarget.style.background = "#fff"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {/* ── ZIG warning if currency selected but no rate ── */}
        {currency === "ZIG" && !zigRate && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#fff7ed", border: "1px solid #fed7aa",
            borderLeft: "4px solid #f59e0b", borderRadius: 12, padding: "14px 18px",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e", fontFamily: "'DM Sans',sans-serif" }}>ZiG Exchange Rate Not Set</div>
              <div style={{ fontSize: 12, color: "#b45309", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>Salary values are showing in USD. Please set the ZiG rate to see converted values.</div>
            </div>
            <button
              onClick={() => setShowZigModal(true)}
              style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#d97706,#f59e0b)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}
            >
              Set Rate Now
            </button>
          </div>
        )}

        {/* ── Stat cards ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <StatCard
            label="Total Final Payable"
            value={fmtAmount(totalNetPayable, currency, zigRate)}
            sub={`${filtered.length} employees`}
            accent="#7c3aed" bg="#f5f3ff"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>}
          />
          <StatCard
            label="Total Deductions"
            value={fmtAmount(totalDeductions, currency, zigRate)}
            sub="This month"
            accent="#dc2626" bg="#fef2f2"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>}
          />
          <StatCard
            label="Total Bonuses"
            value={fmtAmount(totalBonuses, currency, zigRate)}
            sub="This month"
            accent="#059669" bg="#f0fdf4"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.8" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
          />
        </div>

        {/* ── Main table card ── */}
        <div style={{
          background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden",
        }}>
          {/* Filters */}
          <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {/* Search */}
            <div style={{ position: "relative", flex: "1 1 220px" }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text" placeholder="Search by name, job title or department…"
                value={search} onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 30px",
                  border: "1.5px solid #e2e8f0", borderRadius: 9,
                  fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155",
                  outline: "none", background: "#fafbff",
                }}
                onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
                onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Department filter */}
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer", flex: "0 1 170px" }}>
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
            </select>

            {/* Status filter */}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer", flex: "0 1 150px" }}>
              <option value="all">All Statuses</option>
              <option value="employed">Employed</option>
              <option value="retired">Retired</option>
              <option value="suspended">Suspended</option>
              <option value="dismissed">Dismissed</option>
              <option value="resigned">Resigned</option>
            </select>

            {/* Count */}
            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", padding: "0 4px" }}>
              {filtered.length} of {ctxEmployees?.length ?? 0} employees
            </div>
          </div>

          {/* Info bar */}
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, background: "#fafbff" }}>
            <div style={{ fontSize: 12, color: "#1557b0", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
              📅 {monthLabel} — {workingDays} working days
              {currency === "ZIG" && zigRate && (
                <span style={{ marginLeft: 10, color: "#b45309", background: "#fff7ed", borderRadius: 20, padding: "2px 8px", fontSize: 11 }}>
                  1 USD = {parseFloat(zigRate).toFixed(2)} ZiG
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
              Click a Deduction or Bonus cell to edit — saved automatically
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fafbff", borderBottom: "1.5px solid #e2e8f0" }}>
                  {[
                    "Employee",
                    "Job Title",
                    "Attendance",
                    `Base Salary (${currency})`,
                    `Net Salary (${currency})`,
                    `Deduction (${currency})`,
                    `Bonus (${currency})`,
                    `Final Pay (${currency})`,
                  ].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left",
                      fontSize: 10, fontWeight: 700, color: "#64748b",
                      letterSpacing: "0.8px", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ padding: "48px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#94a3b8", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                      <div style={{ width: 22, height: 22, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      Loading payroll data…
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                    No employees match your filters.
                  </td></tr>
                ) : filtered.map((emp, i) => {
                  const zigR = parseFloat(zigRate) || 1;
                  const conv = (v) => currency === "ZIG" ? v * zigR : v;
                  const symb = currency === "ZIG" ? "ZiG " : "$";
                  const fmtV = (v) => `${symb}${conv(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                  // Deduction value for display (USD base, shown in selected currency)
                  const deductionDisplay = conv(emp.deduction);
                  const bonusDisplay     = conv(emp.bonus);
                  const finalPayDisplay  = conv(emp.finalPay);

                  const payColor = emp.finalPay > 0 ? "#166534" : "#94a3b8";

                  return (
                    <tr key={emp.id}
                      style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafcff", transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafcff"}
                    >
                      {/* Employee */}
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600, color: "#0a2a5e", fontSize: 13 }}>{emp.fullName}</div>
                        {emp.employee_number && <div style={{ fontSize: 10.5, color: "#94a3b8" }}>#{emp.employee_number}</div>}
                      </td>

                      {/* Job Title */}
                      <td style={{ padding: "11px 14px", color: "#334155", fontWeight: 500, fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {emp.job_title || emp.position || "—"}
                      </td>

                      {/* Attendance */}
                      <td style={{ padding: "11px 14px", minWidth: 130 }}>
                        <AttBar attended={emp.daysAttended} total={workingDays} />
                      </td>

                      {/* Base Salary */}
                      <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 12.5, color: emp.monthlySalary > 0 ? "#0f172a" : "#cbd5e1", whiteSpace: "nowrap" }}>
                        {emp.monthlySalary > 0 ? fmtV(emp.monthlySalary) : <span style={{ color: "#cbd5e1", fontFamily: "'DM Sans',sans-serif" }}>Not set</span>}
                      </td>

                      {/* Net Salary (attendance-based) */}
                      <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 12.5, color: emp.netSalary > 0 ? "#0f172a" : "#cbd5e1", whiteSpace: "nowrap" }}>
                        {emp.netSalary > 0 ? fmtV(emp.netSalary) : "—"}
                        {emp.netSalary > 0 && emp.monthlySalary > 0 && (
                          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginTop: 1, textAlign: "right" }}>
                            {Math.round((emp.daysAttended / workingDays) * 100)}% of base
                          </div>
                        )}
                      </td>

                      {/* Deduction (editable) */}
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <EditableCell
                            value={emp.deductionStr}
                            onChange={val => updateEdit(emp.id, "deduction", val)}
                            placeholder="Add deduction"
                            prefix="$"
                          />
                        </div>
                        {emp.deduction > 0 && currency === "ZIG" && zigRate && (
                          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginTop: 2, textAlign: "right" }}>
                            = ZiG {deductionDisplay.toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* Bonus (editable) */}
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <EditableCell
                            value={emp.bonusStr}
                            onChange={val => updateEdit(emp.id, "bonus", val)}
                            placeholder="Add bonus"
                            prefix="$"
                          />
                        </div>
                        {emp.bonus > 0 && currency === "ZIG" && zigRate && (
                          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginTop: 2, textAlign: "right" }}>
                            = ZiG {bonusDisplay.toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* Final Pay */}
                      <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: payColor }}>
                          {emp.finalPay > 0
                            ? fmtV(emp.finalPay)
                            : <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 400, color: "#cbd5e1" }}>—</span>
                          }
                        </div>
                        {emp.deduction > 0 && (
                          <div style={{ fontSize: 10, color: "#dc2626", fontFamily: "'DM Sans',sans-serif", marginTop: 1 }}>
                            -{fmtUSD(emp.deduction)} deducted
                          </div>
                        )}
                        {emp.bonus > 0 && (
                          <div style={{ fontSize: 10, color: "#059669", fontFamily: "'DM Sans',sans-serif", marginTop: 1 }}>
                            +{fmtUSD(emp.bonus)} bonus
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer totals */}
              {!loading && filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: "linear-gradient(135deg,#f8faff,#eff6ff)", borderTop: "2px solid #e2e8f0" }}>
                    <td colSpan={2} style={{ padding: "12px 14px", fontWeight: 700, fontSize: 12, color: "#0a2a5e", fontFamily: "'DM Sans',sans-serif" }}>
                      Totals ({filtered.length} employees)
                    </td>
                    {/* Attendance col — blank */}
                    <td style={{ padding: "12px 14px" }} />
                    {/* Base salary total */}
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "#0a2a5e" }}>
                      {fmtAmount(filtered.reduce((s, e) => s + e.monthlySalary, 0), currency, zigRate)}
                    </td>
                    {/* Net salary total */}
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "#0a2a5e" }}>
                      {fmtAmount(filtered.reduce((s, e) => s + e.netSalary, 0), currency, zigRate)}
                    </td>
                    {/* Deduction total */}
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#dc2626" }}>
                        {totalDeductions > 0 ? fmtAmount(totalDeductions, currency, zigRate) : "—"}
                      </span>
                    </td>
                    {/* Bonus total */}
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#059669" }}>
                        {totalBonuses > 0 ? fmtAmount(totalBonuses, currency, zigRate) : "—"}
                      </span>
                    </td>
                    {/* Final pay total */}
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#059669" }}>
                        {fmtAmount(totalNetPayable, currency, zigRate)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* ZIG rate modal */}
      {showZigModal && (
        <ZigRateModal
          currentRate={zigRate}
          onClose={() => {
            setShowZigModal(false);
            if (!zigRate) setCurrency("USD"); // revert if no rate set
          }}
          onSave={rate => {
            setZigRate(rate);
            setCurrency("ZIG");
          }}
        />
      )}
    </>
  );
}