import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, getUser, getToken, performLogout, startInactivityTimer, startTokenRefreshTimer } from "../utils/auth";
import EmployeesPage from "../components/Itportal/EmployeesPage";
import AdminsPage   from "../components/Itportal/Adminspage";
import { ITPortalProvider, useITPortal } from "../context/ITPortalContext";

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;

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
        const x = gap + i * (barW + gap);
        const y = height - bh;
        return (
          <g key={i}>
            <rect x={x} y={height} width={barW} height={0} rx="6" fill={d.color}>
              <animate attributeName="height" from="0" to={bh} dur="0.6s" begin={`${i*0.08}s`} fill="freeze" />
              <animate attributeName="y" from={height} to={y} dur="0.6s" begin={`${i*0.08}s`} fill="freeze" />
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
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3400); return () => clearTimeout(t); }, []);
  return (
    <div className={`toast toast-${type}`}>
      {type === "ok"
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      }
      <span>{msg}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function ITPortal() {
  return (
    <ITPortalProvider>
      <ITPortalInner />
    </ITPortalProvider>
  );
}

function ITPortalInner() {
  const { stats } = useITPortal();
  const user = getUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const page    = searchParams.get("page") || "dashboard";
  const setPage = (p) => setSearchParams({ page: p }, { replace: false });
  const [sideOpen, setSideOpen] = useState(true);
  const [toast, setToast]       = useState(null);
  const [modal, setModal]       = useState(null); // "profile" | "password" | "addIT"
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Inactivity auto-logout: kicks in after 10 min of no activity ──
  useEffect(() => startInactivityTimer(), []);
  useEffect(() => startTokenRefreshTimer(), []);

  // ── Session displaced notice: show toast if this login kicked another session ──
  useEffect(() => {
    if (sessionStorage.getItem("session_displaced_notice")) {
      sessionStorage.removeItem("session_displaced_notice");
      showToast("Your previous session on another device was signed out.", "ok");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Month navigator for Employees page
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getFullYear(), month: now.getMonth() }); // month 0-indexed

  const prevMonth = () => setSelectedMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const nextMonth = () => {
    const cur = new Date();
    setSelectedMonth(({ year, month }) => {
      if (year === cur.getFullYear() && month === cur.getMonth()) return { year, month }; // don't go into future
      return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
    });
  };
  const monthLabel = new Date(selectedMonth.year, selectedMonth.month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const isCurrentMonth = selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth();

  const showToast = (msg, type = "ok") => setToast({ msg, type });

  const handleLogout = () => performLogout("manual");

  const navItems = [
    { key: "dashboard",    label: "Dashboard",     icon: <GridIcon /> },
    { key: "divider1",     divider: true, label: "USERS" },
    { key: "admins",       label: "Admins",        icon: <ShieldIcon /> },
    { key: "employees",    label: "Employees",     icon: <UsersIcon /> },
    { key: "divider2",     divider: true, label: "SYSTEM" },
    { key: "loginhistory", label: "Login History", icon: <ClockIcon /> },
    { key: "profile",      label: "My Profile",    icon: <UserIcon /> },
  ];

  const initials = (user.full_name || "IT").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 16px; }
        body { font-family: 'DM Sans', sans-serif; background: #ffffff; color: #0f172a; -webkit-font-smoothing: antialiased; }

        :root {
          --blue:       #1557b0;
          --blue-dark:  #0e3d82;
          --blue-deep:  #0a2a5e;
          --blue-mid:   #1a6fd4;
          --blue-light: #4a90d9;
          --white:      #ffffff;
          --text:       #0f172a;
          --muted:      #64748b;
          --border:     #e2e8f0;
          --bg:         #f8faff;
          --card-r:     16px;
          --side-w:     220px;
          --top-h:      64px;
        }

        /* ══ Layout ══ */
        .portal { display: flex; min-height: 100vh; background: var(--bg); }

        /* ══ Sidebar ══ */
        .sidebar {
          width: var(--side-w);
          background: linear-gradient(180deg,
            #1a6fd4 0%,
            #1557b0 25%,
            #0e3d82 55%,
            #0a2a5e 100%
          );
          position: fixed;
          top: 0; left: 0; bottom: 0;
          z-index: 200;
          display: flex;
          flex-direction: column;
          transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1);
          overflow: hidden;
        }
        .sidebar.collapsed { width: 64px; }

        /* Mobile */
        .sidebar-overlay {
          display: none;
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.4);
          z-index: 199;
        }

        /* Brand */
        .sb-brand {
          padding: 0 14px;
          height: var(--top-h);
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          flex-shrink: 0;
          overflow: hidden;
        }
        .sb-logo {
          width: 44px; height: 44px;
          border-radius: 10px;
          background: rgba(255,255,255,0.15);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
        }
        .sb-logo img {
          width: 40px; height: 40px;
          object-fit: contain;
          border-radius: 8px;
        }
        .sb-brand-text { overflow: hidden; white-space: nowrap; }
        .sb-brand-name {
          font-family: 'Playfair Display', serif;
          font-size: 13.5px;
          font-weight: 700;
          color: #fff;
          line-height: 1.2;
          letter-spacing: -0.2px;
        }
        .sb-brand-sub {
          font-size: 9.5px;
          color: rgba(255,255,255,0.5);
          letter-spacing: 1.8px;
          text-transform: uppercase;
          margin-top: 1px;
        }
        .sidebar.collapsed .sb-brand-text { display: none; }

        /* Admin chip */
        .sb-user {
          margin: 14px 10px;
          padding: 10px 11px;
          background: rgba(255,255,255,0.1);
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .sidebar.collapsed .sb-user { margin: 14px 10px; padding: 8px; justify-content: center; }
        .sb-avatar {
          width: 36px; height: 36px;
          border-radius: 9px;
          background: rgba(255,255,255,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: #fff;
          flex-shrink: 0;
          letter-spacing: 0.5px;
        }
        .sb-user-info { overflow: hidden; white-space: nowrap; }
        .sb-user-name { font-size: 13px; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; }
        .sb-user-role { font-size: 10px; color: rgba(255,255,255,0.5); margin-top: 1px; letter-spacing: 0.3px; }
        .sidebar.collapsed .sb-user-info { display: none; }

        /* Nav */
        .sb-nav { flex: 1; padding: 6px 10px; overflow-y: auto; scrollbar-width: none; }
        .sb-nav::-webkit-scrollbar { display: none; }

        .sb-section {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.8px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          padding: 14px 8px 6px;
          white-space: nowrap;
          overflow: hidden;
        }
        .sidebar.collapsed .sb-section { opacity: 0; height: 0; padding: 0; margin: 4px 0; }

        .nav-btn {
          display: flex;
          align-items: center;
          gap: 11px;
          width: 100%;
          padding: 9px 10px;
          border-radius: 10px;
          border: none;
          background: none;
          color: rgba(255,255,255,0.65);
          font-size: 13.5px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
          overflow: hidden;
          text-align: left;
          margin-bottom: 2px;
        }
        .nav-btn svg { flex-shrink: 0; width: 18px; height: 18px; }
        .nav-btn span { overflow: hidden; text-overflow: ellipsis; }
        .nav-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .nav-btn.active { background: rgba(255,255,255,0.18); color: #fff; font-weight: 600; }
        .sidebar.collapsed .nav-btn span { display: none; }
        .sidebar.collapsed .nav-btn { justify-content: center; padding: 10px; }

        /* Footer */
        .sb-footer { padding: 12px 10px; border-top: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; }
        .sb-logout {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 9px 10px; border-radius: 10px;
          border: none; background: none;
          color: rgba(255,255,255,0.5);
          font-size: 13px; font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap; overflow: hidden;
        }
        .sb-logout svg { flex-shrink: 0; }
        .sb-logout:hover { background: rgba(220,38,38,0.2); color: #fca5a5; }
        .sidebar.collapsed .sb-logout { justify-content: center; }
        .sidebar.collapsed .sb-logout span { display: none; }

        /* ══ Main area ══ */
        .main {
          flex: 1;
          margin-left: var(--side-w);
          display: flex; flex-direction: column;
          min-height: 100vh;
          transition: margin-left 0.28s cubic-bezier(0.4,0,0.2,1);
          background: var(--bg);
        }
        .main.collapsed-main { margin-left: 64px; }

        /* ══ Topbar ══ */
        .topbar {
          height: var(--top-h);
          background: var(--white);
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center;
          padding: 0 28px; gap: 14px;
          position: sticky; top: 0; z-index: 100;
        }
        .toggle-btn {
          width: 36px; height: 36px;
          border: 1.5px solid var(--border);
          border-radius: 9px;
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--muted);
          transition: border-color 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .toggle-btn:hover { border-color: var(--blue); color: var(--blue); }

        .topbar-title {
          flex: 1;
          font-family: 'Playfair Display', serif;
          font-size: 20px; font-weight: 700;
          color: var(--text);
          letter-spacing: -0.3px;
        }

        .topbar-right { display: flex; align-items: center; gap: 10px; }
        .top-avatar {
          width: 38px; height: 38px;
          background: linear-gradient(135deg, var(--blue), var(--blue-light));
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 13px; color: #fff;
          cursor: pointer; position: relative;
          border: 2px solid transparent;
          transition: border-color 0.15s;
          letter-spacing: 0.5px;
        }
        .top-avatar:hover { border-color: var(--blue); }

        .top-menu {
          position: absolute; top: calc(100% + 10px); right: 0;
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.1);
          min-width: 210px;
          overflow: hidden;
          z-index: 300;
          animation: fadeDown 0.15s ease;
        }
        @keyframes fadeDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        .top-menu-head { padding: 14px 16px; border-bottom: 1px solid var(--border); }
        .top-menu-name { font-weight: 600; font-size: 14px; color: var(--text); }
        .top-menu-role { font-size: 11px; color: var(--muted); margin-top: 2px; }
        .top-menu-item {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 16px; font-size: 13.5px; color: var(--text);
          cursor: pointer; border: none; background: none;
          width: 100%; text-align: left; font-family: 'DM Sans', sans-serif;
          transition: background 0.1s;
        }
        .top-menu-item:hover { background: var(--bg); }
        .top-menu-item.red { color: #dc2626; }
        .top-menu-item.red:hover { background: #fef2f2; }
        .menu-hr { height: 1px; background: var(--border); }

        /* ══ Page ══ */
        .page { padding: 28px; flex: 1; }

        /* ══ Stat cards ══ */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: #fff;
          border-radius: var(--card-r);
          padding: 20px 22px;
          border: 1px solid var(--border);
          border-left: 4px solid var(--blue);
          display: flex; align-items: center; gap: 16px;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .stat-card:hover { box-shadow: 0 6px 24px rgba(21,87,176,0.1); transform: translateY(-2px); }
        .stat-icon-box {
          width: 46px; height: 46px;
          background: #eff6ff;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .stat-num {
          font-family: 'Playfair Display', serif;
          font-size: 30px; font-weight: 700;
          color: var(--blue-deep);
          line-height: 1;
        }
        .stat-lbl { font-size: 12px; color: var(--muted); margin-top: 4px; }

        /* ══ Charts ══ */
        .charts-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        .chart-card {
          background: #fff;
          border-radius: var(--card-r);
          border: 1px solid var(--border);
          padding: 22px 24px;
        }
        .chart-card.full { grid-column: 1 / -1; }
        .chart-head {
          font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1.2px;
          color: var(--blue-deep);
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border);
        }
        .donut-wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
        .legend { display: flex; flex-direction: column; gap: 10px; }
        .leg-item { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--muted); }
        .leg-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
        .leg-val { font-weight: 600; color: var(--text); margin-left: 4px; font-size: 14px; }

        /* ══ Profile page ══ */
        .profile-card {
          background: #fff;
          border-radius: var(--card-r);
          border: 1px solid var(--border);
          padding: 28px;
          margin-bottom: 18px;
          max-width: 680px;
        }
        .profile-top { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
        .profile-avatar {
          width: 76px; height: 76px;
          background: linear-gradient(135deg, var(--blue-deep), var(--blue-mid));
          border-radius: 18px;
          display: flex; align-items: center; justify-content: center;
          font-size: 26px; font-weight: 700; color: #fff;
          flex-shrink: 0; letter-spacing: 1px;
        }
        .profile-name { font-family:'Playfair Display',serif; font-size:22px; font-weight:700; color:var(--text); }
        .profile-sub  { font-size:13px; color:var(--muted); margin-top:4px; }
        .profile-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
        .profile-field label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:var(--muted); }
        .profile-field p { font-size:14px; font-weight:500; color:var(--text); margin-top:4px; }

        .action-cards { display:grid; grid-template-columns:1fr 1fr; gap:16px; max-width:680px; }
        .action-card {
          background:#fff;
          border:1px solid var(--border);
          border-radius:var(--card-r);
          padding:20px;
          cursor:pointer;
          display:flex; align-items:center; gap:14px;
          transition:box-shadow 0.2s, border-color 0.2s;
        }
        .action-card:hover { border-color:var(--blue); box-shadow:0 4px 20px rgba(21,87,176,0.1); }
        .action-icon {
          width:46px;height:46px;border-radius:12px;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
        }
        .action-title { font-size:14px;font-weight:600;color:var(--text); }
        .action-desc  { font-size:12px;color:var(--muted);margin-top:3px; }

        /* ══ Modal ══ */
        .modal-backdrop {
          position:fixed;inset:0;background:rgba(10,30,80,0.5);
          z-index:600;display:flex;align-items:center;justify-content:center;
          padding:20px;animation:fadeIn 0.18s ease;
        }
        @keyframes fadeIn { from{opacity:0;} to{opacity:1;} }
        .modal-box {
          background:#fff;border-radius:18px;width:100%;
          box-shadow:0 24px 64px rgba(0,0,0,0.18);
          animation:slideUp 0.25s cubic-bezier(0.22,1,0.36,1) both;
          overflow:hidden;
        }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:none;} }
        .modal-header {
          background: linear-gradient(135deg, var(--blue-deep), var(--blue));
          padding:18px 22px;
          display:flex;align-items:center;justify-content:space-between;
        }
        .modal-title { font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:#fff; }
        .modal-close {
          width:30px;height:30px;background:rgba(255,255,255,0.15);
          border:none;border-radius:8px;
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;color:#fff;transition:background 0.15s;
        }
        .modal-close:hover{background:rgba(255,255,255,0.25);}
        .modal-body { padding:24px; }

        /* Form */
        .f-field { margin-bottom:16px; }
        .f-label {
          display:block;font-size:11px;font-weight:700;
          text-transform:uppercase;letter-spacing:0.7px;
          color:var(--muted);margin-bottom:7px;
        }
        .f-input {
          width:100%;padding:11px 14px;
          border:1.5px solid var(--border);border-radius:10px;
          font-size:14px;font-family:'DM Sans',sans-serif;
          color:var(--text);background:#fafbff;outline:none;
          transition:border-color 0.2s,box-shadow 0.2s;
        }
        .f-input:focus { border-color:var(--blue);box-shadow:0 0 0 3px rgba(21,87,176,0.1);background:#fff; }
        .f-row { display:grid;grid-template-columns:1fr 1fr;gap:14px; }
        .pw-wrap { position:relative; }
        .pw-wrap .f-input { padding-right:42px; }
        .pw-eye {
          position:absolute;right:13px;top:50%;transform:translateY(-50%);
          background:none;border:none;cursor:pointer;color:#94a3b8;
          display:flex;align-items:center;padding:2px;transition:color 0.15s;
        }
        .pw-eye:hover{color:var(--blue);}
        .info-box {
          background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;
          padding:11px 14px;font-size:13px;color:#1e40af;
          display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;
        }

        /* Buttons */
        .btn-row { display:flex;justify-content:flex-end;gap:10px;margin-top:22px; }
        .btn {
          padding:10px 22px;border-radius:10px;font-family:'DM Sans',sans-serif;
          font-size:14px;font-weight:500;cursor:pointer;border:none;
          transition:opacity 0.18s,transform 0.15s;
          display:inline-flex;align-items:center;gap:7px;
        }
        .btn:hover:not(:disabled){opacity:0.88;transform:translateY(-1px);}
        .btn:active:not(:disabled){transform:none;}
        .btn:disabled{opacity:0.5;cursor:not-allowed;}
        .btn-primary { background:linear-gradient(135deg,var(--blue-deep),var(--blue));color:#fff; }
        .btn-ghost   { background:#f1f5f9;color:var(--text);border:1px solid var(--border); }

        /* Toast */
        .toast {
          position:fixed;bottom:24px;right:24px;
          background:#fff;border-radius:12px;padding:13px 18px;
          display:flex;align-items:center;gap:10px;font-size:14px;
          box-shadow:0 8px 32px rgba(0,0,0,0.12);border:1px solid var(--border);
          z-index:9999;animation:slideInT 0.25s ease;max-width:360px;
        }
        @keyframes slideInT{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
        .toast-ok  { border-left:4px solid #16a34a; }
        .toast-err { border-left:4px solid #dc2626; }

        /* Placeholder */
        .ph-page {
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:60vh;gap:14px;text-align:center;color:var(--muted);
        }
        .ph-icon {
          width:72px;height:72px;background:#eff6ff;border-radius:20px;
          display:flex;align-items:center;justify-content:center;font-size:30px;
          margin-bottom:8px;
        }
        .ph-page h2 { font-family:'Playfair Display',serif;font-size:22px;color:var(--text); }
        .ph-page p { font-size:14px;max-width:320px;line-height:1.65; }

        /* Spinner */
        .spin { width:36px;height:36px;border:3px solid #e8edf8;border-top-color:var(--blue);
          border-radius:50%;animation:sp 0.75s linear infinite;margin:0 auto; }
        @keyframes sp{to{transform:rotate(360deg);}}

        /* ══ Responsive ══ */
        @media (max-width: 1100px) {
          .stats-row { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 900px) {
          .charts-row { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          :root { --side-w: 220px; }
          .sidebar { transform: translateX(-100%); width: var(--side-w) !important; }
          .sidebar.mobile-open { transform: translateX(0); }
          .sidebar-overlay { display: block; }
          .sidebar-overlay.hidden { display: none; }
          .main { margin-left: 0 !important; }
          .page { padding: 18px; }
          .topbar { padding: 0 18px; }
          .stats-row { grid-template-columns: 1fr 1fr; gap:12px; }
          .action-cards { grid-template-columns:1fr; }
          .profile-grid { grid-template-columns:1fr; }
          .f-row { grid-template-columns:1fr; }
        }
        @media (max-width: 480px) {
          .stats-row { grid-template-columns: 1fr; }
          .donut-wrap { flex-direction: column; align-items:flex-start; }
        }
      `}</style>

      <div className="portal">
        {/* Overlay for mobile */}
        <div
          className={`sidebar-overlay${mobileOpen ? "" : " hidden"}`}
          onClick={() => setMobileOpen(false)}
        />

        {/* ══ SIDEBAR ══ */}
        <aside className={`sidebar${!sideOpen ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
          {/* Brand */}
          <div className="sb-brand">
            <div className="sb-logo">
              <img src="/logo.jpeg" alt="JECCA"
                onError={e => { e.target.style.display="none"; }}
              />
            </div>
            <div className="sb-brand-text">
              <div className="sb-brand-name">JECCA Engineering</div>
              <div className="sb-brand-sub">HR Management</div>
            </div>
          </div>

          {/* Admin chip */}
          <div className="sb-user">
            <div className="sb-avatar">{initials}</div>
            <div className="sb-user-info">
              <div className="sb-user-name">{user.full_name || "IT Manager"}</div>
              <div className="sb-user-role">IT Manager</div>
            </div>
          </div>

          {/* Nav */}
          <nav className="sb-nav">
            {navItems.map(item =>
              item.divider
                ? <div key={item.key} className="sb-section">{item.label}</div>
                : (
                  <button key={item.key}
                    className={`nav-btn${page === item.key ? " active" : ""}`}
                    onClick={() => { setPage(item.key); setMobileOpen(false); }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                )
            )}
          </nav>

          {/* Footer */}
          <div className="sb-footer">
            <button className="sb-logout" onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* ══ MAIN ══ */}
        <div className={`main${!sideOpen ? " collapsed-main" : ""}`}>
          {/* Topbar */}
          <header className="topbar">
            {/* Desktop: collapse sidebar | Mobile: open drawer */}
            <button className="toggle-btn"
              onClick={() => { window.innerWidth <= 768 ? setMobileOpen(!mobileOpen) : setSideOpen(!sideOpen); }}
              aria-label="Toggle sidebar"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>

            {page === "employees" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                <span className="topbar-title">Employee Records</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 14, background: "#f0f6ff", border: "1.5px solid #d1e3ff", borderRadius: 12, padding: "4px 6px" }}>
                  <button onClick={prevMonth} style={{ width: 28, height: 28, border: "none", background: "none", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#1557b0" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#dbeafe"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 700, color: "#0a2a5e", minWidth: 130, textAlign: "center" }}>{monthLabel}</span>
                  <button onClick={nextMonth} disabled={isCurrentMonth} style={{ width: 28, height: 28, border: "none", background: "none", borderRadius: 8, cursor: isCurrentMonth ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: isCurrentMonth ? "#cbd5e1" : "#1557b0" }}
                    onMouseEnter={e => { if (!isCurrentMonth) e.currentTarget.style.background = "#dbeafe"; }}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
                {!isCurrentMonth && (
                  <button onClick={() => setSelectedMonth({ year: now.getFullYear(), month: now.getMonth() })} style={{ padding: "4px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#64748b", fontWeight: 500 }}>Today</button>
                )}
              </div>
            ) : (
              <span className="topbar-title">
                { page === "dashboard"    ? "Dashboard"
                : page === "admins"       ? "Admin Management"
                : page === "loginhistory" ? "Login History"
                : page === "profile"      ? "My Profile" : "" }
              </span>
            )}

            <div className="topbar-right">
              <TopbarMenu user={user} initials={initials}
                onProfile={() => setModal("profile")}
                onPassword={() => setModal("password")}
                onLogout={handleLogout}
              />
            </div>
          </header>

          {/* Content */}
          <div className="page">
            {page === "dashboard"    && <DashboardPage stats={stats} />}
            {page === "admins"       && <AdminsPage showToast={showToast} />}
            {page === "employees"    && <EmployeesPage showToast={showToast} selectedMonth={selectedMonth} />}
            {page === "loginhistory" && <LoginHistoryPage showToast={showToast} />}
            {page === "profile"      && (
              <ProfilePage user={user} initials={initials}
                onEdit={() => setModal("profile")}
                onPassword={() => setModal("password")}
                onAddIT={() => setModal("addIT")}
              />
            )}
          </div>
        </div>
      </div>

      {/* ══ MODALS ══ */}
      {modal === "profile"  && <EditProfileModal  user={user} onClose={() => setModal(null)} showToast={showToast} />}
      {modal === "password" && <ChangePasswordModal          onClose={() => setModal(null)} showToast={showToast} />}
      {modal === "addIT"    && <AddITAdminModal              onClose={() => setModal(null)} showToast={showToast} />}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </>
  );
}

// ── Topbar Menu ───────────────────────────────────────────────────────────────
function TopbarMenu({ user, initials, onProfile, onPassword, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  return (
    <div style={{ position:"relative" }} ref={ref}>
      <div className="top-avatar" onClick={() => setOpen(!open)} title="Account">{initials}</div>
      {open && (
        <div className="top-menu">
          <div className="top-menu-head">
            <div className="top-menu-name">{user.full_name}</div>
            <div className="top-menu-role">IT Manager</div>
          </div>
          <button className="top-menu-item" onClick={() => { onProfile(); setOpen(false); }}>
            <UserIcon size={15}/> Edit Profile
          </button>
          <button className="top-menu-item" onClick={() => { onPassword(); setOpen(false); }}>
            <LockIcon size={15}/> Change Password
          </button>
          <div className="menu-hr"/>
          <button className="top-menu-item red" onClick={onLogout}>
            <LogoutIcon size={15}/> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardPage({ stats }) {
  if (!stats) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh",flexDirection:"column",gap:16}}>
      <div className="spin"/><p style={{color:"#64748b",fontSize:14}}>Loading statistics…</p>
    </div>
  );

  const BLUE = ["#0a2a5e","#0e3d82","#1557b0","#1a6fd4","#4a90d9","#7fb3e8","#b3d1f5"];

  const genderData = [
    { label:"Male",   value:stats.male,   color:"#0e3d82" },
    { label:"Female", value:stats.female, color:"#1a6fd4" },
    { label:"Other",  value:stats.other,  color:"#7fb3e8" },
  ];
  const statusColors = { employed:"#0e3d82", retired:"#7fb3e8", dismissed:"#0a2a5e", resigned:"#4a90d9", suspended:"#1557b0" };
  const statusData = Object.entries(stats.statusCount).map(([k,v]) => ({
    label: k.charAt(0).toUpperCase()+k.slice(1), value:v, color:statusColors[k]||"#94a3b8"
  }));
  const deptBars = stats.byDept.map(([name,count],i) => ({
    label: name.length>9?name.slice(0,9)+"…":name, value:count, color:BLUE[i%BLUE.length]
  }));

  return (
    <>
      <div className="stats-row">
        {[
          { label:"Total Employees",    value:stats.total,    icon:<UsersIcon size={22} color="#1557b0"/>  },
          { label:"Currently Employed", value:stats.employed, icon:<CheckIcon size={22} color="#1557b0"/>  },
          { label:"System Admins",      value:stats.admins,   icon:<ShieldIcon size={22} color="#1557b0"/> },
          { label:"Departments",        value:stats.depts,    icon:<BuildingIcon size={22} color="#1557b0"/>},
        ].map((c,i) => (
          <div className="stat-card" key={i}>
            <div className="stat-icon-box">{c.icon}</div>
            <div>
              <div className="stat-num">{c.value}</div>
              <div className="stat-lbl">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-head">Gender Balance</div>
          <div className="donut-wrap">
            <DonutChart data={genderData} />
            <div className="legend">
              {genderData.map((d,i)=>(
                <div className="leg-item" key={i}>
                  <div className="leg-dot" style={{background:d.color}}/>
                  {d.label}<span className="leg-val">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-head">Employment Status</div>
          <div className="donut-wrap">
            <DonutChart data={statusData}/>
            <div className="legend">
              {statusData.map((d,i)=>(
                <div className="leg-item" key={i}>
                  <div className="leg-dot" style={{background:d.color}}/>
                  {d.label}<span className="leg-val">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="chart-card full">
          <div className="chart-head">Employees by Department</div>
          {deptBars.length
            ? <BarChart data={deptBars} height={130}/>
            : <p style={{color:"#94a3b8",fontSize:13}}>No department data yet.</p>
          }
        </div>
      </div>
    </>
  );
}

// ── Profile Page ──────────────────────────────────────────────────────────────
function ProfilePage({ user, initials, onEdit, onPassword, onAddIT }) {
  return (
    <>
      <div className="profile-card">
        <div className="profile-top">
          <div className="profile-avatar">{initials}</div>
          <div style={{flex:1}}>
            <div className="profile-name">{user.full_name||"—"}</div>
            <div className="profile-sub">IT Manager &nbsp;·&nbsp; {user.email||"—"}</div>
          </div>
          <button className="btn btn-primary" onClick={onEdit}>Edit Profile</button>
        </div>
        <div className="profile-grid">
          {[
            ["Username",   user.username||"—"],
            ["Email",      user.email||"—"],
            ["Role",       "IT Manager"],
            ["Department", user.department||"All Departments"],
          ].map(([l,v])=>(
            <div className="profile-field" key={l}>
              <label>{l}</label><p>{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="action-cards">
        <div className="action-card" onClick={onPassword}>
          <div className="action-icon" style={{background:"#eff6ff"}}>
            <LockIcon size={20} color="#1557b0"/>
          </div>
          <div>
            <div className="action-title">Change Password</div>
            <div className="action-desc">Update your login password</div>
          </div>
        </div>
        <div className="action-card" onClick={onAddIT}>
          <div className="action-icon" style={{background:"#f0fdf4"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
            </svg>
          </div>
          <div>
            <div className="action-title">Add IT Admin</div>
            <div className="action-desc">Create another IT Manager account</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────
function EditProfileModal({ user, onClose, showToast }) {
  const [form, setForm] = useState({ full_name:user.full_name||"", email:user.email||"" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.full_name||!form.email){showToast("Name and email required.","err");return;}
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/admins/${user.id}/`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify(form)});
      if (!res.ok) throw new Error();
      const updated = await res.json();
      localStorage.setItem("user", JSON.stringify({...user,...updated}));
      showToast("Profile updated."); onClose();
    } catch (_e) { showToast("Failed to update profile.","err"); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Edit Profile" onClose={onClose}>
      <div className="f-field">
        <label className="f-label">Full Name</label>
        <input className="f-input" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/>
      </div>
      <div className="f-field">
        <label className="f-label">Email Address</label>
        <input className="f-input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
      </div>
      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy?"Saving…":"Save Changes"}</button>
      </div>
    </Modal>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose, showToast }) {
  const [form,setForm] = useState({current_password:"",new_password:"",confirm_password:""});
  const [show,setShow] = useState({c:false,n:false,cf:false});
  const [busy,setBusy] = useState(false);
  const save = async () => {
    if (!form.current_password||!form.new_password||!form.confirm_password){showToast("All fields required.","err");return;}
    if (form.new_password!==form.confirm_password){showToast("Passwords do not match.","err");return;}
    if (form.new_password.length<8){showToast("Minimum 8 characters.","err");return;}
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/me/change-password/`,{method:"POST",headers:authHeaders(),body:JSON.stringify(form)});
      const d = await res.json();
      if (!res.ok){showToast(d.error||"Failed.","err");return;}
      showToast("Password changed! Signing you out…");
      setTimeout(()=>performLogout("manual"),1800);
      onClose();
    } catch{showToast("Server error.","err");}
    finally{setBusy(false);}
  };
  const PwF = ({field,label,sk}) => (
    <div className="f-field">
      <label className="f-label">{label}</label>
      <div className="pw-wrap">
        <input className="f-input" type={show[sk]?"text":"password"} value={form[field]}
          onChange={e=>setForm({...form,[field]:e.target.value})}/>
        <button type="button" className="pw-eye" onClick={()=>setShow({...show,[sk]:!show[sk]})}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {show[sk]
              ?<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
              :<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
            }
          </svg>
        </button>
      </div>
    </div>
  );
  return (
    <Modal title="Change Password" onClose={onClose}>
      <PwF field="current_password"  label="Current Password"     sk="c"/>
      <PwF field="new_password"      label="New Password"         sk="n"/>
      <PwF field="confirm_password"  label="Confirm New Password" sk="cf"/>
      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy?"Updating…":"Update Password"}</button>
      </div>
    </Modal>
  );
}

// ── Add IT Admin Modal ────────────────────────────────────────────────────────
function AddITAdminModal({ onClose, showToast }) {
  const [form,setForm] = useState({username:"",full_name:"",email:"",password:"",confirm:""});
  const [busy,setBusy] = useState(false);
  const save = async () => {
    if (!form.username||!form.full_name||!form.email||!form.password){showToast("All fields required.","err");return;}
    if (form.password!==form.confirm){showToast("Passwords do not match.","err");return;}
    if (form.password.length<8){showToast("Minimum 8 characters.","err");return;}
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/admins/`,{method:"POST",headers:authHeaders(),body:JSON.stringify({...form,role:"IT"})});
      const d = await res.json();
      if (!res.ok){const m=Object.values(d)[0];showToast(Array.isArray(m)?m[0]:m||"Failed.","err");return;}
      showToast(`IT Admin "${form.full_name}" created.`); onClose();
    } catch{showToast("Server error.","err");}
    finally{setBusy(false);}
  };
  const F = (key,label,type="text")=>(
    <div className="f-field">
      <label className="f-label">{label}</label>
      <input className="f-input" type={type} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/>
    </div>
  );
  return (
    <Modal title="Add IT Manager" onClose={onClose}>
      <div className="f-row">
        {F("username","Username")}
        {F("full_name","Full Name")}
      </div>
      {F("email","Email Address","email")}
      <div className="f-row">
        {F("password","Password","password")}
        {F("confirm","Confirm Password","password")}
      </div>
      <div className="info-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        This account will have full IT Manager privileges including delete and deactivation rights.
      </div>
      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy?"Creating…":"Create IT Admin"}</button>
      </div>
    </Modal>
  );
}

// ── Placeholder ───────────────────────────────────────────────────────────────
function PlaceholderPage({ icon, title, desc }) {
  return (
    <div className="ph-page">
      <div className="ph-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{desc}</p>
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const GridIcon     = ({size=18,color="currentColor"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
const ShieldIcon   = ({size=18,color="currentColor"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const UsersIcon    = ({size=18,color="currentColor"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const UserIcon     = ({size=18,color="currentColor"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const LockIcon     = ({size=18,color="currentColor"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const CheckIcon    = ({size=18,color="currentColor"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
const BuildingIcon = ({size=18,color="currentColor"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 22V12h6v10M9 7h1m4 0h1M9 11h1m4 0h1"/></svg>;
const LogoutIcon   = ({size=18,color="currentColor"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const ClockIcon    = ({size=18,color="currentColor"})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;

// ── Login History Page ─────────────────────────────────────────────────────────
function LoginHistoryPage({ showToast }) {
  const { admins: contextAdmins, loading: ctxLoading, errors: ctxErrors } = useITPortal();
  const admins   = contextAdmins || [];
  const loading  = ctxLoading.admins;
  const [selected,  setSelected]  = useState(null);
  const [activity,  setActivity]  = useState(null);
  const [actLoading,setActLoading]= useState(false);
  const [search,    setSearch]    = useState("");

  // Show error from context if admins failed to load
  useEffect(() => {
    if (ctxErrors.admins) showToast("Failed to load admins.", "err");
  }, [ctxErrors.admins]);

  const loadActivity = (adm) => {
    setSelected(adm);
    setActivity(null);
    setActLoading(true);
    fetch(`${API}/auth/admins/${adm.id}/activity/`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setActivity(Array.isArray(d) ? d : []))
      .catch(() => { showToast("Failed to load activity.", "err"); setActivity([]); })
      .finally(() => setActLoading(false));
  };

  const filtered = admins.filter(a => {
    const q = search.toLowerCase();
    return !q || [a.full_name, a.username, a.role].some(v => (v||"").toLowerCase().includes(q));
  });

  function fmtDT(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-ZW", { dateStyle: "medium", timeStyle: "short" });
  }
  function buildSessions(acts) {
    const sessions = [];
    if (!acts || !acts.length) return sessions;
    const chrono = [...acts].reverse();
    let openLogin = null;
    for (const a of chrono) {
      if (a.event === "login") { openLogin = a; }
      else if (a.event === "logout" && openLogin) {
        const dur = Math.round((new Date(a.timestamp) - new Date(openLogin.timestamp)) / 60000);
        sessions.unshift({ login: openLogin, logout: a, duration: dur });
        openLogin = null;
      }
    }
    if (openLogin) sessions.unshift({ login: openLogin, logout: null, duration: null });
    return sessions;
  }
  function fmtDur(mins) {
    if (mins === null || mins === undefined) return "Active";
    if (mins < 1) return "< 1m";
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  const sessions = buildSessions(activity);
  const rc = selected ? ({IT:"#1557b0",MD:"#9333ea",HRM:"#059669",HR:"#16a34a",HOD:"#d97706",HOD_ACCOUNTS:"#dc2626"}[selected.role] || "#64748b") : "#64748b";

  const ROLES_MAP = {IT:"IT Manager",MD:"Managing Director",HRM:"HR Manager",HR:"Standard HR",HOD:"Head of Dept",HOD_ACCOUNTS:"Accounts HOD"};

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 120px)", minHeight: 500 }}>
      {/* Left panel: admin list */}
      <div style={{ width: 280, flexShrink: 0, background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", marginBottom: 10 }}>Select Admin</div>
          <div style={{ position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search admins…"
              style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", boxSizing: "border-box", background: "#fafbff" }}
              onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
              onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
              <div style={{ width: 24, height: 24, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "sp 0.75s linear infinite", margin: "0 auto 10px" }} />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>No admins found</div>
          ) : filtered.map(adm => {
            const isSelected = selected?.id === adm.id;
            return (
              <div key={adm.id} onClick={() => loadActivity(adm)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                borderBottom: "1px solid #f8faff", cursor: "pointer",
                background: isSelected ? "#eff6ff" : "",
                borderLeft: isSelected ? "3px solid #1557b0" : "3px solid transparent",
                transition: "all 0.12s",
              }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f8faff"; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = ""; }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: `linear-gradient(135deg,#0e3d82,#1a6fd4)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, color: "#fff",
                }}>
                  {(adm.full_name||"?").split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{adm.full_name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{ROLES_MAP[adm.role] || adm.role}</div>
                </div>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: adm.is_active ? "#059669" : "#dc2626", flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel: session history */}
      <div style={{ flex: 1, background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", gap: 12 }}>
            <ClockIcon size={40} color="#c7d8f0" />
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: "#64748b" }}>Select an admin</div>
            <div style={{ fontSize: 13 }}>Choose an admin from the left to view their login sessions.</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                background: `linear-gradient(135deg,#0e3d82,#1a6fd4)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 700, color: "#fff",
              }}>
                {(selected.full_name||"?").split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#0a2a5e" }}>{selected.full_name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>@{selected.username} · {ROLES_MAP[selected.role] || selected.role}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  {actLoading ? "Loading…" : `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`}
                </span>
              </div>
            </div>

            {/* Sessions list */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {actLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                  <div style={{ width: 28, height: 28, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "sp 0.75s linear infinite", margin: "0 auto 12px" }} />
                  Loading sessions…
                </div>
              ) : sessions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                  <div style={{ fontSize: 30, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>No login sessions recorded</div>
                  <div style={{ fontSize: 13 }}>This admin has not logged in yet.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {sessions.map((s, i) => {
                    const isActive = !s.logout;
                    return (
                      <div key={i} style={{
                        background: "#f8faff", borderRadius: 12, padding: "16px 18px",
                        border: "1px solid #e2e8f0",
                        borderLeft: `4px solid ${isActive ? "#059669" : "#1557b0"}`,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669" }} />
                                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#64748b" }}>Login</span>
                                </div>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>{fmtDT(s.login.timestamp)}</div>
                              </div>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? "#e2e8f0" : "#dc2626" }} />
                                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#64748b" }}>Logout</span>
                                </div>
                                {isActive
                                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#ecfdf5", color: "#059669", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>● Currently Online</span>
                                  : <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>{fmtDT(s.logout.timestamp)}</div>
                                }
                              </div>
                            </div>
                          </div>
                          <span style={{
                            padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, flexShrink: 0,
                            background: isActive ? "#ecfdf5" : "#eff6ff",
                            color: isActive ? "#059669" : "#1557b0",
                          }}>{fmtDur(s.duration)}</span>
                        </div>
                        {s.login.ip_address && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
                            IP: {s.login.ip_address}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}