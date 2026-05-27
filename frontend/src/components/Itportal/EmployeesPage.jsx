import { useState, useEffect, useRef } from "react";
import { useITPortal } from "../../context/ITPortalContext";

const API = "${import.meta.env.VITE_API_BASE_URL}/api";

function authHeaders() {
  const token = localStorage.getItem("access_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ── Utility: generate employee number ────────────────────────────────────────
function generateEmployeeNumber(existingNumbers = []) {
  const year = new Date().getFullYear().toString().slice(2);
  let num = 1;
  while (existingNumbers.includes(`EMP${year}${String(num).padStart(4, "0")}`)) num++;
  return `EMP${year}${String(num).padStart(4, "0")}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    employed:  { bg: "#ecfdf5", color: "#059669", label: "Employed" },
    retired:   { bg: "#f0f9ff", color: "#0284c7", label: "Retired" },
    dismissed: { bg: "#fef2f2", color: "#dc2626", label: "Dismissed" },
    resigned:  { bg: "#fffbeb", color: "#d97706", label: "Resigned" },
    suspended: { bg: "#fdf4ff", color: "#9333ea", label: "Suspended" },
  };
  const s = map[status] || { bg: "#f1f5f9", color: "#64748b", label: status };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
      padding: "3px 10px", borderRadius: 20,
      border: `1px solid ${s.color}22`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────────
function EmpAvatar({ name, size = 34, photo = null }) {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["#0e3d82","#1557b0","#1a6fd4","#0a2a5e","#4a90d9"];
  const ci = (name.charCodeAt(0) || 0) % colors.length;
  const radius = size >= 56 ? 16 : 10;
  if (photo) {
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, overflow: "hidden",
        flexShrink: 0, border: "2px solid rgba(255,255,255,0.2)",
      }}>
        <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: `linear-gradient(135deg, ${colors[ci]}, ${colors[(ci+2)%colors.length]})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: "#fff",
      flexShrink: 0, letterSpacing: 0.5,
    }}>{initials}</div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 560 }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,26,80,0.52)",
      zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, animation: "empFadeIn 0.18s ease",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 18, width: "100%", maxWidth,
        boxShadow: "0 28px 72px rgba(0,0,0,0.18)",
        animation: "empSlideUp 0.25s cubic-bezier(0.22,1,0.36,1) both",
        maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
          padding: "18px 22px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>{title}</span>
          <button onClick={onClose} style={{
            width: 30, height: 30, background: "rgba(255,255,255,0.15)",
            border: "none", borderRadius: 8, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "#fff",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Form field helpers ────────────────────────────────────────────────────────
function FField({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#64748b", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 13px",
  border: "1.5px solid #e2e8f0", borderRadius: 9,
  fontSize: 13.5, fontFamily: "'DM Sans',sans-serif",
  color: "#0f172a", background: "#fafbff", outline: "none",
  boxSizing: "border-box",
};

function FInput({ value, onChange, type = "text", placeholder = "", required }) {
  return (
    <input
      style={inputStyle} type={type} value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder} required={required}
      onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
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

// ── File Upload Field ─────────────────────────────────────────────────────────
function FFileUpload({ label, hint, accept, file, onChange, existingUrl }) {
  const ref = useRef();
  const name = file?.name || (existingUrl ? existingUrl.split("/").pop() : null);
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div
        onClick={() => ref.current.click()}
        style={{
          border: "1.5px dashed #c7d8f0", borderRadius: 10, padding: "12px 14px",
          cursor: "pointer", background: "#f8faff", display: "flex", alignItems: "center", gap: 10,
          transition: "border-color 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#1557b0"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "#c7d8f0"}
      >
        <div style={{ width: 32, height: 32, background: "#e8f0ff", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="2.2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {name
            ? <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            : <div style={{ fontSize: 13, color: "#94a3b8" }}>Click to upload {hint && <span style={{ fontSize: 11.5 }}>({hint})</span>}</div>
          }
          {existingUrl && !file && <div style={{ fontSize: 11, color: "#1557b0", marginTop: 1 }}>Current file on server</div>}
        </div>
        {(file || existingUrl) && (
          <button onClick={e => { e.stopPropagation(); onChange(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept={accept} style={{ display: "none" }} onChange={e => onChange(e.target.files[0] || null)} />
    </div>
  );
}

// ── Profile Picture Upload ────────────────────────────────────────────────────
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
            : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          }
        </div>
        <button
          onClick={() => ref.current.click()}
          style={{
            position: "absolute", bottom: -4, right: -4,
            width: 22, height: 22, borderRadius: 6, background: "#1557b0",
            border: "2px solid #fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>Profile Photo</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Optional — JPG or PNG, max 5MB</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => ref.current.click()} style={{
            padding: "5px 12px", borderRadius: 7, border: "1.5px solid #1557b0",
            background: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            fontSize: 12, color: "#1557b0", fontWeight: 600,
          }}>{preview ? "Change" : "Upload"}</button>
          {preview && (
            <button onClick={() => onChange(null)} style={{
              padding: "5px 12px", borderRadius: 7, border: "1.5px solid #e2e8f0",
              background: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              fontSize: 12, color: "#64748b",
            }}>Remove</button>
          )}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
        onChange={e => onChange(e.target.files[0] || null)} />
    </div>
  );
}

// ── Add/Edit Employee Modal ───────────────────────────────────────────────────
function EmployeeFormModal({ employee, departments, existingNumbers, onClose, onSave, showToast }) {
  const isEdit = !!employee;
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");

  // File state (held separately from JSON form)
  const [profilePic, setProfilePic] = useState(null);
  const [cvFile, setCvFile] = useState(null);
  const [certFile, setCertFile] = useState(null);

  const [form, setForm] = useState({
    // Personal
    first_name:    employee?.first_name    || "",
    last_name:     employee?.last_name     || "",
    middle_name:   employee?.middle_name   || "",
    date_of_birth: employee?.date_of_birth || "",
    national_id:   employee?.national_id   || "",
    gender:        employee?.gender        || "",
    phone_number:  employee?.phone_number  || "",
    email:         employee?.email         || "",
    address:       employee?.address       || "",
    // Next of Kin
    nok_full_name:     employee?.nok_full_name     || "",
    nok_relationship:  employee?.nok_relationship  || "",
    nok_phone:         employee?.nok_phone         || "",
    nok_email:         employee?.nok_email         || "",
    nok_address:       employee?.nok_address       || "",
    nok_national_id:   employee?.nok_national_id   || "",
    // Employment
    employee_number:   employee?.employee_number   || generateEmployeeNumber(existingNumbers),
    department:        employee?.department        || "",
    job_title:         employee?.job_title         || "",
    date_joined:       employee?.date_joined       || "",
    employment_type:   employee?.employment_type   || "",
    contract_start:    employee?.contract_start    || "",
    contract_end:      employee?.contract_end      || "",
    highest_education: employee?.highest_education || "",
    status:            employee?.status            || "employed",
    status_reason:     employee?.status_reason     || "",
  });

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const validate = () => {
    const req = ["first_name","last_name","date_of_birth","national_id","gender","phone_number","address","employee_number","job_title","employment_type","status"];
    for (const k of req) {
      if (!form[k]) { showToast(`${k.replace(/_/g," ")} is required.`, "err"); return false; }
    }
    if (form.employment_type === "contract") {
      if (!form.contract_start) { showToast("Contract start date is required for contract employees.", "err"); return false; }
      if (!form.contract_end)   { showToast("Contract end date is required for contract employees.", "err"); return false; }
    } else {
      if (!form.date_joined) { showToast("Started work at date is required.", "err"); return false; }
    }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      // Build FormData to support file uploads
      const fd = new FormData();
      const textFields = { ...form };
      // For contract employees, set date_joined = contract_start so backend has a valid date
      if (textFields.employment_type === "contract" && textFields.contract_start) {
        textFields.date_joined = textFields.contract_start;
      }
      // For non-contract, clear contract fields
      if (textFields.employment_type !== "contract") {
        delete textFields.contract_start;
        delete textFields.contract_end;
      }
      if (!textFields.department) delete textFields.department;
      // Remove empty optional fields to avoid backend validation errors
      ["contract_start","contract_end","nok_full_name","nok_relationship","nok_phone",
       "nok_email","nok_address","nok_national_id","highest_education"].forEach(k => {
        if (!textFields[k]) delete textFields[k];
      });
      Object.entries(textFields).forEach(([k, v]) => fd.append(k, v));
      if (profilePic) fd.append("profile_picture", profilePic);
      if (cvFile)     fd.append("cv", cvFile);
      if (certFile)   fd.append("highest_education_certificate", certFile);

      const token = localStorage.getItem("access_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const url    = isEdit ? `${API}/employees/${employee.id}/` : `${API}/employees/`;
      const method = isEdit ? "PATCH" : "POST";
      const res  = await fetch(url, { method, headers, body: fd });
      const data = await res.json();
      if (!res.ok) {
        const msg = Object.values(data)[0];
        showToast(Array.isArray(msg) ? msg[0] : msg || "Failed to save.", "err");
        return;
      }
      showToast(isEdit ? "Employee updated." : "Employee added.");
      onSave(data);
      onClose();
    } catch { showToast("Server error.", "err"); }
    finally { setBusy(false); }
  };

  const tabs = ["personal", "nextofkin", "employment"];
  const tabLabel = { personal: "Personal Info", nextofkin: "Next of Kin", employment: "Employment" };
  const tabIdx   = tabs.indexOf(activeTab);
  const prevTab  = tabIdx > 0 ? tabs[tabIdx - 1] : null;
  const nextTab  = tabIdx < tabs.length - 1 ? tabs[tabIdx + 1] : null;

  return (
    <Modal title={isEdit ? `Edit — ${employee.first_name} ${employee.last_name}` : "Add New Employee"} onClose={onClose} maxWidth={660}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 22, borderBottom: "1px solid #e2e8f0" }}>
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: "9px 20px", border: "none", background: "none", cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: activeTab === t ? 700 : 500,
            color: activeTab === t ? "#1557b0" : "#64748b",
            borderBottom: activeTab === t ? "2.5px solid #1557b0" : "2.5px solid transparent",
            marginBottom: -1, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", fontSize: 10, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: activeTab === t ? "#1557b0" : "#e2e8f0",
              color: activeTab === t ? "#fff" : "#64748b",
            }}>{i + 1}</span>
            {tabLabel[t]}
          </button>
        ))}
      </div>

      {/* ── Personal Info Tab ── */}
      {activeTab === "personal" && (
        <>
          <ProfilePicUpload
            file={profilePic}
            onChange={setProfilePic}
            existingUrl={employee?.profile_picture || null}
          />
          <div style={{ borderTop: "1px solid #f1f5f9", marginBottom: 16 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <FField label="First Name *"><FInput value={form.first_name} onChange={set("first_name")} /></FField>
            <FField label="Last Name *"><FInput value={form.last_name} onChange={set("last_name")} /></FField>
            <FField label="Middle Name"><FInput value={form.middle_name} onChange={set("middle_name")} /></FField>
            <FField label="Date of Birth *"><FInput type="date" value={form.date_of_birth} onChange={set("date_of_birth")} /></FField>
            <FField label="National ID *"><FInput value={form.national_id} onChange={set("national_id")} /></FField>
            <FField label="Gender *">
              <FSelect value={form.gender} onChange={set("gender")} placeholder="Select gender" options={[
                { value: "M", label: "Male" },
                { value: "F", label: "Female" },
                { value: "O", label: "Other" },
              ]} />
            </FField>
            <FField label="Phone Number *"><FInput value={form.phone_number} onChange={set("phone_number")} /></FField>
            <FField label="Email Address"><FInput type="email" value={form.email} onChange={set("email")} /></FField>
          </div>
          <FField label="Address *">
            <textarea
              style={{ ...inputStyle, minHeight: 68, resize: "vertical" }}
              value={form.address} onChange={e => set("address")(e.target.value)}
              onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
              onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
            />
          </FField>
        </>
      )}

      {/* ── Next of Kin Tab ── */}
      {activeTab === "nextofkin" && (
        <>
          <div style={{ background: "#f0f6ff", border: "1px solid #d1e3ff", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 12.5, color: "#1557b0" }}>
            <strong>Next of Kin</strong> — Emergency contact information. All fields are optional but recommended.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <FField label="Full Name">
              <FInput value={form.nok_full_name} onChange={set("nok_full_name")} placeholder="e.g. Nyasha Moyo" />
            </FField>
            <FField label="Relationship">
              <FSelect value={form.nok_relationship} onChange={set("nok_relationship")} placeholder="Select relationship" options={[
                { value: "spouse",  label: "Spouse" },
                { value: "parent",  label: "Parent" },
                { value: "sibling", label: "Sibling" },
                { value: "child",   label: "Child" },
                { value: "guardian",label: "Guardian" },
                { value: "friend",  label: "Friend" },
                { value: "other",   label: "Other" },
              ]} />
            </FField>
            <FField label="Phone Number">
              <FInput value={form.nok_phone} onChange={set("nok_phone")} placeholder="+263 7xx xxx xxx" />
            </FField>
            <FField label="Email Address">
              <FInput type="email" value={form.nok_email} onChange={set("nok_email")} placeholder="email@example.com" />
            </FField>
            <FField label="National ID">
              <FInput value={form.nok_national_id} onChange={set("nok_national_id")} placeholder="63-123456X78" />
            </FField>
          </div>
          <FField label="Home Address">
            <textarea
              style={{ ...inputStyle, minHeight: 68, resize: "vertical" }}
              value={form.nok_address} onChange={e => set("nok_address")(e.target.value)}
              placeholder="Street, suburb, city…"
              onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
              onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
            />
          </FField>
        </>
      )}

      {/* ── Employment Tab ── */}
      {activeTab === "employment" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <FField label="Employee Number *">
              <FInput value={form.employee_number} onChange={set("employee_number")} />
            </FField>
            <FField label="Job Title *"><FInput value={form.job_title} onChange={set("job_title")} /></FField>
            <FField label="Department">
              <FSelect value={form.department} onChange={set("department")} placeholder="Select department" options={departments.map(d => ({ value: d.id, label: d.name }))} />
            </FField>
            <FField label="Employment Type *">
              <FSelect value={form.employment_type} onChange={val => {
                if (val !== "contract") {
                  setForm(f => ({ ...f, employment_type: val, contract_start: "", contract_end: "" }));
                } else {
                  set("employment_type")(val);
                }
              }} placeholder="Select type" options={[
                { value: "full_time", label: "Full Time" },
                { value: "part_time", label: "Part Time" },
                { value: "contract",  label: "Contract" },
              ]} />
            </FField>
            <FField label="Status *">
              <FSelect value={form.status} onChange={set("status")} options={[
                { value: "employed",  label: "Employed" },
                { value: "retired",   label: "Retired" },
                { value: "dismissed", label: "Dismissed" },
                { value: "resigned",  label: "Resigned" },
                { value: "suspended", label: "Suspended" },
              ]} />
            </FField>
            {/* Contract: show start + end. Non-contract: show "Started Work At" using date_joined */}
            {form.employment_type === "contract" ? (
              <>
                <FField label="Contract Start Date *">
                  <FInput type="date" value={form.contract_start} onChange={set("contract_start")} />
                </FField>
                <FField label="Contract End Date *">
                  <FInput type="date" value={form.contract_end} onChange={set("contract_end")} />
                </FField>
                {form.contract_start && form.contract_end && (() => {
                  const start = new Date(form.contract_start);
                  const end   = new Date(form.contract_end);
                  const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                  if (totalMonths <= 0) return null;
                  return (
                    <div style={{ gridColumn: "1 / -1", background: "#f0f6ff", border: "1px solid #d1e3ff", borderRadius: 10, padding: "9px 14px", fontSize: 12.5, color: "#1557b0", display: "flex", alignItems: "center", gap: 8 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Contract duration: <strong>{totalMonths} month{totalMonths !== 1 ? "s" : ""}</strong>
                    </div>
                  );
                })()}
              </>
            ) : (
              <FField label="Started Work At *">
                <FInput type="date" value={form.date_joined} onChange={set("date_joined")} />
              </FField>
            )}
            <FField label="Highest Education Level" style={{ gridColumn: "1 / -1" }}>
              <FSelect value={form.highest_education} onChange={set("highest_education")} placeholder="Select highest level" options={[
                { value: "o_level",     label: "O Level" },
                { value: "a_level",     label: "A Level" },
                { value: "certificate", label: "Certificate" },
                { value: "diploma",     label: "Diploma" },
                { value: "degree",      label: "Degree" },
                { value: "honours",     label: "Honours Degree" },
                { value: "masters",     label: "Masters" },
                { value: "phd",         label: "PhD" },
              ]} />
            </FField>
          </div>

          {["retired","dismissed","suspended"].includes(form.status) && (
            <FField label="Status Reason">
              <textarea
                style={{ ...inputStyle, minHeight: 68, resize: "vertical" }}
                value={form.status_reason} onChange={e => set("status_reason")(e.target.value)}
                placeholder="Briefly describe the reason…"
                onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
                onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
              />
            </FField>
          )}

          {/* File uploads */}
          <div style={{ marginTop: 18, borderTop: "1px solid #f1f5f9", paddingTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", marginBottom: 14 }}>Documents</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <FFileUpload
                label="Curriculum Vitae (CV)"
                hint="PDF or Word"
                accept=".pdf,.doc,.docx"
                file={cvFile}
                onChange={setCvFile}
                existingUrl={employee?.cv || null}
              />
              <FFileUpload
                label="Education Certificate"
                hint="PDF or image"
                accept=".pdf,.jpg,.jpeg,.png"
                file={certFile}
                onChange={setCertFile}
                existingUrl={employee?.highest_education_certificate || null}
              />
            </div>
          </div>
        </>
      )}

      {/* Navigation footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, paddingTop: 18, borderTop: "1px solid #e2e8f0" }}>
        <div>
          {prevTab && (
            <button onClick={() => setActiveTab(prevTab)} style={{
              padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0",
              background: "#f8faff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5,
            }}>← Back</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            padding: "9px 20px", borderRadius: 9, border: "1.5px solid #e2e8f0",
            background: "#f1f5f9", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5,
          }}>Cancel</button>
          {nextTab ? (
            <button onClick={() => setActiveTab(nextTab)} style={{
              padding: "9px 22px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
              cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
            }}>Next →</button>
          ) : (
            <button onClick={save} disabled={busy} style={{
              padding: "9px 22px", borderRadius: 9, border: "none",
              background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
              fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
            }}>{busy ? "Saving…" : isEdit ? "Save Changes" : "Add Employee"}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Employee Detail Drawer ─────────────────────────────────────────────────────
function EmployeeDetail({ employee, departments, onClose, onEdit, showToast, onRefresh, activeMonth }) {
  const [attendance, setAttendance] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusReason, setStatusReason] = useState("");
  const [pendingStatus, setPendingStatus] = useState(null);
  const [localEmployee, setLocalEmployee] = useState(employee);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fullName = `${localEmployee.first_name} ${localEmployee.middle_name ? localEmployee.middle_name + " " : ""}${localEmployee.last_name}`;
  const dept = departments.find(d => d.id === localEmployee.department);

  useEffect(() => {
    const y = activeMonth ? activeMonth.year : new Date().getFullYear();
    const m = activeMonth ? activeMonth.month : new Date().getMonth();
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    setAttendance(null);
    fetch(`${API}/attendance/?employee=${localEmployee.id}&date_after=${from}&date_before=${to}&page_size=200`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : d.results || [];
        const present = list.filter(a => a.status === "present").length;
        const total = list.length;
        setAttendance({ present, total, absent: list.filter(a => a.status === "absent").length, late: list.filter(a => a.status === "late").length });
      })
      .catch(() => setAttendance({ present: 0, total: 0, absent: 0, late: 0 }));
  }, [localEmployee.id, activeMonth?.year, activeMonth?.month]);

  const infoRow = (label, value) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: 14, color: "#0f172a", fontWeight: 500 }}>{value || "—"}</span>
    </div>
  );

  const genderMap = { M: "Male", F: "Female", O: "Other" };
  const etMap = { full_time: "Full Time", part_time: "Part Time", contract: "Contract" };

  const statusOptions = [
    { value: "employed",  label: "Employed",  color: "#059669", bg: "#ecfdf5" },
    { value: "suspended", label: "Suspended", color: "#9333ea", bg: "#fdf4ff" },
    { value: "retired",   label: "Retired",   color: "#0284c7", bg: "#f0f9ff" },
    { value: "resigned",  label: "Resigned",  color: "#d97706", bg: "#fffbeb" },
    { value: "dismissed", label: "Dismissed", color: "#dc2626", bg: "#fef2f2" },
  ];
  const needsReason = ["suspended", "retired", "dismissed"];

  const applyStatusChange = async (newStatus) => {
    if (needsReason.includes(newStatus) && !statusReason.trim()) {
      showToast("Please provide a reason for this status change.", "err");
      return;
    }
    setStatusBusy(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API}/employees/${localEmployee.id}/status/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: newStatus, reason: statusReason }),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || "Failed to update status.", "err");
        return;
      }
      const updated = { ...localEmployee, status: newStatus, status_reason: statusReason };
      setLocalEmployee(updated);
      setPendingStatus(null);
      setStatusReason("");
      showToast(`Status updated to ${newStatus}.`);
      // Propagate to context so the table reflects the change immediately
      onRefresh && onRefresh();
    } catch { showToast("Server error.", "err"); }
    finally { setStatusBusy(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,26,80,0.5)",
      zIndex: 700, display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
      animation: "empFadeIn 0.18s ease",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: "min(520px, 100vw)", height: "100vh", background: "#fff",
        display: "flex", flexDirection: "column",
        boxShadow: "-20px 0 60px rgba(0,0,0,0.15)",
        animation: "empSlideRight 0.28s cubic-bezier(0.22,1,0.36,1) both",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg,#0a2a5e 0%,#1557b0 60%,#1a6fd4 100%)",
          padding: "28px 24px 24px",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
            <button onClick={onClose} style={{
              width: 32, height: 32, background: "rgba(255,255,255,0.15)",
              border: "none", borderRadius: 8, cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <button onClick={onEdit} style={{
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
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <EmpAvatar name={fullName} size={60} photo={localEmployee.profile_picture || null} />
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{fullName}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>{localEmployee.job_title}</div>
              <div style={{ marginTop: 8 }}><StatusBadge status={localEmployee.status} /></div>
            </div>
          </div>
          {/* Mini stat strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 20 }}>
            {[
              { label: "Employee ID", val: localEmployee.employee_number },
              { label: "Department", val: dept?.name || "—" },
              { label: "Type", val: etMap[localEmployee.employment_type] || "—" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Body scroll */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>

          {/* ── Quick Status Change ── */}
          <div style={{ background: "#f8faff", borderRadius: 14, padding: 16, marginBottom: 22, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", marginBottom: 12 }}>Quick Status Change</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {statusOptions.map(opt => {
                const isCurrent = localEmployee.status === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { if (!isCurrent) setPendingStatus(pendingStatus === opt.value ? null : opt.value); }}
                    style={{
                      padding: "6px 14px", borderRadius: 20, cursor: isCurrent ? "default" : "pointer",
                      fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                      border: `1.5px solid ${isCurrent ? opt.color : opt.color + "55"}`,
                      background: isCurrent ? opt.bg : "#fff",
                      color: opt.color,
                      opacity: isCurrent ? 1 : 0.75,
                      transition: "all 0.15s",
                      outline: pendingStatus === opt.value ? `2px solid ${opt.color}` : "none",
                      outlineOffset: 2,
                    }}
                    onMouseEnter={e => { if (!isCurrent) { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = opt.bg; } }}
                    onMouseLeave={e => { if (!isCurrent) { e.currentTarget.style.opacity = "0.75"; e.currentTarget.style.background = "#fff"; } }}
                  >
                    {isCurrent && <span style={{ marginRight: 5 }}>✓</span>}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {pendingStatus && (
              <div style={{ marginTop: 14, borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
                {needsReason.includes(pendingStatus) && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#64748b", marginBottom: 5 }}>Reason <span style={{ color: "#dc2626" }}>*</span></div>
                    <textarea
                      value={statusReason}
                      onChange={e => setStatusReason(e.target.value)}
                      placeholder={`Briefly describe why this employee is being marked as ${pendingStatus}…`}
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "9px 12px",
                        border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13,
                        fontFamily: "'DM Sans',sans-serif", resize: "vertical", minHeight: 64,
                        outline: "none", color: "#0f172a",
                      }}
                      onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
                      onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => applyStatusChange(pendingStatus)}
                    disabled={statusBusy}
                    style={{
                      padding: "7px 18px", borderRadius: 9, border: "none",
                      background: statusOptions.find(o => o.value === pendingStatus)?.color || "#1557b0",
                      color: "#fff", cursor: statusBusy ? "not-allowed" : "pointer",
                      fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
                      opacity: statusBusy ? 0.6 : 1,
                    }}
                  >{statusBusy ? "Updating…" : `Confirm: ${pendingStatus}`}</button>
                  <button
                    onClick={() => { setPendingStatus(null); setStatusReason(""); }}
                    style={{
                      padding: "7px 14px", borderRadius: 9, border: "1.5px solid #e2e8f0",
                      background: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                      fontSize: 13, color: "#64748b",
                    }}
                  >Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Attendance summary — filtered to selected month */}
          {(() => {
            const _y = activeMonth ? activeMonth.year : new Date().getFullYear();
            const _m = activeMonth ? activeMonth.month : new Date().getMonth();
            const monthName = new Date(_y, _m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
            return (
              <div style={{ background: "#f8faff", borderRadius: 14, padding: 18, marginBottom: 22, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8" }}>Attendance — {monthName}</div>
                  </div>
                  <button onClick={() => setHistoryOpen(true)} style={{
                    padding: "5px 12px", borderRadius: 8, border: "1.5px solid #1557b0",
                    background: "#eff6ff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    fontSize: 11.5, color: "#1557b0", fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Full History
                  </button>
                </div>
                {attendance ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                    {[
                      { label: "Present", val: attendance.present, color: "#059669" },
                      { label: "Absent", val: attendance.absent, color: "#dc2626" },
                      { label: "Late", val: attendance.late, color: "#d97706" },
                      { label: "Recorded", val: attendance.total, color: "#1557b0" },
                    ].map((a, i) => (
                      <div key={i} style={{ textAlign: "center", background: "#fff", borderRadius: 10, padding: "10px 6px", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: a.color }}>{a.val}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2, fontWeight: 600 }}>{a.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                    <div style={{ width: 22, height: 22, border: "2.5px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "empFadeIn 0.75s linear infinite" }} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Personal Info */}
          <Section title="Personal Information">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {infoRow("Full Name", fullName)}
              {infoRow("Gender", genderMap[localEmployee.gender])}
              {infoRow("Date of Birth", localEmployee.date_of_birth)}
              {infoRow("National ID", localEmployee.national_id)}
              {infoRow("Phone", localEmployee.phone_number)}
              {infoRow("Email", localEmployee.email)}
            </div>
            <div style={{ marginTop: 14 }}>{infoRow("Address", localEmployee.address)}</div>
          </Section>

          {/* Next of Kin */}
          {(localEmployee.nok_full_name || localEmployee.nok_phone) && (
            <Section title="Next of Kin">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {infoRow("Full Name", localEmployee.nok_full_name)}
                {infoRow("Relationship", localEmployee.nok_relationship && (localEmployee.nok_relationship.charAt(0).toUpperCase() + localEmployee.nok_relationship.slice(1)))}
                {infoRow("Phone", localEmployee.nok_phone)}
                {infoRow("Email", localEmployee.nok_email)}
                {infoRow("National ID", localEmployee.nok_national_id)}
              </div>
              {localEmployee.nok_address && <div style={{ marginTop: 14 }}>{infoRow("Address", localEmployee.nok_address)}</div>}
            </Section>
          )}

          {/* Employment Info */}
          <Section title="Employment Details">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {infoRow("Employee Number", localEmployee.employee_number)}
              {infoRow("Job Title", localEmployee.job_title)}
              {infoRow("Department", dept?.name)}
              {infoRow("Employment Type", etMap[localEmployee.employment_type])}
              {infoRow("Status", localEmployee.status)}
              {localEmployee.employment_type === "contract" ? (
                <>
                  {infoRow("Contract Start", localEmployee.contract_start)}
                  {infoRow("Contract End", localEmployee.contract_end)}
                </>
              ) : (
                infoRow("Started Work At", localEmployee.date_joined)
              )}
              {localEmployee.highest_education && infoRow("Highest Education", localEmployee.highest_education.replace(/_/g," ").replace(/\b\w/g, c => c.toUpperCase()))}
            </div>
            {localEmployee.status_reason && (
              <div style={{ marginTop: 14 }}>
                {infoRow("Status Reason", localEmployee.status_reason)}
              </div>
            )}
            {/* ── Contract / Tenure duration card ── */}
            {(() => {
              const now = new Date();
              if (localEmployee.employment_type === "contract" && localEmployee.contract_start && localEmployee.contract_end) {
                const start = new Date(localEmployee.contract_start);
                const end   = new Date(localEmployee.contract_end);
                const totalMonths   = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                const elapsedMonths = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
                const remainingMonths = Math.max(0, totalMonths - elapsedMonths);
                const isExpired = now > end;
                const progress = totalMonths > 0 ? Math.min(100, (elapsedMonths / totalMonths) * 100) : 0;
                const barColor = isExpired ? "#dc2626" : remainingMonths <= 1 ? "#d97706" : "#1557b0";
                return (
                  <div style={{ marginTop: 16, background: isExpired ? "#fef2f2" : "#f0f6ff", border: `1px solid ${isExpired ? "#fecaca" : "#d1e3ff"}`, borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: isExpired ? "#dc2626" : "#1557b0", marginBottom: 10 }}>
                      {isExpired ? "⚠ Contract Expired" : "Contract Progress"}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: "#0a2a5e" }}>{totalMonths}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 1 }}>Total Months</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: barColor }}>{elapsedMonths}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 1 }}>Months Elapsed</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: isExpired ? "#dc2626" : remainingMonths <= 1 ? "#d97706" : "#059669" }}>{remainingMonths}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 1 }}>{isExpired ? "Months Overdue" : "Months Remaining"}</div>
                      </div>
                    </div>
                    <div style={{ background: "#e2e8f0", borderRadius: 4, height: 7, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${progress}%`, background: barColor, borderRadius: 4, transition: "width 0.6s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, textAlign: "right" }}>
                      {isExpired ? `Contract ended ${Math.abs(remainingMonths) || Math.round((now - end) / (1000*60*60*24))} days ago` : `Ends ${end.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
                    </div>
                  </div>
                );
              } else if (localEmployee.date_joined) {
                // Non-contract: show months on the job
                const start = new Date(localEmployee.date_joined);
                const totalMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                const years  = Math.floor(totalMonths / 12);
                const months = totalMonths % 12;
                const tenure = years > 0
                  ? `${years} year${years !== 1 ? "s" : ""}${months > 0 ? `, ${months} month${months !== 1 ? "s" : ""}` : ""}`
                  : `${months} month${months !== 1 ? "s" : ""}`;
                return (
                  <div style={{ marginTop: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#059669", marginBottom: 10 }}>Time on the Job</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: "#059669" }}>{totalMonths}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 1 }}>Total Months</div>
                      </div>
                      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#0a2a5e" }}>{tenure}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 1 }}>of service</div>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </Section>

          {/* Documents */}
          {(localEmployee.cv || localEmployee.highest_education_certificate) && (
            <Section title="Documents">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {localEmployee.cv && (
                  <a href={localEmployee.cv} target="_blank" rel="noopener noreferrer" style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", background: "#f8faff",
                    border: "1px solid #e2e8f0", borderRadius: 10,
                    textDecoration: "none", color: "#0f172a", fontSize: 13,
                  }}>
                    <div style={{ width: 30, height: 30, background: "#e8f0ff", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="2.2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div><div style={{ fontWeight: 600, fontSize: 13 }}>Curriculum Vitae</div><div style={{ fontSize: 11, color: "#94a3b8" }}>Click to view</div></div>
                  </a>
                )}
                {localEmployee.highest_education_certificate && (
                  <a href={localEmployee.highest_education_certificate} target="_blank" rel="noopener noreferrer" style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", background: "#f8faff",
                    border: "1px solid #e2e8f0", borderRadius: 10,
                    textDecoration: "none", color: "#0f172a", fontSize: 13,
                  }}>
                    <div style={{ width: 30, height: 30, background: "#e8f0ff", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="2.2" strokeLinecap="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                    </div>
                    <div><div style={{ fontWeight: 600, fontSize: 13 }}>Education Certificate</div><div style={{ fontSize: 11, color: "#94a3b8" }}>Click to view</div></div>
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* Qualifications */}
          {localEmployee.qualifications?.length > 0 && (
            <Section title="Academic Qualifications">
              {localEmployee.qualifications.map((q, i) => (
                <div key={i} style={{
                  background: "#f8faff", borderRadius: 10, padding: "12px 14px",
                  border: "1px solid #e2e8f0", marginBottom: 10,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0a2a5e" }}>{q.level?.replace(/_/g," ").toUpperCase()}</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{q.institution} · {q.field_of_study}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Obtained: {q.year_obtained}</div>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
      {/* Full-page attendance history overlay */}
      {historyOpen && (
        <AttendanceHistoryPage
          employee={localEmployee}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: 1.2, color: "#1557b0", marginBottom: 14,
        paddingBottom: 8, borderBottom: "1px solid #e2e8f0",
      }}>{title}</div>
      {children}
    </div>
  );
}

// ── Attendance History Page (full-screen overlay) ────────────────────────────
function AttendanceHistoryPage({ employee, onClose }) {
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });

  useEffect(() => {
    setLoading(true);
    // Fetch up to 2 years of records
    fetch(`${API}/attendance/?employee=${employee.id}&page_size=1000`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setAllRecords(Array.isArray(d) ? d : d.results || []); })
      .catch(() => setAllRecords([]))
      .finally(() => setLoading(false));
  }, [employee.id]);

  // Group records by YYYY-MM
  const byMonth = {};
  allRecords.forEach(rec => {
    const key = rec.date?.slice(0, 7); // "2025-03"
    if (!key) return;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(rec);
  });
  const monthKeys = Object.keys(byMonth).sort().reverse(); // newest first

  const statusColor = { present: "#059669", absent: "#dc2626", late: "#d97706" };
  const statusBg    = { present: "#ecfdf5", absent: "#fef2f2", late: "#fffbeb" };
  const statusDot   = { present: "#059669", absent: "#ef4444", late: "#f59e0b" };

  // Calendar grid for viewMonth
  const calYear  = viewMonth.year;
  const calMonth = viewMonth.month; // 0-indexed
  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const monthKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
  const records  = byMonth[monthKey] || [];
  const recordsByDay = {};
  records.forEach(r => { if (r.date) recordsByDay[r.date] = r; });

  const calLabel = new Date(calYear, calMonth, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const now = new Date();
  const isNow = calYear === now.getFullYear() && calMonth === now.getMonth();

  const prevCal = () => setViewMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const nextCal = () => setViewMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });

  const monthSummary = (recs) => ({
    present: recs.filter(r => r.status === "present").length,
    absent:  recs.filter(r => r.status === "absent").length,
    late:    recs.filter(r => r.status === "late").length,
  });

  const fullName = `${employee.first_name} ${employee.middle_name ? employee.middle_name + " " : ""}${employee.last_name}`;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#f8faff",
      zIndex: 800, display: "flex", flexDirection: "column",
      animation: "empFadeIn 0.2s ease",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
        padding: "0 28px", height: 64, display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0,
        boxShadow: "0 2px 16px rgba(10,42,94,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(255,255,255,0.15)", border: "none",
            cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: "#fff" }}>Attendance History</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>{fullName} · {employee.employee_number}</div>
          </div>
        </div>
        <EmpAvatar name={fullName} size={40} photo={employee.profile_picture || null} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", display: "flex", gap: 28, alignItems: "flex-start" }}>
        {loading ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 14 }}>
            <div style={{ width: 36, height: 36, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "sp 0.75s linear infinite" }} />
            <p style={{ color: "#64748b", fontSize: 14 }}>Loading attendance records…</p>
          </div>
        ) : allRecords.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 12, color: "#94a3b8" }}>
            <div style={{ fontSize: 48 }}>📅</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>No attendance records found</div>
          </div>
        ) : (
          <>
            {/* Left: Calendar */}
            <div style={{ width: 380, flexShrink: 0 }}>
              <div style={{ background: "#fff", borderRadius: 18, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
                {/* Calendar header */}
                <div style={{ background: "linear-gradient(135deg,#0a2a5e,#1557b0)", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <button onClick={prevCal} style={{ width: 30, height: 30, border: "none", background: "rgba(255,255,255,0.15)", borderRadius: 8, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: "#fff" }}>{calLabel}</span>
                  <button onClick={nextCal} disabled={isNow} style={{ width: 30, height: 30, border: "none", background: isNow ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.15)", borderRadius: 8, cursor: isNow ? "default" : "pointer", color: isNow ? "rgba(255,255,255,0.3)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
                {/* Month summary strip */}
                {(() => { const s = monthSummary(records); return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, borderBottom: "1px solid #e2e8f0" }}>
                    {[["Present", s.present, "#059669", "#ecfdf5"], ["Absent", s.absent, "#dc2626", "#fef2f2"], ["Late", s.late, "#d97706", "#fffbeb"]].map(([l,v,c,bg]) => (
                      <div key={l} style={{ textAlign: "center", padding: "10px 6px", background: bg, borderRight: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: c }}>{v}</div>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: c, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                ); })()}
                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "8px 10px 4px" }}>
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                    <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#94a3b8", padding: "4px 0" }}>{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px 12px", gap: 3 }}>
                  {Array.from({ length: firstDay }).map((_, i) => <div key={"e"+i} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const rec = recordsByDay[dateStr];
                    const isToday = dateStr === now.toISOString().slice(0,10);
                    const dow = new Date(calYear, calMonth, day).getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <div key={day} style={{
                        aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 8, fontSize: 12, fontWeight: rec ? 700 : 400,
                        background: rec ? statusBg[rec.status] : isToday ? "#eff6ff" : "transparent",
                        color: rec ? statusColor[rec.status] : isToday ? "#1557b0" : isWeekend ? "#cbd5e1" : "#0f172a",
                        border: isToday ? "1.5px solid #1557b0" : "1.5px solid transparent",
                        position: "relative", cursor: rec ? "default" : "default",
                        title: rec ? rec.status : "",
                      }}>
                        {day}
                        {rec && (
                          <div style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: statusDot[rec.status] }} />
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div style={{ display: "flex", gap: 14, padding: "0 14px 14px", justifyContent: "center" }}>
                  {[["Present","#059669","#ecfdf5"], ["Absent","#dc2626","#fef2f2"], ["Late","#d97706","#fffbeb"]].map(([l,c,bg]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1.5px solid ${c}` }} />
                      <span style={{ color: "#64748b" }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Month-by-month list */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", marginBottom: 16 }}>All Months ({monthKeys.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {monthKeys.map(mk => {
                  const recs = byMonth[mk];
                  const s = monthSummary(recs);
                  const [yr, mo] = mk.split("-").map(Number);
                  const label = new Date(yr, mo - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
                  const isSel = yr === calYear && (mo - 1) === calMonth;
                  const workDays = recs.length || 1;
                  const pct = Math.round((s.present / Math.max(workDays, 1)) * 100);
                  return (
                    <div key={mk}
                      onClick={() => setViewMonth({ year: yr, month: mo - 1 })}
                      style={{
                        background: isSel ? "#eff6ff" : "#fff",
                        border: isSel ? "1.5px solid #1557b0" : "1.5px solid #e2e8f0",
                        borderRadius: 14, padding: "14px 18px",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = "#93c5fd"; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = "#e2e8f0"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: isSel ? "#1557b0" : "#0f172a" }}>{label}</span>
                        <span style={{ fontSize: 11, background: isSel ? "#dbeafe" : "#f1f5f9", color: isSel ? "#1557b0" : "#64748b", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{recs.length} day{recs.length !== 1 ? "s" : ""} recorded</span>
                      </div>
                      <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                        {[["✓ Present", s.present, "#059669"], ["✕ Absent", s.absent, "#dc2626"], ["⏰ Late", s.late, "#d97706"]].map(([l, v, c]) => (
                          <div key={l} style={{ fontSize: 12, color: c, fontWeight: 700 }}>{l}: {v}</div>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", minWidth: 32 }}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Download helpers ──────────────────────────────────────────────────────────
async function downloadExcel(employees, departments) {
  // Simple CSV as fallback (xlsx lib not available); rename to .xlsx opens in Excel
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]));
  const headers = ["Employee Number","First Name","Last Name","Gender","Phone","Email","Department","Job Title","Employment Type","Status","Date Joined"];
  const rows = employees.map(e => [
    e.employee_number, e.first_name, e.last_name,
    { M:"Male",F:"Female",O:"Other" }[e.gender] || e.gender,
    e.phone_number, e.email,
    deptMap[e.department] || e.department_name || "",
    e.job_title,
    { full_time:"Full Time", part_time:"Part Time", contract:"Contract" }[e.employment_type] || e.employment_type,
    e.status, e.date_joined
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `employees_${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

function downloadPDF(employees, departments) {
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]));
  const etMap = { full_time:"Full Time", part_time:"Part Time", contract:"Contract" };
  const gMap = { M:"Male", F:"Female", O:"Other" };

  const rows = employees.map(e => `
    <tr>
      <td>${e.employee_number}</td>
      <td>${e.first_name} ${e.last_name}</td>
      <td>${gMap[e.gender]||""}</td>
      <td>${e.phone_number}</td>
      <td>${deptMap[e.department]||e.department_name||""}</td>
      <td>${e.job_title}</td>
      <td>${etMap[e.employment_type]||""}</td>
      <td><span class="status ${e.status}">${e.status}</span></td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Employee Report</title>
  <style>
    body { font-family: 'Segoe UI',Arial,sans-serif; margin: 30px; color: #0f172a; }
    h1 { font-size: 24px; color: #0a2a5e; margin-bottom: 4px; }
    .sub { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #0a2a5e; color: #fff; padding: 10px 12px; text-align: left; }
    td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8faff; }
    .status { padding: 2px 8px; border-radius: 12px; font-weight: 700; font-size: 11px; }
    .employed { background:#ecfdf5;color:#059669; }
    .retired { background:#f0f9ff;color:#0284c7; }
    .dismissed { background:#fef2f2;color:#dc2626; }
    .resigned { background:#fffbeb;color:#d97706; }
    .suspended { background:#fdf4ff;color:#9333ea; }
  </style></head><body>
  <h1>JECCA Engineering — Employee Report</h1>
  <div class="sub">Generated ${new Date().toLocaleDateString()} · ${employees.length} employees</div>
  <table>
    <thead><tr><th>Emp No.</th><th>Name</th><th>Gender</th><th>Phone</th><th>Department</th><th>Job Title</th><th>Type</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></body></html>`;

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  w.print();
}

// ── Main Employees Page ───────────────────────────────────────────────────────
export default function EmployeesPage({ showToast, selectedMonth }) {
  // Default to current month if not provided
  const _now = new Date();
  const activeMonth = selectedMonth || { year: _now.getFullYear(), month: _now.getMonth() };

  // ── Pull from context instead of fetching locally ──
  const {
    employees: ctxEmployees,
    departments: ctxDepartments,
    loading: ctxLoading,
    errors: ctxErrors,
    refetchEmployees,
    addEmployee,
    updateEmployee,
  } = useITPortal();

  const employees   = ctxEmployees   || [];
  const departments = ctxDepartments || [];
  const loading     = ctxLoading.employees || ctxLoading.departments;

  // Show context errors once
  useEffect(() => {
    if (ctxErrors.employees)   showToast("Failed to load employees.", "err");
    if (ctxErrors.departments) showToast("Failed to load departments.", "err");
  }, [ctxErrors.employees, ctxErrors.departments]);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState(null); // "add" | "edit"
  const [selected, setSelected] = useState(null); // employee for edit/detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [downloadMenu, setDownloadMenu] = useState(false);
  const dlRef = useRef();

  // Close download menu on outside click
  useEffect(() => {
    const fn = e => { if (dlRef.current && !dlRef.current.contains(e.target)) setDownloadMenu(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // Filter logic
  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || [
      e.first_name, e.last_name, e.middle_name, e.email,
      e.phone_number, e.employee_number, e.job_title, e.national_id,
      e.department_name,
    ].some(v => (v||"").toLowerCase().includes(q));
    const matchDept = !deptFilter || String(e.department) === deptFilter;
    const matchStatus = !statusFilter || e.status === statusFilter;
    return matchSearch && matchDept && matchStatus;
  });

  const totalDepts = new Set(employees.map(e => e.department)).size;
  const totalEmployed = employees.filter(e => e.status === "employed").length;

  const openDetail = (emp) => {
    // Fetch full employee with qualifications
    fetch(`${API}/employees/${emp.id}/`, { headers: authHeaders() })
      .then(r => r.json())
      .then(full => { setSelected(full); setDetailOpen(true); })
      .catch(() => { setSelected(emp); setDetailOpen(true); });
  };

  const existingNumbers = employees.map(e => e.employee_number);

  return (
    <>
      <style>{`
        @keyframes empFadeIn  { from{opacity:0;} to{opacity:1;} }
        @keyframes empSlideUp { from{opacity:0;transform:translateY(22px);} to{opacity:1;transform:none;} }
        @keyframes empSlideRight { from{opacity:0;transform:translateX(40px);} to{opacity:1;transform:none;} }
        .emp-row { cursor:pointer; transition:background 0.12s; }
        .emp-row:hover { background:#f0f6ff !important; }
        .emp-row:hover .emp-row-arrow { opacity:1 !important; }
        .dl-menu-item:hover { background:#f0f6ff; }
        .filter-input:focus { border-color:#1557b0 !important; box-shadow:0 0 0 3px rgba(21,87,176,0.1) !important; }
        .edit-btn:hover { background:#eff6ff !important; color:#1557b0 !important; }
        @media(max-width:700px){
          .emp-table-wrap { font-size:12px; }
          .emp-hide-sm { display:none !important; }
        }
      `}</style>

      {/* ── Stat Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Total Employees", value: employees.length, icon: <UsersIcon />, accent: "#1557b0" },
          { label: "Currently Employed", value: totalEmployed, icon: <CheckCircleIcon />, accent: "#059669" },
          { label: "Departments", value: totalDepts, icon: <BuildingIcon />, accent: "#7c3aed" },
          { label: "Showing", value: filtered.length, icon: <FilterIcon />, accent: "#0284c7" },
        ].map((c, i) => (
          <div key={i} style={{
            background: "#fff", borderRadius: 14, padding: "18px 20px",
            border: "1px solid #e2e8f0",
            borderLeft: `4px solid ${c.accent}`,
            display: "flex", alignItems: "center", gap: 14,
            transition: "box-shadow 0.2s, transform 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(21,87,176,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}
          >
            <div style={{ width: 42, height: 42, background: `${c.accent}12`, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 700, color: "#0a2a5e", lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 3 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
        padding: "16px 18px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="filter-input"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID, email, phone…"
            style={{ width: "100%", padding: "9px 12px 9px 36px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", outline: "none", background: "#fafbff", color: "#0f172a", boxSizing: "border-box", transition: "border-color 0.15s" }}
          />
        </div>

        {/* Department filter */}
        <select
          value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ padding: "9px 13px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", color: deptFilter ? "#0f172a" : "#94a3b8", background: "#fafbff", cursor: "pointer", outline: "none", minWidth: 150 }}
        >
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "9px 13px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", color: statusFilter ? "#0f172a" : "#94a3b8", background: "#fafbff", cursor: "pointer", outline: "none", minWidth: 130 }}
        >
          <option value="">All Statuses</option>
          {["employed","retired","dismissed","resigned","suspended"].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {/* Download button */}
        <div style={{ position: "relative" }} ref={dlRef}>
          <button onClick={() => setDownloadMenu(!downloadMenu)} style={{
            padding: "9px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0",
            background: "#f8faff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            fontSize: 13.5, fontWeight: 500, color: "#0f172a",
            display: "flex", alignItems: "center", gap: 7,
            transition: "border-color 0.15s",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {downloadMenu && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,0.1)", minWidth: 180, zIndex: 200, overflow: "hidden",
            }}>
              {[
                { label: "Export as CSV / Excel", icon: "📊", action: () => { downloadExcel(filtered, departments); setDownloadMenu(false); } },
                { label: "Print / Save as PDF", icon: "📄", action: () => { downloadPDF(filtered, departments); setDownloadMenu(false); } },
              ].map((item, i) => (
                <button key={i} className="dl-menu-item" onClick={item.action} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "11px 16px", border: "none", background: "none",
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, color: "#0f172a",
                  transition: "background 0.1s", textAlign: "left",
                }}>
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add Employee */}
        <button onClick={() => { setSelected(null); setModal("add"); }} style={{
          padding: "9px 18px", borderRadius: 10, border: "none",
          background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
          cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
          fontSize: 13.5, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
          transition: "opacity 0.15s, transform 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Employee
        </button>
      </div>

      {/* ── Table ── */}
      <div className="emp-table-wrap" style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 14 }}>
            <div style={{ width: 36, height: 36, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "sp 0.75s linear infinite" }} />
            <p style={{ color: "#64748b", fontSize: 14 }}>Loading employees…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 12, color: "#94a3b8" }}>
            <div style={{ width: 64, height: 64, background: "#f0f6ff", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>👥</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>No employees found</div>
            <div style={{ fontSize: 13 }}>Try adjusting your search or filters</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  {["Employee", "Employee ID", "Gender", "Contact", "Department", "Days Attended", "Status", ""].map((h, i) => (
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
                {filtered.map((emp, i) => {
                  const fullName = `${emp.first_name} ${emp.last_name}`;
                  const dept = departments.find(d => d.id === emp.department);
                  const genderMap = { M: "Male", F: "Female", O: "Other" };
                  const genderColor = { M: { bg: "#eff6ff", color: "#1557b0" }, F: { bg: "#fdf4ff", color: "#9333ea" }, O: { bg: "#f0fdf4", color: "#059669" } };
                  const gc = genderColor[emp.gender] || { bg: "#f1f5f9", color: "#64748b" };
                  return (
                    <tr
                      key={emp.id}
                      className="emp-row"
                      style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbff" }}
                      onClick={() => openDetail(emp)}
                    >
                      {/* Employee */}
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          <EmpAvatar name={fullName} size={36} photo={emp.profile_picture || null} />
                          <div>
                            <div style={{ fontWeight: 600, color: "#0f172a", lineHeight: 1.3 }}>{fullName}</div>
                            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{emp.job_title}</div>
                          </div>
                        </div>
                      </td>
                      {/* ID */}
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{
                          fontFamily: "monospace", fontSize: 12.5,
                          background: "#eff6ff", color: "#1557b0",
                          padding: "3px 8px", borderRadius: 6, fontWeight: 700,
                        }}>{emp.employee_number}</span>
                      </td>
                      {/* Gender */}
                      <td className="emp-hide-sm" style={{ padding: "13px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: gc.bg, color: gc.color,
                          fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: gc.color, display: "inline-block" }} />
                          {genderMap[emp.gender] || "—"}
                        </span>
                      </td>
                      {/* Contact */}
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontSize: 13, color: "#0f172a" }}>{emp.phone_number || "—"}</div>
                        {emp.email && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>{emp.email}</div>}
                      </td>
                      {/* Department */}
                      <td className="emp-hide-sm" style={{ padding: "13px 16px", color: "#64748b", fontSize: 13 }}>
                        {dept?.name || emp.department_name || "—"}
                      </td>
                      {/* Days Attended */}
                      <td className="emp-hide-sm" style={{ padding: "13px 16px" }}>
                        <AttendancePill empId={emp.id} activeMonth={activeMonth} />
                      </td>
                      {/* Status */}
                      <td style={{ padding: "13px 16px" }}>
                        <StatusBadge status={emp.status} />
                      </td>
                      {/* Edit */}
                      <td style={{ padding: "13px 14px", width: 50 }} onClick={e => e.stopPropagation()}>
                        <button
                          className="edit-btn"
                          onClick={e => { e.stopPropagation(); setSelected(emp); setModal("edit"); }}
                          title="Edit employee"
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: "1.5px solid #e2e8f0", background: "#f8faff",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#64748b", transition: "all 0.15s",
                          }}
                        >
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

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid #f1f5f9", fontSize: 12, color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
            <span>Showing <b style={{ color: "#0f172a" }}>{filtered.length}</b> of <b style={{ color: "#0f172a" }}>{employees.length}</b> employees</span>
            <span>Click any row to view full profile</span>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {(modal === "add" || modal === "edit") && (
        <EmployeeFormModal
          employee={modal === "edit" ? selected : null}
          departments={departments}
          existingNumbers={existingNumbers}
          onClose={() => setModal(null)}
          onSave={(savedEmp) => {
            if (modal === "edit") {
              updateEmployee(savedEmp);
            } else {
              addEmployee(savedEmp);
            }
          }}
          showToast={showToast}
        />
      )}

      {detailOpen && selected && (
        <EmployeeDetail
          employee={selected}
          departments={departments}
          onClose={() => setDetailOpen(false)}
          onEdit={() => { setDetailOpen(false); setModal("edit"); }}
          showToast={showToast}
          onRefresh={refetchEmployees}
          activeMonth={activeMonth}
        />
      )}
    </>
  );
}

// ── Lazy attendance pill (fetched per-row, respects selected month) ────────────
function AttendancePill({ empId, activeMonth }) {
  const [data, setData] = useState(null);
  const lastKey = useRef(null);

  useEffect(() => {
    const key = `${empId}-${activeMonth.year}-${activeMonth.month}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    setData(null);
    const y = activeMonth.year;
    const m = activeMonth.month; // 0-indexed
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    Promise.all([
      fetch(`${API}/attendance/?employee=${empId}&status=present&date_after=${from}&date_before=${to}&page_size=200`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/attendance/?employee=${empId}&date_after=${from}&date_before=${to}&page_size=200`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([presentRes, allRes]) => {
      const presentList = Array.isArray(presentRes) ? presentRes : presentRes.results || [];
      const allList = Array.isArray(allRes) ? allRes : allRes.results || [];
      const absent = allList.filter(a => a.status === "absent").length;
      setData({ present: presentList.length, absent, total: allList.length });
    }).catch(() => setData({ present: 0, absent: 0, total: 0 }));
  }, [empId, activeMonth.year, activeMonth.month]);

  if (data === null) return <span style={{ color: "#e2e8f0", fontSize: 12 }}>—</span>;
  const workDays = 22; // approximate
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 52, height: 5, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, (data.present / workDays) * 100)}%`, background: data.present >= 18 ? "#059669" : data.present >= 10 ? "#d97706" : "#dc2626", borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{data.present}d</span>
        {data.absent > 0 && <span style={{ fontSize: 10.5, color: "#dc2626", fontWeight: 600 }}>/ {data.absent} off</span>}
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const UsersIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const BuildingIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 22V12h6v10M9 7h1m4 0h1M9 11h1m4 0h1"/></svg>;
const CheckCircleIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.8" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const FilterIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="1.8" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;