import { useState, useEffect, useRef, useCallback } from "react";

const API = "http://127.0.0.1:8000/api";

function authHeaders() {
  const token = localStorage.getItem("access_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ── Role map ──────────────────────────────────────────────────────────────────
const ROLES = [
  { value: "IT",          label: "IT Manager" },
  { value: "MD",          label: "Managing Director" },
  { value: "HRM",         label: "HR Manager" },
  { value: "HR",          label: "Standard HR" },
  { value: "HOD",         label: "Head of Department" },
  { value: "HOD_ACCOUNTS",label: "Accounts HOD" },
];
const roleLabel  = (r) => ROLES.find(x => x.value === r)?.label || r;
const roleColors = {
  IT:           { bg: "#eff6ff", color: "#1557b0" },
  MD:           { bg: "#fdf4ff", color: "#9333ea" },
  HRM:          { bg: "#ecfdf5", color: "#059669" },
  HR:           { bg: "#f0fdf4", color: "#16a34a" },
  HOD:          { bg: "#fffbeb", color: "#d97706" },
  HOD_ACCOUNTS: { bg: "#fef2f2", color: "#dc2626" },
};

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }) {
  const initials = (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const colors   = ["#0e3d82", "#1557b0", "#1a6fd4", "#0a2a5e", "#4a90d9"];
  const ci       = ((name || "").charCodeAt(0) || 0) % colors.length;
  const r        = size >= 56 ? 16 : 10;
  return (
    <div style={{
      width: size, height: size, borderRadius: r, flexShrink: 0,
      background: `linear-gradient(135deg,${colors[ci]},${colors[(ci+2)%colors.length]})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.33, fontWeight: 700, color: "#fff", letterSpacing: 0.5,
    }}>{initials}</div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 540 }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,26,80,0.52)",
      zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, animation: "adFadeIn 0.18s ease",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 18, width: "100%", maxWidth,
        boxShadow: "0 28px 72px rgba(0,0,0,0.18)",
        animation: "adSlideUp 0.25s cubic-bezier(0.22,1,0.36,1) both",
        maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
          padding: "18px 22px", display: "flex", alignItems: "center",
          justifyContent: "space-between", flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: "#fff" }}>{title}</span>
          <button onClick={onClose} style={{
            width: 30, height: 30, background: "rgba(255,255,255,0.15)",
            border: "none", borderRadius: 8, cursor: "pointer", color: "#fff",
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
const inputSt = {
  width: "100%", padding: "10px 13px", border: "1.5px solid #e2e8f0",
  borderRadius: 9, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
  color: "#0f172a", background: "#fafbff", outline: "none", boxSizing: "border-box",
};

function FField({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#64748b", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
function FInput({ value, onChange, type = "text", placeholder = "" }) {
  return (
    <input style={inputSt} type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
      onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
    />
  );
}
function FSelect({ value, onChange, options, placeholder }) {
  return (
    <select style={{ ...inputSt, cursor: "pointer" }} value={value} onChange={e => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function PwField({ label, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <FField label={label}>
      <div style={{ position: "relative" }}>
        <input style={{ ...inputSt, paddingRight: 40 }} type={show ? "text" : "password"}
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
    </FField>
  );
}

// ── Step 1: Employee Picker ───────────────────────────────────────────────────
function EmployeePicker({ employees, onSelect }) {
  const [q, setQ] = useState("");
  const filtered = employees.filter(e => {
    const s = q.toLowerCase();
    return !s || `${e.first_name} ${e.last_name} ${e.employee_number} ${e.job_title}`.toLowerCase().includes(s);
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
        <input style={{ ...inputSt, paddingLeft: 34 }} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by name, ID or job title…"
          onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
          onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
          autoFocus
        />
      </div>
      <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fafbff" }}>
        {filtered.length === 0
          ? <div style={{ padding: "28px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No employees match your search</div>
          : filtered.map(emp => (
            <div key={emp.id} onClick={() => onSelect(emp)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
              borderBottom: "1px solid #f1f5f9", cursor: "pointer",
              transition: "background 0.1s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <Avatar name={`${emp.first_name} ${emp.last_name}`} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13.5 }}>{emp.first_name} {emp.last_name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{emp.job_title} · {emp.employee_number}</div>
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

// ── Add Admin Modal (multi-step) ──────────────────────────────────────────────
function AddAdminModal({ onClose, onSave, showToast }) {
  const [step, setStep]         = useState(1); // 1=pick employee, 2=fill details
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [departments, setDepartments]  = useState([]);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    username: "", email: "", role: "", department: "", password: "", confirm: "",
  });
  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    Promise.all([
      fetch(`${API}/employees/?page_size=500`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/employees/departments/`,   { headers: authHeaders() }).then(r => r.json()),
    ]).then(([e, d]) => {
      setEmployees(Array.isArray(e) ? e : e.results || []);
      setDepartments(Array.isArray(d) ? d : d.results || []);
    }).catch(() => showToast("Failed to load employees.", "err"))
    .finally(() => setLoadingEmps(false));
  }, []);

  const pickEmployee = (emp) => {
    setSelectedEmp(emp);
    // Pre-fill email/username from employee
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
    if (form.password !== form.confirm) {
      showToast("Passwords do not match.", "err"); return;
    }
    if (form.password.length < 8) {
      showToast("Password must be at least 8 characters.", "err"); return;
    }
    setBusy(true);
    try {
      const payload = {
        username: form.username,
        email: form.email,
        full_name: `${selectedEmp.first_name} ${selectedEmp.last_name}`,
        role: form.role,
        password: form.password,
        employee: selectedEmp.id,
      };
      if (form.department) payload.department = parseInt(form.department, 10);

      const res  = await fetch(`${API}/auth/admins/`, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        const msg = Object.values(data)[0];
        showToast(Array.isArray(msg) ? msg[0] : msg || "Failed to create admin.", "err"); return;
      }
      showToast(`Admin account created for ${payload.full_name}.`);
      onSave(data);
      onClose();
    } catch { showToast("Server error.", "err"); }
    finally { setBusy(false); }
  };

  const needsDept = ["HOD", "HOD_ACCOUNTS", "HR", "HRM"].includes(form.role);

  return (
    <Modal title={step === 1 ? "Add Admin — Select Employee" : "Add Admin — Account Details"} onClose={onClose} maxWidth={580}>
      {step === 1 && (
        loadingEmps
          ? <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>Loading employees…</div>
          : <EmployeePicker employees={employees} onSelect={pickEmployee} />
      )}
      {step === 2 && selectedEmp && (
        <>
          {/* Selected employee banner */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            background: "#eff6ff", borderRadius: 10, marginBottom: 20, border: "1px solid #c7d8f0",
          }}>
            <Avatar name={`${selectedEmp.first_name} ${selectedEmp.last_name}`} size={40} />
            <div>
              <div style={{ fontWeight: 700, color: "#0a2a5e", fontSize: 14 }}>{selectedEmp.first_name} {selectedEmp.last_name}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{selectedEmp.job_title} · {selectedEmp.employee_number}</div>
            </div>
            <button onClick={() => setStep(1)} style={{
              marginLeft: "auto", padding: "5px 12px", borderRadius: 7,
              border: "1.5px solid #c7d8f0", background: "#fff", cursor: "pointer",
              fontSize: 12, color: "#1557b0", fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            }}>Change</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <FField label="Username *"><FInput value={form.username} onChange={set("username")} /></FField>
            <FField label="Email *"><FInput type="email" value={form.email} onChange={set("email")} /></FField>
            <FField label="Role / Admin Type *">
              <FSelect value={form.role} onChange={set("role")} placeholder="Select role" options={ROLES} />
            </FField>
            <FField label={needsDept ? "Department *" : "Department"}>
              <FSelect value={form.department} onChange={set("department")}
                placeholder="Select department"
                options={departments.map(d => ({ value: String(d.id), label: d.name }))}
              />
            </FField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <PwField label="Password *"         value={form.password} onChange={set("password")} />
            <PwField label="Confirm Password *" value={form.confirm}  onChange={set("confirm")} />
          </div>
          {form.password && form.password.length < 8 && (
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: -8, marginBottom: 10 }}>Minimum 8 characters required.</div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <button onClick={() => setStep(1)} style={{
              padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0",
              background: "#f8faff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5,
            }}>← Back</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{
                padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0",
                background: "#f1f5f9", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5,
              }}>Cancel</button>
              <button onClick={save} disabled={busy} style={{
                padding: "9px 22px", borderRadius: 9, border: "none",
                background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
                cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
                fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
              }}>{busy ? "Creating…" : "Create Admin"}</button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Edit Admin Modal ──────────────────────────────────────────────────────────
function EditAdminModal({ admin, departments, onClose, onSave, showToast }) {
  const [tab, setTab] = useState("details"); // "details" | "password"
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: admin.full_name || "",
    email:     admin.email     || "",
    role:      admin.role      || "",
    department: admin.department ? String(admin.department) : "",
  });
  const [pw, setPw] = useState({ new_password: "", confirm: "" });
  const set  = k => v => setForm(f => ({ ...f, [k]: v }));
  const setPwF = k => v => setPw(p => ({ ...p, [k]: v }));

  const saveDetails = async () => {
    if (!form.full_name || !form.email || !form.role) {
      showToast("Name, email and role are required.", "err"); return;
    }
    setBusy(true);
    try {
      const payload = { full_name: form.full_name, email: form.email, role: form.role };
      if (form.department) payload.department = parseInt(form.department, 10);
      else payload.department = null;

      const res  = await fetch(`${API}/auth/admins/${admin.id}/`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { showToast(Object.values(data)[0] || "Failed.", "err"); return; }
      showToast("Admin details updated.");
      onSave(data);
      onClose();
    } catch { showToast("Server error.", "err"); }
    finally { setBusy(false); }
  };

  const savePassword = async () => {
    if (!pw.new_password) { showToast("New password is required.", "err"); return; }
    if (pw.new_password !== pw.confirm) { showToast("Passwords do not match.", "err"); return; }
    if (pw.new_password.length < 8) { showToast("Minimum 8 characters.", "err"); return; }
    setBusy(true);
    try {
      const res  = await fetch(`${API}/auth/admins/${admin.id}/reset-password/`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ new_password: pw.new_password }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed.", "err"); return; }
      showToast(`Password reset for ${admin.full_name}.`);
      onClose();
    } catch { showToast("Server error.", "err"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Edit — ${admin.full_name}`} onClose={onClose}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
        {[["details", "Account Details"], ["password", "Reset Password"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "9px 20px", border: "none", background: "none", cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: tab === key ? 700 : 500,
            color: tab === key ? "#1557b0" : "#64748b",
            borderBottom: tab === key ? "2.5px solid #1557b0" : "2.5px solid transparent",
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === "details" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <FField label="Full Name *"><FInput value={form.full_name} onChange={set("full_name")} /></FField>
            <FField label="Email *"><FInput type="email" value={form.email} onChange={set("email")} /></FField>
            <FField label="Role *">
              <FSelect value={form.role} onChange={set("role")} placeholder="Select role" options={ROLES} />
            </FField>
            <FField label="Department">
              <FSelect value={form.department} onChange={set("department")}
                placeholder="No department"
                options={departments.map(d => ({ value: String(d.id), label: d.name }))}
              />
            </FField>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button onClick={onClose} style={{
              padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0",
              background: "#f1f5f9", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5,
            }}>Cancel</button>
            <button onClick={saveDetails} disabled={busy} style={{
              padding: "9px 22px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
              fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
            }}>{busy ? "Saving…" : "Save Changes"}</button>
          </div>
        </>
      )}

      {tab === "password" && (
        <>
          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
            padding: "10px 14px", marginBottom: 18, fontSize: 12.5, color: "#92400e",
            display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Setting a new password here will immediately override {admin.full_name}'s current password. They will need to use the new password on their next login.
          </div>
          <PwField label="New Password *"     value={pw.new_password} onChange={setPwF("new_password")} />
          <PwField label="Confirm Password *" value={pw.confirm}      onChange={setPwF("confirm")} />
          {pw.new_password && pw.new_password.length < 8 && (
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: -8, marginBottom: 10 }}>Minimum 8 characters required.</div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button onClick={onClose} style={{
              padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0",
              background: "#f1f5f9", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5,
            }}>Cancel</button>
            <button onClick={savePassword} disabled={busy} style={{
              padding: "9px 22px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg,#7c2d12,#dc2626)", color: "#fff",
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
              fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
            }}>{busy ? "Resetting…" : "Reset Password"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── PDF Download helper ───────────────────────────────────────────────────────
function downloadSessionPDF(session, records, adminName) {
  const loginTime  = new Date(session.login.timestamp);
  const logoutTime = session.logout ? new Date(session.logout.timestamp) : null;
  const fmtDate    = d => d.toLocaleString("en-ZW", { dateStyle: "long", timeStyle: "short" });

  const presentRecords = records.filter(r => r.status === "present" || r.status === "late");
  const allRecords     = records;

  const rows = allRecords.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : "#f8faff"}">
      <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;font-weight:500">${r.employee_name || "—"}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">${r.date}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0">
        <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;
          background:${r.status === "present" ? "#ecfdf5" : r.status === "late" ? "#fffbeb" : r.status === "absent" ? "#fef2f2" : "#f1f5f9"};
          color:${r.status === "present" ? "#059669" : r.status === "late" ? "#d97706" : r.status === "absent" ? "#dc2626" : "#64748b"}">
          ${r.status.charAt(0).toUpperCase() + r.status.slice(1).replace("_", " ")}
        </span>
      </td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Attendance Report — ${adminName}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; color: #0f172a; }
    .cover { background: linear-gradient(135deg,#0a2a5e,#1557b0); padding: 40px 48px 36px; color: #fff; }
    .cover h1 { font-size: 26px; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.5px; }
    .cover p  { font-size: 13px; color: rgba(255,255,255,0.7); margin: 0; }
    .meta { display: flex; gap: 32px; margin-top: 24px; }
    .meta-item label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.5); display: block; margin-bottom: 3px; }
    .meta-item span  { font-size: 13px; font-weight: 600; color: #fff; }
    .body { padding: 32px 48px; }
    .summary { display: flex; gap: 16px; margin-bottom: 28px; }
    .stat { flex: 1; border-radius: 10px; padding: 16px; border: 1px solid #e2e8f0; }
    .stat .num { font-size: 28px; font-weight: 800; color: #0a2a5e; line-height: 1; }
    .stat .lbl { font-size: 11px; color: #64748b; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead tr { background: #0a2a5e; }
    thead th { padding: 11px 14px; text-align: left; font-size: 10px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.8px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>Attendance Register</h1>
    <p>Session report generated by the HRMS system</p>
    <div class="meta">
      <div class="meta-item"><label>Admin</label><span>${adminName}</span></div>
      <div class="meta-item"><label>Login Time</label><span>${fmtDate(loginTime)}</span></div>
      <div class="meta-item"><label>Logout Time</label><span>${logoutTime ? fmtDate(logoutTime) : "Still Active"}</span></div>
    </div>
  </div>
  <div class="body">
    <div class="summary">
      <div class="stat"><div class="num">${allRecords.length}</div><div class="lbl">Total Marked</div></div>
      <div class="stat" style="border-color:#bbf7d0"><div class="num" style="color:#059669">${allRecords.filter(r => r.status === "present").length}</div><div class="lbl">Present</div></div>
      <div class="stat" style="border-color:#fecaca"><div class="num" style="color:#dc2626">${allRecords.filter(r => r.status === "absent").length}</div><div class="lbl">Absent</div></div>
      <div class="stat" style="border-color:#fde68a"><div class="num" style="color:#d97706">${allRecords.filter(r => r.status === "late").length}</div><div class="lbl">Late</div></div>
    </div>
    <table>
      <thead><tr><th>Employee Name</th><th>Date</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">No attendance records found for this session.</td></tr>'}</tbody>
    </table>
    <div class="footer">
      <span>HRMS Attendance Report</span>
      <span>Generated: ${new Date().toLocaleString("en-ZW")}</span>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `attendance_${adminName.replace(/\s/g, "_")}_${loginTime.toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Session Attendance Modal ───────────────────────────────────────────────────
function SessionAttendanceModal({ session, adminId, adminName, onClose, showToast }) {
  const [records, setRecords]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ login_time: session.login.timestamp });
    if (session.logout) params.set("logout_time", session.logout.timestamp);
    fetch(`${API}/auth/admins/${adminId}/session-attendance/?${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setRecords(Array.isArray(d) ? d : []))
      .catch(() => { showToast("Failed to load attendance.", "err"); setRecords([]); })
      .finally(() => setLoading(false));
  }, []);

  const fmtTime = iso => new Date(iso).toLocaleString("en-ZW", { dateStyle: "medium", timeStyle: "short" });

  const statusStyle = (s) => ({
    present:  { bg: "#ecfdf5", color: "#059669" },
    absent:   { bg: "#fef2f2", color: "#dc2626" },
    late:     { bg: "#fffbeb", color: "#d97706" },
    half_day: { bg: "#eff6ff", color: "#1557b0" },
    leave:    { bg: "#f5f3ff", color: "#7c3aed" },
  }[s] || { bg: "#f1f5f9", color: "#64748b" });

  const handleDownload = () => {
    setDownloading(true);
    try { downloadSessionPDF(session, records || [], adminName); }
    finally { setTimeout(() => setDownloading(false), 800); }
  };

  return (
    <Modal
      title={`Session Attendance — ${fmtTime(session.login.timestamp)}`}
      onClose={onClose}
      maxWidth={600}
    >
      {/* Session summary */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18,
        background: "#f8faff", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0",
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#94a3b8", marginBottom: 3 }}>Login Time</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{fmtTime(session.login.timestamp)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#94a3b8", marginBottom: 3 }}>Logout Time</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: session.logout ? "#0f172a" : "#059669" }}>
            {session.logout ? fmtTime(session.logout.timestamp) : "Still Active"}
          </div>
        </div>
      </div>

      {/* Records */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
          <div style={{ width: 28, height: 28, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.75s linear infinite", margin: "0 auto 12px" }} />
          Loading attendance records…
        </div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          No attendance was marked during this session.
        </div>
      ) : (
        <>
          {/* Mini stats */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[
              ["Total", records.length, "#1557b0", "#eff6ff"],
              ["Present", records.filter(r => r.status === "present").length, "#059669", "#ecfdf5"],
              ["Absent",  records.filter(r => r.status === "absent").length,  "#dc2626", "#fef2f2"],
              ["Late",    records.filter(r => r.status === "late").length,    "#d97706", "#fffbeb"],
            ].map(([lbl, val, color, bg]) => (
              <div key={lbl} style={{ flex: 1, background: bg, borderRadius: 10, padding: "10px 12px", textAlign: "center", border: `1px solid ${color}22` }}>
                <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 10, color: color, fontWeight: 600, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>{lbl}</div>
              </div>
            ))}
          </div>

          <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fafbff" }}>
            {records.map((r, i) => {
              const st = statusStyle(r.status);
              return (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderBottom: i < records.length - 1 ? "1px solid #f1f5f9" : "none",
                  background: i % 2 === 0 ? "#fff" : "#fafbff",
                }}>
                  <Avatar name={r.employee_name || "?"} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{r.employee_name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{r.date}</div>
                  </div>
                  <span style={{
                    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: st.bg, color: st.color,
                  }}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1).replace("_", " ")}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {records ? `${records.length} record${records.length !== 1 ? "s" : ""} found` : ""}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0",
            background: "#f1f5f9", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5,
          }}>Close</button>
          <button onClick={handleDownload} disabled={!records || downloading} style={{
            padding: "9px 18px", borderRadius: 9, border: "none",
            background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
            cursor: (!records || downloading) ? "not-allowed" : "pointer",
            opacity: (!records || downloading) ? 0.6 : 1,
            fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Admin Detail Drawer ────────────────────────────────────────────────────────
function AdminDetail({ admin, departments, onClose, onEdit, onToggle, showToast }) {
  const [activity,    setActivity]    = useState(null);
  const [localAdmin,  setLocalAdmin]  = useState(admin);
  const [activeTab,   setActiveTab]   = useState("info");   // "info" | "history"
  const [sessionModal,setSessionModal]= useState(null);     // session object or null
  const dept = departments.find(d => d.id === localAdmin.department);
  const rc   = roleColors[localAdmin.role] || { bg: "#f1f5f9", color: "#64748b" };

  useEffect(() => {
    fetch(`${API}/auth/admins/${localAdmin.id}/activity/`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setActivity(Array.isArray(d) ? d : []))
      .catch(() => setActivity([]));
  }, [localAdmin.id]);

  // Group activity into sessions (login → logout pairs)
  const sessions = [];
  if (activity) {
    let currentLogin = null;
    const chrono = [...activity].reverse();
    for (const a of chrono) {
      if (a.event === "login") {
        currentLogin = a;
      } else if (a.event === "logout" && currentLogin) {
        const loginTime  = new Date(currentLogin.timestamp);
        const logoutTime = new Date(a.timestamp);
        const diffMins   = Math.round((logoutTime - loginTime) / 60000);
        sessions.unshift({ login: currentLogin, logout: a, duration: diffMins });
        currentLogin = null;
      }
    }
    if (currentLogin) sessions.unshift({ login: currentLogin, logout: null, duration: null });
  }

  const fmtTime = (iso) => new Date(iso).toLocaleString("en-ZW", { dateStyle: "medium", timeStyle: "short" });
  const fmtDuration = (mins) => {
    if (mins === null) return "Active";
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const handleToggle = async () => {
    try {
      const res  = await fetch(`${API}/auth/admins/${localAdmin.id}/deactivate/`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed.", "err"); return; }
      setLocalAdmin(a => ({ ...a, is_active: data.is_active }));
      showToast(data.message);
      onToggle && onToggle(localAdmin.id, data.is_active);
    } catch { showToast("Server error.", "err"); }
  };

  return (
    <>
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,26,80,0.5)",
      zIndex: 700, display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
      animation: "adFadeIn 0.18s ease",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: "min(520px,100vw)", height: "100vh", background: "#fff",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "-20px 0 60px rgba(0,0,0,0.15)",
        animation: "adSlideRight 0.28s cubic-bezier(0.22,1,0.36,1) both",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg,#0a2a5e 0%,#1557b0 60%,#1a6fd4 100%)",
          padding: "24px 22px 22px", flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
            <button onClick={onClose} style={{
              width: 32, height: 32, background: "rgba(255,255,255,0.15)",
              border: "none", borderRadius: 8, cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <button onClick={() => onEdit(localAdmin)} style={{
              padding: "7px 16px", background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 9, cursor: "pointer", color: "#fff", fontFamily: "'DM Sans',sans-serif",
              fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={localAdmin.full_name} size={58} />
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: "#fff" }}>{localAdmin.full_name}</div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{localAdmin.username}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: rc.bg, color: rc.color,
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                  border: `1px solid ${rc.color}22`,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: rc.color, display: "inline-block" }} />
                  {roleLabel(localAdmin.role)}
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: localAdmin.is_active ? "#ecfdf5" : "#fef2f2",
                  color: localAdmin.is_active ? "#059669" : "#dc2626",
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: localAdmin.is_active ? "#059669" : "#dc2626", display: "inline-block" }} />
                  {localAdmin.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 18 }}>
            {[
              { label: "Email",      val: localAdmin.email || "—" },
              { label: "Department", val: dept?.name || "All Depts" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Tabs inside header */}
          <div style={{ display: "flex", gap: 4, marginTop: 18 }}>
            {[["info","Account Info"],["history","Login History"]].map(([key,label]) => (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, fontWeight: 700,
                background: activeTab === key ? "#fff" : "rgba(255,255,255,0.12)",
                color: activeTab === key ? "#0a2a5e" : "rgba(255,255,255,0.8)",
                transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>

          {/* ── TAB: Account Info ── */}
          {activeTab === "info" && (
            <>
              {/* Toggle activation */}
              <div style={{
                background: localAdmin.is_active ? "#fef2f2" : "#f0fdf4",
                border: `1px solid ${localAdmin.is_active ? "#fecaca" : "#bbf7d0"}`,
                borderRadius: 12, padding: "14px 16px", marginBottom: 22,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: localAdmin.is_active ? "#dc2626" : "#059669" }}>
                    {localAdmin.is_active ? "Deactivate Admin" : "Reactivate Admin"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {localAdmin.is_active
                      ? "Prevent this admin from logging in. History is preserved."
                      : "Restore login access for this admin account."}
                  </div>
                </div>
                <button onClick={handleToggle} style={{
                  padding: "8px 16px", borderRadius: 9, border: "none", cursor: "pointer",
                  background: localAdmin.is_active ? "#dc2626" : "#059669",
                  color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {localAdmin.is_active ? "Deactivate" : "Reactivate"}
                </button>
              </div>

              {/* Account details */}
              <div style={{ marginBottom: 22 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2,
                  color: "#1557b0", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #e2e8f0",
                }}>Account Information</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {[
                    ["Full Name",    localAdmin.full_name],
                    ["Username",     localAdmin.username],
                    ["Email",        localAdmin.email],
                    ["Role",         roleLabel(localAdmin.role)],
                    ["Department",   dept?.name || "—"],
                    ["Member Since", localAdmin.created_at ? new Date(localAdmin.created_at).toLocaleDateString("en-ZW", { dateStyle: "medium" }) : "—"],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#94a3b8" }}>{label}</span>
                      <span style={{ fontSize: 14, color: "#0f172a", fontWeight: 500 }}>{val || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Latest session snapshot */}
              {sessions.length > 0 && (
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2,
                    color: "#1557b0", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #e2e8f0",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span>Latest Session</span>
                    <button onClick={() => setActiveTab("history")} style={{
                      background: "#eff6ff", color: "#1557b0", border: "none", borderRadius: 8,
                      padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                    }}>View All History →</button>
                  </div>
                  {(() => {
                    const s = sessions[0];
                    return (
                      <div style={{
                        background: "#f8faff", borderRadius: 12, padding: "14px 16px",
                        border: "1px solid #e2e8f0",
                        borderLeft: `4px solid ${s.logout ? "#1557b0" : "#059669"}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="2.2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                              </svg>
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#1557b0" }}>Login Time</span>
                            </div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a", marginBottom: s.logout ? 10 : 0 }}>
                              {fmtTime(s.login.timestamp)}
                            </div>
                            {s.logout && (
                              <>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round">
                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                  </svg>
                                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#dc2626" }}>Logout Time</span>
                                </div>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>
                                  {fmtTime(s.logout.timestamp)}
                                </div>
                              </>
                            )}
                            {!s.logout && (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4, background: "#ecfdf5", color: "#059669", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#059669", display: "inline-block", animation: "pulse 1.5s ease-in-out infinite" }} />
                                Currently Online
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "center", minWidth: 64 }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: s.logout ? "#1557b0" : "#059669", lineHeight: 1 }}>
                              {fmtDuration(s.duration)}
                            </div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>Duration</div>
                          </div>
                        </div>
                        {s.login.ip_address && (
                          <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                            IP: {s.login.ip_address}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}

          {/* ── TAB: Login History ── */}
          {activeTab === "history" && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2,
                color: "#1557b0", marginBottom: 6, paddingBottom: 8, borderBottom: "1px solid #e2e8f0",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span>Full Login History</span>
                <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
              </div>

              {activity === null ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
                  <div style={{ width: 28, height: 28, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.75s linear infinite", margin: "0 auto 12px" }} />
                  Loading…
                </div>
              ) : sessions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                  No login activity recorded yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                  {sessions.map((s, i) => (
                    <div key={i}
                      onClick={() => setSessionModal(s)}
                      style={{
                        background: "#f8faff", borderRadius: 12, padding: "14px 16px",
                        border: "1px solid #e2e8f0",
                        borderLeft: `4px solid ${s.logout ? "#1557b0" : "#059669"}`,
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#c7d8f0"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#f8faff"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          {/* Login row */}
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#64748b" }}>Login</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{fmtTime(s.login.timestamp)}</span>
                          </div>
                          {/* Logout row */}
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.logout ? "#dc2626" : "#e2e8f0", flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#64748b" }}>Logout</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: s.logout ? "#0f172a" : "#94a3b8" }}>
                              {s.logout ? fmtTime(s.logout.timestamp) : "—"}
                            </span>
                            {!s.logout && (
                              <span style={{ background: "#ecfdf5", color: "#059669", fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "1px 8px" }}>Active</span>
                            )}
                          </div>
                          {s.login.ip_address && (
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>IP: {s.login.ip_address}</div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                          <span style={{
                            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: s.logout ? "#eff6ff" : "#ecfdf5",
                            color: s.logout ? "#1557b0" : "#059669",
                          }}>
                            {fmtDuration(s.duration)}
                          </span>
                          <span style={{
                            fontSize: 10, color: "#1557b0", fontWeight: 600,
                            display: "flex", alignItems: "center", gap: 4,
                          }}>
                            View Attendance
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Session Attendance Modal */}
    {sessionModal && (
      <SessionAttendanceModal
        session={sessionModal}
        adminId={localAdmin.id}
        adminName={localAdmin.full_name}
        onClose={() => setSessionModal(null)}
        showToast={showToast}
      />
    )}
    </>
  );
}

// ── Download helpers ──────────────────────────────────────────────────────────
function downloadAdminsCSV(admins, departments) {
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]));
  const headers = ["Full Name", "Username", "Email", "Role", "Department", "Status", "Created At"];
  const rows    = admins.map(a => [
    a.full_name, a.username, a.email,
    roleLabel(a.role),
    deptMap[a.department] || "—",
    a.is_active ? "Active" : "Inactive",
    a.created_at ? new Date(a.created_at).toLocaleDateString() : "",
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${(c || "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a    = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `admins_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

// ── Main AdminsPage ────────────────────────────────────────────────────────────
export default function AdminsPage({ showToast }) {
  const [admins,      setAdmins]      = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState("");
  const [statusFilter,setStatusFilter]= useState("");
  const [modal,       setModal]       = useState(null); // "add"
  const [selected,    setSelected]    = useState(null);
  const [editTarget,  setEditTarget]  = useState(null);
  const [detailOpen,  setDetailOpen]  = useState(false);
  const [dlMenu,      setDlMenu]      = useState(false);
  const dlRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aR, dR] = await Promise.all([
        fetch(`${API}/auth/admins/`,          { headers: authHeaders() }),
        fetch(`${API}/employees/departments/`, { headers: authHeaders() }),
      ]);
      const aData = await aR.json();
      const dData = await dR.json();
      setAdmins(Array.isArray(aData) ? aData : aData.results || []);
      setDepartments(Array.isArray(dData) ? dData : dData.results || []);
    } catch { showToast("Failed to load admins.", "err"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const fn = e => { if (dlRef.current && !dlRef.current.contains(e.target)) setDlMenu(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const filtered = admins.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || [a.full_name, a.username, a.email, a.department_name].some(v => (v || "").toLowerCase().includes(q));
    const matchRole   = !roleFilter   || a.role === roleFilter;
    const matchStatus = !statusFilter || (statusFilter === "active" ? a.is_active : !a.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  const totalActive   = admins.filter(a => a.is_active).length;
  const totalInactive = admins.filter(a => !a.is_active).length;
  const roleGroups    = ROLES.map(r => ({ ...r, count: admins.filter(a => a.role === r.value).length })).filter(r => r.count > 0);

  const openDetail = (adm) => {
    fetch(`${API}/auth/admins/${adm.id}/`, { headers: authHeaders() })
      .then(r => r.json())
      .then(full => { setSelected(full); setDetailOpen(true); })
      .catch(() => { setSelected(adm); setDetailOpen(true); });
  };

  const handleToggle = (id, is_active) => {
    setAdmins(prev => prev.map(a => a.id === id ? { ...a, is_active } : a));
  };

  return (
    <>
      <style>{`
        @keyframes adFadeIn    { from{opacity:0;} to{opacity:1;} }
        @keyframes adSlideUp   { from{opacity:0;transform:translateY(22px);} to{opacity:1;transform:none;} }
        @keyframes adSlideRight{ from{opacity:0;transform:translateX(40px);} to{opacity:1;transform:none;} }
        @keyframes spin        { to{transform:rotate(360deg);} }
        @keyframes pulse       { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        .ad-row { cursor:pointer; transition:background 0.12s; }
        .ad-row:hover { background:#f0f6ff !important; }
        .ad-edit-btn:hover { background:#eff6ff !important; color:#1557b0 !important; }
        .ad-dl-item:hover { background:#f0f6ff; }
        .ad-filter:focus { border-color:#1557b0 !important; box-shadow:0 0 0 3px rgba(21,87,176,0.1) !important; }
      `}</style>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Total Admins",    value: admins.length,   accent: "#1557b0" },
          { label: "Active Admins",   value: totalActive,     accent: "#059669" },
          { label: "Inactive Admins", value: totalInactive,   accent: "#dc2626" },
          { label: "Showing",         value: filtered.length, accent: "#0284c7" },
        ].map((c, i) => (
          <div key={i} style={{
            background: "#fff", borderRadius: 14, padding: "18px 20px",
            border: "1px solid #e2e8f0", borderLeft: `4px solid ${c.accent}`,
            display: "flex", alignItems: "center", gap: 14,
            transition: "box-shadow 0.2s,transform 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(21,87,176,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}
          >
            <div style={{ width: 42, height: 42, background: `${c.accent}12`, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 700, color: "#0a2a5e", lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 3 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Role distribution */}
      {roleGroups.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", marginBottom: 12 }}>Role Distribution</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {roleGroups.map(r => {
              const rc2 = roleColors[r.value] || { bg: "#f1f5f9", color: "#64748b" };
              return (
                <div key={r.value} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 14px",
                  background: rc2.bg, borderRadius: 20, border: `1px solid ${rc2.color}22`,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: rc2.color, display: "inline-block" }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: rc2.color }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: rc2.color }}>{r.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          <input className="ad-filter" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, username or email…"
            style={{ width: "100%", padding: "9px 12px 9px 36px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", outline: "none", background: "#fafbff", color: "#0f172a", boxSizing: "border-box" }}
          />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          style={{ padding: "9px 13px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", color: roleFilter ? "#0f172a" : "#94a3b8", background: "#fafbff", cursor: "pointer", outline: "none", minWidth: 150 }}>
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

        {/* Download */}
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
              boxShadow: "0 12px 40px rgba(0,0,0,0.1)", minWidth: 180, zIndex: 200, overflow: "hidden",
            }}>
              <button className="ad-dl-item" onClick={() => { downloadAdminsCSV(filtered, departments); setDlMenu(false); }} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "11px 16px", border: "none", background: "none",
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, color: "#0f172a",
              }}>
                <span>📊</span> Export as CSV
              </button>
            </div>
          )}
        </div>

        {/* Add Admin */}
        <button onClick={() => setModal("add")} style={{
          padding: "9px 18px", borderRadius: 10, border: "none",
          background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
          cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8, transition: "opacity 0.15s",
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
            <div style={{ width: 36, height: 36, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} />
            <p style={{ color: "#64748b", fontSize: 14 }}>Loading admins…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280, gap: 12, color: "#94a3b8" }}>
            <div style={{ fontSize: 28 }}>🛡️</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>No admins found</div>
            <div style={{ fontSize: 13 }}>Try adjusting your search or filters</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  {["Admin", "Username", "Contact", "Role", "Department", "Status", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: "13px 16px", textAlign: "left",
                      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
                      textTransform: "uppercase", color: "#94a3b8",
                      background: "#f8faff", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((adm, i) => {
                  const rc2  = roleColors[adm.role] || { bg: "#f1f5f9", color: "#64748b" };
                  const dept = departments.find(d => d.id === adm.department);
                  return (
                    <tr key={adm.id} className="ad-row"
                      style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbff" }}
                      onClick={() => openDetail(adm)}
                    >
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          <Avatar name={adm.full_name} size={36} />
                          <div>
                            <div style={{ fontWeight: 600, color: "#0f172a", lineHeight: 1.3 }}>{adm.full_name}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                              {adm.is_active
                                ? <span style={{ color: "#059669" }}>● Active</span>
                                : <span style={{ color: "#dc2626" }}>● Inactive</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 12.5, background: "#eff6ff", color: "#1557b0", padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>
                          {adm.username}
                        </span>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontSize: 13, color: "#0f172a" }}>{adm.email || "—"}</div>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: rc2.bg, color: rc2.color,
                          fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                          border: `1px solid ${rc2.color}22`,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: rc2.color, display: "inline-block" }} />
                          {roleLabel(adm.role)}
                        </span>
                      </td>
                      <td style={{ padding: "13px 16px", color: "#64748b", fontSize: 13 }}>
                        {dept?.name || adm.department_name || "—"}
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700,
                          padding: "3px 10px", borderRadius: 20,
                          background: adm.is_active ? "#ecfdf5" : "#f1f5f9",
                          color: adm.is_active ? "#059669" : "#94a3b8",
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: adm.is_active ? "#059669" : "#94a3b8", display: "inline-block" }} />
                          {adm.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "13px 14px", width: 50 }} onClick={e => e.stopPropagation()}>
                        <button className="ad-edit-btn" onClick={e => { e.stopPropagation(); setEditTarget(adm); }} title="Edit admin"
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
          <div style={{ padding: "12px 18px", borderTop: "1px solid #f1f5f9", fontSize: 12, color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
            <span>Showing <b style={{ color: "#0f172a" }}>{filtered.length}</b> of <b style={{ color: "#0f172a" }}>{admins.length}</b> admins</span>
            <span>Click any row to view full profile & activity</span>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === "add" && (
        <AddAdminModal
          onClose={() => setModal(null)}
          onSave={() => load()}
          showToast={showToast}
        />
      )}
      {editTarget && (
        <EditAdminModal
          admin={editTarget}
          departments={departments}
          onClose={() => setEditTarget(null)}
          onSave={() => { load(); setEditTarget(null); }}
          showToast={showToast}
        />
      )}
      {detailOpen && selected && (
        <AdminDetail
          admin={selected}
          departments={departments}
          onClose={() => setDetailOpen(false)}
          onEdit={(adm) => { setDetailOpen(false); setEditTarget(adm); }}
          onToggle={handleToggle}
          showToast={showToast}
        />
      )}
    </>
  );
}