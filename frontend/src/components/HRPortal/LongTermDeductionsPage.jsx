// src/components/HRPortal/LongTermDeductionsPage.jsx
//
// HR Portal — Loans & Advances / Bonuses
//
// Two tabs:
//  - "Loans & Advances": long-term deduction plans (repaid over several
//    months, unchanged from before) PLUS one-off deductions added straight
//    on the Payroll page for a single month — shown here for visibility,
//    tagged "One-off" instead of a start→end range.
//  - "Bonuses": every bonus added on the Payroll page, across months, with
//    an "Add Bonus" button so HR can add one from here too. Either way it's
//    the same PayrollAdjustment record the Payroll page reads/writes, so it
//    shows up on Payroll and Payslips exactly the same regardless of where
//    it was added.

import { useState, useEffect, useMemo, useRef } from "react";
import { apiFetch } from "../../utils/auth";
import { useHRPortal } from "../../context/HRPortalContext";

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;

const T = {
  navy:  "#0a2a5e",
  blue:  "#1557b0",
  ink:   "#1a2233",
  muted: "#5b6472",
  line:  "#e2e8f0",
  bg:    "#f7f9fc",
  red:   "#dc2626",
  amber: "#d97706",
  green: "#059669",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_STYLE = {
  active:    { bg: "#eff6ff", color: T.blue,  label: "Active" },
  completed: { bg: "#ecfdf5", color: T.green, label: "Completed" },
  cancelled: { bg: "#f1f5f9", color: "#64748b", label: "Cancelled" },
};
const ONE_OFF_STYLE = { bg: "#fff7ed", color: T.amber, label: "One-off" };

function fmtUSD(n) {
  const num = Number(n);
  if (isNaN(num)) return "—";
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(year, month) {
  if (!year || !month) return "—";
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}

// Plain CSV export — no extra library needed. Opens fine in Excel/Sheets.
function downloadCSV(headers, rows, filename) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))];
  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── New long-term deduction modal (unchanged) ──────────────────────────────
function NewDeductionModal({ employees, onClose, onSaved, showToast }) {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeOpen, setEmployeeOpen]   = useState(false);
  const employeeBoxRef = useRef();
  const [reason, setReason]         = useState("");
  const [notes, setNotes]           = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [months, setMonths]         = useState("");
  const [startYear, setStartYear]   = useState(now.getFullYear());
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1);
  const [saving, setSaving]         = useState(false);
  const [errors, setErrors]         = useState({});

  const monthlyPreview = (parseFloat(totalAmount) > 0 && parseInt(months) > 0)
    ? parseFloat(totalAmount) / parseInt(months)
    : null;

  const empLabel = (emp) =>
    `${emp.full_name || `${emp.first_name} ${emp.last_name}`}${emp.job_title ? ` — ${emp.job_title}` : ""}`;

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees.slice(0, 50);
    return employees.filter(emp => empLabel(emp).toLowerCase().includes(q)).slice(0, 50);
  }, [employees, employeeQuery]);

  useEffect(() => {
    if (!employeeOpen) return;
    const handler = e => {
      if (employeeBoxRef.current && !employeeBoxRef.current.contains(e.target)) setEmployeeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [employeeOpen]);

  const handleSave = async () => {
    const errs = {};
    if (!employeeId) errs.employee = "Select an employee.";
    if (!reason.trim()) errs.reason = "A reason is required.";
    if (!totalAmount || parseFloat(totalAmount) <= 0) errs.totalAmount = "Enter an amount greater than 0.";
    if (!months || parseInt(months) < 1) errs.months = "Enter at least 1 month.";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      const res = await apiFetch(`${API}/payroll/long-term-deductions/`, {
        method: "POST",
        body: JSON.stringify({
          employee: Number(employeeId),
          reason: reason.trim(),
          notes: notes.trim(),
          total_amount: totalAmount,
          number_of_months: Number(months),
          start_year: Number(startYear),
          start_month: Number(startMonth),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || data.detail
          || Object.values(data).flat().filter(Boolean)[0]
          || "Could not create this deduction.";
        showToast(msg, "err");
        setSaving(false);
        return;
      }
      showToast("Long-term deduction created.", "ok");
      onSaved(data);
    } catch {
      showToast("Could not create this deduction.", "err");
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 13px",
    border: "1.5px solid #e2e8f0", borderRadius: 9,
    fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
    color: T.ink, background: "#fafbff", outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: 0.5, color: T.muted, marginBottom: 6, fontFamily: "'DM Sans',sans-serif",
  };
  const errStyle = { fontSize: 11, color: T.red, marginTop: 4, fontFamily: "'DM Sans',sans-serif" };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,26,80,0.52)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 480, boxShadow: "0 28px 72px rgba(0,0,0,0.18)", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ background: `linear-gradient(135deg,${T.navy},${T.blue})`, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>New Long-Term Deduction</span>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, fontFamily: "'DM Sans',sans-serif" }}>e.g. a loan or a salary advance repaid over several months</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: 24, overflowY: "auto" }}>
          <div style={{ marginBottom: 16, position: "relative" }} ref={employeeBoxRef}>
            <label style={labelStyle}>Employee</label>
            <input
              type="text"
              value={employeeId ? empLabel(employees.find(e => String(e.id) === String(employeeId)) || {}) : employeeQuery}
              onChange={e => {
                setEmployeeQuery(e.target.value);
                setEmployeeId("");
                setEmployeeOpen(true);
                setErrors(x => ({ ...x, employee: null }));
              }}
              onFocus={() => { if (employeeId) { setEmployeeQuery(""); setEmployeeId(""); } setEmployeeOpen(true); }}
              placeholder="Type a name to search…"
              autoComplete="off"
              style={{ ...inputStyle, background: "#fff", border: `1.5px solid ${errors.employee ? T.red : "#e2e8f0"}` }}
            />
            {employeeOpen && (
              <div style={{
                position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0,
                background: "#fff", border: `1.5px solid ${T.line}`, borderRadius: 9,
                boxShadow: "0 8px 24px rgba(10,42,94,0.14)", maxHeight: 220, overflowY: "auto",
              }}>
                {filteredEmployees.length === 0 && (
                  <div style={{ padding: "10px 13px", fontSize: 12.5, color: T.muted, fontFamily: "'DM Sans',sans-serif" }}>
                    No employees match.
                  </div>
                )}
                {filteredEmployees.map(emp => (
                  <div
                    key={emp.id}
                    onClick={() => {
                      setEmployeeId(String(emp.id));
                      setEmployeeQuery("");
                      setEmployeeOpen(false);
                      setErrors(x => ({ ...x, employee: null }));
                    }}
                    style={{
                      padding: "9px 13px", fontSize: 13, color: T.ink, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif", borderBottom: `1px solid #f1f5f9`,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#eff6ff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                  >
                    {empLabel(emp)}
                  </div>
                ))}
              </div>
            )}
            {errors.employee && <div style={errStyle}>{errors.employee}</div>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Reason</label>
            <input
              type="text" value={reason}
              onChange={e => { setReason(e.target.value); setErrors(x => ({ ...x, reason: null })); }}
              placeholder="e.g. Loan, Salary advance, Laptop advance…"
              style={{ ...inputStyle, border: `1.5px solid ${errors.reason ? T.red : "#e2e8f0"}` }}
            />
            {errors.reason && <div style={errStyle}>{errors.reason}</div>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Total Amount (USD)</label>
              <input
                type="number" min="0" step="0.01" value={totalAmount}
                onChange={e => { setTotalAmount(e.target.value); setErrors(x => ({ ...x, totalAmount: null })); }}
                placeholder="0.00"
                style={{ ...inputStyle, border: `1.5px solid ${errors.totalAmount ? T.red : "#e2e8f0"}` }}
              />
              {errors.totalAmount && <div style={errStyle}>{errors.totalAmount}</div>}
            </div>
            <div>
              <label style={labelStyle}>Over how many months</label>
              <input
                type="number" min="1" step="1" value={months}
                onChange={e => { setMonths(e.target.value); setErrors(x => ({ ...x, months: null })); }}
                placeholder="e.g. 6"
                style={{ ...inputStyle, border: `1.5px solid ${errors.months ? T.red : "#e2e8f0"}` }}
              />
              {errors.months && <div style={errStyle}>{errors.months}</div>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Start Month</label>
              <select value={startMonth} onChange={e => setStartMonth(e.target.value)} style={inputStyle}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Start Year</label>
              <input type="number" value={startYear} onChange={e => setStartYear(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {monthlyPreview !== null && (
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 9, padding: "10px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 12.5, color: "#0369a1", fontFamily: "'DM Sans',sans-serif" }}>
                ≈ <strong>{fmtUSD(monthlyPreview)}</strong> deducted each month, from <strong>{monthLabel(Number(startYear), Number(startMonth))}</strong>
                {Number(months) > 0 && (
                  <> through <strong>{(() => {
                    const idx = (Number(startMonth) - 1) + (Number(months) - 1);
                    const endYear = Number(startYear) + Math.floor(idx / 12);
                    const endMonth = (idx % 12) + 1;
                    return monthLabel(endYear, endMonth);
                  })()}</strong></>
                )}.
              </div>
            </div>
          )}

          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Any extra context…"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: `1px solid ${T.line}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f1f5f9", color: T.ink, fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${T.navy},${T.blue})`, color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Creating…" : "Create Deduction"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New bonus modal ─────────────────────────────────────────────────────────
// Writes to the exact same PayrollAdjustment record the Payroll page's
// inline Bonus cell edits — so a bonus added here shows up on Payroll and
// Payslips exactly the same way, and vice versa.
function NewBonusModal({ employees, onClose, onSaved, showToast }) {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const employeeBoxRef = useRef();
  const [amount, setAmount]     = useState("");
  const [year, setYear]         = useState(now.getFullYear());
  const [month, setMonth]       = useState(now.getMonth() + 1);
  const [saving, setSaving]     = useState(false);
  const [errors, setErrors]     = useState({});

  const empLabel = (emp) =>
    `${emp.full_name || `${emp.first_name} ${emp.last_name}`}${emp.job_title ? ` — ${emp.job_title}` : ""}`;

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees.slice(0, 50);
    return employees.filter(emp => empLabel(emp).toLowerCase().includes(q)).slice(0, 50);
  }, [employees, employeeQuery]);

  useEffect(() => {
    if (!employeeOpen) return;
    const handler = e => {
      if (employeeBoxRef.current && !employeeBoxRef.current.contains(e.target)) setEmployeeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [employeeOpen]);

  const handleSave = async () => {
    const errs = {};
    if (!employeeId) errs.employee = "Select an employee.";
    if (!amount || parseFloat(amount) <= 0) errs.amount = "Enter an amount greater than 0.";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      // Only `bonus` is sent — the backend preserves any existing deduction
      // for that employee/month rather than resetting it to 0.
      const res = await apiFetch(`${API}/payroll/payroll-adjustments/`, {
        method: "POST",
        body: JSON.stringify({
          employee: Number(employeeId),
          year: Number(year),
          month: Number(month),
          bonus: amount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || data.detail || "Could not add this bonus.";
        showToast(msg, "err");
        setSaving(false);
        return;
      }
      showToast("Bonus added.", "ok");
      onSaved(data);
    } catch {
      showToast("Could not add this bonus.", "err");
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 13px",
    border: "1.5px solid #e2e8f0", borderRadius: 9,
    fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
    color: T.ink, background: "#fafbff", outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: 0.5, color: T.muted, marginBottom: 6, fontFamily: "'DM Sans',sans-serif",
  };
  const errStyle = { fontSize: 11, color: T.red, marginTop: 4, fontFamily: "'DM Sans',sans-serif" };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,26,80,0.52)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 440, boxShadow: "0 28px 72px rgba(0,0,0,0.18)", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ background: `linear-gradient(135deg,${T.green},#047857)`, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>New Bonus</span>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2, fontFamily: "'DM Sans',sans-serif" }}>Shows up on Payroll and Payslips for that month automatically</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: 24, overflowY: "auto" }}>
          <div style={{ marginBottom: 16, position: "relative" }} ref={employeeBoxRef}>
            <label style={labelStyle}>Employee</label>
            <input
              type="text"
              value={employeeId ? empLabel(employees.find(e => String(e.id) === String(employeeId)) || {}) : employeeQuery}
              onChange={e => {
                setEmployeeQuery(e.target.value);
                setEmployeeId("");
                setEmployeeOpen(true);
                setErrors(x => ({ ...x, employee: null }));
              }}
              onFocus={() => { if (employeeId) { setEmployeeQuery(""); setEmployeeId(""); } setEmployeeOpen(true); }}
              placeholder="Type a name to search…"
              autoComplete="off"
              style={{ ...inputStyle, background: "#fff", border: `1.5px solid ${errors.employee ? T.red : "#e2e8f0"}` }}
            />
            {employeeOpen && (
              <div style={{
                position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0,
                background: "#fff", border: `1.5px solid ${T.line}`, borderRadius: 9,
                boxShadow: "0 8px 24px rgba(10,42,94,0.14)", maxHeight: 220, overflowY: "auto",
              }}>
                {filteredEmployees.length === 0 && (
                  <div style={{ padding: "10px 13px", fontSize: 12.5, color: T.muted, fontFamily: "'DM Sans',sans-serif" }}>
                    No employees match.
                  </div>
                )}
                {filteredEmployees.map(emp => (
                  <div
                    key={emp.id}
                    onClick={() => {
                      setEmployeeId(String(emp.id));
                      setEmployeeQuery("");
                      setEmployeeOpen(false);
                      setErrors(x => ({ ...x, employee: null }));
                    }}
                    style={{
                      padding: "9px 13px", fontSize: 13, color: T.ink, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif", borderBottom: `1px solid #f1f5f9`,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#ecfdf5"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                  >
                    {empLabel(emp)}
                  </div>
                ))}
              </div>
            )}
            {errors.employee && <div style={errStyle}>{errors.employee}</div>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Month</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} style={inputStyle}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Year</label>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>Bonus Amount (USD)</label>
            <input
              type="number" min="0" step="0.01" value={amount}
              onChange={e => { setAmount(e.target.value); setErrors(x => ({ ...x, amount: null })); }}
              placeholder="0.00"
              style={{ ...inputStyle, border: `1.5px solid ${errors.amount ? T.red : "#e2e8f0"}` }}
            />
            {errors.amount && <div style={errStyle}>{errors.amount}</div>}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: `1px solid ${T.line}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f1f5f9", color: T.ink, fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${T.green},#047857)`, color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Adding…" : "Add Bonus"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ paid, total }) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: T.blue, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

function StatCard({ label, value, accent, bg }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: `1px solid ${T.line}`,
      borderLeft: `4px solid ${accent}`, padding: "16px 20px",
      flex: "1 1 180px", minWidth: 160,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{ fontSize: 10.5, color: T.muted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: T.navy }}>
        {value}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 20px", borderRadius: 10, border: "none",
        background: active ? `linear-gradient(135deg,${T.navy},${T.blue})` : "#eef2f7",
        color: active ? "#fff" : T.muted,
        fontSize: 13.5, fontWeight: 600, cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif",
        boxShadow: active ? "0 3px 10px rgba(21,87,176,0.25)" : "none",
        transition: "all .15s",
      }}
    >
      {children}
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function LongTermDeductionsPage({ showToast }) {
  const { employees: ctxEmployees, loading: ctxLoading } = useHRPortal();
  const employees = ctxEmployees || [];
  const employeesLoading = ctxLoading?.employees;

  const [tab, setTab] = useState("loans"); // "loans" | "bonuses"

  // ── Long-term deduction plans ──────────────────────────────────────────
  const [items, setItems]   = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);

  const fetchItems = () => {
    setLoading(true);
    apiFetch(`${API}/payroll/long-term-deductions/`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setItems(Array.isArray(data) ? data : data.results || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const employeeName = (empId) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return `Employee #${empId}`;
    return emp.full_name || `${emp.first_name} ${emp.last_name}`;
  };

  const filtered = useMemo(() => {
    const list = items || [];
    const q = search.toLowerCase();
    return list.filter(it => {
      const name = (it.employee_name || employeeName(it.employee) || "").toLowerCase();
      const matchSearch = !q || name.includes(q) || (it.reason || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || it.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [items, search, statusFilter, employees]);

  const totals = useMemo(() => {
    const list = items || [];
    const active = list.filter(i => i.status === "active");
    const outstanding = list.reduce((s, i) => s + (i.status === "cancelled" ? 0 : parseFloat(i.balance) || 0), 0);
    const recoveredSoFar = list.reduce((s, i) => s + (parseFloat(i.total_paid) || 0), 0);
    return { activeCount: active.length, outstanding, recoveredSoFar };
  }, [items]);

  const handleCancel = async (item) => {
    if (!window.confirm(`Cancel this ${item.reason} deduction for ${item.employee_name || employeeName(item.employee)}? No further installments will be deducted — ${fmtUSD(item.balance)} of the balance will be written off.`)) return;
    setBusyId(item.id);
    try {
      const res = await apiFetch(`${API}/payroll/long-term-deductions/${item.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Could not cancel this deduction.", "err");
        return;
      }
      showToast("Deduction cancelled.", "ok");
      fetchItems();
    } catch {
      showToast("Could not cancel this deduction.", "err");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Permanently delete this ${item.reason} deduction for ${item.employee_name || employeeName(item.employee)}? This removes its whole history and can't be undone.`)) return;
    setBusyId(item.id);
    try {
      const res = await apiFetch(`${API}/payroll/long-term-deductions/${item.id}/`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Could not delete this deduction.", "err");
        return;
      }
      showToast("Deduction deleted.", "ok");
      setItems(prev => (prev || []).filter(i => i.id !== item.id));
    } catch {
      showToast("Could not delete this deduction.", "err");
    } finally {
      setBusyId(null);
    }
  };

  // ── Month filter — applies to one-off deductions + bonuses (and their
  // downloads) below. Long-term plans above aren't month-scoped since their
  // status already conveys active/completed/cancelled across their range.
  const now = new Date();
  const [monthScope, setMonthScope] = useState("month"); // "month" | "all"
  const [filterYear, setFilterYear]   = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);

  // ── One-off deductions + bonuses — both live in PayrollAdjustment, same
  // record the Payroll page's inline Deduction/Bonus cells read and write.
  const [adjustments, setAdjustments] = useState(null);
  const [adjLoading, setAdjLoading]   = useState(true);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [oneOffSearch, setOneOffSearch] = useState("");
  const [bonusSearch, setBonusSearch]   = useState("");
  const [busyAdjId, setBusyAdjId] = useState(null);

  const fetchAdjustments = () => {
    setAdjLoading(true);
    const params = new URLSearchParams();
    if (monthScope === "month") {
      params.set("year", String(filterYear));
      params.set("month", String(filterMonth));
    }
    apiFetch(`${API}/payroll/payroll-adjustments/?${params.toString()}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setAdjustments(Array.isArray(data) ? data : data.results || []))
      .catch(() => setAdjustments([]))
      .finally(() => setAdjLoading(false));
  };

  useEffect(() => { fetchAdjustments(); }, [monthScope, filterYear, filterMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const oneOffDeductions = useMemo(
    () => (adjustments || []).filter(a => parseFloat(a.deduction) > 0),
    [adjustments]
  );
  const bonusList = useMemo(
    () => (adjustments || []).filter(a => parseFloat(a.bonus) > 0),
    [adjustments]
  );

  const filteredOneOff = useMemo(() => {
    const q = oneOffSearch.toLowerCase();
    return oneOffDeductions.filter(a => {
      const name = (a.employee_name || employeeName(a.employee) || "").toLowerCase();
      return !q || name.includes(q) || (a.deduction_reason || "").toLowerCase().includes(q);
    });
  }, [oneOffDeductions, oneOffSearch, employees]);

  const filteredBonuses = useMemo(() => {
    const q = bonusSearch.toLowerCase();
    return bonusList.filter(b => {
      const name = (b.employee_name || employeeName(b.employee) || "").toLowerCase();
      return !q || name.includes(q);
    });
  }, [bonusList, bonusSearch, employees]);

  const oneOffTotal = useMemo(() => filteredOneOff.reduce((s, a) => s + (parseFloat(a.deduction) || 0), 0), [filteredOneOff]);
  const bonusTotal   = useMemo(() => filteredBonuses.reduce((s, a) => s + (parseFloat(a.bonus) || 0), 0), [filteredBonuses]);

  const periodLabel = monthScope === "all" ? "All time" : monthLabel(filterYear, filterMonth);

  const handleClearOneOff = async (adj) => {
    const name = adj.employee_name || employeeName(adj.employee);
    if (!window.confirm(`Remove this ${fmtUSD(adj.deduction)} deduction for ${name} (${monthLabel(adj.year, adj.month)})? This is the same deduction shown on the Payroll page — clearing it here clears it there too.`)) return;
    setBusyAdjId(adj.id);
    try {
      const res = await apiFetch(`${API}/payroll/payroll-adjustments/${adj.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ deduction: 0, deduction_reason: "" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Could not remove this deduction.", "err");
        return;
      }
      showToast("Deduction removed.", "ok");
      fetchAdjustments();
    } catch {
      showToast("Could not remove this deduction.", "err");
    } finally {
      setBusyAdjId(null);
    }
  };

  const handleClearBonus = async (adj) => {
    const name = adj.employee_name || employeeName(adj.employee);
    if (!window.confirm(`Remove this ${fmtUSD(adj.bonus)} bonus for ${name} (${monthLabel(adj.year, adj.month)})? This clears it on the Payroll page and Payslips too.`)) return;
    setBusyAdjId(adj.id);
    try {
      const res = await apiFetch(`${API}/payroll/payroll-adjustments/${adj.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ bonus: 0 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Could not remove this bonus.", "err");
        return;
      }
      showToast("Bonus removed.", "ok");
      fetchAdjustments();
    } catch {
      showToast("Could not remove this bonus.", "err");
    } finally {
      setBusyAdjId(null);
    }
  };

  const downloadLoansCSV = () => {
    const headers = ["Employee", "Type", "Reason", "Amount", "Period", "Status"];
    const rows = [
      ...filtered.map(it => ([
        it.employee_name || employeeName(it.employee),
        "Loan/Advance",
        it.reason,
        fmtUSD(it.total_amount),
        `${monthLabel(it.start_year, it.start_month)} → ${monthLabel(it.end_year, it.end_month)}`,
        (STATUS_STYLE[it.status] || STATUS_STYLE.active).label,
      ])),
      ...filteredOneOff.map(a => ([
        a.employee_name || employeeName(a.employee),
        "One-off (Payroll)",
        a.deduction_reason || "",
        fmtUSD(a.deduction),
        monthLabel(a.year, a.month),
        "One-off",
      ])),
    ];
    downloadCSV(headers, rows, `loans-advances-${monthScope === "all" ? "all-time" : periodLabel.replace(" ", "-")}.csv`);
  };

  const downloadBonusesCSV = () => {
    const headers = ["Employee", "Amount", "Month"];
    const rows = filteredBonuses.map(b => ([
      b.employee_name || employeeName(b.employee),
      fmtUSD(b.bonus),
      monthLabel(b.year, b.month),
    ]));
    downloadCSV(headers, rows, `bonuses-${monthScope === "all" ? "all-time" : periodLabel.replace(" ", "-")}.csv`);
  };

  const loadingAll = loading || employeesLoading;

  const inputStyle = { flex: "1 1 200px", padding: "10px 14px", border: `1.5px solid ${T.line}`, borderRadius: 10, fontSize: 13.5, outline: "none", fontFamily: "'DM Sans',sans-serif", background: "#fff" };
  const downloadBtnStyle = {
    padding: "11px 18px", borderRadius: 11, border: `1.5px solid ${T.line}`,
    background: "#fff", color: T.navy, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 8, fontFamily: "'DM Sans',sans-serif",
  };
  const DownloadIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
  );

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif" }}>
      {/* Header + Tabs */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, color: T.navy, margin: 0 }}>
            {tab === "loans" ? "Loans & Advances" : "Bonuses"}
          </h1>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            {tab === "loans"
              ? "Long-term plans repaid over several months, plus one-off deductions added on the Payroll page."
              : "Every bonus added on the Payroll page, across months — or add one here and it shows up there too."}
          </div>
        </div>
        {tab === "loans" ? (
          <button
            onClick={() => setShowModal(true)}
            style={{ padding: "11px 20px", borderRadius: 11, border: "none", background: `linear-gradient(135deg,${T.navy},${T.blue})`, color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px rgba(21,87,176,0.28)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Deduction
          </button>
        ) : (
          <button
            onClick={() => setShowBonusModal(true)}
            style={{ padding: "11px 20px", borderRadius: 11, border: "none", background: `linear-gradient(135deg,${T.green},#047857)`, color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px rgba(5,150,105,0.28)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Bonus
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <TabButton active={tab === "loans"} onClick={() => setTab("loans")}>Loans & Advances</TabButton>
        <TabButton active={tab === "bonuses"} onClick={() => setTab("bonuses")}>Bonuses</TabButton>
      </div>

      {/* Shared month filter — drives one-off deductions + bonuses (and downloads) on both tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16, padding: "10px 14px", background: T.bg, borderRadius: 10, border: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Period</span>
        <select
          value={monthScope} onChange={e => setMonthScope(e.target.value)}
          style={{ padding: "8px 12px", border: `1.5px solid ${T.line}`, borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif", background: "#fff" }}
        >
          <option value="month">One month</option>
          <option value="all">All time</option>
        </select>
        {monthScope === "month" && (
          <>
            <select
              value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
              style={{ padding: "8px 12px", border: `1.5px solid ${T.line}`, borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif", background: "#fff" }}
            >
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input
              type="number" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
              style={{ width: 90, padding: "8px 12px", border: `1.5px solid ${T.line}`, borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif", background: "#fff" }}
            />
          </>
        )}
        <span style={{ fontSize: 12, color: T.muted, marginLeft: "auto" }}>
          {tab === "loans" ? "One-off deductions this period only — loan/advance plans above always show all." : "Bonuses shown for this period."}
        </span>
      </div>

      {tab === "loans" ? (
        <>
          {/* Stat cards */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label="Active Plans" value={totals.activeCount} accent={T.blue} bg="#eff6ff" />
            <StatCard label="Outstanding Balance" value={fmtUSD(totals.outstanding)} accent={T.red} bg="#fef2f2" />
            <StatCard label="Recovered So Far" value={fmtUSD(totals.recoveredSoFar)} accent={T.green} bg="#ecfdf5" />
            <StatCard label={`One-off Deductions — ${periodLabel}`} value={fmtUSD(oneOffTotal)} accent={T.amber} bg="#fff7ed" />
          </div>

          {/* Filters + Download */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <input
              type="text" value={search} onChange={e => { setSearch(e.target.value); setOneOffSearch(e.target.value); }}
              placeholder="Search employee or reason…"
              style={inputStyle}
            />
            <select
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: "10px 14px", border: `1.5px solid ${T.line}`, borderRadius: 10, fontSize: 13.5, outline: "none", fontFamily: "'DM Sans',sans-serif", background: "#fff" }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={downloadLoansCSV} style={downloadBtnStyle}>
              <DownloadIcon /> Download
            </button>
          </div>

          {/* Table */}
          <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${T.line}`, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.bg, borderBottom: `1px solid ${T.line}` }}>
                    {["Employee", "Type", "Reason", "Total", "Monthly", "Period", "Progress", "Paid", "Balance", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "11px 14px", textAlign: ["Total", "Monthly", "Paid", "Balance"].includes(h) ? "right" : "left", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(loadingAll || adjLoading) && (
                    <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>Loading…</td></tr>
                  )}
                  {!loadingAll && !adjLoading && filtered.length === 0 && filteredOneOff.length === 0 && (
                    <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>
                      {(items && items.length === 0 && oneOffDeductions.length === 0) ? "Nothing here yet — create a deduction to get started." : "No deductions match your filters."}
                    </td></tr>
                  )}
                  {!loadingAll && !adjLoading && filtered.map(it => {
                    const st = STATUS_STYLE[it.status] || STATUS_STYLE.active;
                    return (
                      <tr key={`lt-${it.id}`} style={{ borderBottom: `1px solid ${T.line}` }}>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: T.ink, fontWeight: 600 }}>
                          {it.employee_name || employeeName(it.employee)}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 11.5, color: T.muted }}>Loan/Advance</td>
                        <td style={{ padding: "11px 14px", fontSize: 12.5, color: T.ink, maxWidth: 220 }}>
                          {it.reason}
                          {it.notes && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{it.notes}</div>}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "right", fontFamily: "monospace", color: T.ink }}>
                          {fmtUSD(it.total_amount)}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "right", fontFamily: "monospace", color: T.ink }}>
                          {fmtUSD(it.monthly_amount)}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>
                          {monthLabel(it.start_year, it.start_month)} → {monthLabel(it.end_year, it.end_month)}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <ProgressBar paid={parseFloat(it.total_paid) || 0} total={parseFloat(it.total_amount) || 0} />
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "right", fontFamily: "monospace", color: T.green, fontWeight: 600 }}>
                          {fmtUSD(it.total_paid)}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "right", fontFamily: "monospace", color: parseFloat(it.balance) > 0 ? T.red : T.muted, fontWeight: 600 }}>
                          {fmtUSD(it.balance)}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {it.status === "active" && (
                            <button
                              onClick={() => handleCancel(it)}
                              disabled={busyId === it.id}
                              style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #fde68a", background: "#fffbeb", color: T.amber, fontSize: 11.5, fontWeight: 600, cursor: busyId === it.id ? "not-allowed" : "pointer", marginRight: 6 }}
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(it)}
                            disabled={busyId === it.id}
                            style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff5f5", color: T.red, fontSize: 11.5, fontWeight: 600, cursor: busyId === it.id ? "not-allowed" : "pointer" }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!loadingAll && !adjLoading && filteredOneOff.map(a => (
                    <tr key={`oo-${a.id}`} style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td style={{ padding: "11px 14px", fontSize: 13, color: T.ink, fontWeight: 600 }}>
                        {a.employee_name || employeeName(a.employee)}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 11.5, color: T.amber, fontWeight: 600 }}>One-off (Payroll)</td>
                      <td style={{ padding: "11px 14px", fontSize: 12.5, color: T.ink, maxWidth: 220 }}>
                        {a.deduction_reason || <span style={{ color: T.muted, fontStyle: "italic" }}>No reason given</span>}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "right", fontFamily: "monospace", color: T.ink }}>
                        {fmtUSD(a.deduction)}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "right", fontFamily: "monospace", color: T.ink }}>
                        {fmtUSD(a.deduction)}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>
                        {monthLabel(a.year, a.month)}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted }}>—</td>
                      <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "right", fontFamily: "monospace", color: T.green, fontWeight: 600 }}>
                        {fmtUSD(a.deduction)}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "right", fontFamily: "monospace", color: T.muted, fontWeight: 600 }}>
                        {fmtUSD(0)}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: ONE_OFF_STYLE.bg, color: ONE_OFF_STYLE.color }}>
                          {ONE_OFF_STYLE.label}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => handleClearOneOff(a)}
                          disabled={busyAdjId === a.id}
                          style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff5f5", color: T.red, fontSize: 11.5, fontWeight: 600, cursor: busyAdjId === a.id ? "not-allowed" : "pointer" }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {showModal && (
            <NewDeductionModal
              employees={employees}
              showToast={showToast}
              onClose={() => setShowModal(false)}
              onSaved={() => { setShowModal(false); fetchItems(); }}
            />
          )}
        </>
      ) : (
        <>
          {/* Bonuses tab */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label={`Total Bonuses — ${periodLabel}`} value={fmtUSD(bonusTotal)} accent={T.green} bg="#ecfdf5" />
            <StatCard label="Bonuses Given" value={filteredBonuses.length} accent={T.blue} bg="#eff6ff" />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <input
              type="text" value={bonusSearch} onChange={e => setBonusSearch(e.target.value)}
              placeholder="Search employee…"
              style={inputStyle}
            />
            <button onClick={downloadBonusesCSV} style={downloadBtnStyle}>
              <DownloadIcon /> Download
            </button>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${T.line}`, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.bg, borderBottom: `1px solid ${T.line}` }}>
                    {["Employee", "Amount", "Month", ""].map(h => (
                      <th key={h} style={{ padding: "11px 14px", textAlign: h === "Amount" ? "right" : "left", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adjLoading && (
                    <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>Loading…</td></tr>
                  )}
                  {!adjLoading && filteredBonuses.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>
                      No bonuses {monthScope === "month" ? `for ${periodLabel}` : "yet"}.
                    </td></tr>
                  )}
                  {!adjLoading && filteredBonuses.map(b => (
                    <tr key={b.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td style={{ padding: "11px 14px", fontSize: 13, color: T.ink, fontWeight: 600 }}>
                        {b.employee_name || employeeName(b.employee)}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12.5, textAlign: "right", fontFamily: "monospace", color: T.green, fontWeight: 700 }}>
                        {fmtUSD(b.bonus)}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>
                        {monthLabel(b.year, b.month)}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => handleClearBonus(b)}
                          disabled={busyAdjId === b.id}
                          style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff5f5", color: T.red, fontSize: 11.5, fontWeight: 600, cursor: busyAdjId === b.id ? "not-allowed" : "pointer" }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {showBonusModal && (
            <NewBonusModal
              employees={employees}
              showToast={showToast}
              onClose={() => setShowBonusModal(false)}
              onSaved={() => { setShowBonusModal(false); fetchAdjustments(); }}
            />
          )}
        </>
      )}
    </div>
  );
}