// src/components/HRPortal/EmployeesPage.jsx
// HR Employees Page — shows workers with salary, attendance days, and amount to be paid
// Salary / daily rate logic:
//   daily_rate = monthly_salary / working_days_in_month
//   working_days = weekdays in the month MINUS Zimbabwe public holidays (weekdays only)
//   Saturdays/Sundays/public holidays marked present do NOT count toward working days
//   amount_to_be_paid = days_present_on_working_days * daily_rate
//
// ✅ Uses HRPortalContext for employees + departments (no duplicate DB calls)
// ✅ Only fetches payroll + attendance independently (not in context)

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { apiFetch, getToken, refreshToken } from "../../utils/auth";
import { useHRPortal } from "../../context/HRPortalContext";

const API = "http://127.0.0.1:8000/api";

// ── Zimbabwe Public Holidays (fixed dates, YYYY-MM-DD) ────────────────────────
const ZW_PUBLIC_HOLIDAYS_RECURRING = [
  "01-01", // New Year's Day
  "02-21", // Robert Mugabe National Youth Day
  "04-18", // Independence Day
  "05-01", // Workers' Day
  "05-25", // Africa Day
  "08-11", // Heroes' Day
  "08-12", // Defence Forces Day
  "12-22", // Unity Day
  "12-25", // Christmas Day
  "12-26", // Boxing Day
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

// ── Utility ───────────────────────────────────────────────────────────────────
function generateEmployeeNumber(existingNumbers = []) {
  const year = new Date().getFullYear().toString().slice(2);
  let num = 1;
  while (existingNumbers.includes(`EMP${year}${String(num).padStart(4, "0")}`)) num++;
  return `EMP${year}${String(num).padStart(4, "0")}`;
}

function fmt$(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Form helpers ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", padding: "10px 13px",
  border: "1.5px solid #e2e8f0", borderRadius: 9,
  fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
  color: "#0f172a", background: "#fafbff", outline: "none",
  boxSizing: "border-box",
};
const labelStyle = {
  display: "block", fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.7,
  color: "#64748b", marginBottom: 6, fontFamily: "'DM Sans',sans-serif",
};

function FField({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function FInput({ value, onChange, type = "text", placeholder = "", required, readOnly }) {
  return (
    <input
      style={{ ...inputStyle, background: readOnly ? "#f1f5f9" : "#fafbff" }}
      type={type} value={value}
      onChange={e => onChange && onChange(e.target.value)}
      placeholder={placeholder} required={required} readOnly={readOnly}
      onFocus={e => { if (!readOnly) { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; } }}
      onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
    />
  );
}

function FSelect({ value, onChange, options, placeholder }) {
  return (
    <select style={{ ...inputStyle, cursor: "pointer" }} value={value} onChange={e => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Profile pic upload ────────────────────────────────────────────────────────
function ProfilePicUpload({ file, onChange, existingUrl }) {
  const ref = useRef();
  const preview = file ? URL.createObjectURL(file) : existingUrl || null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", marginBottom: 6 }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 16, overflow: "hidden",
          background: preview ? "transparent" : "linear-gradient(135deg,#0a2a5e,#1557b0)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "2px solid #e2e8f0",
        }}>
          {preview
            ? <img src={preview} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          }
        </div>
        <button onClick={() => ref.current.click()} style={{ position: "absolute", bottom: -4, right: -4, width: 22, height: 22, borderRadius: 6, background: "#1557b0", border: "2px solid #fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
        </button>
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>Profile Photo</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Optional — JPG or PNG, max 5MB</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => ref.current.click()} style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid #1557b0", background: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1557b0", fontWeight: 600 }}>
            {preview ? "Change" : "Upload"}
          </button>
          {preview && (
            <button onClick={() => onChange(null)} style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid #e2e8f0", background: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#64748b" }}>Remove</button>
          )}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={e => onChange(e.target.files[0] || null)} />
    </div>
  );
}

// ── Document upload widget (CV / Certificate) ─────────────────────────────────
function DocUpload({ label, accept, file, onChange, existingUrl, hint }) {
  const ref = useRef();
  const fileName = file ? file.name : existingUrl ? existingUrl.split("/").pop() : null;
  const hasFile = !!(file || existingUrl);

  return (
    <div style={{
      border: `2px dashed ${hasFile ? "#1557b0" : "#e2e8f0"}`,
      borderRadius: 12, padding: "18px 20px",
      background: hasFile ? "#f0f6ff" : "#fafbff",
      transition: "border-color 0.2s, background 0.2s",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: hasFile ? "#dbeafe" : "#f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={hasFile ? "#1557b0" : "#94a3b8"} strokeWidth="1.8" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a", fontFamily: "'DM Sans',sans-serif" }}>
            {label}
          </div>
          {fileName ? (
            <div style={{ fontSize: 12, color: "#1557b0", marginTop: 2, fontFamily: "'DM Sans',sans-serif",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ✓ {fileName}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, fontFamily: "'DM Sans',sans-serif" }}>
              {hint || "PDF, DOC, DOCX — max 10 MB"}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => ref.current.click()}
            style={{
              padding: "7px 14px", borderRadius: 8,
              border: "1.5px solid #1557b0", background: "none",
              cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              fontSize: 12, color: "#1557b0", fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {hasFile ? "Replace" : "Upload"}
          </button>
          {hasFile && (
            <button
              onClick={() => onChange(null)}
              style={{
                padding: "7px 12px", borderRadius: 8,
                border: "1.5px solid #e2e8f0", background: "none",
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                fontSize: 12, color: "#dc2626",
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Existing URL download link */}
      {existingUrl && !file && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
          <a
            href={existingUrl.startsWith("http") ? existingUrl : `http://127.0.0.1:8000${existingUrl.startsWith("/") ? "" : "/media/"}${existingUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, color: "#1557b0", fontFamily: "'DM Sans',sans-serif",
              textDecoration: "none", fontWeight: 500,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            View / Download existing file
          </a>
        </div>
      )}

      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={e => onChange(e.target.files[0] || null)}
      />
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 620 }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,26,80,0.52)",
      zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 18, width: "100%", maxWidth,
        boxShadow: "0 28px 72px rgba(0,0,0,0.18)",
        maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
          padding: "18px 22px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>{title}</span>
          <button onClick={onClose} style={{ width: 30, height: 30, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", borderBottom: "1.5px solid #e2e8f0", marginBottom: 20, gap: 0 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: "9px 18px", border: "none", background: "none",
          fontSize: 13, fontWeight: active === t.key ? 700 : 500,
          color: active === t.key ? "#1557b0" : "#64748b",
          borderBottom: active === t.key ? "2px solid #1557b0" : "2px solid transparent",
          cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
          transition: "color 0.15s",
          marginBottom: -1.5,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {t.label}
          {t.badge && (
            <span style={{
              fontSize: 10, fontWeight: 700, background: "#1557b0",
              color: "#fff", borderRadius: 99, padding: "1px 6px",
              fontFamily: "'DM Sans',sans-serif",
            }}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Add / Edit Employee Modal ─────────────────────────────────────────────
function EmployeeFormModal({ employee, departments, existingNumbers, onClose, onSave, showToast }) {
  const isEdit = !!employee;
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);          // 0-4 wizard steps
  const [profilePic, setProfilePic] = useState(null);
  const [cvFile, setCvFile] = useState(null);
  const [certFile, setCertFile] = useState(null);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const workingDaysThisMonth = getWorkingDaysInMonth(currentYear, currentMonth);

  const [form, setForm] = useState({
    first_name:    employee?.first_name    || "",
    last_name:     employee?.last_name     || "",
    middle_name:   employee?.middle_name   || "",
    date_of_birth: employee?.date_of_birth || "",
    national_id:   employee?.national_id   || "",
    gender:        employee?.gender        || "",
    phone_number:  employee?.phone_number  || "",
    email:         employee?.email         || "",
    address:       employee?.address       || "",
    nok_full_name:    employee?.nok_full_name    || "",
    nok_relationship: employee?.nok_relationship || "",
    nok_phone:        employee?.nok_phone        || "",
    nok_email:        employee?.nok_email        || "",
    nok_address:      employee?.nok_address      || "",
    employee_number:  employee?.employee_number  || generateEmployeeNumber(existingNumbers),
    department:       employee?.department        || "",
    job_title:        employee?.job_title         || "",
    date_joined:      employee?.date_joined       || "",
    employment_type:  employee?.employment_type   || "",
    contract_start:   employee?.contract_start    || "",
    contract_end:     employee?.contract_end      || "",
    highest_education: employee?.highest_education || "",
    status:           employee?.status            || "employed",
    status_reason:    employee?.status_reason     || "",
    monthly_salary:   employee?.payroll?.basic_salary || employee?.basic_salary || "",
    bank_name:        employee?.payroll?.bank_name    || "",
    bank_account:     employee?.payroll?.bank_account || "",
  });

  const set = key => val => setForm(f => ({ ...f, [key]: val }));

  const salary = parseFloat(form.monthly_salary);
  const dailyRate = (!isNaN(salary) && salary > 0 && workingDaysThisMonth > 0)
    ? salary / workingDaysThisMonth
    : null;

  const docCount = [cvFile || employee?.cv, certFile || employee?.highest_education_certificate].filter(Boolean).length;

  // ── Per-step validation ──────────────────────────────────────────────────
  const validateStep = (s) => {
    if (s === 0) {
      const req = ["first_name", "last_name", "date_of_birth", "national_id", "gender", "phone_number", "address"];
      for (const k of req) {
        if (!form[k]) { showToast(`${k.replace(/_/g, " ")} is required.`, "err"); return false; }
      }
    }
    if (s === 1) {
      const req = ["employee_number", "job_title", "employment_type", "status"];
      for (const k of req) {
        if (!form[k]) { showToast(`${k.replace(/_/g, " ")} is required.`, "err"); return false; }
      }
      if (form.employment_type === "contract") {
        if (!form.contract_start) { showToast("Contract start date is required.", "err"); return false; }
        if (!form.contract_end)   { showToast("Contract end date is required.", "err"); return false; }
      } else {
        if (!form.date_joined) { showToast("Started work at date is required.", "err"); return false; }
      }
    }
    if (s === 2) {
      if (!form.monthly_salary || isNaN(parseFloat(form.monthly_salary)) || parseFloat(form.monthly_salary) <= 0) {
        showToast("Monthly salary is required.", "err"); return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (validateStep(step)) setStep(s => Math.min(s + 1, 4));
  };
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  // ── Final submit ─────────────────────────────────────────────────────────
  const submit = async () => {
    // Validate all steps before submitting
    for (let s = 0; s <= 2; s++) {
      if (!validateStep(s)) { setStep(s); return; }
    }
    setBusy(true);
    try {
      const fd = new FormData();
      const skipKeys = new Set(["monthly_salary", "bank_name", "bank_account"]);
      Object.entries(form).forEach(([k, v]) => {
        if (skipKeys.has(k)) return;
        if (v !== null && v !== undefined && v !== "") fd.append(k, v);
      });

      // date_joined is required by the backend — always send it
      // For contract employees use contract_start as the join date if date_joined is empty
      if (!form.date_joined) {
        const fallback = form.contract_start || new Date().toISOString().slice(0, 10);
        fd.set("date_joined", fallback);
      }

      if (profilePic) fd.append("profile_picture", profilePic);
      if (cvFile)     fd.append("cv", cvFile);
      if (certFile)   fd.append("highest_education_certificate", certFile);

      const method = isEdit ? "PATCH" : "POST";
      const url = isEdit ? `${API}/employees/${employee.id}/` : `${API}/employees/`;

      let token = getToken();
      let res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.status === 401) {
        token = await refreshToken();
        if (!token) return;
        res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = Object.values(err).flat().join(", ") || "Failed to save employee.";
        showToast(msg, "err"); setBusy(false); return;
      }
      const saved = await res.json();

      // Save payroll (bank details + salary)
      try {
        const prBody = JSON.stringify({
          employee: saved.id,
          basic_salary: parseFloat(form.monthly_salary),
          allowances: 0, deductions: 0,
          bank_name:    form.bank_name    || "",
          bank_account: form.bank_account || "",
          currency: "USD", updated_by: "HR",
        });
        const prResPatch = await apiFetch(`${API}/payroll/${saved.id}/`, { method: "PATCH", body: prBody });
        if (!prResPatch.ok) {
          await apiFetch(`${API}/payroll/`, { method: "POST", body: prBody });
        }
      } catch (_) { /* payroll save is best-effort */ }

      showToast(isEdit ? "Employee updated successfully." : "Employee added successfully.");
      onSave({ ...saved, basic_salary: parseFloat(form.monthly_salary) });
      onClose();
    } catch (e) {
      showToast("An error occurred. Please try again.", "err");
    } finally {
      setBusy(false);
    }
  };

  // ── Step metadata ────────────────────────────────────────────────────────
  const steps = [
    { label: "Personal Info",  icon: "👤" },
    { label: "Employment",     icon: "💼" },
    { label: "Salary",         icon: "💰" },
    { label: "Next of Kin",    icon: "👨‍👩‍👧" },
    { label: "Documents",      icon: "📄", badge: docCount > 0 ? docCount : null },
  ];

  return (
    <Modal title={isEdit ? "Edit Employee" : "Add New Employee"} onClose={onClose} maxWidth={640}>

      {/* ── Step progress bar ── */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24, gap: 0 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            {/* Circle */}
            <div
              onClick={() => i < step && setStep(i)}
              style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700,
                background: i < step ? "#059669" : i === step ? "linear-gradient(135deg,#0a2a5e,#1557b0)" : "#f1f5f9",
                color: i <= step ? "#fff" : "#94a3b8",
                cursor: i < step ? "pointer" : "default",
                boxShadow: i === step ? "0 0 0 3px rgba(21,87,176,0.2)" : "none",
                transition: "all 0.2s",
                fontFamily: "'DM Sans',sans-serif",
              }}
              title={s.label}
            >
              {i < step ? "✓" : i + 1}
            </div>
            {/* Label below on desktop */}
            <div style={{ display: "none" }} />
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 4px",
                background: i < step ? "#059669" : "#e2e8f0",
                transition: "background 0.3s",
              }} />
            )}
          </div>
        ))}
      </div>
      {/* Step label */}
      <div style={{
        textAlign: "center", marginBottom: 18, marginTop: -14,
        fontSize: 12, fontWeight: 700, color: "#1557b0",
        fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.5px",
        textTransform: "uppercase",
      }}>
        Step {step + 1} of {steps.length} — {steps[step].label}
      </div>

      {/* ── Step 0: Personal Info ── */}
      {step === 0 && (
        <>
          <ProfilePicUpload file={profilePic} onChange={setProfilePic} existingUrl={employee?.profile_picture} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <FField label="First Name *"><FInput value={form.first_name} onChange={set("first_name")} placeholder="e.g. John" /></FField>
            <FField label="Last Name *"><FInput value={form.last_name} onChange={set("last_name")} placeholder="e.g. Doe" /></FField>
            <FField label="Middle Name"><FInput value={form.middle_name} onChange={set("middle_name")} placeholder="Optional" /></FField>
            <FField label="Gender *">
              <FSelect value={form.gender} onChange={set("gender")} placeholder="Select gender"
                options={[{ value: "M", label: "Male" }, { value: "F", label: "Female" }, { value: "O", label: "Other" }]} />
            </FField>
            <FField label="Date of Birth *"><FInput type="date" value={form.date_of_birth} onChange={set("date_of_birth")} /></FField>
            <FField label="National ID *"><FInput value={form.national_id} onChange={set("national_id")} placeholder="e.g. 12-345678 A12" /></FField>
            <FField label="Phone Number *"><FInput value={form.phone_number} onChange={set("phone_number")} placeholder="e.g. +263 77 123 4567" /></FField>
            <FField label="Email Address"><FInput type="email" value={form.email} onChange={set("email")} placeholder="e.g. john@example.com" /></FField>
          </div>
          <FField label="Address *">
            <textarea value={form.address} onChange={e => set("address")(e.target.value)}
              placeholder="Residential address" rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
              onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
              onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
            />
          </FField>
        </>
      )}

      {/* ── Step 1: Employment ── */}
      {step === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <FField label="Employee Number *"><FInput value={form.employee_number} onChange={set("employee_number")} /></FField>
          <FField label="Job Title *"><FInput value={form.job_title} onChange={set("job_title")} placeholder="e.g. Site Engineer" /></FField>
          <FField label="Department">
            <FSelect value={String(form.department)} onChange={set("department")} placeholder="Select department"
              options={(departments || []).map(d => ({ value: String(d.id), label: d.name }))} />
          </FField>
          <FField label="Employment Type *">
            <FSelect value={form.employment_type} onChange={set("employment_type")} placeholder="Select type"
              options={[
                { value: "full_time", label: "Full-Time" },
                { value: "part_time", label: "Part-Time" },
                { value: "contract", label: "Contract" },
              ]} />
          </FField>
          {form.employment_type === "contract" ? (
            <>
              <FField label="Contract Start *"><FInput type="date" value={form.contract_start} onChange={set("contract_start")} /></FField>
              <FField label="Contract End *"><FInput type="date" value={form.contract_end} onChange={set("contract_end")} /></FField>
            </>
          ) : (
            <FField label="Date Started *"><FInput type="date" value={form.date_joined} onChange={set("date_joined")} /></FField>
          )}
          <FField label="Status *">
            <FSelect value={form.status} onChange={set("status")} options={[
              { value: "employed", label: "Employed" },
              { value: "retired", label: "Retired" },
              { value: "dismissed", label: "Dismissed" },
              { value: "resigned", label: "Resigned" },
              { value: "suspended", label: "Suspended" },
            ]} />
          </FField>
          <FField label="Highest Education">
            <FSelect value={form.highest_education} onChange={set("highest_education")} placeholder="Select level"
              options={[
                { value: "o_level", label: "O Level" }, { value: "a_level", label: "A Level" },
                { value: "certificate", label: "Certificate" }, { value: "diploma", label: "Diploma" },
                { value: "degree", label: "Degree" }, { value: "honours", label: "Honours Degree" },
                { value: "masters", label: "Masters" }, { value: "phd", label: "PhD" },
              ]} />
          </FField>
        </div>
      )}

      {/* ── Step 2: Salary & Banking ── */}
      {step === 2 && (
        <div>
          <FField label="Monthly Salary (USD) *">
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 15, fontWeight: 700, color: "#1557b0", pointerEvents: "none", fontFamily: "'DM Sans',sans-serif" }}>$</span>
              <input
                style={{ ...inputStyle, paddingLeft: 28 }}
                type="number" min="0" step="0.01"
                value={form.monthly_salary}
                onChange={e => set("monthly_salary")(e.target.value)}
                placeholder="0.00"
                onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
                onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          </FField>

          {dailyRate !== null && (
            <div style={{ background: "linear-gradient(135deg,#f0f9ff,#eff6ff)", border: "1px solid #bfdbfe", borderRadius: 12, padding: "18px 20px", marginTop: 4, marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1557b0", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 14, fontFamily: "'DM Sans',sans-serif" }}>
                Pay Calculation — {new Date(currentYear, currentMonth).toLocaleString("en-GB", { month: "long", year: "numeric" })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[["Monthly Salary", fmt$(salary)], ["Working Days", `${workingDaysThisMonth} days`], ["Daily Rate", fmt$(dailyRate)], ["Note", "Excl. weekends & ZW holidays"]].map(([l, v], i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3, fontFamily: "'DM Sans',sans-serif" }}>{l}</div>
                    <div style={{ fontSize: i === 2 ? 18 : 13, fontWeight: i === 2 ? 700 : 500, color: "#0a2a5e", fontFamily: i === 2 ? "'Playfair Display',serif" : "'DM Sans',sans-serif" }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Banking Details */}
          <div style={{ marginTop: 8, padding: "16px 18px", background: "#fafbff", border: "1.5px solid #e2e8f0", borderRadius: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 14, fontFamily: "'DM Sans',sans-serif" }}>
              🏦 Banking Details (Optional)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <FField label="Bank Name">
                <FInput value={form.bank_name} onChange={set("bank_name")} placeholder="e.g. CBZ Bank" />
              </FField>
              <FField label="Account Number">
                <FInput value={form.bank_account} onChange={set("bank_account")} placeholder="e.g. 1234567890" />
              </FField>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Next of Kin ── */}
      {step === 3 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <FField label="Next of Kin Full Name">
            <FInput value={form.nok_full_name} onChange={set("nok_full_name")} placeholder="Full name" />
          </FField>
          <FField label="Relationship">
            <FSelect value={form.nok_relationship} onChange={set("nok_relationship")} placeholder="Select"
              options={[
                { value: "spouse", label: "Spouse" }, { value: "parent", label: "Parent" },
                { value: "sibling", label: "Sibling" }, { value: "child", label: "Child" },
                { value: "guardian", label: "Guardian" }, { value: "friend", label: "Friend" },
                { value: "other", label: "Other" },
              ]} />
          </FField>
          <FField label="NOK Phone"><FInput value={form.nok_phone} onChange={set("nok_phone")} placeholder="+263 …" /></FField>
          <FField label="NOK Email"><FInput type="email" value={form.nok_email} onChange={set("nok_email")} /></FField>
          <div style={{ gridColumn: "1/-1" }}>
            <FField label="NOK Address">
              <textarea value={form.nok_address} onChange={e => set("nok_address")(e.target.value)}
                rows={2} style={{ ...inputStyle, resize: "vertical" }}
                onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
                onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
              />
            </FField>
          </div>
        </div>
      )}

      {/* ── Step 4: Documents ── */}
      {step === 4 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 16px", marginBottom: 22 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <span style={{ fontSize: 12.5, color: "#0c4a6e", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5 }}>
              Attach the employee's CV and highest education certificate. Files are saved when you click <strong>{isEdit ? "Update Employee" : "Add Employee"}</strong>.
            </span>
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>Curriculum Vitae (CV)</label>
            <DocUpload label="Upload CV" accept=".pdf,.doc,.docx,.rtf" file={cvFile} onChange={setCvFile} existingUrl={employee?.cv || null} hint="PDF, DOC, DOCX — max 10 MB" />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>Highest Education Certificate</label>
            <DocUpload label="Upload Certificate" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" file={certFile} onChange={setCertFile} existingUrl={employee?.highest_education_certificate || null} hint="PDF, DOC, DOCX, JPG, PNG — max 10 MB" />
          </div>
          <div style={{ marginTop: 8, padding: "14px 16px", background: "#fafbff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Document Status</div>
            {[{ label: "Curriculum Vitae", attached: !!(cvFile || employee?.cv), new: !!cvFile },
              { label: "Education Certificate", attached: !!(certFile || employee?.highest_education_certificate), new: !!certFile }
            ].map(doc => (
              <div key={doc.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontSize: 13, color: "#0f172a", fontFamily: "'DM Sans',sans-serif" }}>{doc.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: "3px 10px", background: doc.attached ? "#dcfce7" : "#fee2e2", color: doc.attached ? "#166534" : "#991b1b", fontFamily: "'DM Sans',sans-serif" }}>
                  {doc.attached ? (doc.new ? "✓ Ready to upload" : "✓ On file") : "Not uploaded"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Navigation buttons ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 26, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
        {/* Left: Cancel or Back */}
        {step === 0
          ? <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#0f172a", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
          : <button onClick={goBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8faff", color: "#475569", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
        }

        {/* Right: Next or Submit */}
        {step < steps.length - 1
          ? <button onClick={goNext} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(21,87,176,0.25)" }}>
              Next
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          : <button onClick={submit} disabled={busy} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : isEdit ? "Update Employee" : "Add Employee"}
            </button>
        }
      </div>
    </Modal>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function EmpAvatar({ name, size = 36, photo = null }) {
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

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, accent = "#1557b0", bg = "#eff6ff" }) {
  return (
    <div style={{
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

// ── Attendance bar ─────────────────────────────────────────────────────────────
function AttBar({ attended, total }) {
  if (!total) return <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>;
  const pct = Math.min(100, (attended / total) * 100);
  const color = pct >= 90 ? "#16a34a" : pct >= 70 ? "#f59e0b" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.6s" }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color, fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>
        {attended}/{total}
      </span>
    </div>
  );
}

// ── Download helpers ──────────────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  const headers = ["Full Name", "Job Title", "Department", "Days Attended", "Working Days", "Monthly Salary", "Daily Rate", "Amount To Be Paid"];
  const lines = [headers.join(","), ...rows.map(r =>
    [
      `"${r.fullName}"`,
      `"${r.jobTitle}"`,
      `"${r.dept}"`,
      r.daysAttended,
      r.workingDays,
      r.monthlySalary.toFixed(2),
      r.dailyRate.toFixed(2),
      r.amountToBePaid.toFixed(2),
    ].join(",")
  )];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadPDF(rows, monthLabel) {
  const html = `
    <html><head><title>Employee Payroll Report</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #0f172a; }
      h1 { font-size: 18px; color: #0a2a5e; margin-bottom: 4px; }
      .sub { color: #64748b; font-size: 11px; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #0e3d82; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
      tr:nth-child(even) td { background: #f8faff; }
      .money { text-align: right; font-family: monospace; }
    </style></head>
    <body>
      <h1>Employee Payroll Report</h1>
      <div class="sub">Month: ${monthLabel} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString("en-GB")}</div>
      <table>
        <thead><tr>
          <th>Full Name</th><th>Job Title</th><th>Dept</th>
          <th>Days Attended</th><th>Working Days</th>
          <th class="money">Monthly Salary</th><th class="money">Daily Rate</th><th class="money">Amount To Pay</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td>${r.fullName}</td><td>${r.jobTitle}</td><td>${r.dept}</td>
            <td>${r.daysAttended}</td><td>${r.workingDays}</td>
            <td class="money">$${r.monthlySalary.toFixed(2)}</td>
            <td class="money">$${r.dailyRate.toFixed(2)}</td>
            <td class="money"><strong>$${r.amountToBePaid.toFixed(2)}</strong></td>
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
// Uses HRPortalContext for employees + departments (avoids duplicate DB calls).
// Fetches payroll and attendance independently (these are not in the context).
export default function HREmployeesPage({ showToast, isHRM }) {
  // ── Data from HRPortal context (shared cache — no extra DB calls) ──────────
  const {
    employees: ctxEmployees,
    departments: ctxDepartments,
    loading: ctxLoading,
  } = useHRPortal();

  // ── Local state: only what context doesn't provide ────────────────────────
  const [employees,     setEmployees]     = useState(null);   // local copy (editable)
  const [payrolls,      setPayrolls]      = useState([]);
  const [attendanceAll, setAttendanceAll] = useState([]);
  const [payrollLoading, setPayrollLoading] = useState(true);

  const [search,       setSearch]       = useState("");
  const [deptFilter,   setDeptFilter]   = useState("all");
  const [typeFilter,   setTypeFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal,        setModal]        = useState(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const dlRef = useRef();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const workingDaysThisMonth = getWorkingDaysInMonth(currentYear, currentMonth);
  const monthLabel = now.toLocaleString("en-GB", { month: "long", year: "numeric" });

  const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // ── Sync employees from context when it loads ─────────────────────────────
  useEffect(() => {
    if (ctxEmployees) {
      setEmployees(ctxEmployees);
    }
  }, [ctxEmployees]);

  // ── Fetch only payroll + attendance (not in context) ──────────────────────
  const fetchPayrollAndAttendance = useCallback(async () => {
    setPayrollLoading(true);
    try {
      // apiFetch handles token refresh automatically
      const [prRes, attRes] = await Promise.all([
        apiFetch(`${API}/payroll/`),
        apiFetch(`${API}/attendance/?date_after=${monthStart}&date_before=${monthEnd}&page_size=5000`),
      ]);
      const [prData, attData] = await Promise.all([
        prRes.ok  ? prRes.json()  : [],
        attRes.ok ? attRes.json() : [],
      ]);
      setPayrolls(Array.isArray(prData)  ? prData  : prData.results  || []);
      setAttendanceAll(Array.isArray(attData) ? attData : attData.results || []);
    } catch (e) {
      console.error("fetchPayrollAndAttendance error:", e);
    } finally {
      setPayrollLoading(false);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => { fetchPayrollAndAttendance(); }, [fetchPayrollAndAttendance]);

  // Close download dropdown on outside click
  useEffect(() => {
    const fn = e => { if (dlRef.current && !dlRef.current.contains(e.target)) setDownloadOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // ── Derived maps ──────────────────────────────────────────────────────────
  const departments = ctxDepartments || [];

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
      const empId = typeof rec.employee === "object" ? rec.employee.id : rec.employee;
      m[empId] = (m[empId] || 0) + (rec.status === "half_day" ? 0.5 : 1);
    });
    return m;
  }, [attendanceAll]);

  const enriched = useMemo(() => {
    if (!employees) return [];
    return employees.map(emp => {
      const monthlySalary = payrollMap[emp.id] || 0;
      const dailyRate = workingDaysThisMonth > 0 ? monthlySalary / workingDaysThisMonth : 0;
      const daysAttended = attendanceMap[emp.id] || 0;
      const amountToBePaid = dailyRate * daysAttended;
      const fullName = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
      return { ...emp, fullName, monthlySalary, dailyRate, daysAttended, amountToBePaid };
    });
  }, [employees, payrollMap, attendanceMap, workingDaysThisMonth]);

  const filtered = useMemo(() => {
    if (!enriched.length) return [];
    return enriched.filter(e => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        e.fullName.toLowerCase().includes(q) ||
        (e.email || "").toLowerCase().includes(q) ||
        (e.phone_number || "").toLowerCase().includes(q) ||
        (e.job_title || "").toLowerCase().includes(q);
      const matchDept = deptFilter === "all" ||
        String(e.department) === deptFilter ||
        (e.department_name || "").toLowerCase() === deptFilter.toLowerCase();
      const matchType = typeFilter === "all" || e.employment_type === typeFilter;
      const matchStatus = statusFilter === "all" || e.status === statusFilter;
      return matchSearch && matchDept && matchType && matchStatus;
    });
  }, [enriched, search, deptFilter, typeFilter, statusFilter]);

  const totalWorkers = enriched.length;
  const totalPayable = filtered.reduce((s, e) => s + e.amountToBePaid, 0);
  const avgAttendance = totalWorkers > 0
    ? Math.round(enriched.reduce((s, e) => s + e.daysAttended, 0) / totalWorkers * 10) / 10
    : 0;

  const existingNumbers = useMemo(() => (employees || []).map(e => e.employee_number).filter(Boolean), [employees]);

  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const tableRows = filtered.map(e => ({
    fullName: e.fullName,
    jobTitle: e.job_title || e.position || "—",
    dept: e.department_name || departments.find(d => d.id === e.department)?.name || "—",
    daysAttended: e.daysAttended,
    workingDays: workingDaysThisMonth,
    monthlySalary: e.monthlySalary,
    dailyRate: e.dailyRate,
    amountToBePaid: e.amountToBePaid,
  }));

  const statusStyles = {
    employed:   { bg: "#dcfce7", color: "#166534" },
    retired:    { bg: "#dbeafe", color: "#1e40af" },
    dismissed:  { bg: "#fee2e2", color: "#991b1b" },
    resigned:   { bg: "#fef9c3", color: "#854d0e" },
    suspended:  { bg: "#fce7f3", color: "#9d174d" },
  };

  // Combined loading: context employees OR payroll
  const loading = ctxLoading?.employees || payrollLoading || employees === null;

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, animation: "fadeInUp 0.3s ease", marginLeft: -120 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif" }}>
              Employees
            </h1>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>{today}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {/* Download dropdown */}
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
                  boxShadow: "0 12px 40px rgba(0,0,0,0.1)", minWidth: 180,
                  overflow: "hidden", zIndex: 200,
                }}>
                  {[
                    { label: "Download as Excel (CSV)", icon: "📊", action: () => { downloadCSV(tableRows, `employees-${monthLabel.replace(/ /g, "-")}.csv`); setDownloadOpen(false); } },
                    { label: "Download as PDF", icon: "📄", action: () => { downloadPDF(tableRows, monthLabel); setDownloadOpen(false); } },
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

            {/* Add Employee */}
            {isHRM && (
              <button
                onClick={() => setModal("add")}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 18px", borderRadius: 10, border: "none",
                  background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
                  color: "#fff", fontSize: 13, fontWeight: 600,
                  fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(21,87,176,0.25)",
                  transition: "opacity 0.15s, transform 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Employee
              </button>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <StatCard
            label="Total Employees" value={totalWorkers}
            sub={`${enriched.filter(e => e.status === "employed").length} currently employed`}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
          />
          <StatCard
            label="Working Days" value={workingDaysThisMonth}
            sub="This month (excl. weekends & holidays)"
            accent="#0891b2" bg="#f0f9ff"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          />
          <StatCard
            label="Total Payable" value={fmt$(totalPayable)}
            sub={`${filtered.length} employees shown`}
            accent="#7c3aed" bg="#f5f3ff"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>}
          />
          <StatCard
            label="Departments" value={departments.length}
            sub="Active departments"
            accent="#0891b2" bg="#e0f2fe"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>}
          />
        </div>

        {/* Main table card */}
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
                type="text" placeholder="Search by name, email, phone or job…"
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

            {/* Type filter */}
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer", flex: "0 1 150px" }}>
              <option value="all">All Types</option>
              <option value="full_time">Full-Time</option>
              <option value="part_time">Part-Time</option>
              <option value="contract">Contract</option>
            </select>

            {/* Status filter */}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer", flex: "0 1 150px" }}>
              <option value="all">All Statuses</option>
              <option value="employed">Employed</option>
              <option value="retired">Retired</option>
              <option value="dismissed">Dismissed</option>
              <option value="resigned">Resigned</option>
              <option value="suspended">Suspended</option>
            </select>

            {/* Result count */}
            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", padding: "0 4px" }}>
              {filtered.length} of {employees?.length ?? 0} employees
            </div>
          </div>

          {/* Month info bar */}
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#1557b0", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
              📅 {monthLabel} — {workingDaysThisMonth} working days (excl. weekends &amp; Zimbabwe public holidays)
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
              Sat/Sun/public holiday attendance is tracked but not counted toward working days
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fafbff", borderBottom: "1.5px solid #e2e8f0" }}>
                  {["Employee", "Job Title", "Days Attended", "Monthly Salary", "Daily Rate", "Amount To Be Paid"].map(h => (
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
                  <tr><td colSpan={9} style={{ padding: "48px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#94a3b8", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                      <div style={{ width: 22, height: 22, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      Loading employees…
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                    No employees match your filters.
                  </td></tr>
                ) : filtered.map((emp, i) => {
                  const ss = statusStyles[emp.status] || { bg: "#f1f5f9", color: "#475569" };
                  const typeLabel = { full_time: "Full-Time", part_time: "Part-Time", contract: "Contract" };
                  const deptName = emp.department_name || departments.find(d => d.id === emp.department)?.name || "—";
                  const payColor = emp.amountToBePaid > 0 ? "#166534" : "#94a3b8";

                  return (
                    <tr key={emp.id}
                      style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafcff", transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafcff"}
                    >
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <EmpAvatar name={emp.fullName} size={34} photo={emp.profile_picture} />
                          <div>
                            <div style={{ fontWeight: 600, color: "#0a2a5e", fontSize: 13 }}>{emp.fullName}</div>
                            {emp.employee_number && <div style={{ fontSize: 10.5, color: "#94a3b8" }}>#{emp.employee_number}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", color: "#334155", fontWeight: 500, fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {emp.job_title || emp.position || "—"}
                      </td>
                      <td style={{ padding: "11px 14px", minWidth: 150 }}>
                        <AttBar attended={emp.daysAttended} total={workingDaysThisMonth} />
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 12.5, color: emp.monthlySalary > 0 ? "#0f172a" : "#cbd5e1", whiteSpace: "nowrap" }}>
                        {emp.monthlySalary > 0 ? fmt$(emp.monthlySalary) : <span style={{ color: "#cbd5e1" }}>Not set</span>}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                        {emp.dailyRate > 0 ? fmt$(emp.dailyRate) : "—"}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: payColor }}>
                          {emp.amountToBePaid > 0 ? fmt$(emp.amountToBePaid) : <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 400, color: "#cbd5e1" }}>—</span>}
                        </div>
                        {emp.amountToBePaid > 0 && emp.monthlySalary > 0 && (
                          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginTop: 1 }}>
                            {Math.round((emp.amountToBePaid / emp.monthlySalary) * 100)}% of salary
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {!loading && filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: "linear-gradient(135deg,#f8faff,#eff6ff)", borderTop: "2px solid #e2e8f0" }}>
                    {/* cols 1–2: Employee + Job Title → label */}
                    <td colSpan={2} style={{ padding: "12px 14px", fontWeight: 700, fontSize: 12, color: "#0a2a5e", fontFamily: "'DM Sans',sans-serif" }}>
                      Totals ({filtered.length} employees shown)
                    </td>
                    {/* col 3: Days Attended */}
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1557b0", fontFamily: "'DM Sans',sans-serif" }}>
                        Avg: {avgAttendance} days
                      </span>
                    </td>
                    {/* col 4: Monthly Salary */}
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "#0a2a5e" }}>
                      {fmt$(filtered.reduce((s, e) => s + e.monthlySalary, 0))}
                    </td>
                    {/* col 5: Daily Rate — intentionally blank */}
                    <td style={{ padding: "12px 14px" }} />
                    {/* col 6: Amount To Be Paid */}
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#059669" }}>
                        {fmt$(totalPayable)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Add Employee modal */}
      {modal === "add" && (
        <EmployeeFormModal
          departments={departments}
          existingNumbers={existingNumbers}
          onClose={() => setModal(null)}
          showToast={showToast}
          onSave={emp => {
            setEmployees(prev => prev ? [emp, ...prev] : [emp]);
            showToast("Employee added successfully.");
          }}
        />
      )}
    </>
  );
}