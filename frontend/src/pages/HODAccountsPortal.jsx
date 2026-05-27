// src/pages/HODAccountsPortal.jsx
//
// Portal for the HOD_ACCOUNTS role.
// Gives the same view as the HR Portal (employees, attendance, payroll, payslips)
// but with ALL add / edit / delete actions disabled (read-only).
// The "Admins" section is completely removed from the sidebar.
// An extra "Mark Register" tab (identical to the HOD's Mark Attendance page)
// is added so this HOD can still mark employee attendance.

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { HRPortalProvider, useHRPortal } from "../context/HRPortalContext";
import { DeptPortalProvider, useDeptPortal } from "../context/DeptPortalContext";
import {
  performLogout,
  startInactivityTimer,
  startTokenRefreshTimer,
  apiFetch,
} from "../utils/auth";

import HREmployeesPage  from "../components/HRPortal/EmployeesPage";
import HRAttendancePage from "../components/HRPortal/AttendancePage";
import HRPayrollPage    from "../components/HRPortal/PayrollPage";
import HRPayslipsPage   from "../components/HRPortal/PayslipsPage";

const API = "http://127.0.0.1:8000/api";

// ─── Nav items (HR set minus Admins, plus Mark Register) ─────────────────────
const NAV_ITEMS = [
  {
    key: "dashboard", label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    key: "employees", label: "Employees",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    key: "attendance", label: "Attendance",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" /><polyline points="9 16 11 18 15 14" />
      </svg>
    ),
  },
  {
    key: "payroll", label: "Payroll",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" /><line x1="6" y1="15" x2="10" y2="15" />
      </svg>
    ),
  },
  {
    key: "payslips", label: "Payslips",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        <line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
    ),
  },
  {
    key: "register", label: "Mark Register",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <polyline points="16 11 18 13 22 9"/>
      </svg>
    ),
  },
  {
    key: "profile", label: "My Profile",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3400); return () => clearTimeout(t); }, [onDone]);
  const ok = type === "ok";
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 9999,
      display: "flex", alignItems: "center", gap: 10,
      background: "#fff",
      border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`,
      borderLeft: `4px solid ${ok ? "#16a34a" : "#dc2626"}`,
      color: ok ? "#166534" : "#991b1b",
      borderRadius: 12, padding: "13px 18px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      fontSize: 13, fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
      animation: "slideUp 0.3s ease", maxWidth: 360,
    }}>
      {ok
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      }
      <span>{msg}</span>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, sideOpen, user, mobileOpen, setMobileOpen }) {
  const initials = ((user?.full_name || user?.username || "HOD")
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase());

  return (
    <aside
      className="hr-sidebar-mobile"
      style={{
        width: sideOpen ? 220 : 64,
        position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200,
        background: "linear-gradient(180deg, #1a6fd4 0%, #1557b0 25%, #0e3d82 55%, #0a2a5e 100%)",
        display: "flex", flexDirection: "column",
        transition: "width 0.28s cubic-bezier(.4,0,.2,1), transform 0.28s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
      }}>
      {/* Logo */}
      <div style={{
        padding: "0 14px", height: 64,
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid rgba(255,255,255,0.1)", flexShrink: 0, overflow: "hidden",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: "rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, overflow: "hidden",
        }}>
          <img src="/logo.jpeg" alt="JECCA"
            style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8 }}
            onError={e => { e.target.style.display = "none"; }} />
        </div>
        {sideOpen && (
          <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 13.5, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>JECCA Engineering</div>
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.5)", letterSpacing: "1.8px", textTransform: "uppercase", marginTop: 1 }}>HR Management</div>
          </div>
        )}
      </div>

      {/* User info */}
      <div style={{
        margin: "14px 10px",
        padding: sideOpen ? "10px 11px" : "8px",
        background: "rgba(255,255,255,0.1)", borderRadius: 12,
        display: "flex", alignItems: "center",
        gap: sideOpen ? 10 : 0,
        justifyContent: sideOpen ? "flex-start" : "center",
        overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: "linear-gradient(135deg, rgba(255,255,255,0.3), rgba(255,255,255,0.15))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#fff",
          fontFamily: "'DM Sans',sans-serif", flexShrink: 0, letterSpacing: "0.5px",
        }}>
          {initials}
        </div>
        {sideOpen && (
          <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.full_name || user?.username || "Accounts HOD"}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>Accounts HOD</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "6px 10px", overflowY: "auto", scrollbarWidth: "none" }}>
        {sideOpen && (
          <div style={{
            fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 700,
            letterSpacing: "1.8px", textTransform: "uppercase",
            padding: "14px 8px 6px", whiteSpace: "nowrap", overflow: "hidden",
            fontFamily: "'DM Sans',sans-serif",
          }}>NAVIGATION</div>
        )}
        {NAV_ITEMS.map((item) => {
          const active = page === item.key;
          // Visual separator before Mark Register
          const showDivider = item.key === "register";
          return (
            <div key={item.key}>
              {showDivider && sideOpen && (
                <div style={{
                  fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 700,
                  letterSpacing: "1.8px", textTransform: "uppercase",
                  padding: "12px 8px 6px", whiteSpace: "nowrap",
                  fontFamily: "'DM Sans',sans-serif",
                }}>REGISTER</div>
              )}
              {showDivider && !sideOpen && (
                <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "8px 4px" }} />
              )}
              <button
                onClick={() => { setPage(item.key); setMobileOpen && setMobileOpen(false); }}
                style={{
                  display: "flex", alignItems: "center",
                  gap: sideOpen ? 11 : 0,
                  justifyContent: sideOpen ? "flex-start" : "center",
                  width: "100%", padding: sideOpen ? "9px 10px" : "10px",
                  marginBottom: 2, borderRadius: 10,
                  border: "none", cursor: "pointer",
                  background: active ? "rgba(255,255,255,0.18)" : "transparent",
                  color: active ? "#fff" : "rgba(255,255,255,0.65)",
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 13.5, fontWeight: active ? 600 : 500,
                  textAlign: "left",
                  transition: "background 0.15s, color 0.15s",
                  whiteSpace: "nowrap", overflow: "hidden",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.65)"; } }}
              >
                <span style={{ flexShrink: 0, width: 18, height: 18 }}>{item.icon}</span>
                {sideOpen && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
        <button
          onClick={() => performLogout("manual")}
          style={{
            display: "flex", alignItems: "center",
            gap: sideOpen ? 10 : 0,
            justifyContent: sideOpen ? "flex-start" : "center",
            width: "100%", padding: sideOpen ? "9px 10px" : "10px",
            borderRadius: 10, border: "none", cursor: "pointer",
            background: "transparent", color: "rgba(255,255,255,0.5)",
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500,
            transition: "background 0.15s, color 0.15s", whiteSpace: "nowrap", overflow: "hidden",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(220,38,38,0.2)"; e.currentTarget.style.color = "#fca5a5"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {sideOpen && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

// ─── Topbar user menu ─────────────────────────────────────────────────────────
function TopbarMenu({ user, initials, onProfile, onPassword }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  const photoUrl = user?.profile_picture
    ? (user.profile_picture.startsWith("http") ? user.profile_picture : `http://127.0.0.1:8000${user.profile_picture}`)
    : null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 36, height: 36, borderRadius: 9,
          background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
          border: "none", cursor: "pointer", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#fff",
          fontFamily: "'DM Sans',sans-serif",
        }}
      >
        {photoUrl
          ? <img src={photoUrl} alt={user?.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; e.target.parentNode.textContent = initials; }} />
          : initials}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 9000,
          background: "#fff", borderRadius: 14, minWidth: 220,
          boxShadow: "0 8px 32px rgba(0,0,0,0.13)", border: "1px solid #e2e8f0",
          overflow: "hidden", animation: "fadeDown 0.15s ease",
        }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 9, overflow: "hidden",
              background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {photoUrl
                ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                : initials}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{user?.full_name || user?.username}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Accounts HOD</div>
            </div>
          </div>
          {[
            { label: "My Profile", icon: "👤", action: () => { onProfile(); setOpen(false); } },
            { label: "Change Password", icon: "🔑", action: () => { onPassword(); setOpen(false); } },
          ].map((item) => (
            <button key={item.label} onClick={item.action} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "10px 16px", border: "none", background: "transparent",
              cursor: "pointer", fontSize: 13, color: "#0f172a",
              fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
              transition: "background 0.1s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f8faff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
          <div style={{ padding: "6px 8px", borderTop: "1px solid #f1f5f9" }}>
            <button onClick={() => performLogout("manual")} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "10px 16px", border: "none", borderRadius: 9,
              background: "transparent", cursor: "pointer",
              fontSize: 13, color: "#dc2626", fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
              transition: "background 0.1s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profile page ─────────────────────────────────────────────────────────────
function ProfilePage({ user, initials, onPassword }) {
  const photoUrl = user?.profile_picture
    ? (user.profile_picture.startsWith("http") ? user.profile_picture : `http://127.0.0.1:8000${user.profile_picture}`)
    : null;
  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{
        background: "#fff", borderRadius: 18, border: "1px solid #e2e8f0",
        overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
      }}>
        <div style={{ background: "linear-gradient(135deg,#0a2a5e,#1557b0)", padding: "32px 28px", display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, overflow: "hidden",
            background: "rgba(255,255,255,0.2)", border: "3px solid rgba(255,255,255,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0,
          }}>
            {photoUrl ? <img src={photoUrl} alt={user?.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} /> : initials}
          </div>
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: "#fff" }}>{user?.full_name || "Accounts HOD"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>Accounts HOD · {user?.email || "—"}</div>
          </div>
        </div>
        <div style={{ padding: "24px 28px" }}>
          {[
            ["Full Name", user?.full_name || "—"],
            ["Username", user?.username || "—"],
            ["Email", user?.email || "—"],
            ["Role", "Accounts HOD"],
            ["Department", user?.department_name || "—"],
          ].map(([label, value]) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 0", borderBottom: "1px solid #f1f5f9",
            }}>
              <span style={{ fontSize: 13, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "'DM Sans',sans-serif" }}>{value}</span>
            </div>
          ))}
          <button
            onClick={onPassword}
            style={{
              marginTop: 20, width: "100%", padding: "11px 0",
              borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
              color: "#fff", fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
            }}
          >
            Change Password
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Password-change modal ────────────────────────────────────────────────────
function PasswordModal({ user, onClose, showToast }) {
  const [form, setForm] = useState({ current: "", newPw: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!form.current || !form.newPw || !form.confirm) { showToast("All fields are required.", "err"); return; }
    if (form.newPw !== form.confirm) { showToast("Passwords do not match.", "err"); return; }
    if (form.newPw.length < 8) { showToast("Password must be at least 8 characters.", "err"); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`${API}/auth/admins/${user.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ current_password: form.current, new_password: form.newPw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || err.current_password?.[0] || "Failed to change password.", "err");
        return;
      }
      showToast("Password changed successfully.");
      onClose();
    } catch { showToast("Server error.", "err"); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,26,80,0.5)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700 }}>Change Password</span>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#64748b" }}>✕</button>
        </div>
        <div style={{ padding: "22px" }}>
          {[
            { label: "Current Password", key: "current", type: "password" },
            { label: "New Password", key: "newPw", type: "password" },
            { label: "Confirm New Password", key: "confirm", type: "password" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 5, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.label}</label>
              <input
                type={f.type} value={form[f.key]}
                onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>
        <div style={{ padding: "0 22px 22px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : "Save Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Read-only banner ─────────────────────────────────────────────────────────
function ReadOnlyBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "#fffbeb", border: "1px solid #fde68a",
      borderRadius: 10, padding: "10px 16px", marginBottom: 18,
      fontSize: 13, color: "#78350f", fontFamily: "'DM Sans',sans-serif",
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>You are viewing this section in <strong>read-only mode</strong>. Contact HR Manager to make changes.</span>
    </div>
  );
}

// ─── Mark Register tab (full DeptPortal attendance, all employees) ─────────────
function resolveLocation(raw) {
  if (!raw || !raw.trim()) return "";
  return raw.trim().replace(/\b\w/g, c => c.toUpperCase());
}
function suggestLocations(raw, registry) {
  if (!raw || raw.length < 1 || !registry) return [];
  const lower = raw.toLowerCase();
  return registry.filter(name => name.toLowerCase().includes(lower));
}

function MarkRegisterPage({ showToast }) {
  const {
    employees, upsertAttendanceRecord, getAttendanceForDate,
    locationRegistry, registerLocation,
  } = useDeptPortal();

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showCalendar, setShowCalendar] = useState(false);
  const calRef = useRef();

  useEffect(() => {
    const fn = e => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const isToday = selectedDate === todayStr();
  const isPastDate = selectedDate < todayStr();

  const [lateRegReason, setLateRegReason] = useState("");
  const [lateRegReasonSaved, setLateRegReasonSaved] = useState("");
  const [showLateRegModal, setShowLateRegModal] = useState(false);

  useEffect(() => {
    setLateRegReasonSaved("");
    setLateRegReason("");
  }, [selectedDate]);

  const tableLocked = isPastDate && !lateRegReasonSaved;

  const [records, setRecords] = useState({});
  const [loadingR, setLoadingR] = useState(false);
  const [saving, setSaving] = useState({});
  const [draft, setDraft] = useState({});
  const [modal, setModal] = useState(null);
  const [modalVal, setModalVal] = useState({ arrival_time: "", absence_reason: "" });

  const [empLocSuggestions, setEmpLocSuggestions] = useState({});
  const [empLocDropOpen, setEmpLocDropOpen] = useState({});

  const handleEmpLocationInput = (empId, val) => {
    setDraft(d => ({ ...d, [empId]: { ...(d[empId] || {}), work_location: val } }));
    const sug = suggestLocations(val, locationRegistry);
    setEmpLocSuggestions(s => ({ ...s, [empId]: sug }));
    setEmpLocDropOpen(o => ({ ...o, [empId]: sug.length > 0 && val.length > 0 }));
  };
  const handleEmpLocationBlur = (empId) => {
    setTimeout(() => {
      setEmpLocDropOpen(o => ({ ...o, [empId]: false }));
      setDraft(d => {
        const cur = d[empId]?.work_location || "";
        if (cur.trim()) return { ...d, [empId]: { ...(d[empId] || {}), work_location: resolveLocation(cur) } };
        return d;
      });
    }, 160);
  };
  const pickEmpLocation = (empId, loc) => {
    setDraft(d => ({ ...d, [empId]: { ...(d[empId] || {}), work_location: loc } }));
    setEmpLocDropOpen(o => ({ ...o, [empId]: false }));
  };

  const fetchRecords = useCallback(async (date) => {
    setLoadingR(true);
    const { records: map, error } = await getAttendanceForDate(date);
    if (error) showToast("Failed to load attendance records.", "err");
    setRecords(map);
    setDraft(prev => {
      const next = { ...prev };
      Object.entries(map).forEach(([id, rec]) => {
        if (!next[id]) next[id] = {
          status: rec.status,
          arrival_time: rec.arrival_time || "",
          absence_reason: rec.absence_reason || "",
          work_location: rec.work_location || "",
        };
      });
      return next;
    });
    setLoadingR(false);
  }, [getAttendanceForDate, showToast]);

  useEffect(() => { fetchRecords(selectedDate); }, [selectedDate, fetchRecords]);

  const navigate = (dir) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (next <= todayStr()) setSelectedDate(next);
  };

  const formatDisplayDate = (str) => {
    const d = new Date(str + "T00:00:00");
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  const markEmployee = async (empId, status, extra = {}) => {
    setSaving(s => ({ ...s, [empId]: true }));
    try {
      const existing = records[empId];
      const resolvedLoc = resolveLocation(extra.work_location || draft[empId]?.work_location || "");
      if (resolvedLoc) registerLocation(resolvedLoc);
      const payload = {
        employee: empId, date: selectedDate, status, shift: null, notes: "",
        arrival_time: extra.arrival_time || "",
        absence_reason: extra.absence_reason || "",
        late_register_reason: lateRegReasonSaved || "",
        work_location: resolvedLoc,
      };
      let res;
      if (existing) {
        res = await apiFetch(`${API}/attendance/${existing.id}/`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        res = await apiFetch(`${API}/attendance/`, { method: "POST", body: JSON.stringify(payload) });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || err.error || "Failed to save.", "err"); return;
      }
      const saved = await res.json();
      setRecords(r => ({ ...r, [empId]: saved }));
      upsertAttendanceRecord(saved);
      setDraft(d => ({ ...d, [empId]: { status, arrival_time: extra.arrival_time || "", absence_reason: extra.absence_reason || "", work_location: resolvedLoc } }));
      showToast(`Marked as ${status}${resolvedLoc ? ` · ${resolvedLoc}` : ""}.`);
    } catch { showToast("Server error.", "err"); }
    finally { setSaving(s => ({ ...s, [empId]: false })); }
  };

  const handleStatusClick = (empId, status) => {
    if (tableLocked) { setShowLateRegModal(true); return; }
    if (status === "late") {
      setModalVal({ arrival_time: draft[empId]?.arrival_time || "", absence_reason: "" });
      setModal({ empId, type: "late" });
    } else if (status === "absent") {
      setModalVal({ arrival_time: "", absence_reason: draft[empId]?.absence_reason || "" });
      setModal({ empId, type: "absent" });
    } else { markEmployee(empId, status); }
  };

  const handleModalSave = () => {
    if (!modal) return;
    if (modal.type === "late" && !modalVal.arrival_time) { showToast("Please enter arrival time.", "err"); return; }
    markEmployee(modal.empId, modal.type, modalVal);
    setModal(null);
  };

  const activeEmployees = (employees || []).filter(e => e.status === "employed");
  const presentCount  = activeEmployees.filter(e => records[e.id]?.status === "present").length;
  const absentCount   = activeEmployees.filter(e => records[e.id]?.status === "absent").length;
  const lateCount     = activeEmployees.filter(e => records[e.id]?.status === "late").length;
  const unmarkedCount = activeEmployees.filter(e => !records[e.id]).length;
  const statusOfEmp   = (empId) => draft[empId]?.status || records[empId]?.status || null;

  if (!employees) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 28, height: 28, border: "3px solid #e2e8f0", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#64748b", fontSize: 14 }}>Loading employees…</p>
    </div>
  );

  return (
    <>
      <style>{`
        .mra-date-bar { display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
        .mra-nav-btn { width:36px; height:36px; border:1.5px solid #e2e8f0; border-radius:9px; background:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; transition:border-color .15s,color .15s,background .15s; flex-shrink:0; }
        .mra-nav-btn:hover { border-color:#1557b0; color:#1557b0; background:#eff6ff; }
        .mra-nav-btn:disabled { opacity:.4; cursor:not-allowed; }
        .mra-date-display { flex:1; min-width:180px; font-family:'Playfair Display',serif; font-size:20px; font-weight:700; color:#0f172a; }
        .mra-today-badge { font-size:11px; font-weight:600; background:#dcfce7; color:#166534; padding:3px 10px; border-radius:20px; margin-left:10px; vertical-align:middle; }
        .mra-past-badge  { font-size:11px; font-weight:600; background:#fef3c7; color:#92400e; padding:3px 10px; border-radius:20px; margin-left:10px; vertical-align:middle; }
        .mra-cal-wrap { position:relative; }
        .mra-cal-btn { display:flex; align-items:center; gap:7px; padding:8px 14px; border:1.5px solid #e2e8f0; border-radius:10px; background:#fff; font-size:13px; color:#0a2a5e; font-family:'DM Sans',sans-serif; font-weight:500; cursor:pointer; transition:border-color .15s,background .15s; }
        .mra-cal-btn:hover { border-color:#1557b0; background:#eff6ff; }
        .mra-cal-input { position:absolute; top:calc(100% + 6px); left:0; z-index:300; border:1.5px solid #1557b0; border-radius:12px; padding:4px; background:#fff; box-shadow:0 8px 32px rgba(21,87,176,.12); }
        .mra-cal-input input[type="date"] { padding:10px 14px; border:none; outline:none; border-radius:9px; font-size:14px; font-family:'DM Sans',sans-serif; color:#0f172a; background:transparent; cursor:pointer; }
        .mra-late-banner { background:linear-gradient(135deg,#fffbeb,#fef3c7); border:1.5px solid #f59e0b; border-radius:14px; padding:16px 20px; margin-bottom:20px; display:flex; align-items:flex-start; gap:14px; }
        .mra-late-unlocked { background:#f0fdf4; border:1.5px solid #4ade80; border-radius:14px; padding:12px 18px; margin-bottom:20px; display:flex; align-items:center; gap:10px; font-size:13px; color:#166534; }
        .mra-sum-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
        .mra-sum-card { background:#fff; border-radius:14px; border:1px solid #e2e8f0; padding:16px 18px; display:flex; align-items:center; gap:12px; }
        .mra-table-card { background:#fff; border-radius:16px; border:1px solid #e2e8f0; padding:22px 24px; }
        .mra-table-locked { position:relative; }
        .mra-table-locked::after { content:''; position:absolute; inset:0; border-radius:16px; background:rgba(248,250,255,.72); backdrop-filter:blur(2px); z-index:10; pointer-events:all; cursor:not-allowed; }
        .mra-progress-bar { height:6px; background:#e8edf8; border-radius:10px; margin-bottom:20px; overflow:hidden; }
        .mra-progress-fill { height:100%; border-radius:10px; background:linear-gradient(90deg,#16a34a,#4ade80); transition:width .6s ease; }
        .mra-table { width:100%; border-collapse:collapse; font-family:'DM Sans',sans-serif; }
        .mra-table th { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#64748b; padding:0 14px 12px; text-align:left; border-bottom:1px solid #f1f5f9; }
        .mra-table td { padding:12px 14px; border-bottom:1px solid #f8faff; font-size:13px; vertical-align:middle; }
        .mra-table tbody tr:last-child td { border-bottom:none; }
        .mra-table tbody tr:hover td { background:#fafbff; }
        .mra-status-group { display:flex; gap:6px; align-items:center; }
        .mra-status-btn { display:flex; align-items:center; gap:5px; padding:6px 12px; border-radius:8px; border:1.5px solid transparent; font-size:12px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; transition:all .15s; white-space:nowrap; }
        .mra-status-btn:disabled { opacity:.5; cursor:not-allowed; }
        .mra-btn-present { background:#f0fdf4; color:#15803d; border-color:#bbf7d0; }
        .mra-btn-present:hover:not(:disabled) { background:#dcfce7; border-color:#4ade80; }
        .mra-btn-present.active { background:#16a34a; color:#fff; border-color:#16a34a; }
        .mra-btn-absent  { background:#fef2f2; color:#b91c1c; border-color:#fecaca; }
        .mra-btn-absent:hover:not(:disabled)  { background:#fee2e2; border-color:#f87171; }
        .mra-btn-absent.active  { background:#dc2626; color:#fff; border-color:#dc2626; }
        .mra-btn-late   { background:#fffbeb; color:#b45309; border-color:#fde68a; }
        .mra-btn-late:hover:not(:disabled)   { background:#fef3c7; border-color:#fbbf24; }
        .mra-btn-late.active   { background:#d97706; color:#fff; border-color:#d97706; }
        .mra-modal-backdrop { position:fixed; inset:0; background:rgba(10,26,80,.52); z-index:700; display:flex; align-items:center; justify-content:center; padding:20px; }
        .mra-modal-box { background:#fff; border-radius:18px; width:100%; max-width:460px; box-shadow:0 24px 64px rgba(0,0,0,.2); overflow:hidden; }
        .mra-modal-header { padding:18px 22px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #e2e8f0; }
        .mra-modal-header h3 { font-family:'Playfair Display',serif; font-size:17px; font-weight:700; color:#0f172a; margin:0; }
        .mra-modal-body { padding:22px; }
        .mra-modal-footer { padding:0 22px 22px; display:flex; justify-content:flex-end; gap:10px; }
        .mra-f-label { display:block; font-size:11px; font-weight:700; color:#64748b; margin-bottom:5px; text-transform:uppercase; letter-spacing:.5px; font-family:'DM Sans',sans-serif; }
        .mra-f-input { width:100%; padding:9px 12px; border-radius:9px; border:1.5px solid #e2e8f0; font-size:13px; font-family:'DM Sans',sans-serif; outline:none; box-sizing:border-box; transition:border-color .2s; }
        .mra-f-input:focus { border-color:#1557b0; box-shadow:0 0 0 3px rgba(21,87,176,.1); }
        .mra-loc-input { width:100%; padding:8px 12px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:12px; font-family:'DM Sans',sans-serif; outline:none; background:#fff; transition:border-color .2s; }
        .mra-loc-input:focus { border-color:#1557b0; }
        .mra-loc-drop { position:absolute; top:100%; left:0; right:0; z-index:400; background:#fff; border:1.5px solid #1557b0; border-radius:10px; box-shadow:0 8px 28px rgba(21,87,176,.12); overflow:hidden; }
        .mra-loc-opt { padding:9px 13px; font-size:13px; color:#0f172a; cursor:pointer; border:none; background:none; width:100%; text-align:left; font-family:'DM Sans',sans-serif; display:flex; align-items:center; gap:8px; }
        .mra-loc-opt:hover { background:#eff6ff; color:#1557b0; }
        .mra-info-pill { font-size:11px; color:#64748b; background:#f1f5f9; border-radius:6px; padding:2px 7px; display:inline-block; }
        .mra-lrm-warning { background:#fef3c7; border:1.5px solid #fbbf24; border-radius:10px; padding:12px 14px; margin-bottom:16px; font-size:13px; color:#78350f; display:flex; gap:10px; align-items:flex-start; }
        @media (max-width:900px) { .mra-sum-row { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:600px) { .mra-status-btn { padding:5px 8px; font-size:11px; } }
      `}</style>

      {/* Date nav */}
      <div className="mra-date-bar">
        <button className="mra-nav-btn" onClick={() => navigate(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="mra-date-display">
          {formatDisplayDate(selectedDate)}
          {isToday && <span className="mra-today-badge">Today</span>}
          {isPastDate && <span className="mra-past-badge">Past Date</span>}
        </div>
        <button className="mra-nav-btn" onClick={() => navigate(1)} disabled={isToday}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div className="mra-cal-wrap" ref={calRef}>
          <button className="mra-cal-btn" onClick={() => setShowCalendar(v => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Jump to date
          </button>
          {showCalendar && (
            <div className="mra-cal-input">
              <input type="date" value={selectedDate} max={todayStr()}
                onChange={e => { setSelectedDate(e.target.value); setShowCalendar(false); }} />
            </div>
          )}
        </div>
      </div>

      {/* Late register banner */}
      {isPastDate && !lateRegReasonSaved && (
        <div className="mra-late-banner">
          <div style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>⚠️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>Late Register — Reason Required</div>
            <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.5 }}>
              You are marking attendance for a past date (<strong>{formatDisplayDate(selectedDate)}</strong>).
              A reason is required before you can mark. This will be visible to HR.
            </div>
            <button
              onClick={() => setShowLateRegModal(true)}
              style={{ marginTop: 10, padding: "9px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#d97706,#f59e0b)", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Submit Reason to Unlock
            </button>
          </div>
        </div>
      )}
      {isPastDate && lateRegReasonSaved && (
        <div className="mra-late-unlocked">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span><strong>Late reason submitted.</strong> Attendance marking is now unlocked.</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b", fontStyle: "italic" }}>"{lateRegReasonSaved}"</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="mra-sum-row">
        {[
          { label: "Total Staff",  value: activeEmployees.length, bg: "#eff6ff",  c: "#1557b0", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
          { label: "Present",      value: presentCount,           bg: "#f0fdf4",  c: "#16a34a", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> },
          { label: "Absent",       value: absentCount,            bg: "#fef2f2",  c: "#dc2626", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> },
          { label: "Late",         value: lateCount,              bg: "#fffbeb",  c: "#d97706", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
        ].map((c, i) => (
          <div className="mra-sum-card" key={i}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.icon}</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, color: c.c, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className={`mra-table-card${tableLocked ? " mra-table-locked" : ""}`}
        onClick={tableLocked ? () => setShowLateRegModal(true) : undefined}
        title={tableLocked ? "Submit late reason to unlock" : undefined}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#0a2a5e", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>All Employees — Mark Register</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {tableLocked && <span style={{ fontSize: 12, fontWeight: 600, color: "#d97706", textTransform: "none", letterSpacing: 0, display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Locked — submit reason to unlock
            </span>}
            {unmarkedCount > 0 && !tableLocked && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>{unmarkedCount} not yet marked</span>}
          </div>
        </div>
        {activeEmployees.length > 0 && (
          <div className="mra-progress-bar">
            <div className="mra-progress-fill" style={{ width: `${Math.round(((activeEmployees.length - unmarkedCount) / activeEmployees.length) * 100)}%` }} />
          </div>
        )}
        {loadingR ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ width: 28, height: 28, border: "3px solid #e2e8f0", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="mra-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Job Title</th>
                  <th style={{ textAlign: "center" }}>Mark Attendance</th>
                  <th>Site / Location</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activeEmployees.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>No active employees found.</td></tr>
                ) : activeEmployees.map(e => {
                  const fullName = `${e.first_name} ${e.middle_name ? e.middle_name + " " : ""}${e.last_name}`.trim();
                  const initials = `${e.first_name[0] || ""}${e.last_name[0] || ""}`.toUpperCase();
                  const currentStatus = statusOfEmp(e.id);
                  const rec = records[e.id];
                  const isSaving = saving[e.id];
                  const imgSrc = e.profile_picture
                    ? (e.profile_picture.startsWith("http") ? e.profile_picture : `http://127.0.0.1:8000${e.profile_picture}`)
                    : null;
                  return (
                    <tr key={e.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#0a2a5e,#1557b0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
                            {imgSrc
                              ? <img src={imgSrc} alt={fullName} style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 8, display: "block" }} onError={ev => { ev.target.style.display = "none"; ev.target.parentNode.textContent = initials; }} />
                              : initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{fullName}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>#{e.employee_number}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: "#475569" }}>{e.job_title || "—"}</td>
                      <td>
                        <div className="mra-status-group" style={{ justifyContent: "center" }}>
                          <button className={`mra-status-btn mra-btn-present${currentStatus === "present" ? " active" : ""}`} disabled={isSaving || tableLocked} onClick={() => handleStatusClick(e.id, "present")}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Present
                          </button>
                          <button className={`mra-status-btn mra-btn-absent${currentStatus === "absent" ? " active" : ""}`} disabled={isSaving || tableLocked} onClick={() => handleStatusClick(e.id, "absent")}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Absent
                          </button>
                          <button className={`mra-status-btn mra-btn-late${currentStatus === "late" ? " active" : ""}`} disabled={isSaving || tableLocked} onClick={() => handleStatusClick(e.id, "late")}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Late
                          </button>
                          {isSaving && <div style={{ width: 20, height: 20, border: "2px solid #e2e8f0", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                        </div>
                      </td>
                      <td style={{ minWidth: 160, verticalAlign: "top", paddingTop: 10 }}>
                        <div style={{ position: "relative" }}>
                          <input
                            className="mra-loc-input"
                            value={draft[e.id]?.work_location || ""}
                            onChange={ev => handleEmpLocationInput(e.id, ev.target.value)}
                            onFocus={() => { const v = draft[e.id]?.work_location || ""; if (v) setEmpLocDropOpen(o => ({ ...o, [e.id]: suggestLocations(v, locationRegistry).length > 0 })); }}
                            onBlur={() => handleEmpLocationBlur(e.id)}
                            placeholder="e.g. Unki, Head Office…"
                            disabled={tableLocked}
                          />
                          {empLocDropOpen[e.id] && (empLocSuggestions[e.id] || []).length > 0 && (
                            <div className="mra-loc-drop">
                              {(empLocSuggestions[e.id] || []).map(s => (
                                <button key={s} className="mra-loc-opt" onMouseDown={() => pickEmpLocation(e.id, s)}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {currentStatus === "late" && rec?.arrival_time && <span className="mra-info-pill">🕐 {rec.arrival_time}</span>}
                          {currentStatus === "absent" && rec?.absence_reason && <span className="mra-info-pill" title={rec.absence_reason}>📝 {rec.absence_reason.length > 26 ? rec.absence_reason.slice(0, 26) + "…" : rec.absence_reason}</span>}
                          {!currentStatus && <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Late Register Reason Modal */}
      {showLateRegModal && (
        <div className="mra-modal-backdrop" onClick={e => e.target === e.currentTarget && setShowLateRegModal(false)}>
          <div className="mra-modal-box" style={{ maxWidth: 480 }}>
            <div className="mra-modal-header" style={{ background: "linear-gradient(135deg,#92400e,#d97706)", borderBottom: "none" }}>
              <h3 style={{ color: "#fff" }}>⚠️ Late Register — Reason Required</h3>
              <button onClick={() => setShowLateRegModal(false)} style={{ border: "none", background: "rgba(255,255,255,0.2)", borderRadius: 8, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="mra-modal-body">
              <div className="mra-lrm-warning">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>Marking attendance for <strong>{formatDisplayDate(selectedDate)}</strong> (past date). This reason will be logged for HR review.</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="mra-f-label">Reason for Late Register <span style={{ color: "#dc2626" }}>*</span></label>
                <textarea className="mra-f-input" rows={4} placeholder="e.g. System was down, Admin was on leave…" value={lateRegReason} onChange={e => setLateRegReason(e.target.value)} style={{ resize: "vertical", minHeight: 100 }} autoFocus />
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>This reason is mandatory and will be visible to HR.</div>
              </div>
            </div>
            <div className="mra-modal-footer">
              <button onClick={() => setShowLateRegModal(false)} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
              <button
                style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#92400e,#d97706)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => {
                  const trimmed = lateRegReason.trim();
                  if (!trimmed) { showToast("Reason cannot be empty.", "err"); return; }
                  setLateRegReasonSaved(trimmed);
                  setShowLateRegModal(false);
                  showToast("Reason submitted. You may now mark attendance.");
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Submit & Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Late Arrival Modal */}
      {modal?.type === "late" && (
        <div className="mra-modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="mra-modal-box">
            <div className="mra-modal-header"><h3>🕐 Record Late Arrival</h3>
              <button onClick={() => setModal(null)} style={{ border: "none", background: "#f1f5f9", borderRadius: 8, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="mra-modal-body">
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Enter the time this employee arrived at work.</p>
              <div style={{ marginBottom: 14 }}>
                <label className="mra-f-label">Arrival Time <span style={{ color: "#dc2626" }}>*</span></label>
                <input className="mra-f-input" type="time" value={modalVal.arrival_time} onChange={e => setModalVal(v => ({ ...v, arrival_time: e.target.value }))} autoFocus />
              </div>
            </div>
            <div className="mra-modal-footer">
              <button onClick={() => setModal(null)} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={handleModalSave} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#92400e,#d97706)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Save Late Arrival</button>
            </div>
          </div>
        </div>
      )}

      {/* Absence Reason Modal */}
      {modal?.type === "absent" && (
        <div className="mra-modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="mra-modal-box">
            <div className="mra-modal-header"><h3>📝 Absence Reason</h3>
              <button onClick={() => setModal(null)} style={{ border: "none", background: "#f1f5f9", borderRadius: 8, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="mra-modal-body">
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Provide a reason for the absence (optional but recommended).</p>
              <div style={{ marginBottom: 14 }}>
                <label className="mra-f-label">Reason for Absence</label>
                <textarea className="mra-f-input" rows={3} placeholder="e.g. Sick leave, Personal, No reason given…" value={modalVal.absence_reason} onChange={e => setModalVal(v => ({ ...v, absence_reason: e.target.value }))} style={{ resize: "vertical", minHeight: 80 }} autoFocus />
              </div>
            </div>
            <div className="mra-modal-footer">
              <button onClick={() => setModal(null)} style={{ padding: "9px 18px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={handleModalSave} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#991b1b,#dc2626)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Mark Absent</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Inner portal (has access to both contexts) ───────────────────────────────
function HODAccountsPortalInner() {
  const { user } = useHRPortal();
  const [searchParams, setSearchParams] = useSearchParams();
  const page    = searchParams.get("page") || "dashboard";
  const setPage = (p) => setSearchParams({ page: p }, { replace: false });

  const [sideOpen,   setSideOpen]   = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast,      setToast]      = useState(null);
  const [modal,      setModal]      = useState(null); // "profile" | "password"

  const showToast = (msg, type = "ok") => setToast({ msg, type });

  const needsPwChange = localStorage.getItem("dp_must_change_pw") === "true";
  const [showFirstLoginModal, setShowFirstLoginModal] = useState(needsPwChange);

  useEffect(() => startInactivityTimer(), []);
  useEffect(() => startTokenRefreshTimer(), []);

  const initials = ((user?.full_name || user?.username || "HOD")
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase());

  const sideWidth = sideOpen ? 220 : 64;

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        // Reuse HRPortal dashboard but force isHRM=false (no edit access)
        return (
          <>
            <ReadOnlyBanner />
            {/* Lazy import: render the HR Dashboard component from HRPortal */}
            <HODAccountsDashboard showToast={showToast} />
          </>
        );
      case "employees":
        return (
          <>
            <ReadOnlyBanner />
            {/* isHRM=false hides the Add Employee button; no edit actions shown */}
            <HREmployeesPage showToast={showToast} isHRM={false} />
          </>
        );
      case "attendance":
        return (
          <>
            <ReadOnlyBanner />
            <HRAttendancePage showToast={showToast} />
          </>
        );
      case "payroll":
        return (
          <>
            <ReadOnlyBanner />
            <HRPayrollReadOnly showToast={showToast} />
          </>
        );
      case "payslips":
        return (
          <>
            <ReadOnlyBanner />
            <HRPayslipsPage showToast={showToast} />
          </>
        );
      case "register":
        return <MarkRegisterPage showToast={showToast} />;
      case "profile":
        return <ProfilePage user={user} initials={initials} onPassword={() => setModal("password")} />;
      default:
        return <HODAccountsDashboard showToast={showToast} />;
    }
  };

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 16px; }
        body { font-family: 'DM Sans', sans-serif; background: #f8faff; color: #0f172a; -webkit-font-smoothing: antialiased; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform:none; } }
        @keyframes fadeDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        select, input, textarea { font-family: 'DM Sans', sans-serif; }
        .hoa-sidebar-overlay {
          display: none; position: fixed; inset: 0;
          background: rgba(0,0,0,0.4); z-index: 199;
        }
        @media (max-width: 768px) {
          .hoa-sidebar-overlay { display: block; }
          .hoa-sidebar-overlay.hidden { display: none; }
          .hr-sidebar-mobile { transform: translateX(-100%) !important; width: 220px !important; }
          .hr-sidebar-mobile.open { transform: translateX(0) !important; }
          .hoa-main-mobile { margin-left: 0 !important; }
          .hoa-page-pad { padding: 14px 14px 14px 0 !important; }
          .hoa-topbar-pad { padding: 0 14px !important; }
        }
      `}</style>

      <div className={`hoa-sidebar-overlay${mobileOpen ? "" : " hidden"}`} onClick={() => setMobileOpen(false)} />

      <div style={{ minHeight: "100vh", background: "#f8faff" }}>
        <Sidebar
          page={page} setPage={setPage}
          sideOpen={sideOpen} user={user}
          mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
        />

        <div
          className="hoa-main-mobile"
          style={{ marginLeft: sideWidth, display: "flex", flexDirection: "column", minHeight: "100vh", transition: "margin-left 0.28s cubic-bezier(.4,0,.2,1)", background: "#f8faff" }}
        >
          {/* Topbar */}
          <header
            className="hoa-topbar-pad"
            style={{ height: 64, background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 24px", gap: 16, flexShrink: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", position: "sticky", top: 0, zIndex: 100 }}
          >
            <button
              onClick={() => { if (window.innerWidth <= 768) { setMobileOpen(v => !v); } else { setSideOpen(v => !v); } }}
              style={{ width: 36, height: 36, border: "1.5px solid #e2e8f0", borderRadius: 9, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748b", transition: "border-color 0.15s, color 0.15s", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.color = "#1557b0"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
              <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: "#0a2a5e" }}>
                {NAV_ITEMS.find(n => n.key === page)?.label || "Dashboard"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#0891b2", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 20, padding: "4px 12px", fontFamily: "'DM Sans',sans-serif" }}>
                ACCOUNTS HOD
              </div>
              <TopbarMenu user={user} initials={initials} onProfile={() => setModal("profile")} onPassword={() => setModal("password")} />
            </div>
          </header>

          {/* Content */}
          <main className="hoa-page-pad" style={{ flex: 1, padding: "24px 24px 28px 0" }}>
            <div style={{ padding: "0 0 0 24px" }}>
              {renderPage()}
            </div>
          </main>
        </div>
      </div>

      {/* Password modal */}
      {modal === "password" && <PasswordModal user={user} onClose={() => setModal(null)} showToast={showToast} />}

      {/* First-login password change */}
      {showFirstLoginModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,26,80,0.7)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 18, padding: 32, maxWidth: 400, width: "100%", textAlign: "center" }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Password Change Required</div>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>You must change your password before continuing.</p>
            <PasswordModal
              user={user}
              onClose={() => {
                localStorage.removeItem("dp_must_change_pw");
                setShowFirstLoginModal(false);
              }}
              showToast={showToast}
            />
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </>
  );
}

// ─── Lightweight read-only Payroll view ───────────────────────────────────────
// Wraps HRPayrollPage but intercepts any save actions via disabled styling.
// The real gate is backend-side (HOD_ACCOUNTS has no write permission on /payroll/).
// On the frontend we render the page normally — the editable cells just won't
// persist since the backend will reject the PATCH. To make it visually clear,
// we overlay a CSS pointer-events:none layer over the editable columns.
function HRPayrollReadOnly({ showToast }) {
  return (
    <div style={{ position: "relative" }}>
      {/* Invisible overlay that blocks clicks on the entire payroll editable area */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 5,
        cursor: "not-allowed",
        // Transparent so content is still visible
        background: "transparent",
        // We use pointer-events on child so read-only banner and downloads still work
      }} title="Payroll editing is disabled for this role." />
      <HRPayrollPage showToast={showToast} />
    </div>
  );
}

// ─── Minimal dashboard (reuses HR stat cards via context) ─────────────────────
function HODAccountsDashboard({ showToast }) {
  const { stats, loading, errors } = useHRPortal();

  if (loading.employees || loading.departments) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ color: "#64748b", fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>Loading dashboard…</p>
      </div>
    );
  }

  if (!stats) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
      No data available yet.
    </div>
  );

  const cards = [
    { label: "Total Employees", value: stats.total,       icon: "👥", color: "#1557b0", bg: "#eff6ff" },
    { label: "Employed",        value: stats.employed,    icon: "✅", color: "#16a34a", bg: "#f0fdf4" },
    { label: "On Leave",        value: stats.onLeave,     icon: "🏖",  color: "#d97706", bg: "#fffbeb" },
    { label: "Departments",     value: stats.totalDepts,  icon: "🏢", color: "#7c3aed", bg: "#faf5ff" },
    { label: "Present Today",   value: stats.presentToday,icon: "🟢", color: "#16a34a", bg: "#f0fdf4" },
    { label: "Absent Today",    value: stats.absentToday, icon: "🔴", color: "#dc2626", bg: "#fef2f2" },
    { label: "Not Marked",      value: stats.notMarkedToday,icon:"⏳",color: "#64748b", bg: "#f8faff" },
    { label: "Terminated",      value: stats.terminated,  icon: "⛔", color: "#991b1b", bg: "#fef2f2" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: "#0a2a5e", margin: 0 }}>Overview</h2>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4, fontFamily: "'DM Sans',sans-serif" }}>Read-only summary. Use the sidebar to navigate details.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginTop: 20 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
            borderLeft: `4px solid ${c.color}`, padding: "18px 20px",
            display: "flex", alignItems: "center", gap: 14,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{c.icon}</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontFamily: "'DM Sans',sans-serif" }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root export (wraps both providers) ──────────────────────────────────────
export default function HODAccountsPortal() {
  return (
    <HRPortalProvider>
      <DeptPortalProvider>
        <HODAccountsPortalInner />
      </DeptPortalProvider>
    </HRPortalProvider>
  );
}