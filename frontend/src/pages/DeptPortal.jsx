// src/pages/DeptPortal.jsx
//
// Department Admin Portal — accessible by any HOD (Head of Department) admin.
// On login the token already carries the department name; this portal
// automatically scopes all data to that department.
//
// Sidebar nav:  Dashboard · Mark Attendance (placeholder) · My Profile
// Dashboard:    Stats cards → Charts (gender, employment status, type) → Workers table

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, getUser, getToken, clearSession } from "../utils/auth";
import { DeptPortalProvider, useDeptPortal } from "../context/DeptPortalContext";

const API = "http://127.0.0.1:8000/api";

function authHeaders() {
  const token = getToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ data, size = 150 }) {
  const r = 54, cx = 75, cy = 75, circ = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 150 150">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f4ff" strokeWidth="22" />
      {data.map((d, i) => {
        const dash = (d.value / total) * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={d.color} strokeWidth="22"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        );
        offset += dash;
        return el;
      })}
      <circle cx={cx} cy={cy} r={43} fill="#fff" />
      <text x={cx} y={cy - 7} textAnchor="middle"
        fill="#0a1a5c" fontSize="20" fontWeight="700" fontFamily="'DM Sans',sans-serif">{total}</text>
      <text x={cx} y={cy + 10} textAnchor="middle"
        fill="#94a3b8" fontSize="9" fontFamily="'DM Sans',sans-serif" letterSpacing="1.2">TOTAL</text>
    </svg>
  );
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────
function BarChart({ data, height = 130 }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 380, barW = 36, gap = (w - data.length * barW) / (data.length + 1);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height + 36}`} style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const bh = Math.max((d.value / max) * height, 4);
        const x  = gap + i * (barW + gap);
        const y  = height - bh;
        return (
          <g key={i}>
            <rect x={x} y={height} width={barW} height={0} rx="6" fill={d.color}>
              <animate attributeName="height" from="0" to={bh} dur="0.6s" begin={`${i * 0.08}s`} fill="freeze" />
              <animate attributeName="y" from={height} to={y}  dur="0.6s" begin={`${i * 0.08}s`} fill="freeze" />
            </rect>
            <text x={x + barW / 2} y={height + 20} textAnchor="middle"
              fill="#64748b" fontSize="10" fontFamily="'DM Sans',sans-serif">{d.label}</text>
            <text x={x + barW / 2} y={y - 6} textAnchor="middle"
              fill="#0a1a5c" fontSize="11" fontWeight="600" fontFamily="'DM Sans',sans-serif">{d.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 480 }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div className="dp-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dp-modal-box" style={{ maxWidth }}>
        <div className="dp-modal-header">
          <span className="dp-modal-title">{title}</span>
          <button className="dp-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="dp-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3400); return () => clearTimeout(t); }, []);
  return (
    <div className={`dp-toast dp-toast-${type}`}>
      {type === "ok"
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      }
      <span>{msg}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function DeptPortal() {
  return (
    <DeptPortalProvider>
      <DeptPortalInner />
    </DeptPortalProvider>
  );
}

function DeptPortalInner() {
  const { stats, deptName } = useDeptPortal();
  const user = getUser();

  const [page,       setPage]       = useState("dashboard");
  const [sideOpen,   setSideOpen]   = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast,      setToast]      = useState(null);
  const [modal,      setModal]      = useState(null); // "password"

  // Admin photo
  const [photoUrl, setPhotoUrl] = useState(null);

  // First-login: show popup only if flagged AND the user hasn't already changed their password.
  const hasAlreadyChangedPw = () =>
    localStorage.getItem(`dp_pw_changed_${getUser().username}`) === "true";

  const needsPasswordChange = () =>
    localStorage.getItem("dp_must_change_pw") === "true" && !hasAlreadyChangedPw();

  const [showFirstLoginModal, setShowFirstLoginModal] = useState(needsPasswordChange);
  const [mustChangePassword, setMustChangePassword]   = useState(needsPasswordChange);

  const showToast = (msg, type = "ok") => setToast({ msg, type });

  // Fetch admin profile photo from linked employee record
  useEffect(() => {
    const fetchPhoto = async () => {
      try {
        const res = await apiFetch(`${API}/auth/me/`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.employee) {
          const empRes = await apiFetch(`${API}/employees/${data.employee}/`);
          if (empRes.ok) {
            const emp = await empRes.json();
            if (emp.profile_picture) {
              const url = emp.profile_picture.startsWith("http")
                ? emp.profile_picture
                : `http://127.0.0.1:8000${emp.profile_picture}`;
              setPhotoUrl(url);
            }
          }
        }
      } catch (_) { /* photo is optional */ }
    };
    fetchPhoto();
  }, []);

  const handleLogout = async () => {
    const refresh = localStorage.getItem("refresh_token");
    try {
      await fetch(`${API}/auth/logout/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ refresh }),
      });
    } catch (_e) { /* best-effort */ }
    clearSession();
    window.location.href = "/";
  };

  const navItems = [
    { key: "dashboard",   label: "Dashboard",        icon: <GridIcon /> },
    { key: "divider1",    divider: true, label: "MANAGEMENT" },
    { key: "attendance",  label: "Mark Attendance",  icon: <CheckSquareIcon /> },
    { key: "divider2",    divider: true, label: "ACCOUNT" },
    { key: "profile",     label: "My Profile",       icon: <UserIcon /> },
  ];

  const initials = (user.full_name || "HOD").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  const pageTitle = {
    dashboard:  "Dashboard",
    attendance: "Mark Attendance",
    profile:    "My Profile",
  }[page] || "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 16px; }
        body { font-family: 'DM Sans', sans-serif; background: #fff; color: #0f172a; -webkit-font-smoothing: antialiased; }

        :root {
          --dp-blue:       #1557b0;
          --dp-blue-dark:  #0e3d82;
          --dp-blue-deep:  #0a2a5e;
          --dp-blue-mid:   #1a6fd4;
          --dp-blue-light: #4a90d9;
          --dp-white:      #ffffff;
          --dp-text:       #0f172a;
          --dp-muted:      #64748b;
          --dp-border:     #e2e8f0;
          --dp-bg:         #f8faff;
          --dp-card-r:     16px;
          --dp-side-w:     220px;
          --dp-top-h:      64px;
        }

        /* ══ Layout ══ */
        .dp-portal { display: flex; min-height: 100vh; background: var(--dp-bg); }

        /* ══ Sidebar ══ */
        .dp-sidebar {
          width: var(--dp-side-w);
          background: linear-gradient(180deg,
            #1a6fd4 0%,
            #1557b0 25%,
            #0e3d82 55%,
            #0a2a5e 100%
          );
          position: fixed; top: 0; left: 0; bottom: 0;
          z-index: 200;
          display: flex; flex-direction: column;
          transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1);
          overflow: hidden;
        }
        .dp-sidebar.collapsed { width: 64px; }

        .dp-sidebar-overlay {
          display: none; position: fixed; inset: 0;
          background: rgba(0,0,0,0.4); z-index: 199;
        }

        /* Brand */
        .dp-sb-brand {
          padding: 0 14px; height: var(--dp-top-h);
          display: flex; align-items: center; gap: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          flex-shrink: 0; overflow: hidden;
        }
        .dp-sb-logo {
          width: 44px; height: 44px; border-radius: 10px;
          background: rgba(255,255,255,0.15);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; overflow: hidden;
        }
        .dp-sb-logo img { width: 40px; height: 40px; object-fit: contain; border-radius: 8px; }
        .dp-sb-brand-text { overflow: hidden; white-space: nowrap; }
        .dp-sb-brand-name {
          font-family: 'Playfair Display', serif; font-size: 13.5px; font-weight: 700;
          color: #fff; line-height: 1.2; letter-spacing: -0.2px;
        }
        .dp-sb-brand-sub {
          font-size: 9.5px; color: rgba(255,255,255,0.5);
          letter-spacing: 1.8px; text-transform: uppercase; margin-top: 1px;
        }
        .dp-sidebar.collapsed .dp-sb-brand-text { display: none; }

        /* Admin chip */
        .dp-sb-user {
          margin: 14px 10px; padding: 10px 11px;
          background: rgba(255,255,255,0.1); border-radius: 12px;
          display: flex; align-items: center; gap: 10px;
          overflow: hidden; flex-shrink: 0;
        }
        .dp-sidebar.collapsed .dp-sb-user { margin: 14px 10px; padding: 8px; justify-content: center; }
        .dp-sb-avatar {
          width: 36px; height: 36px; border-radius: 9px;
          background: rgba(255,255,255,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; letter-spacing: 0.5px;
          overflow: hidden;
        }
        .dp-sb-avatar img { width: 36px; height: 36px; object-fit: cover; border-radius: 9px; }
        .dp-sb-user-info { overflow: hidden; white-space: nowrap; }
        .dp-sb-user-name { font-size: 13px; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; }
        .dp-sb-user-role { font-size: 10px; color: rgba(255,255,255,0.5); margin-top: 1px; letter-spacing: 0.3px; }
        .dp-sidebar.collapsed .dp-sb-user-info { display: none; }

        /* Department badge in sidebar */
        .dp-sb-dept {
          margin: 0 10px 10px; padding: 7px 10px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 9px; overflow: hidden;
        }
        .dp-sidebar.collapsed .dp-sb-dept { display: none; }
        .dp-sb-dept-label { font-size: 9px; color: rgba(255,255,255,0.4); letter-spacing: 1.5px; text-transform: uppercase; }
        .dp-sb-dept-name { font-size: 12px; font-weight: 600; color: #fff; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Nav */
        .dp-sb-nav { flex: 1; padding: 6px 10px; overflow-y: auto; scrollbar-width: none; }
        .dp-sb-nav::-webkit-scrollbar { display: none; }
        .dp-sb-section {
          font-size: 9px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase;
          color: rgba(255,255,255,0.35); padding: 14px 8px 6px; white-space: nowrap; overflow: hidden;
        }
        .dp-sidebar.collapsed .dp-sb-section { opacity: 0; height: 0; padding: 0; margin: 4px 0; }
        .dp-nav-btn {
          display: flex; align-items: center; gap: 11px;
          width: 100%; padding: 9px 10px; border-radius: 10px; border: none; background: none;
          color: rgba(255,255,255,0.65); font-size: 13.5px; font-weight: 500;
          font-family: 'DM Sans', sans-serif; cursor: pointer;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap; overflow: hidden; text-align: left; margin-bottom: 2px;
        }
        .dp-nav-btn svg { flex-shrink: 0; width: 18px; height: 18px; }
        .dp-nav-btn span { overflow: hidden; text-overflow: ellipsis; }
        .dp-nav-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .dp-nav-btn.active { background: rgba(255,255,255,0.18); color: #fff; font-weight: 600; }
        .dp-sidebar.collapsed .dp-nav-btn span { display: none; }
        .dp-sidebar.collapsed .dp-nav-btn { justify-content: center; padding: 10px; }

        /* Footer */
        .dp-sb-footer { padding: 12px 10px; border-top: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; }
        .dp-sb-logout {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 9px 10px; border-radius: 10px; border: none; background: none;
          color: rgba(255,255,255,0.5); font-size: 13px; font-family: 'DM Sans', sans-serif;
          cursor: pointer; transition: background 0.15s, color 0.15s; white-space: nowrap; overflow: hidden;
        }
        .dp-sb-logout svg { flex-shrink: 0; }
        .dp-sb-logout:hover { background: rgba(220,38,38,0.2); color: #fca5a5; }
        .dp-sidebar.collapsed .dp-sb-logout { justify-content: center; }
        .dp-sidebar.collapsed .dp-sb-logout span { display: none; }

        /* ══ Main ══ */
        .dp-main {
          flex: 1; margin-left: var(--dp-side-w);
          display: flex; flex-direction: column; min-height: 100vh;
          transition: margin-left 0.28s cubic-bezier(0.4,0,0.2,1); background: var(--dp-bg);
        }
        .dp-main.collapsed-main { margin-left: 64px; }

        /* ══ Topbar ══ */
        .dp-topbar {
          height: var(--dp-top-h); background: var(--dp-white);
          border-bottom: 1px solid var(--dp-border);
          display: flex; align-items: center;
          padding: 0 28px; gap: 14px;
          position: sticky; top: 0; z-index: 100;
        }
        .dp-toggle-btn {
          width: 36px; height: 36px; border: 1.5px solid var(--dp-border);
          border-radius: 9px; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--dp-muted); transition: border-color 0.15s, color 0.15s; flex-shrink: 0;
        }
        .dp-toggle-btn:hover { border-color: var(--dp-blue); color: var(--dp-blue); }
        .dp-topbar-title {
          flex: 1; font-family: 'Playfair Display', serif;
          font-size: 20px; font-weight: 700; color: var(--dp-text); letter-spacing: -0.3px;
        }
        .dp-topbar-right { display: flex; align-items: center; gap: 10px; }
        .dp-top-avatar {
          width: 38px; height: 38px;
          background: linear-gradient(135deg, var(--dp-blue), var(--dp-blue-light));
          border-radius: 10px; display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 13px; color: #fff;
          cursor: pointer; position: relative; border: 2px solid transparent;
          transition: border-color 0.15s; letter-spacing: 0.5px; overflow: hidden;
        }
        .dp-top-avatar img { width: 38px; height: 38px; object-fit: cover; border-radius: 8px; }
        .dp-top-avatar:hover { border-color: var(--dp-blue); }
        .dp-top-menu {
          position: absolute; top: calc(100% + 10px); right: 0;
          background: #fff; border: 1px solid var(--dp-border); border-radius: 14px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.1); min-width: 210px; overflow: hidden;
          z-index: 300; animation: dp-fadeDown 0.15s ease;
        }
        @keyframes dp-fadeDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        .dp-top-menu-head { padding: 14px 16px; border-bottom: 1px solid var(--dp-border); display: flex; align-items: center; gap: 10px; }
        .dp-top-menu-photo { width: 38px; height: 38px; border-radius: 9px; object-fit: cover; flex-shrink: 0; }
        .dp-top-menu-photo-init {
          width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0;
          background: linear-gradient(135deg, var(--dp-blue-deep), var(--dp-blue-mid));
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: #fff;
        }
        .dp-top-menu-name { font-weight: 600; font-size: 14px; color: var(--dp-text); }
        .dp-top-menu-role { font-size: 11px; color: var(--dp-muted); margin-top: 2px; }
        .dp-top-menu-item {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 16px; font-size: 13.5px; color: var(--dp-text);
          cursor: pointer; border: none; background: none;
          width: 100%; text-align: left; font-family: 'DM Sans', sans-serif; transition: background 0.1s;
        }
        .dp-top-menu-item:hover { background: var(--dp-bg); }
        .dp-top-menu-item.red { color: #dc2626; }
        .dp-top-menu-item.red:hover { background: #fef2f2; }
        .dp-menu-hr { height: 1px; background: var(--dp-border); }

        /* ══ Page ══ */
        .dp-page { padding: 28px; flex: 1; }

        /* ══ Stat cards ══ */
        .dp-stats-row {
          display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 24px;
        }
        .dp-stat-card {
          background: #fff; border-radius: var(--dp-card-r);
          padding: 20px 22px; border: 1px solid var(--dp-border);
          border-left: 4px solid var(--dp-blue);
          display: flex; align-items: center; gap: 16px;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .dp-stat-card:hover { box-shadow: 0 6px 24px rgba(21,87,176,0.1); transform: translateY(-2px); }
        .dp-stat-icon-box {
          width: 46px; height: 46px; background: #eff6ff; border-radius: 12px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .dp-stat-num {
          font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 700;
          color: var(--dp-blue-deep); line-height: 1;
        }
        .dp-stat-lbl { font-size: 12px; color: var(--dp-muted); margin-top: 4px; }

        /* ══ Charts ══ */
        .dp-charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .dp-chart-card { background: #fff; border-radius: var(--dp-card-r); border: 1px solid var(--dp-border); padding: 22px 24px; }
        .dp-chart-card.full { grid-column: 1 / -1; }
        .dp-chart-head {
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
          color: var(--dp-blue-deep); margin-bottom: 20px; padding-bottom: 12px;
          border-bottom: 1px solid var(--dp-border);
        }
        .dp-donut-wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
        .dp-legend { display: flex; flex-direction: column; gap: 10px; }
        .dp-leg-item { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--dp-muted); }
        .dp-leg-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
        .dp-leg-val { font-weight: 600; color: var(--dp-text); margin-left: 4px; font-size: 14px; }

        /* ══ Workers Table ══ */
        .dp-table-card {
          background: #fff; border-radius: var(--dp-card-r); border: 1px solid var(--dp-border);
          padding: 22px 24px; margin-bottom: 24px;
        }
        .dp-table-head-row {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 16px; flex-wrap: wrap; gap: 12px;
        }
        .dp-table-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: var(--dp-blue-deep); }
        .dp-table-controls { display: flex; align-items: center; gap: 10px; }
        .dp-search-wrap { position: relative; }
        .dp-search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; }
        .dp-search {
          padding: 9px 12px 9px 32px; border: 1.5px solid var(--dp-border); border-radius: 10px;
          font-size: 13px; font-family: 'DM Sans', sans-serif; outline: none;
          background: #fafbff; width: 220px; transition: border-color 0.2s, box-shadow 0.2s;
          color: #0f172a;
        }
        .dp-search::placeholder { color: #94a3b8; }
        .dp-search:focus { border-color: var(--dp-blue); box-shadow: 0 0 0 3px rgba(21,87,176,0.1); background: #fff; }
        /* Download dropdown */
        .dp-dl-wrap { position: relative; }
        .dp-dl-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 9px 16px; border-radius: 10px; border: 1.5px solid var(--dp-border);
          background: #fff; font-size: 13px; font-family: 'DM Sans', sans-serif;
          font-weight: 500; color: var(--dp-blue-dark); cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .dp-dl-btn:hover { border-color: var(--dp-blue); background: #eff6ff; }
        .dp-dl-menu {
          position: absolute; top: calc(100% + 6px); right: 0;
          background: #fff; border: 1px solid var(--dp-border); border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.1); min-width: 170px; overflow: hidden;
          z-index: 200; animation: dp-fadeDown 0.15s ease;
        }
        .dp-dl-item {
          display: flex; align-items: center; gap: 9px;
          padding: 11px 16px; font-size: 13px; color: var(--dp-text);
          cursor: pointer; border: none; background: none;
          width: 100%; text-align: left; font-family: 'DM Sans', sans-serif;
          transition: background 0.1s;
        }
        .dp-dl-item:hover { background: #f0f9ff; color: var(--dp-blue); }

        .dp-table-wrap { overflow-x: auto; }
        table.dp-table { width: 100%; border-collapse: collapse; }
        table.dp-table th {
          text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.8px; color: var(--dp-muted); padding: 10px 12px;
          border-bottom: 1.5px solid var(--dp-border); white-space: nowrap; background: #fafbff;
        }
        table.dp-table td {
          padding: 12px 12px; font-size: 13px; color: var(--dp-text);
          border-bottom: 1px solid #f1f5f9; vertical-align: middle;
        }
        table.dp-table tr:last-child td { border-bottom: none; }
        table.dp-table tbody tr { transition: background 0.12s; }
        table.dp-table tbody tr:hover { background: #f8faff; }

        .dp-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 600;
        }
        .dp-emp-avatar {
          width: 30px; height: 30px; border-radius: 8px;
          background: linear-gradient(135deg,#0e3d82,#1a6fd4);
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: #fff;
          flex-shrink: 0; margin-right: 8px; letter-spacing: 0.4px;
          overflow: hidden;
        }
        .dp-name-cell { display: flex; align-items: center; }

        /* ══ Profile page ══ */
        .dp-profile-card {
          background: #fff; border-radius: var(--dp-card-r); border: 1px solid var(--dp-border);
          padding: 28px; margin-bottom: 18px; max-width: 680px;
        }
        .dp-profile-top { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
        .dp-profile-avatar {
          width: 76px; height: 76px;
          background: linear-gradient(135deg, var(--dp-blue-deep), var(--dp-blue-mid));
          border-radius: 18px; display: flex; align-items: center; justify-content: center;
          font-size: 26px; font-weight: 700; color: #fff; flex-shrink: 0; letter-spacing: 1px;
          overflow: hidden;
        }
        .dp-profile-avatar img { width: 76px; height: 76px; object-fit: cover; border-radius: 18px; }
        .dp-profile-name { font-family:'Playfair Display',serif; font-size:22px; font-weight:700; color:var(--dp-text); }
        .dp-profile-sub  { font-size:13px; color:var(--dp-muted); margin-top:4px; }
        .dp-profile-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
        .dp-profile-field label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:var(--dp-muted); }
        .dp-profile-field p { font-size:14px; font-weight:500; color:var(--dp-text); margin-top:4px; }

        .dp-action-cards { display:grid; grid-template-columns:1fr; gap:16px; max-width:340px; }
        .dp-action-card {
          background:#fff; border:1px solid var(--dp-border); border-radius:var(--dp-card-r);
          padding:20px; cursor:pointer; display:flex; align-items:center; gap:14px;
          transition:box-shadow 0.2s, border-color 0.2s;
        }
        .dp-action-card:hover { border-color:var(--dp-blue); box-shadow:0 4px 20px rgba(21,87,176,0.1); }
        .dp-action-icon { width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
        .dp-action-title { font-size:14px;font-weight:600;color:var(--dp-text); }
        .dp-action-desc  { font-size:12px;color:var(--dp-muted);margin-top:3px; }

        /* ══ Modal ══ */
        .dp-modal-backdrop {
          position:fixed;inset:0;background:rgba(10,30,80,0.5);
          z-index:600;display:flex;align-items:center;justify-content:center;
          padding:20px;animation:dp-fadeIn 0.18s ease;
        }
        @keyframes dp-fadeIn { from{opacity:0;} to{opacity:1;} }
        .dp-modal-box {
          background:#fff;border-radius:18px;width:100%;
          box-shadow:0 24px 64px rgba(0,0,0,0.18);
          animation:dp-slideUp 0.25s cubic-bezier(0.22,1,0.36,1) both; overflow:hidden;
        }
        @keyframes dp-slideUp { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:none;} }
        .dp-modal-header {
          background: linear-gradient(135deg, var(--dp-blue-deep), var(--dp-blue));
          padding:18px 22px; display:flex;align-items:center;justify-content:space-between;
        }
        .dp-modal-title { font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:#fff; }
        .dp-modal-close {
          width:30px;height:30px;background:rgba(255,255,255,0.15);
          border:none;border-radius:8px;display:flex;align-items:center;justify-content:center;
          cursor:pointer;color:#fff;transition:background 0.15s;
        }
        .dp-modal-close:hover{background:rgba(255,255,255,0.25);}
        .dp-modal-body { padding:24px; }

        /* First-login password banner */
        .dp-pw-banner {
          background: linear-gradient(135deg, #fff7ed, #fef3c7);
          border: 1.5px solid #f59e0b; border-radius: 14px;
          padding: 18px 22px; margin-bottom: 24px;
          display: flex; align-items: flex-start; gap: 14px;
        }
        .dp-pw-banner-icon { font-size: 26px; flex-shrink: 0; }
        .dp-pw-banner-title { font-size: 15px; font-weight: 700; color: #92400e; margin-bottom: 4px; }
        .dp-pw-banner-text  { font-size: 13px; color: #78350f; line-height: 1.5; }
        .dp-pw-banner-btn {
          margin-top: 10px; padding: 9px 18px; border-radius: 10px; border: none;
          background: linear-gradient(135deg, #d97706, #f59e0b);
          color: #fff; font-size: 13px; font-weight: 600;
          font-family: 'DM Sans', sans-serif; cursor: pointer;
          transition: opacity 0.15s;
        }
        .dp-pw-banner-btn:hover { opacity: 0.88; }

        /* Form */
        .dp-f-field { margin-bottom:16px; }
        .dp-f-label {
          display:block;font-size:11px;font-weight:700;
          text-transform:uppercase;letter-spacing:0.7px;
          color:var(--dp-muted);margin-bottom:7px;
        }
        .dp-f-input {
          width:100%;padding:11px 14px;border:1.5px solid var(--dp-border);border-radius:10px;
          font-size:14px;font-family:'DM Sans',sans-serif;color:var(--dp-text);
          background:#fafbff;outline:none;transition:border-color 0.2s,box-shadow 0.2s;
        }
        .dp-f-input:focus { border-color:var(--dp-blue);box-shadow:0 0 0 3px rgba(21,87,176,0.1);background:#fff; }
        .dp-pw-wrap { position:relative; }
        .dp-pw-wrap .dp-f-input { padding-right:42px; }
        .dp-pw-eye {
          position:absolute;right:13px;top:50%;transform:translateY(-50%);
          background:none;border:none;cursor:pointer;color:#94a3b8;
          display:flex;align-items:center;padding:2px;transition:color 0.15s;
        }
        .dp-pw-eye:hover{color:var(--dp-blue);}

        /* Buttons */
        .dp-btn-row { display:flex;justify-content:flex-end;gap:10px;margin-top:22px; }
        .dp-btn {
          padding:10px 22px;border-radius:10px;font-family:'DM Sans',sans-serif;
          font-size:14px;font-weight:500;cursor:pointer;border:none;
          transition:opacity 0.18s,transform 0.15s;display:inline-flex;align-items:center;gap:7px;
        }
        .dp-btn:hover:not(:disabled){opacity:0.88;transform:translateY(-1px);}
        .dp-btn:active:not(:disabled){transform:none;}
        .dp-btn:disabled{opacity:0.5;cursor:not-allowed;}
        .dp-btn-primary { background:linear-gradient(135deg,var(--dp-blue-deep),var(--dp-blue));color:#fff; }
        .dp-btn-ghost   { background:#f1f5f9;color:var(--dp-text);border:1px solid var(--dp-border); }

        /* Toast */
        .dp-toast {
          position:fixed;bottom:24px;right:24px;background:#fff;border-radius:12px;padding:13px 18px;
          display:flex;align-items:center;gap:10px;font-size:14px;
          box-shadow:0 8px 32px rgba(0,0,0,0.12);border:1px solid var(--dp-border);
          z-index:9999;animation:dp-slideInT 0.25s ease;max-width:360px;
        }
        @keyframes dp-slideInT{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
        .dp-toast-ok  { border-left:4px solid #16a34a; }
        .dp-toast-err { border-left:4px solid #dc2626; }

        /* Placeholder */
        .dp-ph-page {
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:60vh;gap:14px;text-align:center;color:var(--dp-muted);
        }
        .dp-ph-icon {
          width:72px;height:72px;background:#eff6ff;border-radius:20px;
          display:flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:8px;
        }
        .dp-ph-page h2 { font-family:'Playfair Display',serif;font-size:22px;color:var(--dp-text); }
        .dp-ph-page p { font-size:14px;max-width:320px;line-height:1.65; }

        /* Spinner */
        .dp-spin { width:36px;height:36px;border:3px solid #e8edf8;border-top-color:var(--dp-blue);
          border-radius:50%;animation:dp-sp 0.75s linear infinite;margin:0 auto; }
        @keyframes dp-sp{to{transform:rotate(360deg);}}

        /* Print styles */
        @media print {
          .dp-sidebar, .dp-topbar, .dp-table-controls, .dp-toast { display: none !important; }
          .dp-main { margin-left: 0 !important; }
          .dp-page { padding: 0 !important; }
          .dp-table-card, .dp-chart-card, .dp-stat-card { box-shadow: none !important; border: 1px solid #ccc !important; }
          body { background: white !important; }
        }

        /* ══ Responsive ══ */
        @media (max-width: 1100px) { .dp-stats-row { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 900px)  { .dp-charts-row { grid-template-columns: 1fr; } }
        @media (max-width: 768px) {
          :root { --dp-side-w: 220px; }
          .dp-sidebar { transform: translateX(-100%); width: var(--dp-side-w) !important; }
          .dp-sidebar.mobile-open { transform: translateX(0); }
          .dp-sidebar-overlay { display: block; }
          .dp-sidebar-overlay.hidden { display: none; }
          .dp-main { margin-left: 0 !important; }
          .dp-page { padding: 18px; }
          .dp-topbar { padding: 0 18px; }
          .dp-stats-row { grid-template-columns: 1fr 1fr; gap:12px; }
          .dp-profile-grid { grid-template-columns:1fr; }
        }
        @media (max-width: 480px) {
          .dp-stats-row { grid-template-columns: 1fr; }
          .dp-donut-wrap { flex-direction: column; align-items:flex-start; }
        }
      `}</style>

      <div className="dp-portal">
        {/* Overlay for mobile */}
        <div
          className={`dp-sidebar-overlay${mobileOpen ? "" : " hidden"}`}
          onClick={() => setMobileOpen(false)}
        />

        {/* ══ SIDEBAR ══ */}
        <aside className={`dp-sidebar${!sideOpen ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
          {/* Brand */}
          <div className="dp-sb-brand">
            <div className="dp-sb-logo">
              <img src="/logo.jpeg" alt="JECCA"
                onError={e => { e.target.style.display = "none"; }}
              />
            </div>
            <div className="dp-sb-brand-text">
              <div className="dp-sb-brand-name">JECCA Engineering</div>
              <div className="dp-sb-brand-sub">HR Management</div>
            </div>
          </div>

          {/* Admin chip */}
          <div className="dp-sb-user">
            <div className="dp-sb-avatar">
              {photoUrl
                ? <img src={photoUrl} alt={user.full_name || "Admin"} onError={e => { e.target.style.display = "none"; }} />
                : initials
              }
            </div>
            <div className="dp-sb-user-info">
              <div className="dp-sb-user-name">{user.full_name || "Dept Admin"}</div>
              <div className="dp-sb-user-role">Head of Department</div>
            </div>
          </div>

          {/* Department badge */}
          <div className="dp-sb-dept">
            <div className="dp-sb-dept-label">Department</div>
            <div className="dp-sb-dept-name">{deptName}</div>
          </div>

          {/* Nav */}
          <nav className="dp-sb-nav">
            {navItems.map(item =>
              item.divider
                ? <div key={item.key} className="dp-sb-section">{item.label}</div>
                : (
                  <button key={item.key}
                    className={`dp-nav-btn${page === item.key ? " active" : ""}`}
                    onClick={() => { setPage(item.key); setMobileOpen(false); }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                )
            )}
          </nav>

          {/* Footer */}
          <div className="dp-sb-footer">
            <button className="dp-sb-logout" onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* ══ MAIN ══ */}
        <div className={`dp-main${!sideOpen ? " collapsed-main" : ""}`}>
          {/* Topbar */}
          <header className="dp-topbar">
            <button className="dp-toggle-btn"
              onClick={() => { window.innerWidth <= 768 ? setMobileOpen(!mobileOpen) : setSideOpen(!sideOpen); }}
              aria-label="Toggle sidebar"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>

            <span className="dp-topbar-title">{pageTitle}</span>

            <div className="dp-topbar-right">
              <TopbarMenu user={user} initials={initials} photoUrl={photoUrl}
                onPassword={() => setModal("password")}
                onLogout={handleLogout}
                deptName={deptName}
              />
            </div>
          </header>

          {/* Content */}
          <div className="dp-page">
            {/* First-login password change banner */}
            {mustChangePassword && (
              <div className="dp-pw-banner">
                <div className="dp-pw-banner-icon">🔐</div>
                <div>
                  <div className="dp-pw-banner-title">Security Action Required</div>
                  <div className="dp-pw-banner-text">
                    You are logging in for the first time. For your account's security, please change your password before proceeding.
                  </div>
                  <button className="dp-pw-banner-btn" onClick={() => setModal("password")}>
                    Change Password Now
                  </button>
                </div>
              </div>
            )}

            {page === "dashboard"  && <DashboardPage showToast={showToast} />}
            {page === "attendance" && <AttendancePage showToast={showToast} />}
            {page === "profile"    && (
              <ProfilePage user={user} initials={initials} deptName={deptName}
                photoUrl={photoUrl}
                onPassword={() => setModal("password")}
              />
            )}
          </div>
        </div>
      </div>

      {/* ══ MODALS ══ */}
      {/* First-login password popup */}
      {showFirstLoginModal && (
        <div className="dp-modal-backdrop">
          <div className="dp-modal-box" style={{ maxWidth: 440 }}>
            <div className="dp-modal-header" style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
              <span className="dp-modal-title">🔐 Password Change Required</span>
            </div>
            <div className="dp-modal-body">
              <div style={{ textAlign: "center", padding: "8px 0 18px" }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: "#fff7ed", border: "2px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>🔑</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 8, fontFamily: "'Playfair Display',serif" }}>Welcome! Please change your password</div>
                <div style={{ fontSize: 13.5, color: "#64748b", lineHeight: 1.6, maxWidth: 340, margin: "0 auto" }}>
                  For your account's security, it is recommended that you change your default password before continuing.
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="dp-btn dp-btn-ghost" onClick={() => setShowFirstLoginModal(false)} style={{ minWidth: 120 }}>
                  Do It Later
                </button>
                <button className="dp-btn dp-btn-primary" onClick={() => { setShowFirstLoginModal(false); setModal("password"); }} style={{ minWidth: 160, background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
                  Change Password Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === "password" && (
        <ChangePasswordModal
          onClose={() => setModal(null)}
          showToast={showToast}
          user={user}
          onSuccess={() => {
            // Permanently mark this user as having changed their password.
            // Keyed by username; clearSession() in auth.js preserves this across all portal logouts.
            localStorage.setItem(`dp_pw_changed_${user.username}`, "true");
            localStorage.removeItem("dp_must_change_pw");
            setMustChangePassword(false);
          }}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </>
  );
}

// ── Topbar dropdown menu ──────────────────────────────────────────────────────
function TopbarMenu({ user, initials, photoUrl, onPassword, onLogout, deptName }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <div className="dp-top-avatar" onClick={() => setOpen(!open)} title="Account">
        {photoUrl
          ? <img src={photoUrl} alt={user.full_name || "Admin"} onError={e => { e.target.style.display = "none"; }} />
          : initials
        }
      </div>
      {open && (
        <div className="dp-top-menu">
          <div className="dp-top-menu-head">
            {photoUrl
              ? <img src={photoUrl} alt={user.full_name} className="dp-top-menu-photo" onError={e => { e.target.style.display = "none"; }} />
              : <div className="dp-top-menu-photo-init">{initials}</div>
            }
            <div>
              <div className="dp-top-menu-name">{user.full_name || "Dept Admin"}</div>
              <div className="dp-top-menu-role">{deptName} · HOD</div>
            </div>
          </div>
          <button className="dp-top-menu-item" onClick={() => { onPassword(); setOpen(false); }}>
            <LockIcon size={15} /> Change Password
          </button>
          <div className="dp-menu-hr" />
          <button className="dp-top-menu-item red" onClick={() => { onLogout(); setOpen(false); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────
function DashboardPage({ showToast }) {
  const { stats, employees, attendance, deptName, loading, errors } = useDeptPortal();
  const [search, setSearch] = useState("");
  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef();
  const [selectedEmp, setSelectedEmp] = useState(null);   // full employee object once loaded
  const [empLoading,  setEmpLoading]  = useState(false);

  useEffect(() => {
    if (errors.employees) showToast("Failed to load employees.", "err");
  }, [errors.employees]);

  // Close download menu on outside click
  useEffect(() => {
    const fn = e => { if (dlRef.current && !dlRef.current.contains(e.target)) setDlOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  if (empLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 16 }}>
      <div className="dp-spin" /><p style={{ color: "#64748b", fontSize: 14 }}>Loading employee profile…</p>
    </div>
  );

  if (selectedEmp) return (
    <EmployeeProfileView emp={selectedEmp} onBack={() => setSelectedEmp(null)} />
  );

  if (!stats) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 16 }}>
      <div className="dp-spin" /><p style={{ color: "#64748b", fontSize: 14 }}>Loading {deptName} data…</p>
    </div>
  );

  const BLUE = ["#0a2a5e","#0e3d82","#1557b0","#1a6fd4","#4a90d9","#7fb3e8","#b3d1f5"];
  const genderData = [
    { label: "Male",   value: stats.male,   color: "#0e3d82" },
    { label: "Female", value: stats.female, color: "#1a6fd4" },
    { label: "Other",  value: stats.other,  color: "#7fb3e8" },
  ];
  const statusColors = { employed: "#0e3d82", retired: "#7fb3e8", dismissed: "#0a2a5e", resigned: "#4a90d9", suspended: "#1557b0" };
  const statusData = Object.entries(stats.statusCount).map(([k, v]) => ({
    label: k.charAt(0).toUpperCase() + k.slice(1), value: v, color: statusColors[k] || "#94a3b8",
  }));
  const empTypeData = [
    { label: "Full Time", value: stats.fullTime, color: "#0e3d82" },
    { label: "Part Time", value: stats.partTime, color: "#1a6fd4" },
    { label: "Contract",  value: stats.contract,  color: "#7fb3e8" },
  ];

  // Workers table
  const q = search.toLowerCase();
  const filtered = (employees || []).filter(e => {
    if (!q) return true;
    const fullName = `${e.first_name} ${e.middle_name || ""} ${e.last_name}`.toLowerCase();
    return [fullName, e.phone_number, e.email, e.job_title].some(v => (v || "").toLowerCase().includes(q));
  });

  const daysAttended = (empId) => stats.attendedDays[empId] ?? 0;

  const statusBadge = (s) => {
    const map = {
      employed:  { bg: "#dcfce7", color: "#166534" },
      retired:   { bg: "#e0f2fe", color: "#0369a1" },
      dismissed: { bg: "#fee2e2", color: "#991b1b" },
      resigned:  { bg: "#fef9c3", color: "#854d0e" },
      suspended: { bg: "#fce7f3", color: "#9d174d" },
    };
    const style = map[s] || { bg: "#f1f5f9", color: "#475569" };
    return (
      <span className="dp-badge" style={{ background: style.bg, color: style.color }}>
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </span>
    );
  };

  const downloadCSV = () => {
    const rows = [
      ["Full Name", "Phone", "Email", "Job Title", "Employment Type", "Status", "Days Attended"],
      ...filtered.map(e => [
        `${e.first_name} ${e.middle_name || ""} ${e.last_name}`.trim(),
        e.phone_number || "",
        e.email || "",
        e.job_title || "",
        (e.employment_type || "").replace("_", " "),
        e.status || "",
        daysAttended(e.id),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${deptName.replace(/\s+/g, "_")}_workers.csv`;
    a.click(); URL.revokeObjectURL(url);
    setDlOpen(false);
  };

  const downloadPDF = () => {
    setDlOpen(false);
    const rows = filtered.map(e => ({
      fullName: `${e.first_name} ${e.middle_name ? e.middle_name + " " : ""}${e.last_name}`.trim(),
      empNum: e.employee_number, phone: e.phone_number || "—", email: e.email || "—",
      jobTitle: e.job_title || "—",
      empType: { full_time: "Full Time", part_time: "Part Time", contract: "Contract" }[e.employment_type] || e.employment_type,
      status: e.status || "—", days: daysAttended(e.id),
    }));
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${deptName} Workers</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;color:#0f172a;margin:20px;}
      h2{font-size:18px;margin-bottom:4px;color:#0a2a5e;}.sub{font-size:11px;color:#64748b;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;}th{background:#0a2a5e;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;}
      td{padding:8px 10px;border-bottom:1px solid #e2e8f0;}tr:nth-child(even) td{background:#f8faff;}
      .footer{margin-top:16px;font-size:10px;color:#94a3b8;}</style></head><body>
      <h2>${deptName} Department — Workers Report</h2>
      <div class="sub">Generated on ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})} · ${rows.length} record(s)</div>
      <table><thead><tr><th>Full Name</th><th>Emp #</th><th>Phone</th><th>Email</th><th>Job Title</th><th>Type</th><th>Status</th><th>Days</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${r.fullName}</td><td>${r.empNum}</td><td>${r.phone}</td><td>${r.email}</td><td>${r.jobTitle}</td><td>${r.empType}</td><td>${r.status.charAt(0).toUpperCase()+r.status.slice(1)}</td><td>${r.days}</td></tr>`).join("")}</tbody></table>
      <div class="footer">JECCA Engineering HR Management System</div></body></html>`;
    const win = window.open("", "_blank");
    if (!win) { alert("Please allow popups to download PDF."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const printTable = () => {
    setDlOpen(false);
    window.print();
  };

  return (
    <>
      {/* ── Stat Cards ── */}
      <div className="dp-stats-row">
        {[
          { label: "Total Staff",        value: stats.total,    icon: <UsersIcon size={22} color="#1557b0" /> },
          { label: "Currently Employed", value: stats.employed, icon: <CheckIcon size={22} color="#1557b0" /> },
          { label: "Male",               value: stats.male,     icon: <UserIcon  size={22} color="#1557b0" /> },
          { label: "Female",             value: stats.female,   icon: <UserIcon  size={22} color="#1557b0" /> },
        ].map((c, i) => (
          <div className="dp-stat-card" key={i}>
            <div className="dp-stat-icon-box">{c.icon}</div>
            <div>
              <div className="dp-stat-num">{c.value}</div>
              <div className="dp-stat-lbl">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Workers Table ── */}
      <div className="dp-table-card">
        <div className="dp-table-head-row">
          <div className="dp-table-title">Department Workers — {deptName}</div>
          <div className="dp-table-controls">
            <div className="dp-search-wrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="dp-search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search workers…"
              />
            </div>
            {/* Export dropdown */}
            <div style={{ position: "relative" }} ref={dlRef}>
              <button className="dp-dl-btn" onClick={() => setDlOpen(!dlOpen)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {dlOpen && (
                <div className="dp-dl-menu">
                  <button className="dp-dl-item" onClick={downloadCSV}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    Download CSV
                  </button>
                  <button className="dp-dl-item" onClick={downloadPDF}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="11" y2="17"/>
                    </svg>
                    Download PDF
                  </button>
                  <button className="dp-dl-item" onClick={printTable}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polyline points="6 9 6 2 18 2 18 9"/>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    Print
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {loading.employees ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}><div className="dp-spin" /></div>
        ) : (
          <div className="dp-table-wrap">
            <table className="dp-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Job Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Days Attended</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
                      {search ? "No workers match your search." : "No workers found in this department."}
                    </td>
                  </tr>
                ) : filtered.map(e => {
                  const fullName = `${e.first_name} ${e.middle_name ? e.middle_name + " " : ""}${e.last_name}`.trim();
                  const avatarLetters = `${e.first_name[0] || ""}${e.last_name[0] || ""}`.toUpperCase();
                  const empTypeFmt = { full_time: "Full Time", part_time: "Part Time", contract: "Contract" }[e.employment_type] || e.employment_type;
                  return (
                    <tr key={e.id} onClick={async () => {
                      setEmpLoading(true);
                      try {
                        const res = await apiFetch(`${API}/employees/${e.id}/`);
                        if (res.ok) { const full = await res.json(); setSelectedEmp(full); }
                        else showToast("Failed to load employee details.", "err");
                      } catch { showToast("Server error.", "err"); }
                      finally { setEmpLoading(false); }
                    }} style={{ cursor: "pointer" }}
                      onMouseEnter={ev => ev.currentTarget.style.background = "#eff6ff"}
                      onMouseLeave={ev => ev.currentTarget.style.background = ""}>
                      <td>
                        <div className="dp-name-cell">
                          <div className="dp-emp-avatar">
                            {e.profile_picture ? (
                              <img
                                src={e.profile_picture.startsWith("http") ? e.profile_picture : `http://127.0.0.1:8000${e.profile_picture}`}
                                alt={fullName}
                                style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 8, display: "block" }}
                                onError={e2 => { e2.target.style.display = "none"; e2.target.parentNode.textContent = avatarLetters; }}
                              />
                            ) : avatarLetters}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{fullName}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>#{e.employee_number}</div>
                          </div>
                        </div>
                      </td>
                      <td>{e.phone_number || "—"}</td>
                      <td style={{ color: "#1557b0" }}>{e.email || "—"}</td>
                      <td>{e.job_title || "—"}</td>
                      <td>
                        <span className="dp-badge" style={{ background: "#eff6ff", color: "#1557b0" }}>
                          {empTypeFmt}
                        </span>
                      </td>
                      <td>{statusBadge(e.status)}</td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 16, color: "#0a2a5e" }}>
                          {daysAttended(e.id)}
                        </span>
                        <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 3 }}>days</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Charts ── */}
      <div className="dp-charts-row">
        <div className="dp-chart-card">
          <div className="dp-chart-head">Gender Balance</div>
          <div className="dp-donut-wrap">
            <DonutChart data={genderData} />
            <div className="dp-legend">
              {genderData.map((d, i) => (
                <div className="dp-leg-item" key={i}>
                  <div className="dp-leg-dot" style={{ background: d.color }} />
                  {d.label}<span className="dp-leg-val">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dp-chart-card">
          <div className="dp-chart-head">Employment Status</div>
          <div className="dp-donut-wrap">
            <DonutChart data={statusData} />
            <div className="dp-legend">
              {statusData.map((d, i) => (
                <div className="dp-leg-item" key={i}>
                  <div className="dp-leg-dot" style={{ background: d.color }} />
                  {d.label}<span className="dp-leg-val">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dp-chart-card">
          <div className="dp-chart-head">Employment Type Breakdown</div>
          <div className="dp-donut-wrap">
            <DonutChart data={empTypeData} />
            <div className="dp-legend">
              {empTypeData.map((d, i) => (
                <div className="dp-leg-item" key={i}>
                  <div className="dp-leg-dot" style={{ background: d.color }} />
                  {d.label}<span className="dp-leg-val">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </>
  );
}

// ── Attendance Page ───────────────────────────────────────────────────────────
function AttendancePage({ showToast }) {
  const { employees, deptName } = useDeptPortal();
  const user = getUser();

  // ── Date navigation ──
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showCalendar,  setShowCalendar]  = useState(false);
  const calRef = useRef();

  // Close calendar on outside click
  useEffect(() => {
    const fn = e => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // ── Attendance records for selected date ──
  // Map: employeeId → record
  const [records,  setRecords]  = useState({});   // { empId: { id, status, arrival_time, absence_reason } }
  const [loadingR, setLoadingR] = useState(false);
  const [saving,   setSaving]   = useState({});    // { empId: true }

  // ── Inline editing state ──
  // What the admin has clicked for each employee (before saving)
  // { empId: { status, arrival_time, absence_reason } }
  const [draft, setDraft] = useState({});

  // Modal for late/absent extra fields
  const [modal, setModal] = useState(null); // { empId, type: 'late'|'absent' }
  const [modalVal, setModalVal] = useState({ arrival_time: "", absence_reason: "" });

  // Fetch records for selected date
  const fetchRecords = useCallback(async (date) => {
    setLoadingR(true);
    try {
      const res = await apiFetch(`${API}/attendance/?date=${date}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.results || []);
      const map = {};
      list.forEach(r => { map[r.employee] = r; });
      setRecords(map);
      // Sync draft to match saved records
      setDraft(prev => {
        const next = { ...prev };
        // Only reset drafts for employees that now have a saved record
        list.forEach(r => {
          next[r.employee] = {
            status: r.status,
            arrival_time: r.arrival_time || "",
            absence_reason: r.absence_reason || "",
          };
        });
        return next;
      });
    } catch {
      showToast("Failed to load attendance records.", "err");
    } finally {
      setLoadingR(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchRecords(selectedDate);
    setDraft({});
  }, [selectedDate]);

  const navigate = (days) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setSelectedDate(s);
  };

  const formatDisplayDate = (str) => {
    const d = new Date(str + "T00:00:00");
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  const isToday = selectedDate === todayStr();

  // ── Mark attendance ──
  const markEmployee = async (empId, status, extra = {}) => {
    setSaving(s => ({ ...s, [empId]: true }));
    try {
      const existing = records[empId];
      const payload = {
        employee: empId,
        date: selectedDate,
        status,
        shift: null,
        notes: "",
        arrival_time: extra.arrival_time || "",
        absence_reason: extra.absence_reason || "",
      };

      let res;
      if (existing) {
        res = await apiFetch(`${API}/attendance/${existing.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch(`${API}/attendance/`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || err.error || "Failed to save.", "err");
        return;
      }

      const saved = await res.json();
      setRecords(r => ({ ...r, [empId]: saved }));
      setDraft(d => ({
        ...d,
        [empId]: { status, arrival_time: extra.arrival_time || "", absence_reason: extra.absence_reason || "" },
      }));
      showToast(`Marked as ${status}.`);
    } catch {
      showToast("Server error.", "err");
    } finally {
      setSaving(s => ({ ...s, [empId]: false }));
    }
  };

  const handleStatusClick = (empId, status) => {
    if (status === "late") {
      setModalVal({ arrival_time: draft[empId]?.arrival_time || "", absence_reason: "" });
      setModal({ empId, type: "late" });
    } else if (status === "absent") {
      setModalVal({ arrival_time: "", absence_reason: draft[empId]?.absence_reason || "" });
      setModal({ empId, type: "absent" });
    } else {
      markEmployee(empId, status);
    }
  };

  const handleModalSave = () => {
    if (!modal) return;
    if (modal.type === "late") {
      if (!modalVal.arrival_time) { showToast("Please enter arrival time.", "err"); return; }
    }
    markEmployee(modal.empId, modal.type, modalVal);
    setModal(null);
  };

  // ── Summary counts ──
  const activeEmployees = (employees || []).filter(e => e.status === "employed");
  const presentCount = activeEmployees.filter(e => records[e.id]?.status === "present").length;
  const absentCount  = activeEmployees.filter(e => records[e.id]?.status === "absent").length;
  const lateCount    = activeEmployees.filter(e => records[e.id]?.status === "late").length;
  const unmarkedCount = activeEmployees.filter(e => !records[e.id]).length;

  const statusOfEmp = (empId) => draft[empId]?.status || records[empId]?.status || null;

  if (!employees) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"60vh", flexDirection:"column", gap:16 }}>
      <div className="dp-spin" /><p style={{ color:"#64748b", fontSize:14 }}>Loading employees…</p>
    </div>
  );

  return (
    <>
      {/* ── Attendance Page Styles ── */}
      <style>{`
        /* Date nav bar */
        .att-date-bar {
          display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .att-nav-btn {
          width: 36px; height: 36px; border: 1.5px solid var(--dp-border);
          border-radius: 9px; background: #fff; display: flex; align-items: center;
          justify-content: center; cursor: pointer; color: var(--dp-muted);
          transition: border-color 0.15s, color 0.15s, background 0.15s; flex-shrink: 0;
        }
        .att-nav-btn:hover { border-color: var(--dp-blue); color: var(--dp-blue); background: #eff6ff; }
        .att-nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .att-date-display {
          flex: 1; min-width: 180px;
          font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700;
          color: var(--dp-text);
        }
        .att-today-badge {
          font-size: 11px; font-weight: 600; background: #dcfce7; color: #166534;
          padding: 3px 10px; border-radius: 20px; margin-left: 10px; vertical-align: middle;
        }
        /* Calendar picker */
        .att-cal-wrap { position: relative; }
        .att-cal-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 8px 14px; border: 1.5px solid var(--dp-border); border-radius: 10px;
          background: #fff; font-size: 13px; color: var(--dp-blue-dark);
          font-family: 'DM Sans', sans-serif; font-weight: 500; cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .att-cal-btn:hover { border-color: var(--dp-blue); background: #eff6ff; }
        .att-cal-input {
          position: absolute; top: calc(100% + 6px); left: 0; z-index: 300;
          border: 1.5px solid var(--dp-blue); border-radius: 12px; padding: 4px;
          background: #fff; box-shadow: 0 8px 32px rgba(21,87,176,0.12);
          animation: dp-fadeDown 0.15s ease;
        }
        .att-cal-input input[type="date"] {
          padding: 10px 14px; border: none; outline: none; border-radius: 9px;
          font-size: 14px; font-family: 'DM Sans', sans-serif; color: var(--dp-text);
          background: transparent; cursor: pointer;
        }

        /* Summary cards */
        .att-summary-row {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;
        }
        .att-sum-card {
          background: #fff; border-radius: 14px; border: 1px solid var(--dp-border);
          padding: 16px 18px; display: flex; align-items: center; gap: 12px;
        }
        .att-sum-icon {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .att-sum-num { font-family:'Playfair Display',serif; font-size:24px; font-weight:700; line-height:1; }
        .att-sum-lbl { font-size:11px; color:var(--dp-muted); margin-top:3px; }

        /* Attendance table card */
        .att-table-card {
          background: #fff; border-radius: var(--dp-card-r); border: 1px solid var(--dp-border);
          padding: 22px 24px;
        }
        .att-table-title {
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
          color: var(--dp-blue-deep); margin-bottom: 16px;
          padding-bottom: 12px; border-bottom: 1px solid var(--dp-border);
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
        }
        .att-progress-bar {
          height: 6px; background: #e8edf8; border-radius: 10px; margin-bottom: 20px; overflow: hidden;
        }
        .att-progress-fill {
          height: 100%; border-radius: 10px;
          background: linear-gradient(90deg, #16a34a, #4ade80);
          transition: width 0.6s ease;
        }

        /* Status buttons */
        .att-status-group { display: flex; gap: 6px; align-items: center; }
        .att-status-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 8px; border: 1.5px solid transparent;
          font-size: 12px; font-weight: 600; font-family: 'DM Sans', sans-serif;
          cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .att-status-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Present */
        .att-btn-present { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
        .att-btn-present:hover:not(:disabled) { background: #dcfce7; border-color: #4ade80; }
        .att-btn-present.active { background: #16a34a; color: #fff; border-color: #16a34a; }

        /* Absent */
        .att-btn-absent { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
        .att-btn-absent:hover:not(:disabled) { background: #fee2e2; border-color: #f87171; }
        .att-btn-absent.active { background: #dc2626; color: #fff; border-color: #dc2626; }

        /* Late */
        .att-btn-late { background: #fffbeb; color: #b45309; border-color: #fde68a; }
        .att-btn-late:hover:not(:disabled) { background: #fef3c7; border-color: #fbbf24; }
        .att-btn-late.active { background: #d97706; color: #fff; border-color: #d97706; }

        /* Tick icon */
        .att-tick { width: 13px; height: 13px; }

        /* Extra info pill */
        .att-info-pill {
          font-size: 11px; color: var(--dp-muted); margin-left: 6px;
          background: #f1f5f9; border-radius: 6px; padding: 2px 7px;
        }

        /* Modal overlay */
        .att-modal-backdrop {
          position: fixed; inset: 0; background: rgba(10,26,80,0.45);
          z-index: 700; display: flex; align-items: center; justify-content: center;
          padding: 20px; animation: dp-fadeIn 0.15s ease;
        }
        .att-modal-box {
          background: #fff; border-radius: 16px; width: 100%; max-width: 420px;
          box-shadow: 0 20px 56px rgba(0,0,0,0.18);
          animation: dp-slideUp 0.22s cubic-bezier(0.22,1,0.36,1) both; overflow: hidden;
        }
        .att-modal-header {
          padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--dp-border);
        }
        .att-modal-header h3 { font-family:'Playfair Display',serif; font-size:16px; font-weight:700; color:var(--dp-text); }
        .att-modal-body { padding: 20px; }
        .att-modal-footer { padding: 0 20px 20px; display:flex; justify-content:flex-end; gap:10px; }

        @media (max-width: 900px) { .att-summary-row { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 600px) {
          .att-summary-row { grid-template-columns: 1fr 1fr; }
          .att-status-group { gap:4px; }
          .att-status-btn { padding: 5px 8px; font-size: 11px; }
          .att-date-display { font-size: 15px; }
        }
      `}</style>

      {/* ── Date Navigation Bar ── */}
      <div className="att-date-bar">
        <button className="att-nav-btn" onClick={() => navigate(-1)} title="Previous day">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <div className="att-date-display">
          {formatDisplayDate(selectedDate)}
          {isToday && <span className="att-today-badge">Today</span>}
        </div>

        <button className="att-nav-btn" onClick={() => navigate(1)} disabled={isToday} title="Next day">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        {/* Calendar jump */}
        <div className="att-cal-wrap" ref={calRef}>
          <button className="att-cal-btn" onClick={() => setShowCalendar(!showCalendar)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Jump to date
          </button>
          {showCalendar && (
            <div className="att-cal-input">
              <input type="date" value={selectedDate} max={todayStr()}
                onChange={e => { setSelectedDate(e.target.value); setShowCalendar(false); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="att-summary-row">
        {[
          { label:"Total Staff", value: activeEmployees.length, bg:"#eff6ff", iconColor:"#1557b0",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
          { label:"Present",    value: presentCount, bg:"#f0fdf4", iconColor:"#16a34a",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> },
          { label:"Absent",     value: absentCount,  bg:"#fef2f2", iconColor:"#dc2626",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> },
          { label:"Late",       value: lateCount,    bg:"#fffbeb", iconColor:"#d97706",
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
        ].map((c,i) => (
          <div className="att-sum-card" key={i}>
            <div className="att-sum-icon" style={{ background: c.bg }}>{c.icon}</div>
            <div>
              <div className="att-sum-num" style={{ color: c.iconColor }}>{c.value}</div>
              <div className="att-sum-lbl">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Attendance Table ── */}
      <div className="att-table-card">
        <div className="att-table-title">
          <span>Department Workers — {deptName}</span>
          {unmarkedCount > 0 && (
            <span style={{ fontSize:12, color:"#94a3b8", fontWeight:500, textTransform:"none", letterSpacing:0 }}>
              {unmarkedCount} not yet marked
            </span>
          )}
        </div>

        {/* Progress bar */}
        {activeEmployees.length > 0 && (
          <div className="att-progress-bar">
            <div className="att-progress-fill"
              style={{ width: `${Math.round(((activeEmployees.length - unmarkedCount) / activeEmployees.length) * 100)}%` }} />
          </div>
        )}

        {loadingR ? (
          <div style={{ textAlign:"center", padding:"40px 0" }}><div className="dp-spin" /></div>
        ) : (
          <div className="dp-table-wrap">
            <table className="dp-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Job Title</th>
                  <th style={{ textAlign:"center" }}>Mark Attendance</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activeEmployees.length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8" }}>No active employees found.</td></tr>
                ) : activeEmployees.map(e => {
                  const fullName = `${e.first_name} ${e.middle_name ? e.middle_name+" " : ""}${e.last_name}`.trim();
                  const initials = `${e.first_name[0]||""}${e.last_name[0]||""}`.toUpperCase();
                  const currentStatus = statusOfEmp(e.id);
                  const rec = records[e.id];
                  const isSaving = saving[e.id];
                  const imgSrc = e.profile_picture
                    ? (e.profile_picture.startsWith("http") ? e.profile_picture : `http://127.0.0.1:8000${e.profile_picture}`)
                    : null;

                  return (
                    <tr key={e.id}>
                      {/* Employee name + avatar */}
                      <td>
                        <div className="dp-name-cell">
                          <div className="dp-emp-avatar">
                            {imgSrc
                              ? <img src={imgSrc} alt={fullName} style={{ width:30,height:30,objectFit:"cover",borderRadius:8,display:"block" }}
                                  onError={ev => { ev.target.style.display="none"; ev.target.parentNode.textContent=initials; }} />
                              : initials}
                          </div>
                          <div>
                            <div style={{ fontWeight:600, fontSize:13 }}>{fullName}</div>
                            <div style={{ fontSize:11, color:"#94a3b8" }}>#{e.employee_number}</div>
                          </div>
                        </div>
                      </td>

                      {/* Job title */}
                      <td style={{ fontSize:13, color:"#475569" }}>{e.job_title || "—"}</td>

                      {/* Status buttons */}
                      <td>
                        <div className="att-status-group" style={{ justifyContent:"center" }}>
                          {/* Present */}
                          <button
                            className={`att-status-btn att-btn-present${currentStatus === "present" ? " active" : ""}`}
                            disabled={isSaving}
                            onClick={() => handleStatusClick(e.id, "present")}
                            title="Mark Present"
                          >
                            <svg className="att-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Present
                          </button>

                          {/* Absent */}
                          <button
                            className={`att-status-btn att-btn-absent${currentStatus === "absent" ? " active" : ""}`}
                            disabled={isSaving}
                            onClick={() => handleStatusClick(e.id, "absent")}
                            title="Mark Absent"
                          >
                            <svg className="att-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Absent
                          </button>

                          {/* Late */}
                          <button
                            className={`att-status-btn att-btn-late${currentStatus === "late" ? " active" : ""}`}
                            disabled={isSaving}
                            onClick={() => handleStatusClick(e.id, "late")}
                            title="Mark Late"
                          >
                            <svg className="att-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                            Late
                          </button>

                          {/* Saving spinner */}
                          {isSaving && <div className="dp-spin" style={{ width:20, height:20, borderWidth:2 }} />}
                        </div>
                      </td>

                      {/* Details pill */}
                      <td>
                        {currentStatus === "late" && rec?.arrival_time && (
                          <span className="att-info-pill">🕐 {rec.arrival_time}</span>
                        )}
                        {currentStatus === "absent" && rec?.absence_reason && (
                          <span className="att-info-pill" title={rec.absence_reason}>
                            📝 {rec.absence_reason.length > 28 ? rec.absence_reason.slice(0,28)+"…" : rec.absence_reason}
                          </span>
                        )}
                        {!currentStatus && (
                          <span style={{ fontSize:12, color:"#cbd5e1" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Late Modal ── */}
      {modal?.type === "late" && (
        <div className="att-modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="att-modal-box">
            <div className="att-modal-header">
              <h3>🕐 Record Late Arrival</h3>
              <button className="dp-modal-close" onClick={() => setModal(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="att-modal-body">
              <p style={{ fontSize:13, color:"#64748b", marginBottom:16 }}>
                Enter the time this employee arrived at work.
              </p>
              <div className="dp-f-field">
                <label className="dp-f-label">Arrival Time</label>
                <input
                  className="dp-f-input"
                  type="time"
                  value={modalVal.arrival_time}
                  onChange={e => setModalVal(v => ({ ...v, arrival_time: e.target.value }))}
                  autoFocus
                />
              </div>
            </div>
            <div className="att-modal-footer">
              <button className="dp-btn dp-btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" style={{ background:"linear-gradient(135deg,#92400e,#d97706)" }}
                onClick={handleModalSave}>
                Save Late Arrival
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Absent Modal ── */}
      {modal?.type === "absent" && (
        <div className="att-modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="att-modal-box">
            <div className="att-modal-header">
              <h3>📝 Absence Reason</h3>
              <button className="dp-modal-close" onClick={() => setModal(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="att-modal-body">
              <p style={{ fontSize:13, color:"#64748b", marginBottom:16 }}>
                Provide a reason for the absence (optional but recommended).
              </p>
              <div className="dp-f-field">
                <label className="dp-f-label">Reason for Absence</label>
                <textarea
                  className="dp-f-input"
                  rows={3}
                  placeholder="e.g. Sick leave, Personal, No reason given…"
                  value={modalVal.absence_reason}
                  onChange={e => setModalVal(v => ({ ...v, absence_reason: e.target.value }))}
                  style={{ resize:"vertical", minHeight:80 }}
                  autoFocus
                />
              </div>
            </div>
            <div className="att-modal-footer">
              <button className="dp-btn dp-btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="dp-btn dp-btn-primary" style={{ background:"linear-gradient(135deg,#991b1b,#dc2626)" }}
                onClick={handleModalSave}>
                Mark Absent
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Profile Page ──────────────────────────────────────────────────────────────
function ProfilePage({ user, initials, deptName, photoUrl, onPassword }) {
  return (
    <>
      <div className="dp-profile-card">
        <div className="dp-profile-top">
          <div className="dp-profile-avatar">
            {photoUrl
              ? <img src={photoUrl} alt={user.full_name || "Admin"} onError={e => { e.target.style.display = "none"; }} />
              : initials
            }
          </div>
          <div>
            <div className="dp-profile-name">{user.full_name || "HOD Admin"}</div>
            <div className="dp-profile-sub">Head of Department · {deptName}</div>
          </div>
        </div>
        <div className="dp-profile-grid">
          {[
            { label: "Username",   value: user.username || "—"    },
            { label: "Email",      value: user.email    || "—"    },
            { label: "Role",       value: "Head of Department"    },
            { label: "Department", value: deptName                },
          ].map((f, i) => (
            <div className="dp-profile-field" key={i}>
              <label>{f.label}</label>
              <p>{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="dp-action-cards">
        <div className="dp-action-card" onClick={onPassword}>
          <div className="dp-action-icon" style={{ background: "#eff6ff" }}>
            <LockIcon size={22} color="#1557b0" />
          </div>
          <div>
            <div className="dp-action-title">Change Password</div>
            <div className="dp-action-desc">Update your login password</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose, showToast, onSuccess }) {
  const [currentPassword,  setCurrentPassword]  = useState("");
  const [newPassword,      setNewPassword]      = useState("");
  const [confirmPassword,  setConfirmPassword]  = useState("");
  const [showCurrent,      setShowCurrent]      = useState(false);
  const [showNew,          setShowNew]          = useState(false);
  const [showConfirm,      setShowConfirm]      = useState(false);
  const [busy,             setBusy]             = useState(false);

  const save = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) { showToast("All fields required.", "err"); return; }
    if (newPassword !== confirmPassword) { showToast("Passwords do not match.", "err"); return; }
    if (newPassword.length < 8) { showToast("Minimum 8 characters.", "err"); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/me/change-password/`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || "Failed.", "err"); return; }
      showToast("Password changed successfully!");
      onSuccess?.();
      setTimeout(() => {
        clearSession();
        window.location.href = "/";
      }, 1800);
      onClose();
    } catch { showToast("Server error.", "err"); }
    finally { setBusy(false); }
  };

  const EyeIcon = ({ visible }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {visible
        ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
      }
    </svg>
  );

  return (
    <Modal title="Change Password" onClose={onClose}>
      {/* Current Password */}
      <div className="dp-f-field">
        <label className="dp-f-label">Current Password</label>
        <div className="dp-pw-wrap">
          <input className="dp-f-input" type={showCurrent ? "text" : "password"}
            value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          <button type="button" className="dp-pw-eye" onClick={() => setShowCurrent(!showCurrent)}>
            <EyeIcon visible={showCurrent} />
          </button>
        </div>
      </div>
      {/* New Password */}
      <div className="dp-f-field">
        <label className="dp-f-label">New Password</label>
        <div className="dp-pw-wrap">
          <input className="dp-f-input" type={showNew ? "text" : "password"}
            value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
          <button type="button" className="dp-pw-eye" onClick={() => setShowNew(!showNew)}>
            <EyeIcon visible={showNew} />
          </button>
        </div>
      </div>
      {/* Confirm Password */}
      <div className="dp-f-field">
        <label className="dp-f-label">Confirm New Password</label>
        <div className="dp-pw-wrap">
          <input className="dp-f-input" type={showConfirm ? "text" : "password"}
            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          <button type="button" className="dp-pw-eye" onClick={() => setShowConfirm(!showConfirm)}>
            <EyeIcon visible={showConfirm} />
          </button>
        </div>
      </div>
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "#1e40af", display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        After changing your password you will be signed out and need to log in again with your new password.
      </div>
      <div className="dp-btn-row">
        <button className="dp-btn dp-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="dp-btn dp-btn-primary" onClick={save} disabled={busy}>{busy ? "Updating…" : "Update Password"}</button>
      </div>
    </Modal>
  );
}


// ── Employee Profile View (inline, replaces dashboard content) ───────────────
function EmployeeProfileView({ emp, onBack }) {
  const fullName = [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ");
  const initials = `${emp.first_name?.[0] || ""}${emp.last_name?.[0] || ""}`.toUpperCase();
  const imgSrc   = emp.profile_picture
    ? (emp.profile_picture.startsWith("http") ? emp.profile_picture : `http://127.0.0.1:8000${emp.profile_picture}`)
    : null;

  const statusStyle = {
    employed:  { bg: "#dcfce7", color: "#166534" },
    retired:   { bg: "#e0f2fe", color: "#0369a1" },
    dismissed: { bg: "#fee2e2", color: "#991b1b" },
    resigned:  { bg: "#fef9c3", color: "#854d0e" },
    suspended: { bg: "#fce7f3", color: "#9d174d" },
  }[emp.status] || { bg: "#f1f5f9", color: "#475569" };

  const empTypeLabel = { full_time: "Full Time", part_time: "Part Time", contract: "Contract" }[emp.employment_type] || emp.employment_type || "—";
  const genderLabel  = { M: "Male", F: "Female", O: "Other" }[emp.gender] || "—";
  const fmt    = v => v || "—";
  const fmtDate = d => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }); }
    catch { return d; }
  };

  const Field = ({ label, value, span = false }) => (
    <div style={{ gridColumn: span ? "1 / -1" : undefined, marginBottom: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#94a3b8", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#0f172a", lineHeight: 1.4 }}>{value || "—"}</div>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "20px 22px", marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#1557b0", paddingBottom: 12, marginBottom: 18, borderBottom: "1.5px solid #e2e8f0" }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 28px" }}>
        {children}
      </div>
    </div>
  );

  const hasNok = emp.nok_full_name || emp.nok_phone || emp.nok_email || emp.nok_relationship || emp.nok_national_id || emp.nok_address;

  return (
    <div>
      {/* Back button */}
      <button onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        marginBottom: 20, padding: "9px 18px", border: "1.5px solid #e2e8f0",
        borderRadius: 10, background: "#fff", cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
        color: "#1557b0", transition: "all 0.15s",
      }}
        onMouseEnter={e => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#1557b0"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Dashboard
      </button>

      {/* Profile header card */}
      <div style={{
        background: "linear-gradient(135deg, #0a2a5e 0%, #1557b0 100%)",
        borderRadius: 16, padding: "28px 28px", marginBottom: 16,
        display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap",
      }}>
        {/* Photo */}
        <div style={{
          width: 110, height: 110, borderRadius: 18, flexShrink: 0,
          background: "rgba(255,255,255,0.2)", overflow: "hidden",
          border: "3px solid rgba(255,255,255,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {imgSrc
            ? <img src={imgSrc} alt={fullName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={e => { e.target.style.display = "none"; e.target.parentNode.innerHTML = `<span style="font-size:36px;font-weight:700;color:#fff">${initials}</span>`; }} />
            : <span style={{ fontSize: 36, fontWeight: 700, color: "#fff" }}>{initials}</span>
          }
        </div>

        {/* Name & meta */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, color: "#fff", marginBottom: 6, lineHeight: 1.2 }}>{fullName}</div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", marginBottom: 14 }}>{fmt(emp.job_title)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.12)", padding: "3px 12px", borderRadius: 20 }}>
              #{fmt(emp.employee_number)}
            </span>
            <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: statusStyle.bg, color: statusStyle.color }}>
              {emp.status ? emp.status.charAt(0).toUpperCase() + emp.status.slice(1) : "—"}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.12)", padding: "3px 12px", borderRadius: 20 }}>
              {empTypeLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <Section title="Personal Information">
        <Field label="First Name"    value={fmt(emp.first_name)} />
        <Field label="Last Name"     value={fmt(emp.last_name)} />
        {emp.middle_name && <Field label="Middle Name" value={emp.middle_name} />}
        <Field label="Date of Birth" value={fmtDate(emp.date_of_birth)} />
        <Field label="Gender"        value={genderLabel} />
        <Field label="National ID"   value={fmt(emp.national_id)} />
        <Field label="Phone Number"  value={fmt(emp.phone_number)} />
        <Field label="Email Address" value={fmt(emp.email)} />
        <Field label="Home Address"  value={fmt(emp.address)} span={true} />
      </Section>

      {/* Employment Details */}
      <Section title="Employment Details">
        <Field label="Employee Number"  value={fmt(emp.employee_number)} />
        <Field label="Job Title"        value={fmt(emp.job_title)} />
        <Field label="Department"       value={fmt(emp.department_name)} />
        <Field label="Employment Type"  value={empTypeLabel} />
        <Field label="Date Joined"      value={fmtDate(emp.date_joined)} />
        <Field label="Status"           value={emp.status ? emp.status.charAt(0).toUpperCase() + emp.status.slice(1) : "—"} />
        {emp.contract_start && <Field label="Contract Start" value={fmtDate(emp.contract_start)} />}
        {emp.contract_end   && <Field label="Contract End"   value={fmtDate(emp.contract_end)} />}
        {emp.highest_education && (
          <Field label="Highest Education"
            value={{ o_level:"O Level", a_level:"A Level", certificate:"Certificate", diploma:"Diploma",
                     degree:"Degree", honours:"Honours Degree", masters:"Masters", phd:"PhD" }[emp.highest_education] || emp.highest_education} />
        )}
        {emp.status_reason && <Field label="Status Reason" value={fmt(emp.status_reason)} span={true} />}
      </Section>

      {/* Next of Kin */}
      {hasNok && (
        <Section title="Next of Kin">
          <Field label="Full Name"     value={fmt(emp.nok_full_name)} />
          <Field label="Relationship"  value={emp.nok_relationship ? emp.nok_relationship.charAt(0).toUpperCase() + emp.nok_relationship.slice(1) : "—"} />
          <Field label="Phone Number"  value={fmt(emp.nok_phone)} />
          <Field label="Email Address" value={fmt(emp.nok_email)} />
          {emp.nok_national_id && <Field label="National ID" value={emp.nok_national_id} />}
          {emp.nok_address     && <Field label="Address"     value={emp.nok_address} span={true} />}
        </Section>
      )}

      {/* Academic Qualifications */}
      {emp.qualifications && emp.qualifications.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "20px 22px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#1557b0", paddingBottom: 12, marginBottom: 18, borderBottom: "1.5px solid #e2e8f0" }}>Academic Qualifications</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {emp.qualifications.map((q, i) => (
              <div key={i} style={{ background: "#f8faff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#94a3b8", marginBottom: 3 }}>Qualification</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                    {{ o_level:"O Level", a_level:"A Level", certificate:"Certificate", diploma:"Diploma", degree:"Degree", honours:"Honours Degree", masters:"Masters", phd:"PhD", other:"Other" }[q.level] || q.level}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#94a3b8", marginBottom: 3 }}>Institution</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#0f172a" }}>{q.institution || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#94a3b8", marginBottom: 3 }}>Field of Study</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#0f172a" }}>{q.field_of_study || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#94a3b8", marginBottom: 3 }}>Year Obtained</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#0f172a" }}>{q.year_obtained || "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Second back button at the bottom */}
      <button onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        marginTop: 4, marginBottom: 8, padding: "9px 18px", border: "1.5px solid #e2e8f0",
        borderRadius: 10, background: "#fff", cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
        color: "#1557b0", transition: "all 0.15s",
      }}
        onMouseEnter={e => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#1557b0"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Dashboard
      </button>
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const GridIcon        = ({ size = 18, color = "currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
const UsersIcon       = ({ size = 18, color = "currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const UserIcon        = ({ size = 18, color = "currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const LockIcon        = ({ size = 18, color = "currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const CheckIcon       = ({ size = 18, color = "currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
const CheckSquareIcon = ({ size = 18, color = "currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;