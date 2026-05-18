// src/components/HRPortal/AdminsPage.jsx
// HR Portal – Admin Management page
// Shows all admins EXCEPT IT Managers. Includes last login, today's attendance count,
// inline edit (password + deactivate), download, add-from-employee, and an
// inline registers view showing daily attendance grouped by date.

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../../utils/auth";
import { useHRPortal } from "../../context/HRPortalContext";

const API = "http://127.0.0.1:8000/api";

// ── Role config (no IT) ───────────────────────────────────────────────────────
const ROLES = [
  { value: "MD",           label: "Managing Director" },
  { value: "HRM",          label: "HR Manager" },
  { value: "HR",           label: "Standard HR" },
  { value: "HOD",          label: "Head of Department" },
  { value: "HOD_ACCOUNTS", label: "Accounts HOD" },
];
const roleLabel = (r) => ROLES.find(x => x.value === r)?.label || r;
const roleColors = {
  MD:           { bg: "#fdf4ff", color: "#9333ea" },
  HRM:          { bg: "#ecfdf5", color: "#059669" },
  HR:           { bg: "#f0fdf4", color: "#16a34a" },
  HOD:          { bg: "#fffbeb", color: "#d97706" },
  HOD_ACCOUNTS: { bg: "#fef2f2", color: "#dc2626" },
};

const STATUS_COLORS = {
  present:  { bg: "#ecfdf5", color: "#059669" },
  absent:   { bg: "#fef2f2", color: "#dc2626" },
  late:     { bg: "#fffbeb", color: "#d97706" },
  half_day: { bg: "#eff6ff", color: "#1557b0" },
  leave:    { bg: "#f5f3ff", color: "#7c3aed" },
};

// ── Shared helpers ────────────────────────────────────────────────────────────
function fmtLastLogin(loginActivities) {
  if (!loginActivities || !loginActivities.length) return null;
  const logins = loginActivities.filter(a => a.event === "login");
  if (!logins.length) return null;
  const latest = logins.reduce((a, b) => new Date(a.timestamp) > new Date(b.timestamp) ? a : b);
  const d = new Date(latest.timestamp);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);
  let relative;
  if (diffMins < 1) relative = "just now";
  else if (diffMins < 60) relative = `${diffMins}m ago`;
  else if (diffHrs < 24) relative = `${diffHrs}h ago`;
  else if (diffDays === 1) relative = "yesterday";
  else relative = `${diffDays}d ago`;
  const timeStr = d.toLocaleTimeString("en-ZW", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { relative, timeStr, full: d.toLocaleString("en-ZW", { dateStyle: "medium", timeStyle: "short" }) };
}

function fmtMarkedTime(record) {
  const raw = record.created_at || record.marked_at || record.updated_at;
  if (!raw) return null;
  const d = new Date(raw);
  return d.toLocaleTimeString("en-ZW", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function Avatar({ name, size = 36 }) {
  const initials = (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["#0e3d82", "#1557b0", "#1a6fd4", "#0a2a5e", "#4a90d9"];
  const ci = ((name || "").charCodeAt(0) || 0) % colors.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: size >= 48 ? 14 : 10, flexShrink: 0,
      background: `linear-gradient(135deg,${colors[ci]},${colors[(ci + 2) % colors.length]})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.33, fontWeight: 700, color: "#fff", letterSpacing: 0.5,
    }}>{initials}</div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 520 }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,26,80,0.52)",
      zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, animation: "haFadeIn 0.18s ease",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 18, width: "100%", maxWidth,
        boxShadow: "0 28px 72px rgba(0,0,0,0.18)",
        animation: "haSlideUp 0.25s cubic-bezier(0.22,1,0.36,1) both",
        maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
          padding: "18px 22px", display: "flex", alignItems: "center",
          justifyContent: "space-between", flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: "#fff" }}>{title}</span>
          <button onClick={onClose} style={{
            width: 30, height: 30, background: "rgba(255,255,255,0.15)", border: "none",
            borderRadius: 8, cursor: "pointer", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Form helpers ──────────────────────────────────────────────────────────────
const haInputSt = {
  width: "100%", padding: "10px 13px", border: "1.5px solid #e2e8f0",
  borderRadius: 9, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
  color: "#0f172a", background: "#fafbff", outline: "none", boxSizing: "border-box",
};
function HAField({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#64748b", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
function HAInput({ value, onChange, type = "text", placeholder = "" }) {
  return (
    <input style={haInputSt} type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
      onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
    />
  );
}
function HASelect({ value, onChange, options, placeholder }) {
  return (
    <select style={{ ...haInputSt, cursor: "pointer" }} value={value} onChange={e => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function PwField({ label, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <HAField label={label}>
      <div style={{ position: "relative" }}>
        <input style={{ ...haInputSt, paddingRight: 40 }} type={show ? "text" : "password"}
          value={value} onChange={e => onChange(e.target.value)}
          onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
          onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
        />
        <button type="button" onClick={() => setShow(!show)} style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 2,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {show
              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
            }
          </svg>
        </button>
      </div>
    </HAField>
  );
}

// ── Employee Picker ───────────────────────────────────────────────────────────
function EmployeePicker({ employees, onSelect }) {
  const [q, setQ] = useState("");
  const filtered = employees.filter(e => {
    const s = q.toLowerCase();
    return !s || `${e.first_name} ${e.last_name} ${e.employee_number || ""} ${e.job_title || ""}`.toLowerCase().includes(s);
  });
  return (
    <div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
        Search and select the employee to grant admin access.
      </div>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
          style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input style={{ ...haInputSt, paddingLeft: 34 }} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by name, ID or job title…" autoFocus
          onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
          onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
        />
      </div>
      <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fafbff" }}>
        {filtered.length === 0
          ? <div style={{ padding: "28px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No employees match your search</div>
          : filtered.map(emp => (
            <div key={emp.id} onClick={() => onSelect(emp)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
              borderBottom: "1px solid #f1f5f9", cursor: "pointer", transition: "background 0.1s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <Avatar name={`${emp.first_name} ${emp.last_name}`} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13.5 }}>{emp.first_name} {emp.last_name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{emp.job_title || "—"} · {emp.employee_number || ""}</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c7d8f0" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Add Admin Modal ───────────────────────────────────────────────────────────
function AddAdminModal({ employees, departments, onClose, onSave, showToast }) {
  const [step, setStep] = useState(1);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", role: "", department: "", password: "", confirm: "" });
  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  const pickEmployee = (emp) => {
    setSelectedEmp(emp);
    setForm(f => ({
      ...f,
      username: `${emp.first_name.toLowerCase()}.${emp.last_name.toLowerCase()}`.replace(/\s/g, ""),
      email: emp.email || "",
      department: emp.department ? String(emp.department) : "",
    }));
    setStep(2);
  };

  const save = async () => {
    if (!form.username || !form.email || !form.role || !form.password) {
      showToast("Username, email, role and password are required.", "err"); return;
    }
    if (form.password !== form.confirm) { showToast("Passwords do not match.", "err"); return; }
    if (form.password.length < 8) { showToast("Password must be at least 8 characters.", "err"); return; }
    setBusy(true);
    try {
      const payload = {
        username: form.username, email: form.email,
        full_name: `${selectedEmp.first_name} ${selectedEmp.last_name}`,
        role: form.role, password: form.password, employee: selectedEmp.id,
      };
      if (form.department) payload.department = parseInt(form.department, 10);
      const res = await apiFetch(`${API}/auth/admins/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { const msg = Object.values(data)[0]; showToast(Array.isArray(msg) ? msg[0] : msg || "Failed to create admin.", "err"); return; }
      showToast(`Admin account created for ${payload.full_name}.`);
      onSave(data); onClose();
    } catch (_) { showToast("Server error.", "err"); }
    finally { setBusy(false); }
  };

  const needsDept = ["HOD", "HOD_ACCOUNTS", "HR", "HRM"].includes(form.role);

  return (
    <Modal title={step === 1 ? "Add Admin — Select Employee" : "Add Admin — Account Details"} onClose={onClose} maxWidth={580}>
      {step === 1 && (
        employees.length === 0
          ? <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>Loading employees…</div>
          : <EmployeePicker employees={employees} onSelect={pickEmployee} />
      )}
      {step === 2 && selectedEmp && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#eff6ff", borderRadius: 10, marginBottom: 20, border: "1px solid #c7d8f0" }}>
            <Avatar name={`${selectedEmp.first_name} ${selectedEmp.last_name}`} size={40} />
            <div>
              <div style={{ fontWeight: 700, color: "#0a2a5e", fontSize: 14 }}>{selectedEmp.first_name} {selectedEmp.last_name}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{selectedEmp.job_title || "—"} · {selectedEmp.employee_number || ""}</div>
            </div>
            <button onClick={() => setStep(1)} style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 7, border: "1.5px solid #c7d8f0", background: "#fff", cursor: "pointer", fontSize: 12, color: "#1557b0", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Change</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <HAField label="Username *"><HAInput value={form.username} onChange={set("username")} /></HAField>
            <HAField label="Email *"><HAInput type="email" value={form.email} onChange={set("email")} /></HAField>
            <HAField label="Role / Admin Type *">
              <HASelect value={form.role} onChange={set("role")} placeholder="Select role" options={ROLES} />
            </HAField>
            <HAField label={needsDept ? "Department *" : "Department"}>
              <HASelect value={form.department} onChange={set("department")} placeholder="Select department"
                options={departments.map(d => ({ value: String(d.id), label: d.name }))} />
            </HAField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <PwField label="Password *" value={form.password} onChange={set("password")} />
            <PwField label="Confirm Password *" value={form.confirm} onChange={set("confirm")} />
          </div>
          {form.password && form.password.length < 8 && (
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: -8, marginBottom: 10 }}>Minimum 8 characters required.</div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <button onClick={() => setStep(1)} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#f8faff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5 }}>← Back</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#f1f5f9", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5 }}>Cancel</button>
              <button onClick={save} disabled={busy} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600 }}>{busy ? "Creating…" : "Create Admin"}</button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Edit Admin Modal ──────────────────────────────────────────────────────────
function EditAdminModal({ admin, onClose, onSave, onToggle, showToast }) {
  const [tab, setTab] = useState("password");
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ new_password: "", confirm: "" });
  const setPwF = k => v => setPw(p => ({ ...p, [k]: v }));
  const [localActive, setLocalActive] = useState(admin.is_active);

  const savePassword = async () => {
    if (!pw.new_password) { showToast("New password is required.", "err"); return; }
    if (pw.new_password !== pw.confirm) { showToast("Passwords do not match.", "err"); return; }
    if (pw.new_password.length < 8) { showToast("Minimum 8 characters.", "err"); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`${API}/auth/admins/${admin.id}/reset-password/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: pw.new_password }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed.", "err"); return; }
      showToast(`Password reset for ${admin.full_name}.`);
      setPw({ new_password: "", confirm: "" });
    } catch (_) { showToast("Server error.", "err"); }
    finally { setBusy(false); }
  };

  const handleToggle = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`${API}/auth/admins/${admin.id}/deactivate/`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed.", "err"); return; }
      setLocalActive(data.is_active);
      showToast(data.message || (data.is_active ? "Admin reactivated." : "Admin deactivated."));
      onToggle && onToggle(admin.id, data.is_active);
    } catch (_) { showToast("Server error.", "err"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Edit — ${admin.full_name}`} onClose={onClose}>
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
        {[["password", "Reset Password"], ["status", "Account Status"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "9px 20px", border: "none", background: "none", cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: tab === key ? 700 : 500,
            color: tab === key ? "#1557b0" : "#64748b",
            borderBottom: tab === key ? "2.5px solid #1557b0" : "2.5px solid transparent",
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === "password" && (
        <>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 12.5, color: "#92400e", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            This will immediately override {admin.full_name}'s current password. They must use the new password on their next login.
          </div>
          <PwField label="New Password *" value={pw.new_password} onChange={setPwF("new_password")} />
          <PwField label="Confirm Password *" value={pw.confirm} onChange={setPwF("confirm")} />
          {pw.new_password && pw.new_password.length < 8 && (
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: -8, marginBottom: 10 }}>Minimum 8 characters required.</div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#f1f5f9", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5 }}>Cancel</button>
            <button onClick={savePassword} disabled={busy} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#7c2d12,#dc2626)", color: "#fff", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600 }}>{busy ? "Resetting…" : "Reset Password"}</button>
          </div>
        </>
      )}

      {tab === "status" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: localActive ? "#fef2f2" : "#f0fdf4", border: `1px solid ${localActive ? "#fecaca" : "#bbf7d0"}`, borderRadius: 12, padding: "16px 18px" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: localActive ? "#dc2626" : "#059669" }}>
              {localActive ? "Deactivate Admin" : "Reactivate Admin"}
            </div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4 }}>
              {localActive ? `This will block ${admin.full_name} from logging in.` : `This will restore login access for ${admin.full_name}.`}
            </div>
          </div>
          <button onClick={handleToggle} disabled={busy} style={{
            padding: "10px 18px", borderRadius: 9, border: "none", cursor: busy ? "not-allowed" : "pointer",
            background: localActive ? "#dc2626" : "#059669", color: "#fff",
            fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
            whiteSpace: "nowrap", flexShrink: 0, opacity: busy ? 0.6 : 1,
          }}>{busy ? "Saving…" : localActive ? "Deactivate" : "Reactivate"}</button>
        </div>
      )}
    </Modal>
  );
}

// ── PDF helpers ───────────────────────────────────────────────────────────────
async function getLogoBase64() {
  try {
    const res = await fetch("/logo.jpeg");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Shared print CSS
const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #0f172a; font-size: 13px; }
  .header { background: linear-gradient(135deg, #0a2a5e 0%, #1557b0 60%, #1a6fd4 100%); padding: 28px 40px; }
  .header-inner { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
  .header-text h1 { font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 3px; }
  .header-text p  { font-size: 11px; color: rgba(255,255,255,0.55); }
  .meta { display: flex; gap: 24px; flex-wrap: wrap; }
  .meta-item label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.45); display: block; margin-bottom: 2px; }
  .meta-item span  { font-size: 12px; font-weight: 600; color: #fff; }
  .body { padding: 24px 40px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #0a2a5e; }
  thead th { padding: 10px 14px; text-align: left; font-size: 9px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.8px; }
  tbody tr:nth-child(even) { background: #f8faff; }
  tbody td { padding: 9px 14px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .section-title { font-size: 14px; font-weight: 700; color: #0a2a5e; margin-bottom: 6px; }
  .section-sub   { font-size: 11px; color: #94a3b8; margin-bottom: 12px; }
  .late-note { display: inline-flex; align-items: center; gap: 6px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 700; color: #92400e; margin-bottom: 10px; }
  .foot { font-size: 10px; color: #94a3b8; text-align: right; margin-top: 12px; }
  .section-block { margin-bottom: 32px; page-break-inside: avoid; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
`;

function openPrintWindow(html) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  // Give images time to load then trigger print dialog
  win.onload = () => { win.focus(); win.print(); };
  // Fallback if onload doesn't fire (already loaded)
  setTimeout(() => { try { win.focus(); win.print(); } catch (_) {} }, 800);
}

async function downloadAdminsPDF(admins, departments) {
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]));
  const logoBase64 = await getLogoBase64();

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" alt="JECCA" style="height:48px;width:48px;object-fit:contain;border-radius:8px;border:2px solid rgba(255,255,255,0.25)" />`
    : `<div style="width:48px;height:48px;border-radius:8px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff">J</div>`;

  const rows = admins.map((a, i) => {
    const rc = roleColors[a.role] || { bg: "#f1f5f9", color: "#64748b" };
    const ll = fmtLastLogin(a.login_activities);
    const dept = deptMap[a.department] || a.department_name || "—";
    return `<tr>
      <td style="font-weight:600;color:#0a2a5e">${a.full_name}</td>
      <td>${dept}</td>
      <td><span class="badge" style="background:${rc.bg};color:${rc.color}">${roleLabel(a.role)}</span></td>
      <td>${ll ? ll.full : "—"}</td>
      <td><span class="badge" style="background:${a.is_active ? "#ecfdf5" : "#f1f5f9"};color:${a.is_active ? "#059669" : "#94a3b8"}">${a.is_active ? "Active" : "Inactive"}</span></td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>HR Admins Report</title>
<style>${PRINT_CSS}</style>
</head><body>
<div class="header">
  <div class="header-inner">
    ${logoHtml}
    <div class="header-text">
      <h1>Admin Management Report</h1>
      <p>JECCA Engineering HR Management System · Generated ${new Date().toLocaleString("en-ZW")}</p>
    </div>
  </div>
</div>
<div class="body">
  <table>
    <thead><tr><th>Full Name</th><th>Department</th><th>Role</th><th>Last Login</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">Total: ${admins.length} admin${admins.length !== 1 ? "s" : ""} · HR Portal</div>
</div>
</body></html>`;

  openPrintWindow(html);
}

async function downloadRegistersPDF(admin, registers, departments) {
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]));
  const dept = deptMap[admin.department] || admin.department_name || "—";
  const logoBase64 = await getLogoBase64();

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" alt="JECCA" style="height:48px;width:48px;object-fit:contain;border-radius:8px;border:2px solid rgba(255,255,255,0.25)" />`
    : `<div style="width:48px;height:48px;border-radius:8px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff">J</div>`;

  let allDatesHtml = "";
  for (const [date, records] of Object.entries(registers)) {
    const [y, m, d] = date.split("-").map(Number);
    const dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-ZW", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const lateReasons = records
      .filter(r => r.late_register_reason)
      .map(r => r.late_register_reason)
      .filter((v, i, arr) => arr.indexOf(v) === i);

    const lateNote = lateReasons.length > 0
      ? `<div class="late-note">⚠ Late Register — ${lateReasons.join("; ")}</div>`
      : "";

    const rows = records.map(r => {
      const sc = STATUS_COLORS[r.status] || { bg: "#f1f5f9", color: "#64748b" };
      const statusLabel = (r.status || "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());
      const markedAt = (() => {
        const raw = r.created_at || r.marked_at || r.updated_at;
        if (!raw) return "—";
        return new Date(raw).toLocaleTimeString("en-ZW", { hour: "2-digit", minute: "2-digit", hour12: true });
      })();
      // employee_job_title is now returned by the serializer
      const jobTitle = r.employee_job_title || "—";

      return `<tr>
        <td style="font-weight:600;color:#0f172a">${r.employee_name || "—"}</td>
        <td>${jobTitle}</td>
        <td><span class="badge" style="background:${sc.bg};color:${sc.color}">${statusLabel}</span></td>
        <td>${markedAt}</td>
      </tr>`;
    }).join("");

    allDatesHtml += `<div class="section-block">
      <div class="section-title">${dateLabel} <span style="font-size:11px;color:#94a3b8;font-weight:400">(${records.length} employee${records.length !== 1 ? "s" : ""})</span></div>
      ${lateNote}
      <table>
        <thead><tr><th>Employee</th><th>Job Title</th><th>Status</th><th>Marked At</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  const totalRecords = Object.values(registers).flat().length;
  const totalDates = Object.keys(registers).length;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Registers — ${admin.full_name}</title>
<style>${PRINT_CSS}</style>
</head><body>
<div class="header">
  <div class="header-inner">
    ${logoHtml}
    <div class="header-text">
      <h1>Attendance Registers</h1>
      <p>All attendance records marked by this admin · JECCA Engineering</p>
    </div>
  </div>
  <div class="meta">
    <div class="meta-item"><label>Admin</label><span>${admin.full_name}</span></div>
    <div class="meta-item"><label>Department</label><span>${dept}</span></div>
    <div class="meta-item"><label>Role</label><span>${roleLabel(admin.role)}</span></div>
    <div class="meta-item"><label>Total Records</label><span>${totalRecords}</span></div>
    <div class="meta-item"><label>Register Dates</label><span>${totalDates}</span></div>
    <div class="meta-item"><label>Generated</label><span>${new Date().toLocaleString("en-ZW")}</span></div>
  </div>
</div>
<div class="body">
  ${allDatesHtml || '<p style="color:#94a3b8;text-align:center;padding:40px 0">No registers found.</p>'}
  <div class="foot">HR Portal · ${admin.full_name}'s Attendance Registers</div>
</div>
</body></html>`;

  openPrintWindow(html);
}

// ── Inline Registers View ─────────────────────────────────────────────────────
function RegistersView({ admin, departments, onBack, showToast }) {
  const [registers, setRegisters] = useState(null);
  const [loadingRegs, setLoadingRegs] = useState(true);
  const [expandedDates, setExpandedDates] = useState({});
  const [dlBusy, setDlBusy] = useState(false);

  useEffect(() => {
    setLoadingRegs(true);
    apiFetch(`${API}/attendance/?marked_by=${admin.username}&page_size=1000`)
      .then(r => r.json())
      .then(data => {
        const records = Array.isArray(data) ? data : data.results || [];
        const grouped = {};
        for (const r of records) {
          if (!grouped[r.date]) grouped[r.date] = [];
          grouped[r.date].push(r);
        }
        const sorted = Object.fromEntries(
          Object.entries(grouped).sort((a, b) => new Date(b[0]) - new Date(a[0]))
        );
        setRegisters(sorted);
        const firstDate = Object.keys(sorted)[0];
        if (firstDate) setExpandedDates({ [firstDate]: true });
      })
      .catch(() => { showToast("Failed to load registers.", "err"); setRegisters({}); })
      .finally(() => setLoadingRegs(false));
  }, [admin.id]);

  const toggleDate = (date) => setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));

  const totalRecords = registers ? Object.values(registers).flat().length : 0;
  const totalDates = registers ? Object.keys(registers).length : 0;
  const dept = departments.find(d => d.id === admin.department);
  const rc = roleColors[admin.role] || { bg: "#f1f5f9", color: "#64748b" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Back + Download row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <button
          onClick={onBack}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "none", border: "1.5px solid #e2e8f0",
            borderRadius: 9, padding: "8px 16px",
            fontSize: 13, color: "#475569", fontFamily: "'DM Sans',sans-serif",
            fontWeight: 500, cursor: "pointer",
            transition: "border-color 0.15s, color 0.15s, background 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.color = "#1557b0"; e.currentTarget.style.background = "#eff6ff"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#475569"; e.currentTarget.style.background = "none"; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Admins List
        </button>

        <button
          onClick={async () => {
            if (!registers || totalDates === 0) return;
            setDlBusy(true);
            try { await downloadRegistersPDF(admin, registers, departments); }
            finally { setDlBusy(false); }
          }}
          disabled={loadingRegs || dlBusy || totalDates === 0}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 18px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
            cursor: (loadingRegs || dlBusy || totalDates === 0) ? "not-allowed" : "pointer",
            opacity: (loadingRegs || dlBusy || totalDates === 0) ? 0.5 : 1,
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
            boxShadow: "0 2px 8px rgba(21,87,176,0.25)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {dlBusy ? "Preparing…" : "Download PDF"}
        </button>
      </div>

      {/* Admin profile card */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "28px 32px",
        display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        <Avatar name={admin.full_name} size={72} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif", lineHeight: 1.2 }}>
            {admin.full_name}
          </h1>
          <div style={{ fontSize: 13, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>
            @{admin.username}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "4px 12px", background: rc.bg, color: rc.color, fontFamily: "'DM Sans',sans-serif", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: rc.color, display: "inline-block" }} />
              {roleLabel(admin.role)}
            </span>
            {dept && (
              <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 12px", background: "#eff6ff", color: "#1557b0", fontFamily: "'DM Sans',sans-serif" }}>
                🏢 {dept.name}
              </span>
            )}
            <span style={{
              fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "4px 12px",
              background: admin.is_active ? "#ecfdf5" : "#f1f5f9",
              color: admin.is_active ? "#059669" : "#94a3b8",
              fontFamily: "'DM Sans',sans-serif",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: admin.is_active ? "#059669" : "#94a3b8", display: "inline-block" }} />
              {admin.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            ["Total Records", totalRecords, "#1557b0"],
            ["Register Dates", totalDates, "#059669"],
          ].map(([label, val, accent]) => (
            <div key={label} style={{
              textAlign: "center", background: "#f8faff", borderRadius: 12,
              border: "1px solid #e2e8f0", padding: "14px 20px", minWidth: 100,
              borderLeft: `4px solid ${accent}`,
            }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif" }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Registers list */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid #e2e8f0",
          fontSize: 11, fontWeight: 700, color: "#0a2a5e",
          letterSpacing: "1.2px", textTransform: "uppercase",
          fontFamily: "'DM Sans',sans-serif",
        }}>
          Attendance Registers
        </div>

        <div style={{ padding: "16px 24px" }}>
          {loadingRegs ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 0", gap: 14 }}>
              <div style={{ width: 34, height: 34, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "haSpin 0.75s linear infinite" }} />
              <span style={{ color: "#64748b", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>Loading registers…</span>
            </div>
          ) : totalDates === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 0", gap: 12, color: "#94a3b8" }}>
              <div style={{ fontSize: 36 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>No registers found</div>
              <div style={{ fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>This admin hasn't marked any attendance records yet.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Object.entries(registers).map(([date, records]) => {
                const [y, m, d] = date.split("-").map(Number);
                const dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-ZW", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
                const isExpanded = expandedDates[date];
                const todayStr = new Date().toISOString().slice(0, 10);
                const isToday = date === todayStr;

                const lateReasons = records
                  .filter(r => r.late_register_reason)
                  .map(r => r.late_register_reason)
                  .filter((v, i, arr) => arr.indexOf(v) === i);

                const statusCounts = records.reduce((acc, r) => {
                  acc[r.status] = (acc[r.status] || 0) + 1; return acc;
                }, {});

                return (
                  <div key={date} style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                    <div
                      onClick={() => toggleDate(date)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        padding: "14px 18px",
                        background: isExpanded ? "#eff6ff" : "#fafbff",
                        cursor: "pointer",
                        borderBottom: isExpanded ? "1px solid #e2e8f0" : "none",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "#f0f6ff"; }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "#fafbff"; }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#0a2a5e", fontFamily: "'DM Sans',sans-serif" }}>{dateLabel}</span>
                          {isToday && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: "#dbeafe", color: "#1557b0", padding: "2px 8px", borderRadius: 20, fontFamily: "'DM Sans',sans-serif" }}>TODAY</span>
                          )}
                          {lateReasons.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: "#fef3c7", color: "#d97706", padding: "2px 8px", borderRadius: 20, fontFamily: "'DM Sans',sans-serif" }}>⚠ LATE REGISTER</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: lateReasons.length > 0 ? 8 : 0 }}>
                          <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>{records.length} employee{records.length !== 1 ? "s" : ""}</span>
                          {Object.entries(statusCounts).map(([status, cnt]) => {
                            const sc = STATUS_COLORS[status] || { bg: "#f1f5f9", color: "#64748b" };
                            const lbl = status.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());
                            return (
                              <span key={status} style={{ fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color, padding: "2px 8px", borderRadius: 20, fontFamily: "'DM Sans',sans-serif" }}>
                                {cnt} {lbl}
                              </span>
                            );
                          })}
                        </div>
                        {lateReasons.length > 0 && (
                          <div style={{
                            display: "inline-flex", alignItems: "flex-start", gap: 7,
                            background: "#fffbeb", border: "1px solid #fde68a",
                            borderRadius: 8, padding: "7px 12px",
                            fontSize: 12, color: "#92400e", fontFamily: "'DM Sans',sans-serif",
                          }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            <div>
                              <span style={{ fontWeight: 700, marginRight: 4 }}>Late register reason:</span>
                              {lateReasons.join("; ")}
                            </div>
                          </div>
                        )}
                      </div>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0, marginTop: 2 }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>

                    {isExpanded && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans',sans-serif" }}>
                          <thead>
                            <tr style={{ background: "#f8faff", borderBottom: "1px solid #e2e8f0" }}>
                              {["Employee", "Job Title", "Status", "Marked At"].map(h => (
                                <th key={h} style={{
                                  padding: "9px 16px", textAlign: "left",
                                  fontSize: 10, fontWeight: 700, color: "#64748b",
                                  letterSpacing: "0.8px", textTransform: "uppercase",
                                  whiteSpace: "nowrap",
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {records.map((r, i) => {
                              const sc = STATUS_COLORS[r.status] || { bg: "#f1f5f9", color: "#64748b" };
                              const statusLabel = (r.status || "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());
                              const markedTime = fmtMarkedTime(r);
                              // employee_job_title is now returned by the API
                              const jobTitle = r.employee_job_title || "—";

                              return (
                                <tr key={r.id} style={{
                                  borderBottom: i < records.length - 1 ? "1px solid #f1f5f9" : "none",
                                  background: i % 2 === 0 ? "#fff" : "#fafbff",
                                }}>
                                  <td style={{ padding: "11px 16px" }}>
                                    <span style={{ fontWeight: 600, fontSize: 13.5, color: "#0a2a5e", fontFamily: "'DM Sans',sans-serif" }}>
                                      {r.employee_name || "—"}
                                    </span>
                                  </td>
                                  <td style={{ padding: "11px 16px" }}>
                                    <span style={{ fontSize: 12.5, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
                                      {jobTitle}
                                    </span>
                                  </td>
                                  <td style={{ padding: "11px 16px" }}>
                                    <span style={{
                                      padding: "3px 11px", borderRadius: 20,
                                      fontSize: 11, fontWeight: 700,
                                      background: sc.bg, color: sc.color,
                                      fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
                                    }}>
                                      {statusLabel}
                                    </span>
                                  </td>
                                  <td style={{ padding: "11px 16px" }}>
                                    <span style={{ fontSize: 12.5, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
                                      {markedTime || "—"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main HRAdminsPage ─────────────────────────────────────────────────────────
export default function HRAdminsPage({ showToast }) {
  const { employees, departments } = useHRPortal();

  const [admins, setAdmins] = useState(null);
  const [loading, setLoading] = useState(true);
  const [todayCounts, setTodayCounts] = useState({});

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [modal, setModal] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [viewingAdmin, setViewingAdmin] = useState(null);

  const [dlMenu, setDlMenu] = useState(false);
  const dlRef = useRef();

  useEffect(() => {
    const fn = e => { if (dlRef.current && !dlRef.current.contains(e.target)) setDlMenu(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  useEffect(() => {
    apiFetch(`${API}/auth/admins/`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.results || [];
        setAdmins(list.filter(a => a.role !== "IT"));
      })
      .catch(() => { showToast("Failed to load admins.", "err"); setAdmins([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    apiFetch(`${API}/attendance/?date=${today}&page_size=1000`)
      .then(r => r.json())
      .then(data => {
        const records = Array.isArray(data) ? data : data.results || [];
        const counts = {};
        for (const r of records) {
          if (r.marked_by) counts[r.marked_by] = (counts[r.marked_by] || 0) + 1;
        }
        setTodayCounts(counts);
      })
      .catch(() => {});
  }, []);

  const filtered = (admins || []).filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || [a.full_name, a.username, a.email, a.department_name].some(v => (v || "").toLowerCase().includes(q));
    const matchRole = !roleFilter || a.role === roleFilter;
    const matchStatus = !statusFilter || (statusFilter === "active" ? a.is_active : !a.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  const totalActive = (admins || []).filter(a => a.is_active).length;
  const totalInactive = (admins || []).filter(a => !a.is_active).length;

  const optimisticAdd = (newAdmin) => {
    if (newAdmin.role === "IT") return;
    setAdmins(prev => prev ? [{ ...newAdmin, login_activities: [] }, ...prev] : [newAdmin]);
  };
  const optimisticToggle = (id, is_active) => {
    setAdmins(prev => prev ? prev.map(a => a.id === id ? { ...a, is_active } : a) : prev);
  };

  const deptMap = Object.fromEntries((departments || []).map(d => [d.id, d.name]));

  // ── Inline registers view ─────────────────────────────────────────────────
  if (viewingAdmin) {
    return (
      <>
        <style>{`
          @keyframes haFadeIn  { from{opacity:0} to{opacity:1} }
          @keyframes haSlideUp { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
          @keyframes haSpin    { to{transform:rotate(360deg)} }
        `}</style>
        <div style={{ paddingLeft: 24 }}>
          <RegistersView
            admin={viewingAdmin}
            departments={departments || []}
            onBack={() => setViewingAdmin(null)}
            showToast={showToast}
          />
        </div>
        {editTarget && (
          <EditAdminModal
            admin={editTarget}
            onClose={() => setEditTarget(null)}
            onSave={() => {}}
            onToggle={optimisticToggle}
            showToast={showToast}
          />
        )}
      </>
    );
  }

  // ── Admins table view ─────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes haFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes haSlideUp { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
        @keyframes haSpin    { to{transform:rotate(360deg)} }
        .ha-row { cursor:pointer; transition:background 0.12s; }
        .ha-row:hover { background:#f0f6ff !important; }
        .ha-edit-btn:hover { background:#eff6ff !important; color:#1557b0 !important; }
        .ha-dl-item:hover { background:#f0f6ff; }
      `}</style>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Total Admins", value: (admins || []).length, accent: "#1557b0" },
          { label: "Active",       value: totalActive,           accent: "#059669" },
          { label: "Inactive",     value: totalInactive,         accent: "#dc2626" },
          { label: "Showing",      value: filtered.length,       accent: "#0284c7" },
        ].map((c, i) => (
          <div key={i} style={{
            background: "#fff", borderRadius: 14, padding: "18px 20px",
            border: "1px solid #e2e8f0", borderLeft: `4px solid ${c.accent}`,
            display: "flex", alignItems: "center", gap: 14, transition: "box-shadow 0.2s,transform 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(21,87,176,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}
          >
            <div style={{ width: 42, height: 42, background: `${c.accent}14`, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="1.8" strokeLinecap="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 700, color: "#0a2a5e", lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 3 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
        padding: "14px 18px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, username or department…"
            style={{ width: "100%", padding: "9px 12px 9px 36px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", outline: "none", background: "#fafbff", color: "#0f172a", boxSizing: "border-box" }}
            onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
            onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
          />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          style={{ padding: "9px 13px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", color: roleFilter ? "#0f172a" : "#94a3b8", background: "#fafbff", cursor: "pointer", outline: "none", minWidth: 160 }}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "9px 13px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", color: statusFilter ? "#0f172a" : "#94a3b8", background: "#fafbff", cursor: "pointer", outline: "none", minWidth: 130 }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div style={{ flex: 1 }} />

        {/* Download dropdown */}
        <div style={{ position: "relative" }} ref={dlRef}>
          <button onClick={() => setDlMenu(!dlMenu)} style={{
            padding: "9px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0",
            background: "#f8faff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            fontSize: 13.5, fontWeight: 500, color: "#0f172a",
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {dlMenu && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,0.1)", minWidth: 210, zIndex: 200, overflow: "hidden",
            }}>
              <button className="ha-dl-item" onClick={async () => { await downloadAdminsPDF(filtered, departments || []); setDlMenu(false); }} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "12px 16px", border: "none", background: "none",
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, color: "#0f172a",
              }}>
                <span>📄</span> Download Admins PDF
              </button>
            </div>
          )}
        </div>

        {/* Add Admin */}
        <button onClick={() => setModal("add")} style={{
          padding: "9px 18px", borderRadius: 10, border: "none",
          background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
          cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Admin
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 14 }}>
            <div style={{ width: 36, height: 36, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "haSpin 0.75s linear infinite" }} />
            <p style={{ color: "#64748b", fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>Loading admins…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280, gap: 12, color: "#94a3b8" }}>
            <div style={{ fontSize: 28 }}>🛡️</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>No admins found</div>
            <div style={{ fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>Try adjusting your search or filters</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: "#fafbff", borderBottom: "1.5px solid #e2e8f0" }}>
                  {["Admin", "Role", "Last Login", "Today's Marks", "Status", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: i === 0 ? "12px 16px 12px 18px" : "12px 16px",
                      textAlign: "left", fontSize: 10, fontWeight: 700,
                      letterSpacing: 0.8, textTransform: "uppercase", color: "#64748b",
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((adm, i) => {
                  const rc = roleColors[adm.role] || { bg: "#f1f5f9", color: "#64748b" };
                  const dept = deptMap[adm.department] || adm.department_name;
                  const ll = fmtLastLogin(adm.login_activities);
                  const todayCount = todayCounts[adm.username] || 0;

                  return (
                    <tr key={adm.id} className="ha-row"
                      style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbff" }}
                      onClick={() => setViewingAdmin(adm)}
                    >
                      <td style={{ padding: "12px 16px 12px 18px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          <Avatar name={adm.full_name} size={38} />
                          <div>
                            <div style={{ fontWeight: 600, color: "#0a2a5e", fontSize: 13.5, lineHeight: 1.3 }}>{adm.full_name}</div>
                            {dept && (
                              <span style={{
                                display: "inline-block", marginTop: 4,
                                fontSize: 10, fontWeight: 700, color: "#1557b0",
                                background: "#eff6ff", border: "1px solid #c7d8f0",
                                borderRadius: 20, padding: "1px 8px", letterSpacing: "0.03em",
                              }}>🏢 {dept}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: rc.bg, color: rc.color,
                          fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                          border: `1px solid ${rc.color}22`,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: rc.color, display: "inline-block" }} />
                          {roleLabel(adm.role)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                        {ll ? (
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Last in {ll.timeStr}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{ll.relative}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "#cbd5e1" }}>Never logged in</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                        {todayCount > 0 ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 8,
                              background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, fontWeight: 800, color: "#fff",
                            }}>{todayCount}</div>
                            <span style={{ fontSize: 12, color: "#64748b" }}>marked today</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "#cbd5e1" }}>None today</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700,
                          padding: "3px 10px", borderRadius: 20,
                          background: adm.is_active ? "#ecfdf5" : "#f1f5f9",
                          color: adm.is_active ? "#059669" : "#94a3b8",
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: adm.is_active ? "#059669" : "#94a3b8", display: "inline-block" }} />
                          {adm.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", width: 46, verticalAlign: "middle" }} onClick={e => e.stopPropagation()}>
                        <button className="ha-edit-btn"
                          onClick={e => { e.stopPropagation(); setEditTarget(adm); }}
                          title="Edit admin"
                          style={{
                            width: 32, height: 32, borderRadius: 8, border: "1.5px solid #e2e8f0",
                            background: "#f8faff", cursor: "pointer", display: "flex", alignItems: "center",
                            justifyContent: "center", color: "#64748b", transition: "all 0.15s",
                          }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid #f1f5f9", fontSize: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", display: "flex", justifyContent: "space-between" }}>
            <span>Showing <b style={{ color: "#0f172a" }}>{filtered.length}</b> of <b style={{ color: "#0f172a" }}>{(admins || []).length}</b> admins</span>
            <span>Click any row to view full attendance registers</span>
          </div>
        )}
      </div>

      {modal === "add" && (
        <AddAdminModal
          employees={employees || []}
          departments={departments || []}
          onClose={() => setModal(null)}
          onSave={optimisticAdd}
          showToast={showToast}
        />
      )}
      {editTarget && (
        <EditAdminModal
          admin={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={() => {}}
          onToggle={optimisticToggle}
          showToast={showToast}
        />
      )}
    </>
  );
}