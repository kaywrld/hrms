// src/pages/HRPortal.jsx
//
// Main entry point for the HR Portal.
// Accessible by: HRM (Human Resource Manager) and HR (Standard HR officer).
// Wraps everything in HRPortalProvider so all child pages share one data cache.

import { useState, useEffect, useMemo, useRef } from "react";
import { HRPortalProvider, useHRPortal } from "../context/HRPortalContext";
import { performLogout, startInactivityTimer, apiFetch } from "../utils/auth";

// ── Palette & design tokens ───────────────────────────────────────────────────
const COLORS = {
  deptPalette: [
    "#0d9488", "#0891b2", "#7c3aed", "#db2777",
    "#ea580c", "#65a30d", "#ca8a04", "#475569",
  ],
  genderMale:   "#0e3d82",
  genderFemale: "#1a6fd4",
  genderOther:  "#7fb3e8",
  fullTime:     "#0e3d82",
  partTime:     "#f59e0b",
  contract:     "#6366f1",
  present:      "#16a34a",
  absent:       "#dc2626",
  notMarked:    "#94a3b8",
  lineJoin:     "#1557b0",
};

// ── Tiny SVG chart components ─────────────────────────────────────────────────

function DonutChart({ slices, size = 144, label, sublabel }) {
  const r = 52, cx = 72, cy = 72, circ = 2 * Math.PI * r;
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 144 144">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f4ff" strokeWidth="20" />
      {slices.map((d, i) => {
        const dash = (d.value / total) * circ;
        const el = (
          <circle
            key={`donut-${i}`} cx={cx} cy={cy} r={r} fill="none"
            stroke={d.color} strokeWidth="20"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 0.7s ease" }}
          />
        );
        offset += dash;
        return el;
      })}
      <circle cx={cx} cy={cy} r={40} fill="white" />
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#0a2a5e"
        fontSize="20" fontWeight="700" fontFamily="'Playfair Display',serif">{label}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8"
        fontSize="9" fontFamily="'DM Sans',sans-serif" letterSpacing="1">{sublabel}</text>
    </svg>
  );
}

function BarChart({ data, height = 120 }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const w = 460, barW = Math.min(38, Math.floor((w - 20) / data.length) - 8);
  const gap = (w - data.length * barW) / (data.length + 1);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height + 40}`} style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const bh = Math.max((d.count / max) * height, 3);
        const x  = gap + i * (barW + gap);
        const y  = height - bh;
        return (
          <g key={i}>
            <rect x={x} y={height} width={barW} height={0} rx="5"
              fill={COLORS.deptPalette[i % COLORS.deptPalette.length]}>
              <animate attributeName="height" from="0" to={bh}
                dur="0.55s" begin={`${i * 0.07}s`} fill="freeze" />
              <animate attributeName="y" from={height} to={y}
                dur="0.55s" begin={`${i * 0.07}s`} fill="freeze" />
            </rect>
            <text x={x + barW / 2} y={height + 18} textAnchor="middle"
              fill="#64748b" fontSize="9" fontFamily="'DM Sans',sans-serif">
              {d.name.length > 7 ? d.name.slice(0, 7) + "…" : d.name}
            </text>
            <text x={x + barW / 2} y={y - 5} textAnchor="middle"
              fill="#0a2a5e" fontSize="10" fontWeight="600" fontFamily="'DM Sans',sans-serif">
              {d.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ data, height = 110 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const w = 460, padL = 30, padB = 28, padT = 16;
  const iw = w - padL - 10;
  const ih = height - padT - padB;
  const px = (i) => padL + (i / (data.length - 1)) * iw;
  const py = (v) => padT + ih - (v / max) * ih;
  const pts = data.map((d, i) => `${px(i)},${py(d.count)}`).join(" ");
  const area = `M ${px(0)},${py(0)} ` +
    data.map((d, i) => `L ${px(i)},${py(d.count)}`).join(" ") +
    ` L ${px(data.length - 1)},${py(0)} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} style={{ overflow: "visible" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padL} x2={w - 10}
          y1={padT + ih - f * ih} y2={padT + ih - f * ih}
          stroke="#f1f5f9" strokeWidth="1" />
      ))}
      {[0, Math.round(max / 2), max].map((v, i) => (
        <text key={`yax-${i}`} x={padL - 5} y={py(v) + 4} textAnchor="end"
          fill="#94a3b8" fontSize="9" fontFamily="'DM Sans',sans-serif">{v}</text>
      ))}
      <defs>
        <linearGradient id="lineGradHR" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLORS.lineJoin} stopOpacity="0.18" />
          <stop offset="100%" stopColor={COLORS.lineJoin} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lineGradHR)" />
      <polyline points={pts} fill="none"
        stroke={COLORS.lineJoin} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={`lc-dot-${i}`} cx={px(i)} cy={py(d.count)} r="4"
          fill="white" stroke={COLORS.lineJoin} strokeWidth="2.5" />
      ))}
      {data.map((d, i) => (
        <text key={`lc-lbl-${i}`} x={px(i)} y={height - 4} textAnchor="middle"
          fill="#64748b" fontSize="9" fontFamily="'DM Sans',sans-serif">{d.label}</text>
      ))}
    </svg>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3400);
    return () => clearTimeout(t);
  }, [onDone]);
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

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14,
      border: "1px solid #e2e8f0",
      borderLeft: "4px solid #1557b0",
      padding: "20px 22px",
      display: "flex", alignItems: "center", gap: 16,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      flex: "1 1 180px", minWidth: 170,
      transition: "box-shadow 0.2s, transform 0.2s",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(21,87,176,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 12,
        background: "#eff6ff",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700,
          letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3,
          fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#0a2a5e",
          lineHeight: 1, fontFamily: "'Playfair Display',serif" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4,
          fontFamily: "'DM Sans',sans-serif" }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function Card({ title, children, style = {} }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
      boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 24px",
      ...style,
    }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: "#0a2a5e",
          letterSpacing: "1.2px", textTransform: "uppercase",
          marginBottom: 18, paddingBottom: 12,
          borderBottom: "1px solid #e2e8f0",
          fontFamily: "'DM Sans',sans-serif",
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────
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
    key: "admins", label: "Admins",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    key: "employees", label: "Employees",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    key: "attendance", label: "Attendance",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <polyline points="9 16 11 18 15 14" />
      </svg>
    ),
  },
  {
    key: "payroll", label: "Payroll",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="6" y1="15" x2="10" y2="15" />
      </svg>
    ),
  },
  {
    key: "profile", label: "My Profile",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, sideOpen, user, isHRM, mobileOpen, setMobileOpen }) {
  const initials = ((user?.full_name || user?.username || "HR")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase());

  const roleBadge = isHRM ? "HR Manager" : "HR Officer";

  return (
    <aside style={{
      width: sideOpen ? 220 : 64,
      position: "fixed",
      top: 0, left: 0, bottom: 0,
      zIndex: 200,
      background: "linear-gradient(180deg, #1a6fd4 0%, #1557b0 25%, #0e3d82 55%, #0a2a5e 100%)",
      display: "flex", flexDirection: "column",
      transition: "width 0.28s cubic-bezier(.4,0,.2,1), transform 0.28s cubic-bezier(.4,0,.2,1)",
      overflow: "hidden",
    }}>
      {/* Logo / branding */}
      <div style={{
        padding: "0 14px",
        height: 64,
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        flexShrink: 0, overflow: "hidden",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: "rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, overflow: "hidden",
        }}>
          <img src="/logo.jpeg" alt="JECCA"
            style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8 }}
            onError={e => { e.target.style.display = "none"; }}
          />
        </div>
        {sideOpen && (
          <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
            <div style={{
              fontFamily: "'Playfair Display', serif", fontSize: 13.5, fontWeight: 700,
              color: "#fff", lineHeight: 1.2, letterSpacing: "-0.2px",
            }}>JECCA Engineering</div>
            <div style={{
              fontSize: 9.5, color: "rgba(255,255,255,0.5)",
              letterSpacing: "1.8px", textTransform: "uppercase", marginTop: 1,
            }}>HR Management</div>
          </div>
        )}
      </div>

      {/* Logged-in admin info */}
      <div style={{
        margin: "14px 10px",
        padding: sideOpen ? "10px 11px" : "8px",
        background: "rgba(255,255,255,0.1)",
        borderRadius: 12,
        display: "flex", alignItems: "center",
        gap: sideOpen ? 10 : 0,
        justifyContent: sideOpen ? "flex-start" : "center",
        overflow: "hidden",
        flexShrink: 0,
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
            <div style={{
              color: "#fff", fontWeight: 600, fontSize: 13,
              fontFamily: "'DM Sans',sans-serif",
              overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {user?.full_name || user?.username || "HR Admin"}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1, letterSpacing: "0.3px" }}>
              {roleBadge}
            </div>
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
          return (
            <button
              key={item.key}
              onClick={() => { setPage(item.key); setMobileOpen && setMobileOpen(false); }}
              style={{
                display: "flex", alignItems: "center",
                gap: sideOpen ? 11 : 0,
                justifyContent: sideOpen ? "flex-start" : "center",
                width: "100%", padding: sideOpen ? "9px 10px" : "10px",
                marginBottom: 2,
                borderRadius: 10, border: "none", cursor: "pointer",
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
            borderRadius: 10,
            border: "none", cursor: "pointer",
            background: "transparent", color: "rgba(255,255,255,0.5)",
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500,
            transition: "background 0.15s, color 0.15s",
            whiteSpace: "nowrap", overflow: "hidden",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(220,38,38,0.2)"; e.currentTarget.style.color = "#fca5a5"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {sideOpen && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

// ── Topbar dropdown menu ──────────────────────────────────────────────────────
function TopbarMenu({ user, initials, isHRM, onProfile, onPassword }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          width: 38, height: 38,
          background: "linear-gradient(135deg, #0e3d82, #1a6fd4)",
          borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 13, color: "#fff",
          cursor: "pointer", border: "2px solid transparent",
          transition: "border-color 0.15s",
          letterSpacing: "0.5px",
        }}
        title="Account"
      >
        {initials}
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 10px)", right: 0,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.1)", minWidth: 210, overflow: "hidden",
          zIndex: 300, animation: "fadeDown 0.15s ease",
        }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{user?.full_name || user?.username}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{isHRM ? "HR Manager" : "HR Officer"}</div>
          </div>
          <button onClick={() => { onProfile(); setOpen(false); }} style={{ display:"flex",alignItems:"center",gap:10,padding:"11px 16px",fontSize:13.5,color:"#0f172a",cursor:"pointer",border:"none",background:"none",width:"100%",textAlign:"left",fontFamily:"'DM Sans',sans-serif",transition:"background 0.1s" }} onMouseEnter={e=>e.currentTarget.style.background="#f8faff"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Edit Profile
          </button>
          <button onClick={() => { onPassword(); setOpen(false); }} style={{ display:"flex",alignItems:"center",gap:10,padding:"11px 16px",fontSize:13.5,color:"#0f172a",cursor:"pointer",border:"none",background:"none",width:"100%",textAlign:"left",fontFamily:"'DM Sans',sans-serif",transition:"background 0.1s" }} onMouseEnter={e=>e.currentTarget.style.background="#f8faff"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Change Password
          </button>
          <div style={{ height:1, background:"#e2e8f0" }} />
          <button
            onClick={() => { performLogout("manual"); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "11px 16px", fontSize: 13.5, color: "#dc2626",
              cursor: "pointer", border: "none", background: "none",
              width: "100%", textAlign: "left", fontFamily: "'DM Sans',sans-serif",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#fef2f2"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
          >
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

// ── Contract Progress Bar ─────────────────────────────────────────────────────
function ContractProgressBar({ contractStart, contractEnd }) {
  if (!contractStart || !contractEnd) return null;

  const start = new Date(contractStart);
  const end   = new Date(contractEnd);
  const now   = new Date();

  const totalMs    = end - start;
  const elapsedMs  = now - start;
  const remainingMs = end - now;

  if (totalMs <= 0) return null;

  const pct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const remainingMonths = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24 * 30.44)));

  // Color: green (>50% remaining) → orange (20–50%) → red (<20%)
  const remainingPct = 100 - pct;
  const barColor = remainingPct > 50 ? "#16a34a" : remainingPct > 20 ? "#f59e0b" : "#dc2626";
  const bgColor  = remainingPct > 50 ? "#dcfce7"  : remainingPct > 20 ? "#fef9c3"  : "#fee2e2";
  const textColor = remainingPct > 50 ? "#166534" : remainingPct > 20 ? "#854d0e"  : "#991b1b";

  const label = remainingMs <= 0
    ? "Expired"
    : `${remainingMonths} month${remainingMonths !== 1 ? "s" : ""} left`;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
          Contract Progress
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: textColor,
          background: bgColor, borderRadius: 20, padding: "2px 8px",
          fontFamily: "'DM Sans',sans-serif",
        }}>
          {label}
        </span>
      </div>
      <div style={{
        height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: barColor,
          borderRadius: 99,
          transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
          {start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
          {end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>
    </div>
  );
}

// ── Employee Detail Panel (slide-in drawer) ───────────────────────────────────
function EmployeeDetailPanel({ emp, onClose }) {
  const panelRef = useRef();

  useEffect(() => {
    const fn = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    // Slight delay so the click that opens the panel doesn't immediately close it
    const t = setTimeout(() => document.addEventListener("mousedown", fn), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", fn); };
  }, [onClose]);

  if (!emp) return null;

  const getFullName = (e) => e.full_name || [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ") || "—";
  const getPhone    = (e) => e.phone || e.phone_number || "";

  const fullName = getFullName(emp);
  const phone    = getPhone(emp);

  const avatarLetters = fullName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

  const genderLabel = { M: "Male", F: "Female", O: "Other" };
  const typeLabel   = { full_time: "Full-Time", part_time: "Part-Time", contract: "Contract" };

  const statusStyle = {
    employed:   { bg: "#dcfce7", color: "#166534" },
    terminated: { bg: "#fee2e2", color: "#991b1b" },
    on_leave:   { bg: "#fef9c3", color: "#854d0e" },
    dismissed:  { bg: "#fee2e2", color: "#991b1b" },
    resigned:   { bg: "#fef9c3", color: "#854d0e" },
    suspended:  { bg: "#fce7f3", color: "#9d174d" },
  };
  const ss = statusStyle[emp.status] || { bg: "#f1f5f9", color: "#475569" };

  // Tenure calculation
  const dateJoined = emp.date_joined ? new Date(emp.date_joined) : null;
  const now = new Date();
  let tenureStr = "—";
  if (dateJoined) {
    const totalMonths = (now.getFullYear() - dateJoined.getFullYear()) * 12 + (now.getMonth() - dateJoined.getMonth());
    const years  = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    tenureStr = years > 0
      ? `${years}y ${months}m`
      : `${months} month${months !== 1 ? "s" : ""}`;
  }

  const InfoRow = ({ label, value, valueColor }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      padding: "9px 0", borderBottom: "1px solid #f1f5f9", gap: 12 }}>
      <span style={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif",
        fontWeight: 500, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: valueColor || "#0f172a", fontFamily: "'DM Sans',sans-serif",
        fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>
        {value || "—"}
      </span>
    </div>
  );

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: "fixed", inset: 0, background: "rgba(10,42,94,0.18)",
        zIndex: 400, backdropFilter: "blur(2px)",
      }} />

      {/* Drawer */}
      <div ref={panelRef} style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 420, maxWidth: "95vw",
        background: "#fff",
        boxShadow: "-8px 0 48px rgba(0,0,0,0.14)",
        zIndex: 500,
        display: "flex", flexDirection: "column",
        animation: "slideInRight 0.28s cubic-bezier(.4,0,.2,1)",
        overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #0e3d82 0%, #1a6fd4 100%)",
          padding: "28px 24px 24px",
          position: "relative", flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 16, right: 16,
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(255,255,255,0.15)", border: "none",
              cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, overflow: "hidden", flexShrink: 0,
              border: "3px solid rgba(255,255,255,0.3)",
              background: "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.1))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {emp.profile_picture || emp.photo || emp.avatar ? (
                <img
                  src={emp.profile_picture || emp.photo || emp.avatar}
                  alt={fullName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={e => {
                    e.target.style.display = "none";
                    e.target.parentNode.innerHTML = `<span style="font-size:26px;font-weight:700;color:#fff;font-family:'DM Sans',sans-serif">${avatarLetters}</span>`;
                  }}
                />
              ) : (
                <span style={{ fontSize: 26, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans',sans-serif" }}>
                  {avatarLetters}
                </span>
              )}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700,
                color: "#fff", lineHeight: 1.2, marginBottom: 5 }}>
                {fullName}
              </div>
              {emp.employee_number && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: "0.5px",
                  fontFamily: "'DM Sans',sans-serif", marginBottom: 6 }}>
                  #{emp.employee_number}
                </div>
              )}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, borderRadius: 20,
                  padding: "3px 10px", background: ss.bg, color: ss.color,
                  fontFamily: "'DM Sans',sans-serif",
                }}>
                  {(emp.status || "—").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                <span style={{
                  fontSize: 10.5, fontWeight: 600, borderRadius: 20,
                  padding: "3px 10px",
                  background: emp.employment_type === "full_time" ? "#eff6ff"
                    : emp.employment_type === "part_time" ? "#fffbeb" : "#f5f3ff",
                  color: emp.employment_type === "full_time" ? "#1557b0"
                    : emp.employment_type === "part_time" ? "#b45309" : "#7c3aed",
                  fontFamily: "'DM Sans',sans-serif",
                }}>
                  {typeLabel[emp.employment_type] || emp.employment_type || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>

          {/* Contract bar OR tenure block */}
          {emp.employment_type === "contract" ? (
            <div style={{
              background: "#fafbff", border: "1px solid #e2e8f0",
              borderRadius: 12, padding: "14px 16px", marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0a2a5e",
                letterSpacing: "1px", textTransform: "uppercase",
                fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>
                Contract Status
              </div>
              <ContractProgressBar
                contractStart={emp.contract_start || emp.date_joined}
                contractEnd={emp.contract_end || emp.contract_expiry}
              />
            </div>
          ) : (
            <div style={{
              background: "#fafbff", border: "1px solid #e2e8f0",
              borderRadius: 12, padding: "14px 16px", marginBottom: 20,
              display: "flex", gap: 24,
            }}>
              <div>
                <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700,
                  letterSpacing: "0.8px", textTransform: "uppercase",
                  fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>Tenure</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0a2a5e",
                  fontFamily: "'Playfair Display',serif" }}>{tenureStr}</div>
              </div>
              {dateJoined && (
                <div>
                  <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700,
                    letterSpacing: "0.8px", textTransform: "uppercase",
                    fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>Date Joined</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#334155",
                    fontFamily: "'DM Sans',sans-serif" }}>
                    {dateJoined.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Personal details */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#0a2a5e",
              letterSpacing: "1px", textTransform: "uppercase",
              fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>
              Personal Details
            </div>
            <InfoRow label="Full Name"    value={fullName} />
            <InfoRow label="Gender"       value={genderLabel[emp.gender] || emp.gender} />
            <InfoRow label="Date of Birth" value={emp.date_of_birth
              ? new Date(emp.date_of_birth).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : null} />
            <InfoRow label="National ID"  value={emp.national_id || emp.id_number} />
            <InfoRow label="Address"      value={emp.address || emp.home_address} />
          </div>

          {/* Contact */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#0a2a5e",
              letterSpacing: "1px", textTransform: "uppercase",
              fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>
              Contact
            </div>
            <InfoRow label="Email"  value={emp.email} valueColor="#1557b0" />
            <InfoRow label="Phone"  value={phone} />
            <InfoRow label="Alt Phone" value={emp.alt_phone || emp.alternative_phone} />
            <InfoRow label="Next of Kin"       value={
              emp.nok_full_name || emp.next_of_kin || emp.next_of_keen ||
              emp.emergency_contact || emp.emergency_contact_name || emp.nok_name
            } />
            <InfoRow label="Relationship"      value={emp.nok_relationship} />
            <InfoRow label="Next of Kin Phone" value={
              emp.nok_phone || emp.next_of_kin_phone ||
              emp.emergency_contact_phone || emp.emergency_phone
            } />
          </div>

          {/* Employment */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#0a2a5e",
              letterSpacing: "1px", textTransform: "uppercase",
              fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>
              Employment
            </div>
            <InfoRow label="Job Title"    value={emp.job_title || emp.position} />
            <InfoRow label="Department"   value={emp.department_name} />
            <InfoRow label="Type"         value={typeLabel[emp.employment_type] || emp.employment_type} />
            <InfoRow label="Status"       value={(emp.status || "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())} />
            <InfoRow label="Date Joined"  value={dateJoined
              ? dateJoined.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : null} />
            {emp.employment_type === "contract" && (
              <>
                <InfoRow label="Contract Start" value={emp.contract_start
                  ? new Date(emp.contract_start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                  : null} />
                <InfoRow label="Contract End" value={(emp.contract_end || emp.contract_expiry)
                  ? new Date(emp.contract_end || emp.contract_expiry).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                  : null} />
              </>
            )}
            <InfoRow label="Employee No." value={emp.employee_number ? `#${emp.employee_number}` : null} />
          </div>

          {/* Bank / Payroll if available */}
          {(emp.bank_name || emp.bank_account || emp.salary) && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#0a2a5e",
                letterSpacing: "1px", textTransform: "uppercase",
                fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>
                Payroll
              </div>
              {emp.bank_name    && <InfoRow label="Bank"    value={emp.bank_name} />}
              {emp.bank_account && <InfoRow label="Account" value={emp.bank_account} />}
              {emp.salary       && <InfoRow label="Salary"  value={`$${Number(emp.salary).toLocaleString()}`} />}
            </div>
          )}

          {/* Notes / bio */}
          {(emp.notes || emp.bio || emp.remarks) && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#0a2a5e",
                letterSpacing: "1px", textTransform: "uppercase",
                fontFamily: "'DM Sans',sans-serif", marginBottom: 8 }}>
                Notes
              </div>
              <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.65,
                fontFamily: "'DM Sans',sans-serif", background: "#fafbff",
                borderRadius: 10, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                {emp.notes || emp.bio || emp.remarks}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Employee Avatar (with profile pic support) ────────────────────────────────
function EmployeeAvatar({ emp, size = 32 }) {
  const [imgFailed, setImgFailed] = useState(false);
  const fullName = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "?";
  const letters  = fullName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  const src = emp.profile_picture || emp.photo || emp.avatar;

  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.25),
      overflow: "hidden", flexShrink: 0,
      background: "linear-gradient(135deg, #0e3d82, #1a6fd4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.34), fontWeight: 700, color: "#fff",
      border: "1.5px solid #e2e8f0",
    }}>
      {src && !imgFailed ? (
        <img
          src={src} alt={fullName}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span style={{ fontFamily: "'DM Sans',sans-serif" }}>{letters}</span>
      )}
    </div>
  );
}

// ── Employee Detail Inline View ───────────────────────────────────────────────
function EmployeeDetailView({ emp, onBack, loadingDetail }) {
  if (!emp) return null;

  const getFullName = (e) => e.full_name || [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ") || "—";
  const getPhone    = (e) => e.phone || e.phone_number || "";

  const fullName = getFullName(emp);
  const phone    = getPhone(emp);

  const avatarLetters = fullName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

  const genderLabel = { M: "Male", F: "Female", O: "Other" };
  const typeLabel   = { full_time: "Full-Time", part_time: "Part-Time", contract: "Contract" };

  const statusStyle = {
    employed:   { bg: "#dcfce7", color: "#166534" },
    terminated: { bg: "#fee2e2", color: "#991b1b" },
    on_leave:   { bg: "#fef9c3", color: "#854d0e" },
    dismissed:  { bg: "#fee2e2", color: "#991b1b" },
    resigned:   { bg: "#fef9c3", color: "#854d0e" },
    suspended:  { bg: "#fce7f3", color: "#9d174d" },
  };
  const ss = statusStyle[emp.status] || { bg: "#f1f5f9", color: "#475569" };

  const dateJoined = emp.date_joined ? new Date(emp.date_joined) : null;
  const now = new Date();
  let tenureStr = "—";
  if (dateJoined) {
    const totalMonths = (now.getFullYear() - dateJoined.getFullYear()) * 12 + (now.getMonth() - dateJoined.getMonth());
    const years  = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    tenureStr = years > 0 ? `${years}y ${months}m` : `${months} month${months !== 1 ? "s" : ""}`;
  }

  // Months worked (from date_joined to now)
  const monthsWorked = dateJoined
    ? Math.max(0, (now.getFullYear() - dateJoined.getFullYear()) * 12 + (now.getMonth() - dateJoined.getMonth()))
    : null;

  const InfoRow = ({ label, value, valueColor }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      padding: "10px 0", borderBottom: "1px solid #f1f5f9", gap: 12 }}>
      <span style={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif",
        fontWeight: 600, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 130 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: valueColor || "#0f172a", fontFamily: "'DM Sans',sans-serif",
        fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>
        {value || "—"}
      </span>
    </div>
  );

  const SectionTitle = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: "#0a2a5e", letterSpacing: "1.2px",
      textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif",
      marginBottom: 4, marginTop: 8, paddingBottom: 8,
      borderBottom: "2px solid #eff6ff" }}>
      {children}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
      {/* Loading overlay while full data fetches */}
      {loadingDetail && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(255,255,255,0.7)",
          zIndex: 50, borderRadius: 16,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          backdropFilter: "blur(2px)",
        }}>
          <div style={{ width: 28, height: 28, border: "3px solid #e8edf8", borderTopColor: "#1557b0",
            borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 13, color: "#1557b0", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>
            Loading full details…
          </span>
        </div>
      )}

      {/* Back button */}
      <div>
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
          Back to Dashboard
        </button>
      </div>

      {/* Profile header card */}
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        padding: "28px 32px",
        display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        {/* Avatar */}
        <div style={{
          width: 88, height: 88, borderRadius: 22, overflow: "hidden", flexShrink: 0,
          background: "linear-gradient(135deg, #0e3d82, #1a6fd4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "3px solid #eff6ff",
        }}>
          {(emp.profile_picture || emp.photo || emp.avatar) ? (
            <img src={emp.profile_picture || emp.photo || emp.avatar} alt={fullName}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { e.target.style.display = "none"; }} />
          ) : (
            <span style={{ fontSize: 30, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans',sans-serif" }}>
              {avatarLetters}
            </span>
          )}
        </div>

        {/* Name / badges */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#0a2a5e",
            fontFamily: "'Playfair Display',serif", lineHeight: 1.2 }}>
            {fullName}
          </h1>
          {emp.employee_number && (
            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>
              #{emp.employee_number}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "4px 12px",
              background: ss.bg, color: ss.color, fontFamily: "'DM Sans',sans-serif" }}>
              {(emp.status || "—").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 12px",
              background: emp.employment_type === "full_time" ? "#eff6ff" : emp.employment_type === "part_time" ? "#fffbeb" : "#f5f3ff",
              color: emp.employment_type === "full_time" ? "#1557b0" : emp.employment_type === "part_time" ? "#b45309" : "#7c3aed",
              fontFamily: "'DM Sans',sans-serif",
            }}>
              {typeLabel[emp.employment_type] || emp.employment_type || "—"}
            </span>
            {emp.job_title && (
              <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
                · {emp.job_title || emp.position}
              </span>
            )}
            {emp.department_name && (
              <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
                · {emp.department_name}
              </span>
            )}
          </div>
        </div>

        {/* Tenure / joined highlight */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", background: "#f8faff", borderRadius: 12,
            border: "1px solid #e2e8f0", padding: "14px 20px", minWidth: 100 }}>
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.8px",
              textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>Tenure</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0a2a5e",
              fontFamily: "'Playfair Display',serif" }}>{tenureStr}</div>
          </div>
          {dateJoined && (
            <div style={{ textAlign: "center", background: "#f8faff", borderRadius: 12,
              border: "1px solid #e2e8f0", padding: "14px 20px", minWidth: 100 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.8px",
                textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>Joined</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#334155",
                fontFamily: "'DM Sans',sans-serif" }}>
                {dateJoined.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contract progress bar for contract employees */}
      {emp.employment_type === "contract" && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 32px" }}>
          <SectionTitle>Contract Status</SectionTitle>
          <div style={{ marginTop: 12 }}>
            <ContractProgressBar
              contractStart={emp.contract_start || emp.date_joined}
              contractEnd={emp.contract_end || emp.contract_expiry}
            />
          </div>
        </div>
      )}

      {/* Detail sections grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

        {/* Personal Details */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Personal Details</SectionTitle>
          <InfoRow label="Full Name"     value={fullName} />
          <InfoRow label="Gender"        value={genderLabel[emp.gender] || emp.gender} />
          <InfoRow label="Date of Birth" value={
            (emp.date_of_birth || emp.dob || emp.birth_date)
              ? new Date(emp.date_of_birth || emp.dob || emp.birth_date)
                  .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : null
          } />
          <InfoRow label="National ID"   value={
            emp.national_id || emp.id_number || emp.national_id_number ||
            emp.id_no || emp.nin || emp.passport_number || emp.id
              ? String(emp.national_id || emp.id_number || emp.national_id_number || emp.id_no || emp.nin || emp.passport_number || "")
              : null
          } />
          <InfoRow label="Address"       value={
            emp.address || emp.home_address || emp.residential_address ||
            emp.physical_address || emp.street_address || emp.location
          } />
        </div>

        {/* Contact */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Contact Information</SectionTitle>
          <InfoRow label="Email"             value={emp.email || emp.email_address} valueColor="#1557b0" />
          <InfoRow label="Phone"             value={phone} />
          <InfoRow label="Alt Phone"         value={emp.alt_phone || emp.alternative_phone || emp.other_phone || emp.phone2} />
          <InfoRow label="Next of Kin"       value={
            emp.nok_full_name || emp.next_of_kin || emp.next_of_keen ||
            emp.emergency_contact || emp.emergency_contact_name || emp.nok_name
          } />
          <InfoRow label="Relationship"      value={emp.nok_relationship} />
          <InfoRow label="Next of Kin Phone" value={
            emp.nok_phone || emp.next_of_kin_phone ||
            emp.emergency_contact_phone || emp.emergency_phone
          } />
        </div>

        {/* Employment Information */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Employment Information</SectionTitle>
          <InfoRow label="Job Title"    value={emp.job_title || emp.position || emp.role} />
          <InfoRow label="Department"   value={emp.department_name || emp.department} />
          <InfoRow label="Employment Type" value={typeLabel[emp.employment_type] || emp.employment_type} />
          <InfoRow label="Status"       value={(emp.status || "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
            valueColor={ss.color} />
          <InfoRow label="Date Joined"  value={dateJoined
            ? dateJoined.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : null} />
          <InfoRow label="Employee No." value={emp.employee_number ? `#${emp.employee_number}` : null} />
          {emp.employment_type === "contract" && (
            <>
              <InfoRow label="Contract Start" value={emp.contract_start
                ? new Date(emp.contract_start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                : null} />
              <InfoRow label="Contract End"   value={(emp.contract_end || emp.contract_expiry)
                ? new Date(emp.contract_end || emp.contract_expiry).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                : null} />
            </>
          )}
        </div>

        {/* Payroll / Bank */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Payroll &amp; Bank</SectionTitle>
          {(emp.bank_name || emp.bank || emp.bank_account || emp.account_number || emp.net_salary || emp.basic_salary || emp.salary) ? (
            <>
              {(emp.bank_name || emp.bank) && <InfoRow label="Bank"         value={emp.bank_name || emp.bank} />}
              {(emp.bank_account || emp.account_number) && <InfoRow label="Account"      value={emp.bank_account || emp.account_number} />}
              {emp.basic_salary  && <InfoRow label="Basic Salary"  value={`${emp.currency || "$"}${Number(emp.basic_salary).toLocaleString()}`} />}
              {emp.allowances    && <InfoRow label="Allowances"    value={`${emp.currency || "$"}${Number(emp.allowances).toLocaleString()}`} />}
              {emp.deductions    && <InfoRow label="Deductions"    value={`${emp.currency || "$"}${Number(emp.deductions).toLocaleString()}`} />}
              {emp.net_salary    && <InfoRow label="Net Salary"    value={`${emp.currency || "$"}${Number(emp.net_salary).toLocaleString()}`} valueColor="#166534" />}
              {(emp.salary && !emp.basic_salary) && <InfoRow label="Salary"       value={`$${Number(emp.salary).toLocaleString()}`} />}
              {/* Months worked — derived from date_joined */}
              {monthsWorked !== null && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif",
                      fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Months in Service
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif" }}>
                      {monthsWorked}
                    </span>
                  </div>
                  <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, (monthsWorked / 120) * 100)}%`,
                      background: monthsWorked >= 60 ? "#16a34a" : monthsWorked >= 24 ? "#1557b0" : "#f59e0b",
                      borderRadius: 99,
                      transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4, fontFamily: "'DM Sans',sans-serif" }}>
                    {monthsWorked < 12 ? "< 1 year" : `${Math.floor(monthsWorked / 12)} year${Math.floor(monthsWorked / 12) !== 1 ? "s" : ""} of service`}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: "#cbd5e1", fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              padding: "16px 0", textAlign: "center" }}>No payroll information available</div>
          )}
        </div>
      </div>

      {/* Notes / bio — full width */}
      {(emp.notes || emp.bio || emp.remarks) && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
          <SectionTitle>Notes</SectionTitle>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7,
            fontFamily: "'DM Sans',sans-serif", marginTop: 12 }}>
            {emp.notes || emp.bio || emp.remarks}
          </div>
        </div>
      )}

      {/* Documents — CV + Education Certificate + any attachments */}
      {(() => {
        // Build document list from model fields: cv, highest_education_certificate, plus any attached docs array
        const apiBase = "http://127.0.0.1:8000";
        const docList = [];
        if (emp.cv) {
          const url = emp.cv.startsWith("http") ? emp.cv : `${apiBase}${emp.cv.startsWith("/") ? "" : "/media/"}${emp.cv}`;
          docList.push({ name: "Curriculum Vitae (CV)", url, type: "cv" });
        }
        if (emp.highest_education_certificate) {
          const url = emp.highest_education_certificate.startsWith("http")
            ? emp.highest_education_certificate
            : `${apiBase}${emp.highest_education_certificate.startsWith("/") ? "" : "/media/"}${emp.highest_education_certificate}`;
          docList.push({ name: "Education Certificate", url, type: "cert" });
        }
        // Also include any extra docs array if present
        const extraDocs = emp.documents || emp.files || emp.attachments || [];
        if (Array.isArray(extraDocs)) {
          extraDocs.forEach((doc, i) => {
            const name = doc.name || doc.file_name || doc.filename || doc.title || `Document ${i + 1}`;
            const url  = doc.url  || doc.file_url  || doc.file     || doc.path  || "#";
            docList.push({ name, url, uploaded_at: doc.uploaded_at });
          });
        }
        return (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "22px 28px" }}>
            <SectionTitle>Documents</SectionTitle>
            {docList.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", padding: "28px 0", gap: 10 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                  stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ fontSize: 13, color: "#cbd5e1", fontFamily: "'DM Sans',sans-serif" }}>
                  No documents uploaded
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {docList.map((doc, i) => {
                  const name = doc.name;
                  const url  = doc.url || "#";
                  const ext  = name.split(".").pop().toLowerCase();
                  const iconColor = ext === "pdf" ? "#dc2626" : ["doc","docx"].includes(ext) ? "#1557b0" : ["xls","xlsx"].includes(ext) ? "#16a34a" : doc.type === "cv" ? "#7c3aed" : doc.type === "cert" ? "#0891b2" : "#64748b";
                  return (
                    <div key={`doc-${i}`} style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "12px 16px",
                      background: "#fafbff", borderRadius: 10,
                      border: "1px solid #e2e8f0",
                    }}>
                      {/* File icon */}
                      <div style={{
                        width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                        background: "#eff6ff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                          stroke={iconColor} strokeWidth="1.8" strokeLinecap="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      {/* File name + type */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a",
                          fontFamily: "'DM Sans',sans-serif",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </div>
                        {doc.uploaded_at && (
                          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
                            {new Date(doc.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                        )}
                      </div>
                      {/* Download button */}
                      <a
                        href={url}
                        download={name}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "7px 14px",
                          background: "#1557b0", color: "#fff",
                          borderRadius: 8, fontSize: 12, fontWeight: 600,
                          fontFamily: "'DM Sans',sans-serif",
                          textDecoration: "none", flexShrink: 0,
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#0e3d82"}
                        onMouseLeave={e => e.currentTarget.style.background = "#1557b0"}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const { stats, employees, departments, loading, errors, fetchEmployeeDetail } = useHRPortal();

  // ── ALL hooks must come before any conditional return ──
  const [selectedEmp,     setSelectedEmp]     = useState(null);
  const [loadingDetail,   setLoadingDetail]   = useState(false);
  const [search,          setSearch]          = useState("");
  const [deptFilter,      setDeptFilter]      = useState("all");
  const [typeFilter,      setTypeFilter]      = useState("all");

  // ── Click handler: fetch FULL employee data from /employees/{id}/ ──────────
  const handleEmpClick = async (emp) => {
    setLoadingDetail(true);
    // Show a partial record immediately (list data) while full data loads
    setSelectedEmp(emp);
    const full = await fetchEmployeeDetail(emp.id);
    if (full) setSelectedEmp(full);
    setLoadingDetail(false);
  };

  const deptOptions = useMemo(() => {
    if (!departments) return [];
    return departments.map((d) => ({ value: String(d.id), label: d.name }));
  }, [departments]);

  const filtered = useMemo(() => {
    if (!employees) return [];
    return employees.filter((e) => {
      const q = search.toLowerCase();
      const fullName = [e.full_name, e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ");
      const matchSearch = !q ||
        fullName.toLowerCase().includes(q) ||
        (e.email      || "").toLowerCase().includes(q) ||
        (e.phone      || "").toLowerCase().includes(q) ||
        (e.phone_number || "").toLowerCase().includes(q) ||
        (e.job_title  || "").toLowerCase().includes(q);
      const matchDept = deptFilter === "all" ||
        String(e.department) === deptFilter ||
        (e.department_name || "").toLowerCase() === deptFilter.toLowerCase();
      const matchType = typeFilter === "all" || e.employment_type === typeFilter;
      return matchSearch && matchDept && matchType;
    });
  }, [employees, search, deptFilter, typeFilter]);

  const typeLabel   = { full_time: "Full-Time", part_time: "Part-Time", contract: "Contract" };
  const statusStyle = {
    employed:   { bg: "#dcfce7", color: "#166534" },
    terminated: { bg: "#fee2e2", color: "#991b1b" },
    on_leave:   { bg: "#fef9c3", color: "#854d0e" },
    dismissed:  { bg: "#fee2e2", color: "#991b1b" },
    resigned:   { bg: "#fef9c3", color: "#854d0e" },
    suspended:  { bg: "#fce7f3", color: "#9d174d" },
  };

  const allLoading = loading.employees || loading.departments || loading.attendance;

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const getFullName = (emp) => {
    if (emp.full_name) return emp.full_name;
    return [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
  };

  const getPhone = (emp) => emp.phone || emp.phone_number || "";

  // Show employee detail view inline (replaces dashboard)
  if (selectedEmp) {
    return <EmployeeDetailView emp={selectedEmp} loadingDetail={loadingDetail} onBack={() => setSelectedEmp(null)} />;
  }

  if (allLoading && !stats) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: 300, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", fontSize: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e8edf8",
            borderTopColor: "#1557b0", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
          Loading dashboard…
        </div>
      </div>
    );
  }

  if (errors.employees || errors.departments) {
    return (
      <div style={{ color: "#dc2626", padding: 32, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
        Failed to load data. Please refresh the page.
      </div>
    );
  }

  const s = stats || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0a2a5e",
            fontFamily: "'Playfair Display',serif" }}>Dashboard</h1>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3,
            fontFamily: "'DM Sans',sans-serif" }}>{today}</div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 10, padding: "8px 14px",
          fontSize: 12, color: "#1557b0", fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399" }} />
          Live Data
        </div>
      </div>

      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <StatCard
          label="Total Workers"
          value={s.total ?? "–"}
          sub={`${s.employed ?? 0} currently employed`}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <StatCard
          label="Departments"
          value={s.totalDepts ?? departments?.length ?? "–"}
          sub="Active departments"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              <line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" />
            </svg>
          }
        />
        <StatCard
          label="Present Today"
          value={s.presentToday ?? "–"}
          sub="Marked by HODs"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        />
        <StatCard
          label="Absent Today"
          value={s.absentToday ?? "–"}
          sub="Marked absent"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          }
        />
      </div>

      {/* Employee Table */}
      <Card title="All Employees" style={{ padding: "22px 0" }}>
        {/* Filters row */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap",
          padding: "0 24px", marginBottom: 16, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email, phone or job…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "9px 12px 9px 30px",
                border: "1.5px solid #e2e8f0", borderRadius: 9,
                fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155",
                outline: "none", background: "#fafbff",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
              onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {/* Department filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{
              padding: "9px 14px", border: "1.5px solid #e2e8f0",
              borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              color: "#334155", background: "#fafbff", outline: "none",
              cursor: "pointer", flex: "0 1 170px",
            }}
          >
            <option value="all">All Departments</option>
            {deptOptions.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>

          {/* Employment type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: "9px 14px", border: "1.5px solid #e2e8f0",
              borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              color: "#334155", background: "#fafbff", outline: "none",
              cursor: "pointer", flex: "0 1 150px",
            }}
          >
            <option value="all">All Types</option>
            <option value="full_time">Full-Time</option>
            <option value="part_time">Part-Time</option>
            <option value="contract">Contract</option>
          </select>

          {/* Result count */}
          <div style={{ display: "flex", alignItems: "center",
            fontSize: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif",
            whiteSpace: "nowrap", padding: "0 4px" }}>
            {filtered.length} of {employees?.length ?? 0} employees
          </div>
        </div>

        {/* Hint */}
        <div style={{ padding: "0 24px", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif",
            display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Click any row to view full employee details
          </span>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse",
            fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafbff", borderBottom: "1.5px solid #e2e8f0" }}>
                {["Employee", "Contact", "Gender", "Job Title", "Dept", "Type", "Status"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left",
                    fontSize: 10.5, fontWeight: 700, color: "#64748b",
                    letterSpacing: "0.8px", textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!employees ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px 16px", textAlign: "center", color: "#94a3b8" }}>
                    Loading employees…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px 16px", textAlign: "center", color: "#94a3b8" }}>
                    No employees match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((emp, i) => {
                  const ss = statusStyle[emp.status] || { bg: "#f1f5f9", color: "#475569" };
                  const fullName = getFullName(emp);
                  const phone    = getPhone(emp);

                  return (
                    <tr
                      key={`emp-${emp.id}-${i}`}
                      onClick={() => handleEmpClick(emp)}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: i % 2 === 0 ? "#fff" : "#fafcff",
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"}
                      onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafcff"}
                    >
                      {/* Employee (photo + name + number) */}
                      <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <EmployeeAvatar emp={emp} size={36} />
                          <div>
                            <div style={{ fontWeight: 600, color: "#0a2a5e", fontSize: 13 }}>
                              {fullName}
                            </div>
                            {emp.employee_number && (
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>#{emp.employee_number}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact: email + phone stacked */}
                      <td style={{ padding: "11px 16px", minWidth: 170 }}>
                        {emp.email ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5,
                            fontSize: 12, color: "#1557b0", marginBottom: phone ? 4 : 0 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                            {emp.email}
                          </div>
                        ) : null}
                        {phone ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#334155" }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="2" strokeLinecap="round">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.44 2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16.92z" />
                            </svg>
                            {phone}
                          </div>
                        ) : null}
                        {!emp.email && !phone && <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>

                      {/* Gender */}
                      <td style={{ padding: "11px 16px", color: "#475569", fontSize: 12 }}>
                        {{ M: "Male", F: "Female", O: "Other" }[emp.gender] || emp.gender || "—"}
                      </td>

                      {/* Job */}
                      <td style={{ padding: "11px 16px", color: "#334155", fontWeight: 500, fontSize: 12 }}>
                        {emp.job_title || emp.position || "—"}
                      </td>

                      {/* Department */}
                      <td style={{ padding: "11px 16px", color: "#475569", fontSize: 12 }}>
                        {emp.department_name || "—"}
                      </td>

                      {/* Employment type */}
                      <td style={{ padding: "11px 16px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 20,
                          padding: "3px 9px",
                          background: emp.employment_type === "full_time" ? "#eff6ff"
                            : emp.employment_type === "part_time" ? "#fffbeb" : "#f5f3ff",
                          color: emp.employment_type === "full_time" ? "#1557b0"
                            : emp.employment_type === "part_time" ? "#b45309" : "#7c3aed",
                        }}>
                          {typeLabel[emp.employment_type] || emp.employment_type || "—"}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: "11px 16px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 20,
                          padding: "3px 10px",
                          background: ss.bg, color: ss.color,
                        }}>
                          {(emp.status || "—").replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>

        {/* Gender donut */}
        <Card title="Gender Breakdown">
          <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <DonutChart
              size={136}
              label={s.total ?? 0}
              sublabel="TOTAL"
              slices={[
                { value: s.male   || 0, color: COLORS.genderMale   },
                { value: s.female || 0, color: COLORS.genderFemale  },
                { value: s.other  || 0, color: COLORS.genderOther   },
              ]}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Male",   value: s.male   || 0, color: COLORS.genderMale   },
                { label: "Female", value: s.female || 0, color: COLORS.genderFemale  },
                { label: "Other",  value: s.other  || 0, color: COLORS.genderOther   },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: row.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0a2a5e",
                    fontFamily: "'Playfair Display',serif", marginLeft: "auto", paddingLeft: 12 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Employment type donut */}
        <Card title="Employment Type">
          <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <DonutChart
              size={136}
              label={s.employed ?? 0}
              sublabel="EMPLOYED"
              slices={[
                { value: s.fullTime || 0, color: COLORS.fullTime },
                { value: s.partTime || 0, color: COLORS.partTime },
                { value: s.contract || 0, color: COLORS.contract },
              ]}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Full-Time", value: s.fullTime || 0, color: COLORS.fullTime },
                { label: "Part-Time", value: s.partTime || 0, color: COLORS.partTime },
                { label: "Contract",  value: s.contract || 0, color: COLORS.contract  },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: row.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0a2a5e",
                    fontFamily: "'Playfair Display',serif", marginLeft: "auto", paddingLeft: 12 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Today attendance donut */}
        <Card title="Today's Attendance">
          <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <DonutChart
              size={136}
              label={s.presentToday ?? 0}
              sublabel="PRESENT"
              slices={[
                { value: s.presentToday  || 0, color: COLORS.present   },
                { value: s.absentToday   || 0, color: COLORS.absent    },
                { value: s.notMarkedToday >= 0 ? s.notMarkedToday : 0, color: COLORS.notMarked },
              ]}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Present",    value: s.presentToday   || 0, color: COLORS.present   },
                { label: "Absent",     value: s.absentToday    || 0, color: COLORS.absent    },
                { label: "Not Marked", value: s.notMarkedToday >= 0 ? s.notMarkedToday : 0, color: COLORS.notMarked },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: row.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0a2a5e",
                    fontFamily: "'Playfair Display',serif", marginLeft: "auto", paddingLeft: 12 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Second charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

        <Card title="Employees by Department">
          {s.byDept && s.byDept.length > 0 ? (
            <>
              <BarChart data={s.byDept} height={120} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 14 }}>
                {s.byDept.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 3,
                      background: COLORS.deptPalette[i % COLORS.deptPalette.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
                      {d.name}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", color: "#cbd5e1", padding: 30,
              fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>No data yet</div>
          )}
        </Card>

        <Card title="Monthly New Joiners (Last 6 Months)">
          {s.monthlyJoins && s.monthlyJoins.length >= 2 ? (
            <>
              <LineChart data={s.monthlyJoins} height={130} />
              <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8",
                fontFamily: "'DM Sans',sans-serif", textAlign: "right" }}>
                Total: {s.monthlyJoins.reduce((acc, m) => acc + m.count, 0)} joiners in period
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", color: "#cbd5e1", padding: 30,
              fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>No joining data available</div>
          )}
        </Card>
      </div>

    </div>
  );
}

// ── Profile Page ──────────────────────────────────────────────────────────────
function ProfilePage({ user, initials, isHRM, onEdit, onPassword }) {
  const roleBadge = isHRM ? "HR Manager" : "HR Officer";
  return (
    <>
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "28px 32px", marginBottom: 18, maxWidth: 680 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
          <div style={{
            width: 76, height: 76, borderRadius: 18, flexShrink: 0,
            background: "linear-gradient(135deg, #0e3d82, #1a6fd4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: 1,
          }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
              {user?.full_name || user?.username || "—"}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
              {roleBadge} &nbsp;·&nbsp; {user?.email || "—"}
            </div>
          </div>
          <button
            onClick={onEdit}
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#0a2a5e,#1557b0)", color: "#fff",
              fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600,
              transition: "opacity 0.18s, transform 0.15s", display: "inline-flex", alignItems: "center", gap: 7 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Profile
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {[
            ["Username",   user?.username || "—"],
            ["Email",      user?.email    || "—"],
            ["Role",       roleBadge],
            ["Department", user?.department || "All Departments"],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#94a3b8", marginBottom: 4, fontFamily: "'DM Sans',sans-serif" }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#0f172a", fontFamily: "'DM Sans',sans-serif" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 680 }}>
        <div
          onClick={onEdit}
          style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
            transition: "box-shadow 0.2s, border-color 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(21,87,176,0.1)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ width: 46, height: 46, borderRadius: 12, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", fontFamily: "'DM Sans',sans-serif" }}>Edit Profile</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>Update your name and email</div>
          </div>
        </div>
        <div
          onClick={onPassword}
          style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
            transition: "box-shadow 0.2s, border-color 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(21,87,176,0.1)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ width: 46, height: 46, borderRadius: 12, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", fontFamily: "'DM Sans',sans-serif" }}>Change Password</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>Update your login password</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 480 }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(10,30,80,0.5)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn 0.18s ease" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:"#fff",borderRadius:18,width:"100%",maxWidth,boxShadow:"0 24px 64px rgba(0,0,0,0.18)",animation:"slideUp 0.25s cubic-bezier(0.22,1,0.36,1) both",overflow:"hidden" }}>
        <div style={{ background:"linear-gradient(135deg,#0a2a5e,#1557b0)",padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <span style={{ fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"#fff" }}>{title}</span>
          <button onClick={onClose} style={{ width:30,height:30,background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff",transition:"background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  );
}

const fInput = { width:"100%",padding:"11px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,fontFamily:"'DM Sans',sans-serif",color:"#0f172a",background:"#fafbff",outline:"none",transition:"border-color 0.2s,box-shadow 0.2s",boxSizing:"border-box" };
const fLabel = { display:"block",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",color:"#94a3b8",marginBottom:7,fontFamily:"'DM Sans',sans-serif" };

// ── Edit Profile Modal ────────────────────────────────────────────────────────
function EditProfileModal({ user, onClose, showToast }) {
  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    email:     user?.email    || "",
    username:  user?.username || "",
  });
  const [busy, setBusy] = useState(false);
  const API = "http://127.0.0.1:8000/api";

  const save = async () => {
    if (!form.full_name || !form.email || !form.username) { showToast("Name, username and email are required.", "err"); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`${API}/auth/admins/${user.id}/`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      localStorage.setItem("user", JSON.stringify({ ...user, ...updated }));
      showToast("Profile updated successfully."); onClose();
    } catch { showToast("Failed to update profile.", "err"); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Edit Profile" onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <label style={fLabel}>Full Name</label>
        <input style={fInput} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
          onFocus={e => { e.target.style.borderColor="#1557b0"; e.target.style.boxShadow="0 0 0 3px rgba(21,87,176,0.1)"; }}
          onBlur={e => { e.target.style.borderColor="#e2e8f0"; e.target.style.boxShadow="none"; }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={fLabel}>Username</label>
        <input style={fInput} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
          onFocus={e => { e.target.style.borderColor="#1557b0"; e.target.style.boxShadow="0 0 0 3px rgba(21,87,176,0.1)"; }}
          onBlur={e => { e.target.style.borderColor="#e2e8f0"; e.target.style.boxShadow="none"; }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={fLabel}>Email Address</label>
        <input style={fInput} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
          onFocus={e => { e.target.style.borderColor="#1557b0"; e.target.style.boxShadow="0 0 0 3px rgba(21,87,176,0.1)"; }}
          onBlur={e => { e.target.style.borderColor="#e2e8f0"; e.target.style.boxShadow="none"; }} />
      </div>
      <div style={{ display:"flex",justifyContent:"flex-end",gap:10,marginTop:22 }}>
        <button onClick={onClose} style={{ padding:"10px 22px",borderRadius:10,border:"1px solid #e2e8f0",background:"#f1f5f9",color:"#0f172a",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:"pointer" }}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ padding:"10px 22px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#0a2a5e,#1557b0)",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:busy?"not-allowed":"pointer",opacity:busy?0.5:1 }}>{busy ? "Saving…" : "Save Changes"}</button>
      </div>
    </Modal>
  );
}

// ── Password field — defined OUTSIDE modal to prevent remount on each render ──
function PwField({ field, label, sk, form, setForm, show, setShow }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={fLabel}>{label}</label>
      <div style={{ position: "relative" }}>
        <input style={{ ...fInput, paddingRight: 42 }} type={show[sk] ? "text" : "password"}
          value={form[field]} onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
          onFocus={e => { e.target.style.borderColor="#1557b0"; e.target.style.boxShadow="0 0 0 3px rgba(21,87,176,0.1)"; }}
          onBlur={e => { e.target.style.borderColor="#e2e8f0"; e.target.style.boxShadow="none"; }} />
        <button type="button" onClick={() => setShow(prev => ({ ...prev, [sk]: !prev[sk] }))}
          style={{ position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",display:"flex",alignItems:"center",padding:2 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {show[sk]
              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
            }
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose, showToast, onSuccess }) {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [show, setShow] = useState({ c: false, n: false, cf: false });
  const [busy, setBusy] = useState(false);
  const API = "http://127.0.0.1:8000/api";

  const save = async () => {
    if (!form.current_password || !form.new_password || !form.confirm_password) { showToast("All fields required.", "err"); return; }
    if (form.new_password !== form.confirm_password) { showToast("Passwords do not match.", "err"); return; }
    if (form.new_password.length < 8) { showToast("Minimum 8 characters.", "err"); return; }
    setBusy(true);
    try {
      // Use plain fetch — NOT apiFetch — so a wrong-password 401 never
      // triggers the auto-logout/token-refresh flow in apiFetch.
      const token = localStorage.getItem("access_token") || "";
      const res = await fetch(`${API}/auth/me/change-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || "Incorrect current password.", "err"); return; }
      showToast("Password changed! Signing you out…");
      onSuccess?.();
      setTimeout(() => { localStorage.clear(); sessionStorage.clear(); window.location.href = "/"; }, 1800);
      onClose();
    } catch { showToast("Server error. Please try again.", "err"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Change Password" onClose={onClose}>
      <PwField field="current_password"  label="Current Password"     sk="c"  form={form} setForm={setForm} show={show} setShow={setShow} />
      <PwField field="new_password"      label="New Password"         sk="n"  form={form} setForm={setForm} show={show} setShow={setShow} />
      <PwField field="confirm_password"  label="Confirm New Password" sk="cf" form={form} setForm={setForm} show={show} setShow={setShow} />
      <div style={{ display:"flex",justifyContent:"flex-end",gap:10,marginTop:22 }}>
        <button onClick={onClose} style={{ padding:"10px 22px",borderRadius:10,border:"1px solid #e2e8f0",background:"#f1f5f9",color:"#0f172a",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:"pointer" }}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ padding:"10px 22px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#0a2a5e,#1557b0)",color:"#fff",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:busy?"not-allowed":"pointer",opacity:busy?0.5:1 }}>{busy ? "Updating…" : "Update Password"}</button>
      </div>
    </Modal>
  );
}

// ── Placeholder pages ─────────────────────────────────────────────────────────
function PlaceholderPage({ name, icon }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: 360,
      color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", gap: 16,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 18,
        background: "#eff6ff", display: "flex", alignItems: "center",
        justifyContent: "center", color: "#1557b0", marginBottom: 8,
      }}>
        {icon}
      </div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: "#0f172a", margin: 0 }}>{name}</h2>
      <p style={{ fontSize: 14, maxWidth: 320, lineHeight: 1.65, textAlign: "center", margin: 0 }}>
        This section is under construction.
      </p>
    </div>
  );
}

// ── Inner portal (has access to context) ─────────────────────────────────────
function HRPortalInner() {
  const { user, isHRM } = useHRPortal();
  const [page,       setPage]       = useState("dashboard");
  const [sideOpen,   setSideOpen]   = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast,      setToast]      = useState(null);
  const [modal,      setModal]      = useState(null); // "profile" | "password"

  // First-login forced password change (mirrors DeptPortal pattern)
  const needsPwChange = localStorage.getItem("dp_must_change_pw") === "true";
  const [showFirstLoginModal, setShowFirstLoginModal] = useState(needsPwChange);
  const [mustChangePw,        setMustChangePw]        = useState(needsPwChange);

  useEffect(() => startInactivityTimer(), []);

  const showToast = (msg, type = "ok") => setToast({ msg, type });

  const initials = ((user?.full_name || user?.username || "HR")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase());

  const renderPage = () => {
    switch (page) {
      case "dashboard":  return <Dashboard />;
      case "admins":     return (
        <PlaceholderPage name="Admin Management" icon={
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        } />
      );
      case "employees":  return (
        <PlaceholderPage name="Employees" icon={
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        } />
      );
      case "attendance": return (
        <PlaceholderPage name="Attendance" icon={
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <polyline points="9 16 11 18 15 14" />
          </svg>
        } />
      );
      case "payroll":    return (
        <PlaceholderPage name="Payroll" icon={
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
            <line x1="6" y1="15" x2="10" y2="15" />
          </svg>
        } />
      );
      case "profile":    return (
        <ProfilePage
          user={user} initials={initials} isHRM={isHRM}
          onEdit={() => setModal("profile")}
          onPassword={() => setModal("password")}
        />
      );
      default: return <Dashboard />;
    }
  };

  const sideWidth = sideOpen ? 220 : 64;

  return (
    <>
      {/* Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 16px; }
        body { font-family: 'DM Sans', sans-serif; background: #f8faff; color: #0f172a; -webkit-font-smoothing: antialiased; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform:none; } }
        @keyframes fadeDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        @keyframes slideInRight { from { opacity:0; transform: translateX(40px); } to { opacity:1; transform:none; } }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        select, input { font-family: 'DM Sans', sans-serif; }

        /* Mobile overlay */
        .hr-sidebar-overlay {
          display: none;
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.4); z-index: 199;
        }

        @media (max-width: 1100px) {
          .hr-stats-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 900px) {
          .hr-charts-3 { grid-template-columns: 1fr !important; }
          .hr-charts-2 { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .hr-sidebar-overlay { display: block; }
          .hr-sidebar-overlay.hidden { display: none; }
          .hr-sidebar-mobile { transform: translateX(-100%) !important; width: 220px !important; }
          .hr-sidebar-mobile.open { transform: translateX(0) !important; }
          .hr-main-mobile { margin-left: 0 !important; }
          .hr-page-pad { padding: 14px !important; }
          .hr-topbar-pad { padding: 0 14px !important; }
        }
        @media (max-width: 600px) {
          .hr-stats-grid { grid-template-columns: 1fr !important; }
          .hr-table-th-hide { display: none !important; }
          .hr-table-td-hide { display: none !important; }
        }
      `}</style>

      {/* Mobile overlay */}
      <div
        className={`hr-sidebar-overlay${mobileOpen ? "" : " hidden"}`}
        onClick={() => setMobileOpen(false)}
      />

      <div style={{ display: "flex", minHeight: "100vh", background: "#f8faff" }}>

        {/* ── SIDEBAR ── */}
        <div
          className={`hr-sidebar-mobile${mobileOpen ? " open" : ""}`}
          style={{ flexShrink: 0 }}
        >
          <Sidebar
            page={page} setPage={setPage}
            sideOpen={sideOpen} user={user} isHRM={isHRM}
            mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
          />
        </div>

        {/* ── MAIN ── */}
        <div
          className="hr-main-mobile"
          style={{
            flex: 1,
            marginLeft: sideWidth,
            display: "flex", flexDirection: "column",
            minHeight: "100vh",
            transition: "margin-left 0.28s cubic-bezier(.4,0,.2,1)",
            background: "#f8faff",
          }}
        >
          {/* Top bar */}
          <header
            className="hr-topbar-pad"
            style={{
              height: 64, background: "#fff",
              borderBottom: "1px solid #e2e8f0",
              display: "flex", alignItems: "center",
              padding: "0 24px", gap: 16, flexShrink: 0,
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              position: "sticky", top: 0, zIndex: 100,
            }}
          >
            {/* Toggle sidebar */}
            <button
              onClick={() => {
                if (window.innerWidth <= 768) {
                  setMobileOpen(v => !v);
                } else {
                  setSideOpen(v => !v);
                }
              }}
              style={{
                width: 36, height: 36,
                border: "1.5px solid #e2e8f0", borderRadius: 9,
                background: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#64748b",
                transition: "border-color 0.15s, color 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#1557b0"; e.currentTarget.style.color = "#1557b0"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#64748b"; }}
              title={sideOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", flex: 1 }}>
              <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: "#0a2a5e" }}>
                {NAV_ITEMS.find((n) => n.key === page)?.label || "Dashboard"}
              </span>
            </div>

            {/* Role chip + avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                color: isHRM ? "#1557b0" : "#0891b2",
                background: isHRM ? "#eff6ff" : "#f0f9ff",
                border: `1px solid ${isHRM ? "#bfdbfe" : "#bae6fd"}`,
                borderRadius: 20, padding: "4px 12px",
                fontFamily: "'DM Sans',sans-serif",
              }}>
                {isHRM ? "HR MANAGER" : "HR OFFICER"}
              </div>
              <TopbarMenu user={user} initials={initials} isHRM={isHRM}
                onProfile={() => setModal("profile")}
                onPassword={() => setModal("password")}
              />
            </div>
          </header>

          {/* Scrollable content */}
          <main
            className="hr-page-pad"
            style={{ flex: 1, padding: "24px 14px 28px 14px" }}
          >
            {/* First-login password change banner */}
            {mustChangePw && (
              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                background: "#fffbeb", border: "1px solid #f59e0b",
                borderLeft: "4px solid #f59e0b",
                borderRadius: 12, padding: "16px 20px", marginBottom: 22,
                flexWrap: "wrap",
              }}>
                <div style={{ fontSize: 26, flexShrink: 0 }}>🔐</div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", fontFamily: "'DM Sans',sans-serif", marginBottom: 3 }}>
                    Security Action Required
                  </div>
                  <div style={{ fontSize: 13, color: "#b45309", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5 }}>
                    You are logging in for the first time. Please change your password before proceeding.
                  </div>
                </div>
                <button
                  onClick={() => setModal("password")}
                  style={{
                    padding: "9px 18px", borderRadius: 9, border: "none",
                    background: "linear-gradient(135deg,#d97706,#f59e0b)",
                    color: "#fff", fontFamily: "'DM Sans',sans-serif",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    flexShrink: 0, whiteSpace: "nowrap",
                  }}
                >
                  Change Password Now
                </button>
              </div>
            )}
            {renderPage()}
          </main>
        </div>
      </div>

      {toast && (
        <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}

      {/* First-login forced password change popup */}
      {showFirstLoginModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(10,30,80,0.55)",
          zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "#fff", borderRadius: 18, width: "100%", maxWidth: 440,
            boxShadow: "0 24px 64px rgba(0,0,0,0.18)", overflow: "hidden",
            animation: "slideUp 0.25s cubic-bezier(0.22,1,0.36,1) both",
          }}>
            <div style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)", padding: "18px 22px" }}>
              <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>
                🔐 Password Change Required
              </span>
            </div>
            <div style={{ padding: 28, textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16, background: "#fff7ed",
                border: "2px solid #f59e0b", display: "flex", alignItems: "center",
                justifyContent: "center", margin: "0 auto 18px", fontSize: 28,
              }}>🔑</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 10, fontFamily: "'Playfair Display',serif" }}>
                Welcome! Please change your password
              </div>
              <div style={{ fontSize: 13.5, color: "#64748b", lineHeight: 1.65, maxWidth: 340, margin: "0 auto 24px" }}>
                For your account's security, please change your default password before continuing.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => setShowFirstLoginModal(false)}
                  style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#0f172a", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
                >
                  Do It Later
                </button>
                <button
                  onClick={() => { setShowFirstLoginModal(false); setModal("password"); }}
                  style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#d97706,#f59e0b)", color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Change Password Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === "profile"  && (
        <EditProfileModal user={user} onClose={() => setModal(null)} showToast={showToast} />
      )}
      {modal === "password" && (
        <ChangePasswordModal
          onClose={() => setModal(null)}
          showToast={showToast}
          onSuccess={() => {
            localStorage.removeItem("dp_must_change_pw");
            setMustChangePw(false);
          }}
        />
      )}
    </>
  );
}

// ── Default export ─────────────────────────────────────────────────────────────
export default function HRPortal() {
  return (
    <HRPortalProvider>
      <HRPortalInner />
    </HRPortalProvider>
  );
}