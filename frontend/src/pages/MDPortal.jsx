// src/pages/MDPortal.jsx
//
// Managing Director Dashboard — read-only view of the entire organisation.
// Nav: Dashboard | Attendance (placeholder) | Payroll (placeholder) | Profile
// Mobile-first design: collapses sidebar to a hamburger on small screens.

import { useState, useEffect, useMemo, useRef } from "react";
import { MDPortalProvider, useMDPortal } from "../context/MDPortalContext";
import AttendancePage from "../components/MDPortal/AttendancePage";
import PayrollPage from "../components/MDPortal/PayrollPage";
import {
  performLogout, startInactivityTimer, startTokenRefreshTimer, apiFetch,
} from "../utils/auth";
import { useSearchParams } from "react-router-dom";

const API_BASE = "${import.meta.env.VITE_API_BASE_URL}";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  primary:      "#0a2a5e",
  mid:          "#1557b0",
  light:        "#1a6fd4",
  accent:       "#7fb3e8",
  bg:           "#f8faff",
  card:         "#ffffff",
  border:       "#e2e8f0",
  text:         "#0f172a",
  muted:        "#64748b",
  dim:          "#94a3b8",
  male:         "#0e3d82",
  female:       "#1a6fd4",
  other:        "#7fb3e8",
  fullTime:     "#0e3d82",
  partTime:     "#f59e0b",
  contract:     "#6366f1",
  present:      "#16a34a",
  absent:       "#dc2626",
  notMarked:    "#94a3b8",
  deptPalette:  ["#0d9488","#0891b2","#7c3aed","#db2777","#ea580c","#65a30d","#ca8a04","#475569"],
};

// ─── SVG Charts ───────────────────────────────────────────────────────────────
function DonutChart({ slices, size = 144, label, sublabel }) {
  const r = 52, cx = 72, cy = 72, circ = 2 * Math.PI * r;
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  let offset  = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 144 144">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f4ff" strokeWidth="20" />
      {slices.map((d, i) => {
        const dash = (d.value / total) * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={d.color} strokeWidth="20"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            style={{ transition: "stroke-dasharray 0.7s ease" }}
          />
        );
        offset += dash;
        return el;
      })}
      <circle cx={cx} cy={cy} r={40} fill="white" />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={C.primary}
        fontSize="20" fontWeight="700" fontFamily="'Playfair Display',serif">{label}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill={C.dim}
        fontSize="9" fontFamily="'DM Sans',sans-serif" letterSpacing="1">{sublabel}</text>
    </svg>
  );
}

function BarChart({ data, height = 120 }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const w   = 460;
  const barW = Math.min(38, Math.floor((w - 20) / data.length) - 8);
  const gap  = (w - data.length * barW) / (data.length + 1);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height + 40}`} style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const bh = Math.max((d.count / max) * height, 3);
        const x  = gap + i * (barW + gap);
        const y  = height - bh;
        return (
          <g key={i}>
            <rect x={x} y={height} width={barW} height={0} rx="5"
              fill={C.deptPalette[i % C.deptPalette.length]}>
              <animate attributeName="height" from="0" to={bh} dur="0.55s" begin={`${i * 0.07}s`} fill="freeze" />
              <animate attributeName="y" from={height} to={y} dur="0.55s" begin={`${i * 0.07}s`} fill="freeze" />
            </rect>
            <text x={x + barW / 2} y={height + 18} textAnchor="middle" fill={C.muted} fontSize="9" fontFamily="'DM Sans',sans-serif">
              {d.name.length > 7 ? d.name.slice(0, 7) + "…" : d.name}
            </text>
            <text x={x + barW / 2} y={y - 5} textAnchor="middle" fill={C.primary} fontSize="10" fontWeight="600" fontFamily="'DM Sans',sans-serif">
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
  const max = Math.max(...data.map(d => d.count), 1);
  const w   = 460, padL = 30, padB = 28, padT = 16;
  const iw  = w - padL - 10;
  const ih  = height - padT - padB;
  const px  = i => padL + (i / (data.length - 1)) * iw;
  const py  = v => padT + ih - (v / max) * ih;
  const pts = data.map((d, i) => `${px(i)},${py(d.count)}`).join(" ");
  const area = `M ${px(0)},${py(0)} ` +
    data.map((d, i) => `L ${px(i)},${py(d.count)}`).join(" ") +
    ` L ${px(data.length - 1)},${py(0)} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} style={{ overflow: "visible" }}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={padL} x2={w - 10}
          y1={padT + ih - f * ih} y2={padT + ih - f * ih}
          stroke="#f1f5f9" strokeWidth="1" />
      ))}
      <defs>
        <linearGradient id="mdLineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={C.mid} stopOpacity="0.18" />
          <stop offset="100%" stopColor={C.mid} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mdLineGrad)" />
      <polyline points={pts} fill="none" stroke={C.mid} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={px(i)} cy={py(d.count)} r="4"
          fill="white" stroke={C.mid} strokeWidth="2.5" />
      ))}
      {data.map((d, i) => (
        <text key={`l${i}`} x={px(i)} y={height - 4} textAnchor="middle"
          fill={C.muted} fontSize="9" fontFamily="'DM Sans',sans-serif">{d.label}</text>
      ))}
    </svg>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  const ok = type !== "err";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 20, zIndex: 9999,
      display: "flex", alignItems: "center", gap: 10,
      background: "#fff", borderRadius: 12, padding: "12px 18px",
      border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`,
      borderLeft: `4px solid ${ok ? "#16a34a" : "#dc2626"}`,
      color: ok ? "#166534" : "#991b1b",
      boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      fontSize: 13, fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
      animation: "slideUp 0.3s ease", maxWidth: 340,
    }}>
      {ok
        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      }
      <span>{msg}</span>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub }) {
  return (
    <div style={{
      background: C.card, borderRadius: 14,
      border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.mid}`,
      padding: "18px 20px",
      display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      flex: "1 1 160px", minWidth: 0,
      transition: "box-shadow 0.2s, transform 0.2s",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(21,87,176,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: "#eff6ff",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: C.dim, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2, fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.primary, lineHeight: 1, fontFamily: "'Playfair Display',serif" }}>{value}</div>
        {sub && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ title, children, style = {} }) {
  return (
    <div style={{
      background: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
      boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "20px 22px",
      ...style,
    }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.primary,
          letterSpacing: "1.2px", textTransform: "uppercase",
          marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}`,
          fontFamily: "'DM Sans',sans-serif",
        }}>{title}</div>
      )}
      {children}
    </div>
  );
}

// ─── Legend row (shared by charts) ────────────────────────────────────────────
function LegendRow({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {items.map(row => (
        <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 9, height: 9, borderRadius: 3, background: row.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>{row.label}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.primary, fontFamily: "'Playfair Display',serif", marginLeft: "auto", paddingLeft: 12 }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Employee Avatar ───────────────────────────────────────────────────────────
function Avatar({ emp, size = 36 }) {
  const [failed, setFailed] = useState(false);
  const name    = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "?";
  const letters = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  const src     = emp.profile_picture || emp.photo || emp.avatar;
  const br      = Math.round(size * 0.25);
  return (
    <div style={{
      width: size, height: size, borderRadius: br, overflow: "hidden", flexShrink: 0,
      background: "linear-gradient(135deg,#0e3d82,#1a6fd4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.34), fontWeight: 700, color: "#fff",
      border: `1.5px solid ${C.border}`,
    }}>
      {src && !failed
        ? <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailed(true)} />
        : <span style={{ fontFamily: "'DM Sans',sans-serif" }}>{letters}</span>
      }
    </div>
  );
}

// ─── Contract progress bar ─────────────────────────────────────────────────────
function ContractBar({ start, end }) {
  if (!start || !end) return null;
  const s = new Date(start), e = new Date(end), now = new Date();
  const total = e - s; if (total <= 0) return null;
  const pct       = Math.min(100, Math.max(0, ((now - s) / total) * 100));
  const remPct    = 100 - pct;
  const remMs     = e - now;
  const remMonths = Math.max(0, Math.ceil(remMs / (1000 * 60 * 60 * 24 * 30.44)));
  const barColor  = remPct > 50 ? "#16a34a" : remPct > 20 ? "#f59e0b" : "#dc2626";
  const bgColor   = remPct > 50 ? "#dcfce7"  : remPct > 20 ? "#fef9c3"  : "#fee2e2";
  const txtColor  = remPct > 50 ? "#166534"  : remPct > 20 ? "#854d0e"  : "#991b1b";
  const label     = remMs <= 0 ? "Expired" : `${remMonths} month${remMonths !== 1 ? "s" : ""} left`;
  const fmtDate   = d => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>Contract Progress</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: txtColor, background: bgColor, borderRadius: 20, padding: "2px 8px", fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
      </div>
      <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99, transition: "width 0.8s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 10, color: C.dim, fontFamily: "'DM Sans',sans-serif" }}>{fmtDate(start)}</span>
        <span style={{ fontSize: 10, color: C.dim, fontFamily: "'DM Sans',sans-serif" }}>{fmtDate(end)}</span>
      </div>
    </div>
  );
}

// ─── Employee Detail Drawer ────────────────────────────────────────────────────
function EmployeeDrawer({ emp, onClose }) {
  const panelRef = useRef();
  useEffect(() => {
    const fn = e => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose(); };
    const t  = setTimeout(() => document.addEventListener("mousedown", fn), 60);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", fn); };
  }, [onClose]);

  if (!emp) return null;

  const fullName = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
  const phone    = emp.phone || emp.phone_number || "";
  const letters  = fullName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  const src      = emp.profile_picture || emp.photo || emp.avatar;

  const statusStyle = {
    employed:  { bg: "#dcfce7", color: "#166534" },
    terminated:{ bg: "#fee2e2", color: "#991b1b" },
    on_leave:  { bg: "#fef9c3", color: "#854d0e" },
    dismissed: { bg: "#fee2e2", color: "#991b1b" },
    resigned:  { bg: "#fef9c3", color: "#854d0e" },
    suspended: { bg: "#fce7f3", color: "#9d174d" },
  };
  const ss = statusStyle[emp.status] || { bg: "#f1f5f9", color: "#475569" };
  const typeLabel = { full_time: "Full-Time", part_time: "Part-Time", contract: "Contract" };

  const dateJoined = emp.date_joined ? new Date(emp.date_joined) : null;
  const now        = new Date();
  let tenureStr    = "—";
  if (dateJoined) {
    const totalM  = (now.getFullYear() - dateJoined.getFullYear()) * 12 + (now.getMonth() - dateJoined.getMonth());
    const years   = Math.floor(totalM / 12);
    const months  = totalM % 12;
    tenureStr = years > 0 ? `${years}y ${months}m` : `${months} month${months !== 1 ? "s" : ""}`;
  }

  const Row = ({ label, value, vc }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid #f1f5f9`, gap: 12 }}>
      <span style={{ fontSize: 11, color: C.dim, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontSize: 12.5, color: vc || C.text, fontFamily: "'DM Sans',sans-serif", fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>{value || "—"}</span>
    </div>
  );

  const Sec = ({ t }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, letterSpacing: "1px", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", margin: "14px 0 4px" }}>{t}</div>
  );

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(10,42,94,0.18)", zIndex: 400, backdropFilter: "blur(2px)" }} />
      <div ref={panelRef} style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 400, maxWidth: "95vw",
        background: "#fff", boxShadow: "-8px 0 48px rgba(0,0,0,0.14)",
        zIndex: 500, display: "flex", flexDirection: "column",
        animation: "slideInRight 0.28s cubic-bezier(.4,0,.2,1)",
        overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#0e3d82 0%,#1a6fd4 100%)", padding: "24px 20px", position: "relative", flexShrink: 0 }}>
          <button onClick={onClose} style={{
            position: "absolute", top: 14, right: 14,
            width: 30, height: 30, borderRadius: 8,
            background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16, overflow: "hidden", flexShrink: 0,
              border: "3px solid rgba(255,255,255,0.3)",
              background: "linear-gradient(135deg,rgba(255,255,255,0.25),rgba(255,255,255,0.1))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {src
                ? <img src={src} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; e.target.parentNode.innerHTML = `<span style="font-size:22px;font-weight:700;color:#fff;font-family:'DM Sans',sans-serif">${letters}</span>`; }} />
                : <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans',sans-serif" }}>{letters}</span>
              }
            </div>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{fullName}</div>
              {emp.employee_number && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>#{emp.employee_number}</div>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", background: ss.bg, color: ss.color, fontFamily: "'DM Sans',sans-serif" }}>
                  {(emp.status || "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, borderRadius: 20, padding: "3px 9px",
                  background: emp.employment_type === "full_time" ? "#eff6ff" : emp.employment_type === "part_time" ? "#fffbeb" : "#f5f3ff",
                  color: emp.employment_type === "full_time" ? C.mid : emp.employment_type === "part_time" ? "#b45309" : "#7c3aed",
                  fontFamily: "'DM Sans',sans-serif",
                }}>
                  {typeLabel[emp.employment_type] || emp.employment_type || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tenure strip */}
        <div style={{ background: "#fafbff", borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", gap: 20, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 9, color: C.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: "'DM Sans',sans-serif", marginBottom: 2 }}>Tenure</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.primary, fontFamily: "'Playfair Display',serif" }}>{tenureStr}</div>
          </div>
          {dateJoined && (
            <div>
              <div style={{ fontSize: 9, color: C.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: "'DM Sans',sans-serif", marginBottom: 2 }}>Date Joined</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", fontFamily: "'DM Sans',sans-serif" }}>
                {dateJoined.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "4px 20px 24px", overflowY: "auto" }}>
          {emp.employment_type === "contract" && (
            <div style={{ background: "#fafbff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, letterSpacing: "1px", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 8 }}>Contract Status</div>
              <ContractBar start={emp.contract_start || emp.date_joined} end={emp.contract_end || emp.contract_expiry} />
            </div>
          )}

          <Sec t="Personal" />
          <Row label="Full Name"     value={fullName} />
          <Row label="Gender"        value={{ M: "Male", F: "Female", O: "Other" }[emp.gender] || emp.gender} />
          <Row label="Date of Birth" value={emp.date_of_birth ? new Date(emp.date_of_birth).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null} />
          <Row label="National ID"   value={emp.national_id || emp.id_number} />
          <Row label="Address"       value={emp.address || emp.home_address} />

          <Sec t="Contact" />
          <Row label="Email"            value={emp.email} vc={C.mid} />
          <Row label="Phone"            value={phone} />
          <Row label="Alt Phone"        value={emp.alt_phone || emp.alternative_phone} />
          <Row label="Next of Kin"      value={emp.nok_full_name || emp.next_of_kin || emp.emergency_contact_name} />
          <Row label="Relationship"     value={emp.nok_relationship} />
          <Row label="NOK Phone"        value={emp.nok_phone || emp.emergency_contact_phone} />

          <Sec t="Employment" />
          <Row label="Job Title"    value={emp.job_title || emp.position} />
          <Row label="Department"   value={emp.department_name} />
          <Row label="Type"         value={typeLabel[emp.employment_type] || emp.employment_type} />
          <Row label="Status"       value={(emp.status || "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())} vc={ss.color} />
          <Row label="Employee No." value={emp.employee_number ? `#${emp.employee_number}` : null} />
          {emp.employment_type === "contract" && (
            <>
              <Row label="Contract Start" value={emp.contract_start ? new Date(emp.contract_start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null} />
              <Row label="Contract End"   value={(emp.contract_end || emp.contract_expiry) ? new Date(emp.contract_end || emp.contract_expiry).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null} />
            </>
          )}

          {(emp.bank_name || emp.bank_account || emp.basic_salary) && (
            <>
              <Sec t="Payroll" />
              {emp.bank_name    && <Row label="Bank"        value={emp.bank_name} />}
              {emp.bank_account && <Row label="Account"     value={emp.bank_account} />}
              {emp.basic_salary && <Row label="Basic Salary" value={`$${Number(emp.basic_salary).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} vc="#166534" />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Nav items ─────────────────────────────────────────────────────────────────
const NAV = [
  {
    key: "dashboard", label: "Dashboard",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  },
  {
    key: "attendance", label: "Attendance",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><polyline points="9 16 11 18 15 14" /></svg>,
  },
  {
    key: "payroll", label: "Payroll",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="6" y1="15" x2="10" y2="15" /></svg>,
  },
  {
    key: "profile", label: "My Profile",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  },
];

// ─── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, sideOpen, user, mobileOpen, setMobileOpen }) {
  const initials = ((user?.full_name || user?.username || "MD").split(" ").slice(0, 2).map(w => w[0]).join("")).toUpperCase();

  return (
    <aside className={`md-sidebar${mobileOpen ? " open" : ""}`} style={{
      width: sideOpen ? 220 : 64,
      position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200,
      background: "linear-gradient(180deg,#1a6fd4 0%,#1557b0 25%,#0e3d82 55%,#0a2a5e 100%)",
      display: "flex", flexDirection: "column",
      transition: "width 0.28s cubic-bezier(.4,0,.2,1), transform 0.28s cubic-bezier(.4,0,.2,1)",
      overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ padding: "0 14px", height: 64, display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.1)", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
          <img src="/logo.jpeg" alt="Logo" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8 }} onError={e => { e.target.style.display = "none"; }} />
        </div>
        {sideOpen && (
          <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 13.5, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>JECCA Engineering</div>
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.5)", letterSpacing: "1.8px", textTransform: "uppercase", marginTop: 1 }}>MD Portal</div>
          </div>
        )}
      </div>

      {/* User chip */}
      <div style={{
        margin: "14px 10px", padding: sideOpen ? "10px 11px" : "8px",
        background: "rgba(255,255,255,0.1)", borderRadius: 12,
        display: "flex", alignItems: "center", gap: sideOpen ? 10 : 0,
        justifyContent: sideOpen ? "flex-start" : "center", overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,rgba(255,255,255,0.3),rgba(255,255,255,0.15))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>{initials}</div>
        {sideOpen && (
          <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.full_name || user?.username || "MD"}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>Managing Director</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "6px 10px", overflowY: "auto", scrollbarWidth: "none" }}>
        {sideOpen && (
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", padding: "14px 8px 6px", fontFamily: "'DM Sans',sans-serif" }}>NAVIGATION</div>
        )}
        {NAV.map(item => {
          const active = page === item.key;
          return (
            <button key={item.key}
              onClick={() => { setPage(item.key); setMobileOpen && setMobileOpen(false); }}
              style={{
                display: "flex", alignItems: "center",
                gap: sideOpen ? 11 : 0, justifyContent: sideOpen ? "flex-start" : "center",
                width: "100%", padding: sideOpen ? "9px 10px" : "10px",
                marginBottom: 2, borderRadius: 10, border: "none", cursor: "pointer",
                background: active ? "rgba(255,255,255,0.18)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.65)",
                fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: active ? 600 : 500,
                textAlign: "left", transition: "background 0.15s, color 0.15s",
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
            display: "flex", alignItems: "center", gap: sideOpen ? 10 : 0,
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
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {sideOpen && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

// ─── Topbar menu dropdown ──────────────────────────────────────────────────────
function TopbarMenu({ user, initials, onProfile, onPassword }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const menuBtn = (label, icon, onClick, danger) => (
    <button onClick={() => { onClick(); setOpen(false); }} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "11px 16px",
      fontSize: 13.5, color: danger ? "#dc2626" : C.text, cursor: "pointer",
      border: "none", background: "none", width: "100%", textAlign: "left",
      fontFamily: "'DM Sans',sans-serif", transition: "background 0.1s",
    }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? "#fef2f2" : "#f8faff"}
      onMouseLeave={e => e.currentTarget.style.background = "none"}
    >
      {icon}{label}
    </button>
  );

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <div onClick={() => setOpen(!open)} style={{
        width: 38, height: 38,
        background: "linear-gradient(135deg,#0e3d82,#1a6fd4)",
        borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer",
        border: "2px solid transparent", letterSpacing: "0.5px",
      }} title="Account">{initials}</div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 10px)", right: 0,
          background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.1)", minWidth: 200, overflow: "hidden",
          zIndex: 300, animation: "fadeDown 0.15s ease",
        }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{user?.full_name || user?.username}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Managing Director</div>
          </div>
          {menuBtn("Edit Profile",
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
            onProfile)}
          {menuBtn("Change Password",
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
            onPassword)}
          <div style={{ height: 1, background: C.border }} />
          {menuBtn("Sign Out",
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
            () => performLogout("manual"), true)}
        </div>
      )}
    </div>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 480 }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,30,80,0.5)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", overflow: "hidden", animation: "slideUp 0.25s cubic-bezier(0.22,1,0.36,1) both" }}>
        <div style={{ background: "linear-gradient(135deg,#0a2a5e,#1557b0)", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: "#fff" }}>{title}</span>
          <button onClick={onClose} style={{ width: 30, height: 30, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

const fInput = { width: "100%", padding: "11px 14px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "'DM Sans',sans-serif", color: C.text, background: "#fafbff", outline: "none", boxSizing: "border-box" };
const fLabel = { display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px", color: C.dim, marginBottom: 7, fontFamily: "'DM Sans',sans-serif" };
const focusStyle = e => { e.target.style.borderColor = C.mid; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; };
const blurStyle  = e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; };

function EditProfileModal({ user, onClose, showToast }) {
  const [form, setForm] = useState({ full_name: user?.full_name || "", email: user?.email || "", username: user?.username || "" });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.full_name || !form.email || !form.username) { showToast("All fields required.", "err"); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/auth/admins/${user.id}/`, { method: "PATCH", body: JSON.stringify(form) });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      localStorage.setItem("user", JSON.stringify({ ...user, ...updated }));
      showToast("Profile updated."); onClose();
    } catch { showToast("Failed to update profile.", "err"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Edit Profile" onClose={onClose}>
      {[["Full Name", "full_name", "text"], ["Username", "username", "text"], ["Email Address", "email", "email"]].map(([lbl, key, type]) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <label style={fLabel}>{lbl}</label>
          <input style={fInput} type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} onFocus={focusStyle} onBlur={blurStyle} />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
        <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#f1f5f9", color: C.text, fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.primary},${C.mid})`, color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save Changes"}</button>
      </div>
    </Modal>
  );
}

function PwField({ field, label, sk, form, setForm, show, setShow }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={fLabel}>{label}</label>
      <div style={{ position: "relative" }}>
        <input style={{ ...fInput, paddingRight: 42 }} type={show[sk] ? "text" : "password"}
          value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
          onFocus={focusStyle} onBlur={blurStyle} />
        <button type="button" onClick={() => setShow(p => ({ ...p, [sk]: !p[sk] }))}
          style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.dim, display: "flex", alignItems: "center", padding: 2 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {show[sk]
              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
            }
          </svg>
        </button>
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose, showToast }) {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [show, setShow] = useState({ c: false, n: false, cf: false });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.current_password || !form.new_password || !form.confirm_password) { showToast("All fields required.", "err"); return; }
    if (form.new_password !== form.confirm_password) { showToast("Passwords do not match.", "err"); return; }
    if (form.new_password.length < 8) { showToast("Minimum 8 characters.", "err"); return; }
    setBusy(true);
    try {
      const token = localStorage.getItem("access_token") || "";
      const res   = await fetch(`${API_BASE}/api/auth/me/change-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || "Incorrect current password.", "err"); return; }
      showToast("Password changed! Signing you out…");
      setTimeout(() => { localStorage.clear(); sessionStorage.clear(); window.location.href = "/"; }, 1800);
      onClose();
    } catch { showToast("Server error. Please try again.", "err"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Change Password" onClose={onClose}>
      <PwField field="current_password" label="Current Password" sk="c" form={form} setForm={setForm} show={show} setShow={setShow} />
      <PwField field="new_password" label="New Password" sk="n" form={form} setForm={setForm} show={show} setShow={setShow} />
      <PwField field="confirm_password" label="Confirm New Password" sk="cf" form={form} setForm={setForm} show={show} setShow={setShow} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
        <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#f1f5f9", color: C.text, fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.primary},${C.mid})`, color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1 }}>{busy ? "Updating…" : "Update Password"}</button>
      </div>
    </Modal>
  );
}

// ─── Profile Page ──────────────────────────────────────────────────────────────
function ProfilePage({ user, initials, onEdit, onPassword }) {
  return (
    <div>
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "28px 32px", marginBottom: 18, maxWidth: 680 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
          <div style={{ width: 76, height: 76, borderRadius: 18, flexShrink: 0, background: "linear-gradient(135deg,#0e3d82,#1a6fd4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "#fff" }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: C.text }}>{user?.full_name || user?.username || "—"}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Managing Director &nbsp;·&nbsp; {user?.email || "—"}</div>
          </div>
          <button onClick={onEdit} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(135deg,${C.primary},${C.mid})`, color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, transition: "opacity 0.18s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.88"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            Edit Profile
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16 }}>
          {[["Username", user?.username || "—"], ["Email", user?.email || "—"], ["Role", "Managing Director"]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: C.dim, marginBottom: 4, fontFamily: "'DM Sans',sans-serif" }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, maxWidth: 680 }}>
        {[
          { label: "Edit Profile", sub: "Update name and email", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>, bg: "#eff6ff", fn: onEdit },
          { label: "Change Password", sub: "Update login password", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>, bg: "#f0fdf4", fn: onPassword },
        ].map(item => (
          <div key={item.label} onClick={item.fn} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "box-shadow 0.2s, border-color 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.mid; e.currentTarget.style.boxShadow = "0 4px 20px rgba(21,87,176,0.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: item.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>{item.label}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Placeholder page ──────────────────────────────────────────────────────────
function PlaceholderPage({ name }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 360, color: C.dim, fontFamily: "'DM Sans',sans-serif", gap: 16 }}>
      <div style={{ width: 72, height: 72, borderRadius: 18, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
      </div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: C.text, margin: 0 }}>{name}</h2>
      <p style={{ fontSize: 14, maxWidth: 300, lineHeight: 1.65, textAlign: "center", margin: 0 }}>This section is coming soon.</p>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const { stats, employees, departments, loading, errors, sites, fetchEmployeeDetail } = useMDPortal();

  const [selectedEmp,   setSelectedEmp]   = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search,        setSearch]        = useState("");
  const [deptFilter,    setDeptFilter]    = useState("all");
  const [typeFilter,    setTypeFilter]    = useState("all");

  const handleEmpClick = async (emp) => {
    setLoadingDetail(true);
    setSelectedEmp(emp);                      // show partial data immediately
    const full = await fetchEmployeeDetail(emp.id);
    if (full) setSelectedEmp(full);
    setLoadingDetail(false);
  };

  const deptOptions = useMemo(() => {
    if (!departments) return [];
    return departments.map(d => ({ value: String(d.id), label: d.name }));
  }, [departments]);

  const filtered = useMemo(() => {
    if (!employees) return [];
    return employees.filter(e => {
      const q        = search.toLowerCase();
      const fullName = [e.full_name, e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ");
      const matchSearch = !q ||
        fullName.toLowerCase().includes(q) ||
        (e.email || "").toLowerCase().includes(q) ||
        (e.phone || "").toLowerCase().includes(q) ||
        (e.phone_number || "").toLowerCase().includes(q) ||
        (e.job_title || "").toLowerCase().includes(q);
      const matchDept = deptFilter === "all" || String(e.department) === deptFilter || (e.department_name || "").toLowerCase() === deptFilter.toLowerCase();
      const matchType = typeFilter === "all" || e.employment_type === typeFilter;
      return matchSearch && matchDept && matchType;
    });
  }, [employees, search, deptFilter, typeFilter]);

  const getFullName = emp => emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
  const getPhone    = emp => emp.phone || emp.phone_number || "";
  const typeLabel   = { full_time: "Full-Time", part_time: "Part-Time", contract: "Contract" };
  const statusStyle = {
    employed:  { bg: "#dcfce7", color: "#166534" }, terminated: { bg: "#fee2e2", color: "#991b1b" },
    on_leave:  { bg: "#fef9c3", color: "#854d0e" }, dismissed:  { bg: "#fee2e2", color: "#991b1b" },
    resigned:  { bg: "#fef9c3", color: "#854d0e" }, suspended:  { bg: "#fce7f3", color: "#9d174d" },
  };

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Employee detail view
  if (selectedEmp) {
    const fullName    = getFullName(selectedEmp);
    const phone       = getPhone(selectedEmp);
    const avatarLetters = fullName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
    const ss          = statusStyle[selectedEmp.status] || { bg: "#f1f5f9", color: "#475569" };
    const dateJoined  = selectedEmp.date_joined ? new Date(selectedEmp.date_joined) : null;
    const now         = new Date();
    let tenureStr     = "—";
    if (dateJoined) {
      const totalM = (now.getFullYear() - dateJoined.getFullYear()) * 12 + (now.getMonth() - dateJoined.getMonth());
      const years  = Math.floor(totalM / 12);
      const months = totalM % 12;
      tenureStr = years > 0 ? `${years}y ${months}m` : `${months} month${months !== 1 ? "s" : ""}`;
    }
    const src = selectedEmp.profile_picture || selectedEmp.photo || selectedEmp.avatar;

    const InfoRow = ({ label, value, vc }) => (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #f1f5f9", gap: 12 }}>
        <span style={{ fontSize: 11, color: C.dim, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 120 }}>{label}</span>
        <span style={{ fontSize: 13, color: vc || C.text, fontFamily: "'DM Sans',sans-serif", fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>{value || "—"}</span>
      </div>
    );
    const SectionTitle = ({ children }) => (
      <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, letterSpacing: "1.2px", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 4, marginTop: 8, paddingBottom: 8, borderBottom: "2px solid #eff6ff" }}>{children}</div>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
        {loadingDetail && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.7)", zIndex: 50, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, border: "3px solid #e8edf8", borderTopColor: C.mid, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13, color: C.mid, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>Loading full details…</span>
          </div>
        )}

        <button onClick={() => setSelectedEmp(null)} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "none", border: `1.5px solid ${C.border}`, borderRadius: 9,
          padding: "8px 16px", fontSize: 13, color: C.muted, fontFamily: "'DM Sans',sans-serif",
          fontWeight: 500, cursor: "pointer", alignSelf: "flex-start",
          transition: "border-color 0.15s, color 0.15s, background 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.mid; e.currentTarget.style.color = C.mid; e.currentTarget.style.background = "#eff6ff"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "none"; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Dashboard
        </button>

        {/* Profile header */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "24px 28px", display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#0e3d82,#1a6fd4)", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #eff6ff" }}>
            {src ? <img src={src} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> : <span style={{ fontSize: 26, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans',sans-serif" }}>{avatarLetters}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: "0 0 3px", fontSize: 22, fontWeight: 700, color: C.primary, fontFamily: "'Playfair Display',serif", lineHeight: 1.2 }}>{fullName}</h1>
            {selectedEmp.employee_number && <div style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>#{selectedEmp.employee_number}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "4px 12px", background: ss.bg, color: ss.color, fontFamily: "'DM Sans',sans-serif" }}>
                {(selectedEmp.status || "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 12px", background: selectedEmp.employment_type === "full_time" ? "#eff6ff" : selectedEmp.employment_type === "part_time" ? "#fffbeb" : "#f5f3ff", color: selectedEmp.employment_type === "full_time" ? C.mid : selectedEmp.employment_type === "part_time" ? "#b45309" : "#7c3aed", fontFamily: "'DM Sans',sans-serif" }}>
                {typeLabel[selectedEmp.employment_type] || selectedEmp.employment_type || "—"}
              </span>
              {selectedEmp.job_title && <span style={{ fontSize: 12, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>· {selectedEmp.job_title}</span>}
              {selectedEmp.department_name && <span style={{ fontSize: 12, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>· {selectedEmp.department_name}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[["Tenure", tenureStr, "'Playfair Display',serif", 20], dateJoined ? ["Joined", dateJoined.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), "'DM Sans',sans-serif", 13] : null].filter(Boolean).map(([l, v, ff, fs]) => (
              <div key={l} style={{ textAlign: "center", background: "#f8faff", borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px 18px", minWidth: 90 }}>
                <div style={{ fontSize: 10, color: C.dim, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: fs, fontWeight: 700, color: C.primary, fontFamily: ff }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Contract bar */}
        {selectedEmp.employment_type === "contract" && (
          <Card title="Contract Status">
            <ContractBar start={selectedEmp.contract_start || selectedEmp.date_joined} end={selectedEmp.contract_end || selectedEmp.contract_expiry} />
          </Card>
        )}

        {/* Detail grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          <Card>
            <SectionTitle>Personal Details</SectionTitle>
            <InfoRow label="Full Name"     value={fullName} />
            <InfoRow label="Gender"        value={{ M: "Male", F: "Female", O: "Other" }[selectedEmp.gender] || selectedEmp.gender} />
            <InfoRow label="Date of Birth" value={selectedEmp.date_of_birth ? new Date(selectedEmp.date_of_birth).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null} />
            <InfoRow label="National ID"   value={selectedEmp.national_id || selectedEmp.id_number} />
            <InfoRow label="Address"       value={selectedEmp.address || selectedEmp.home_address} />
          </Card>

          <Card>
            <SectionTitle>Contact Information</SectionTitle>
            <InfoRow label="Email"     value={selectedEmp.email} vc={C.mid} />
            <InfoRow label="Phone"     value={phone} />
            <InfoRow label="Alt Phone" value={selectedEmp.alt_phone || selectedEmp.alternative_phone} />
            <InfoRow label="Next of Kin"  value={selectedEmp.nok_full_name || selectedEmp.next_of_kin || selectedEmp.emergency_contact_name} />
            <InfoRow label="Relationship" value={selectedEmp.nok_relationship} />
            <InfoRow label="NOK Phone"    value={selectedEmp.nok_phone || selectedEmp.emergency_contact_phone} />
          </Card>

          <Card>
            <SectionTitle>Employment Information</SectionTitle>
            <InfoRow label="Job Title"   value={selectedEmp.job_title || selectedEmp.position} />
            <InfoRow label="Department"  value={selectedEmp.department_name} />
            <InfoRow label="Type"        value={typeLabel[selectedEmp.employment_type] || selectedEmp.employment_type} />
            <InfoRow label="Status"      value={(selectedEmp.status || "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())} vc={ss.color} />
            <InfoRow label="Date Joined" value={dateJoined ? dateJoined.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null} />
            <InfoRow label="Employee No." value={selectedEmp.employee_number ? `#${selectedEmp.employee_number}` : null} />
          </Card>

          {(selectedEmp.bank_name || selectedEmp.bank_account || selectedEmp.basic_salary) && (
            <Card>
              <SectionTitle>Payroll & Bank</SectionTitle>
              {selectedEmp.bank_name    && <InfoRow label="Bank"         value={selectedEmp.bank_name} />}
              {selectedEmp.bank_account && <InfoRow label="Account"      value={selectedEmp.bank_account} />}
              {selectedEmp.basic_salary && <InfoRow label="Basic Salary" value={`$${Number(selectedEmp.basic_salary).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} vc="#166534" />}
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if ((loading.employees || loading.departments) && !stats) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e8edf8", borderTopColor: C.mid, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
          <span style={{ color: C.dim, fontFamily: "'DM Sans',sans-serif", fontSize: 14 }}>Loading dashboard…</span>
        </div>
      </div>
    );
  }

  if (errors.employees || errors.departments) {
    return <div style={{ color: "#dc2626", padding: 32, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>Failed to load data. Please refresh.</div>;
  }

  const s = stats || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.primary, fontFamily: "'Playfair Display',serif" }}>Dashboard</h1>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>{today}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#eff6ff", border: `1px solid #bfdbfe`, borderRadius: 10, padding: "7px 13px", fontSize: 12, color: C.mid, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#34d399" }} />Live Data
        </div>
      </div>

      {/* Stat cards */}
      <div className="md-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <StatCard
          label="Total Employees" value={s.total ?? "–"}
          sub={<><span style={{ fontWeight: 700, color: C.mid }}>{s.newThisMonth ?? 0}</span> joined this month</>}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        />
        <StatCard
          label="Total Departments" value={s.totalDepts ?? departments?.length ?? "–"}
          sub="Active departments"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg>}
        />
        <StatCard
          label="Active Sites" value={s.totalSites ?? "–"}
          sub="Work locations"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="1.8" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>}
        />
        <StatCard
          label="Present Today" value={s.presentToday ?? "–"}
          sub={`${s.absentToday ?? 0} marked absent`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="1.8" strokeLinecap="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
        />
      </div>

      {/* Employee table */}
      <Card title="All Employees" style={{ padding: "20px 0" }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "0 20px", marginBottom: 14, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
            <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder="Search name, email, phone, job…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 30px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", outline: "none", background: "#fafbff" }}
              onFocus={focusStyle} onBlur={blurStyle}
            />
          </div>
          {/* Dept filter */}
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            style={{ padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer", flex: "0 1 160px" }}>
            <option value="all">All Departments</option>
            {deptOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer", flex: "0 1 140px" }}>
            <option value="all">All Types</option>
            <option value="full_time">Full-Time</option>
            <option value="part_time">Part-Time</option>
            <option value="contract">Contract</option>
          </select>
          <span style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>{filtered.length} of {employees?.length ?? 0}</span>
        </div>

        {/* Hint */}
        <div style={{ padding: "0 20px", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: C.dim, fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            Tap any row to view full employee details
          </span>
        </div>

        {/* Table — desktop */}
        <div className="md-table-wrap" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafbff", borderBottom: `1.5px solid ${C.border}` }}>
                {["Employee", "Job Title", "Contact"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: "0.8px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!employees ? (
                <tr><td colSpan={3} style={{ padding: "40px 16px", textAlign: "center", color: C.dim }}>Loading employees…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: "40px 16px", textAlign: "center", color: C.dim }}>No employees match your filters.</td></tr>
              ) : filtered.map((emp, i) => {
                const fullName = getFullName(emp);
                const phone    = getPhone(emp);
                return (
                  <tr key={`emp-${emp.id}-${i}`}
                    onClick={() => handleEmpClick(emp)}
                    style={{ borderBottom: `1px solid #f1f5f9`, background: i % 2 === 0 ? "#fff" : "#fafcff", cursor: "pointer", transition: "background 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafcff"}
                  >
                    {/* Employee: photo + name */}
                    <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar emp={emp} size={38} />
                        <div>
                          <div style={{ fontWeight: 600, color: C.primary, fontSize: 13 }}>{fullName}</div>
                          {emp.employee_number && <div style={{ fontSize: 10.5, color: C.dim }}>#{emp.employee_number}</div>}
                        </div>
                      </div>
                    </td>
                    {/* Job title */}
                    <td style={{ padding: "11px 16px", color: "#334155", fontWeight: 500, fontSize: 12 }}>{emp.job_title || emp.position || "—"}</td>
                    {/* Contact: email + phone */}
                    <td style={{ padding: "11px 16px", minWidth: 170 }}>
                      {emp.email ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.mid, marginBottom: phone ? 4 : 0 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{emp.email}</span>
                        </div>
                      ) : null}
                      {phone ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#334155" }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.44 2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16.92z" /></svg>
                          {phone}
                        </div>
                      ) : null}
                      {!emp.email && !phone && <span style={{ color: "#cbd5e1" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list — shown on small screens via CSS */}
        <div className="md-mobile-list" style={{ display: "none", flexDirection: "column", gap: 0 }}>
          {filtered.map((emp, i) => {
            const fullName = getFullName(emp);
            const phone    = getPhone(emp);
            return (
              <div key={`mc-${emp.id}`}
                onClick={() => handleEmpClick(emp)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background 0.12s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Avatar emp={emp} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: C.primary, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{emp.job_title || emp.position || "—"}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                    {emp.email && <span style={{ fontSize: 11, color: C.mid }}>{emp.email}</span>}
                    {phone && <span style={{ fontSize: 11, color: "#334155" }}>{phone}</span>}
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Charts row 1 */}
      <div className="md-charts-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        <Card title="Gender Breakdown">
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <DonutChart size={130} label={s.total ?? 0} sublabel="TOTAL"
              slices={[{ value: s.male || 0, color: C.male }, { value: s.female || 0, color: C.female }, { value: s.other || 0, color: C.other }]} />
            <LegendRow items={[{ label: "Male", value: s.male || 0, color: C.male }, { label: "Female", value: s.female || 0, color: C.female }, { label: "Other", value: s.other || 0, color: C.other }]} />
          </div>
        </Card>

        <Card title="Employment Type">
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <DonutChart size={130} label={s.employed ?? 0} sublabel="EMPLOYED"
              slices={[{ value: s.fullTime || 0, color: C.fullTime }, { value: s.partTime || 0, color: C.partTime }, { value: s.contract || 0, color: C.contract }]} />
            <LegendRow items={[{ label: "Full-Time", value: s.fullTime || 0, color: C.fullTime }, { label: "Part-Time", value: s.partTime || 0, color: C.partTime }, { label: "Contract", value: s.contract || 0, color: C.contract }]} />
          </div>
        </Card>

        <Card title="Today's Attendance">
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <DonutChart size={130} label={s.presentToday ?? 0} sublabel="PRESENT"
              slices={[{ value: s.presentToday || 0, color: C.present }, { value: s.absentToday || 0, color: C.absent }, { value: Math.max(0, s.notMarkedToday || 0), color: C.notMarked }]} />
            <LegendRow items={[{ label: "Present", value: s.presentToday || 0, color: C.present }, { label: "Absent", value: s.absentToday || 0, color: C.absent }, { label: "Not Marked", value: Math.max(0, s.notMarkedToday || 0), color: C.notMarked }]} />
          </div>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="md-charts-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Employees by Department">
          {s.byDept && s.byDept.length > 0 ? (
            <>
              <BarChart data={s.byDept} height={110} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 12px", marginTop: 12 }}>
                {s.byDept.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 3, background: C.deptPalette[i % C.deptPalette.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>{d.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", color: "#cbd5e1", padding: 30, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>No data yet</div>
          )}
        </Card>

        <Card title="Monthly New Joiners (Last 6 Months)">
          {s.monthlyJoins && s.monthlyJoins.length >= 2 ? (
            <>
              <LineChart data={s.monthlyJoins} height={120} />
              <div style={{ marginTop: 8, fontSize: 11, color: C.dim, fontFamily: "'DM Sans',sans-serif", textAlign: "right" }}>
                Total: {s.monthlyJoins.reduce((a, m) => a + m.count, 0)} joiners in period
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", color: "#cbd5e1", padding: 30, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>No joining data available</div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Inner portal (has context) ────────────────────────────────────────────────
function MDPortalInner() {
  const { user } = useMDPortal();
  const [searchParams, setSearchParams] = useSearchParams();
  const page    = searchParams.get("page") || "dashboard";
  const setPage = p => setSearchParams({ page: p }, { replace: false });

  const [sideOpen,   setSideOpen]   = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast,      setToast]      = useState(null);
  const [modal,      setModal]      = useState(null); // "profile" | "password"

  const showToast = (msg, type = "ok") => setToast({ msg, type });

  useEffect(() => startInactivityTimer(),    []);
  useEffect(() => startTokenRefreshTimer(),  []);

  const initials = ((user?.full_name || user?.username || "MD").split(" ").slice(0, 2).map(w => w[0]).join("")).toUpperCase();

  const renderPage = () => {
    switch (page) {
      case "dashboard":  return <Dashboard />;
      case "attendance": return <AttendancePage />;
      case "payroll":    return <PayrollPage />;
      case "profile":    return <ProfilePage user={user} initials={initials} onEdit={() => setModal("profile")} onPassword={() => setModal("password")} />;
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
        @keyframes spin         { to { transform: rotate(360deg); } }
        @keyframes slideUp      { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
        @keyframes fadeDown     { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        @keyframes slideInRight { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:none; } }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }
        select, input { font-family:'DM Sans',sans-serif; }
        .md-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:199; }

        /* Desktop responsive */
        @media (max-width:1100px) {
          .md-stats-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width:900px) {
          .md-charts-3 { grid-template-columns: 1fr !important; }
          .md-charts-2 { grid-template-columns: 1fr !important; }
        }

        /* Mobile */
        @media (max-width:768px) {
          .md-overlay { display:block; }
          .md-overlay.hidden { display:none; }
          .md-sidebar { transform:translateX(-100%) !important; width:220px !important; }
          .md-sidebar.open { transform:translateX(0) !important; }
          .md-main { margin-left:0 !important; }
          .md-topbar { padding:0 14px !important; }
          .md-content { padding:14px !important; }
        }
        @media (max-width:640px) {
          .md-stats-grid { grid-template-columns: repeat(2,1fr) !important; }
          /* Show mobile card list, hide table */
          .md-table-wrap { display:none !important; }
          .md-mobile-list { display:flex !important; }
          .md-charts-3 { grid-template-columns: 1fr !important; }
        }
        @media (max-width:400px) {
          .md-stats-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Mobile overlay */}
      <div className={`md-overlay${mobileOpen ? "" : " hidden"}`} onClick={() => setMobileOpen(false)} />

      <div style={{ minHeight: "100vh", background: C.bg }}>
        {/* Sidebar */}
        <Sidebar page={page} setPage={setPage} sideOpen={sideOpen} user={user} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

        {/* Main area */}
        <div className="md-main" style={{ marginLeft: sideWidth, display: "flex", flexDirection: "column", minHeight: "100vh", transition: "margin-left 0.28s cubic-bezier(.4,0,.2,1)", background: C.bg }}>
          {/* Topbar */}
          <header className="md-topbar" style={{ height: 64, background: "#fff", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 14, flexShrink: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", position: "sticky", top: 0, zIndex: 100 }}>
            {/* Hamburger/collapse */}
            <button
              onClick={() => { if (window.innerWidth <= 768) setMobileOpen(v => !v); else setSideOpen(v => !v); }}
              style={{ width: 36, height: 36, border: `1.5px solid ${C.border}`, borderRadius: 9, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, transition: "border-color 0.15s, color 0.15s", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.mid; e.currentTarget.style.color = C.mid; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>

            {/* Page title */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {NAV.find(n => n.key === page)?.label || "Dashboard"}
              </span>
            </div>

            {/* Role chip + avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 20, padding: "4px 12px", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>
                MD
              </div>
              <TopbarMenu user={user} initials={initials} onProfile={() => setModal("profile")} onPassword={() => setModal("password")} />
            </div>
          </header>

          {/* Page content */}
          <main className="md-content" style={{ flex: 1, padding: "24px 24px 28px" }}>
            {renderPage()}
          </main>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      {modal === "profile"  && <EditProfileModal user={user} onClose={() => setModal(null)} showToast={showToast} />}
      {modal === "password" && <ChangePasswordModal onClose={() => setModal(null)} showToast={showToast} />}
    </>
  );
}

// ─── Default export ─────────────────────────────────────────────────────────────
export default function MDPortal() {
  return (
    <MDPortalProvider>
      <MDPortalInner />
    </MDPortalProvider>
  );
}