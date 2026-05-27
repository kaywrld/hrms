// src/components/MDPortal/AttendancePage.jsx
//
// Attendance page for the MD Portal.
// Employee click → replaces list with full inline detail view (like Dashboard).
// History shown inline in the detail view, not as a sidebar.
// Location shown for present/late/half_day records in both today's list and history.
//
// ── New features ──────────────────────────────────────────────────────────────
//  • Search bar            — filter by employee name
//  • Location filter       — dropdown of unique work_location values for the day
//  • Department filter     — dropdown of employee departments
//  • Calendar date picker  — click the calendar icon to jump to any date
//  • Past-date stat labels — "Were Present / Were Absent / Were on Leave" for
//                            historical dates instead of "today" language
//  • Mobile responsive     — fully optimised for phones (≤640px)

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { apiFetch } from "../../utils/auth";
import { useMDPortal } from "../../context/MDPortalContext";

const API = "${import.meta.env.VITE_API_BASE_URL}/api";

// ── Responsive hook ───────────────────────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  primary:   "#0a2a5e",
  mid:       "#1557b0",
  light:     "#1a6fd4",
  accent:    "#7fb3e8",
  bg:        "#f8faff",
  card:      "#ffffff",
  border:    "#e2e8f0",
  text:      "#0f172a",
  muted:     "#64748b",
  dim:       "#94a3b8",
  present:   "#16a34a",
  presentBg: "#dcfce7",
  late:      "#d97706",
  lateBg:    "#fef3c7",
  absent:    "#dc2626",
  absentBg:  "#fee2e2",
  leave:     "#7c3aed",
  leaveBg:   "#f5f3ff",
  halfDay:   "#0891b2",
  halfBg:    "#e0f2fe",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d, opts) => new Date(d).toLocaleDateString("en-GB", opts);

const toISO = d => {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const isWeekday = d => d.getDay() !== 0 && d.getDay() !== 6;

const prevWorkDay = d => {
  const x = new Date(d);
  do { x.setDate(x.getDate() - 1); } while (!isWeekday(x));
  return x;
};

const nextWorkDay = d => {
  const x = new Date(d);
  do { x.setDate(x.getDate() + 1); } while (!isWeekday(x));
  return x;
};

const workdaysInMonthUpTo = upTo => {
  const d = new Date(upTo.getFullYear(), upTo.getMonth(), 1);
  let count = 0;
  while (d <= upTo) {
    if (isWeekday(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
};

const totalWorkdaysInMonth = (year, month) => {
  const d   = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  let c = 0;
  while (d <= end) { if (isWeekday(d)) c++; d.setDate(d.getDate() + 1); }
  return c;
};

const STATUS_META = {
  present:  { label: "Present",   bg: C.presentBg, color: C.present },
  late:     { label: "Late",      bg: C.lateBg,    color: C.late    },
  half_day: { label: "Half Day",  bg: C.halfBg,    color: C.halfDay },
  absent:   { label: "Absent",    bg: C.absentBg,  color: C.absent  },
  on_leave: { label: "On Leave",  bg: C.leaveBg,   color: C.leave   },
  leave:    { label: "On Leave",  bg: C.leaveBg,   color: C.leave   },
};

const getSM = s => STATUS_META[s] || { label: s || "—", bg: "#f1f5f9", color: C.muted };

const isPresenceStatus = s => ["present", "late", "half_day"].includes(s);

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size,
      border: "3px solid #e8edf8",
      borderTopColor: C.mid,
      borderRadius: "50%",
      animation: "att-spin 0.75s linear infinite",
      flexShrink: 0,
    }} />
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const { label, bg, color } = getSM(status);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, borderRadius: 20,
      padding: "2px 8px", background: bg, color,
      fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
      letterSpacing: "0.3px",
    }}>{label}</span>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function Tab({ label, count, color, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "9px 16px", borderRadius: 10, border: "none",
      cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
      fontSize: 13, fontWeight: active ? 700 : 500,
      background: active ? "#fff" : "transparent",
      color: active ? C.primary : C.muted,
      boxShadow: active ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
      transition: "all 0.15s",
      whiteSpace: "nowrap",
    }}>
      {label}
      <span style={{
        fontSize: 11, fontWeight: 700, borderRadius: 20,
        padding: "1px 8px",
        background: active ? color + "22" : "#f1f5f9",
        color: active ? color : C.dim,
        fontFamily: "'DM Sans',sans-serif",
        minWidth: 22, textAlign: "center",
      }}>{count}</span>
    </button>
  );
}

// ── Location chip ─────────────────────────────────────────────────────────────
function LocationChip({ location, small }) {
  if (!location) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: small ? 10.5 : 11.5,
      color: C.mid, fontFamily: "'DM Sans',sans-serif",
      background: "#eff6ff", borderRadius: 20,
      padding: small ? "1px 8px" : "2px 10px",
      border: "1px solid #bfdbfe",
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
      </svg>
      {location}
    </span>
  );
}

// ── Filter Dropdown ───────────────────────────────────────────────────────────
function FilterDropdown({ label, value, options, onChange, icon, style: extraStyle }) {
  return (
    <div style={{ position: "relative", minWidth: 0, ...extraStyle }}>
      <div style={{
        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
        pointerEvents: "none", color: C.muted, zIndex: 1,
      }}>
        {icon}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          height: 36, paddingLeft: 30, paddingRight: 24,
          border: `1.5px solid ${value ? C.mid : C.border}`,
          borderRadius: 9,
          background: value ? "#eff6ff" : "#fff",
          color: value ? C.mid : C.muted,
          fontSize: 12, fontWeight: value ? 600 : 400,
          fontFamily: "'DM Sans',sans-serif",
          cursor: "pointer",
          appearance: "none",
          WebkitAppearance: "none",
          outline: "none",
          transition: "border-color 0.15s, background 0.15s",
          boxSizing: "border-box",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <option value="">{label}</option>
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <div style={{
        position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
        pointerEvents: "none", color: value ? C.mid : C.dim,
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}

// ── Calendar Date Picker ──────────────────────────────────────────────────────
function CalendarPicker({ value, onChange, maxDate }) {
  const [open, setOpen]           = useState(false);
  const [viewYear, setViewYear]   = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    setViewYear(value.getFullYear());
    setViewMonth(value.getMonth());
  }, [value]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const maxISO      = maxDate ? toISO(maxDate) : null;

  const cells = [];
  const startOffset = (firstDow + 6) % 7;
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSelected = d => {
    if (!d) return false;
    return value.getFullYear() === viewYear && value.getMonth() === viewMonth && value.getDate() === d;
  };

  const isDisabled = d => {
    if (!d) return true;
    const iso  = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const date = new Date(viewYear, viewMonth, d);
    if (!isWeekday(date)) return true;
    if (maxISO && iso > maxISO) return true;
    return false;
  };

  const pickDay = d => {
    if (!d || isDisabled(d)) return;
    onChange(new Date(viewYear, viewMonth, d));
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    const now = new Date();
    if (nextY > now.getFullYear() || (nextY === now.getFullYear() && nextM > now.getMonth())) return;
    setViewMonth(nextM);
    if (viewMonth === 11) setViewYear(y => y + 1);
  };

  const monthName  = new Date(viewYear, viewMonth, 1).toLocaleString("default", { month: "long", year: "numeric" });
  const dayLabels  = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Jump to date"
        style={{
          height: 34, width: 34, borderRadius: 9,
          border: `1.5px solid ${open ? C.mid : C.border}`,
          background: open ? "#eff6ff" : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: open ? C.mid : C.muted,
          transition: "all 0.15s", flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.mid; e.currentTarget.style.color = C.mid; }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; } }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>

      {/* Dropdown calendar — right-aligned, capped to viewport on mobile */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 999,
          background: "#fff", borderRadius: 14, border: `1.5px solid ${C.border}`,
          boxShadow: "0 8px 32px rgba(10,42,94,0.13)",
          padding: "14px 14px 12px",
          width: 252, maxWidth: "calc(100vw - 24px)",
          animation: "att-fadeIn 0.15s ease",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button onClick={prevMonth} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border}`, background: "#f8faff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, fontFamily: "'DM Sans',sans-serif" }}>{monthName}</span>
            <button onClick={nextMonth} style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border}`, background: "#f8faff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* Day labels */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {dayLabels.map(l => (
              <div key={l} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: C.dim, fontFamily: "'DM Sans',sans-serif", padding: "2px 0" }}>{l}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              const sel   = isSelected(d);
              const dis   = isDisabled(d);
              const isWknd = d ? !isWeekday(new Date(viewYear, viewMonth, d)) : false;
              return (
                <button
                  key={i}
                  onClick={() => pickDay(d)}
                  disabled={dis}
                  style={{
                    height: 30, width: "100%", borderRadius: 7,
                    border: "none",
                    background: sel ? C.mid : "transparent",
                    color: !d ? "transparent" : sel ? "#fff" : dis ? "#cbd5e1" : isWknd ? C.dim : C.text,
                    fontSize: 12, fontWeight: sel ? 700 : 400,
                    fontFamily: "'DM Sans',sans-serif",
                    cursor: dis || !d ? "default" : "pointer",
                    transition: "background 0.1s",
                    outline: "none",
                  }}
                  onMouseEnter={e => { if (!dis && d && !sel) e.currentTarget.style.background = "#eff6ff"; }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
                >
                  {d || ""}
                </button>
              );
            })}
          </div>

          {/* Today shortcut */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => { onChange(new Date()); setOpen(false); }}
              style={{ fontSize: 11.5, fontWeight: 600, color: C.mid, fontFamily: "'DM Sans',sans-serif", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}
            >
              Jump to today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Employee row (list view) ───────────────────────────────────────────────────
function EmpRow({ emp, rec, daysAttended, totalWorkDays, onClick, isMobile }) {
  const status    = rec?.status || "not_marked";
  const { color } = getSM(status);
  const isLate    = status === "late";
  const isAbsent  = status === "absent";
  const isLeave   = status === "on_leave" || status === "leave";
  const reason    = rec?.reason || rec?.absence_reason || rec?.note || rec?.notes || "";
  const location  = rec?.work_location || "";

  if (isMobile) {
    return (
      <div
        onClick={onClick}
        style={{
          padding: "13px 14px", borderBottom: `1px solid ${C.border}`,
          cursor: "pointer", transition: "background 0.12s",
          display: "flex", flexDirection: "column", gap: 4,
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#f0f6ff"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: C.primary, fontFamily: "'DM Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") || "—"}
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, fontFamily: "'DM Sans',sans-serif", marginTop: 1 }}>
              {emp.job_title || emp.position || "—"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            <Badge status={status} />
            <span style={{ fontSize: 11, color: C.dim, fontFamily: "'DM Sans',sans-serif" }}>
              {daysAttended}/{totalWorkDays} days
            </span>
          </div>
        </div>
        {location && isPresenceStatus(status) && (
          <div style={{ marginTop: 2 }}>
            <LocationChip location={location} small />
          </div>
        )}
        {(isLate || isAbsent || isLeave) && reason && (
          <div style={{ fontSize: 11.5, color, fontFamily: "'DM Sans',sans-serif", marginTop: 2, paddingLeft: 2, fontStyle: "italic" }}>
            {isLate ? "Late: " : isAbsent ? "Reason: " : "Leave: "}{reason}
          </div>
        )}
      </div>
    );
  }

  return (
    <tr
      onClick={onClick}
      style={{ cursor: "pointer", transition: "background 0.12s", borderBottom: "1px solid #f1f5f9" }}
      onMouseEnter={e => e.currentTarget.style.background = "#f0f6ff"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <td style={{ padding: "11px 18px", fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.primary }}>
          {emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") || "—"}
        </div>
        {emp.employee_number && (
          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 1 }}>#{emp.employee_number}</div>
        )}
      </td>
      <td style={{ padding: "11px 18px", fontSize: 12.5, color: "#334155", fontFamily: "'DM Sans',sans-serif", fontWeight: 500 }}>
        {emp.job_title || emp.position || "—"}
      </td>
      <td style={{ padding: "11px 18px", whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, fontFamily: "'Playfair Display',serif" }}>
            {daysAttended}
            <span style={{ fontSize: 11, fontWeight: 500, color: C.dim, fontFamily: "'DM Sans',sans-serif" }}>
              /{totalWorkDays}
            </span>
          </span>
          <div style={{ width: 70, height: 4, background: "#e8edf8", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              width: `${totalWorkDays > 0 ? (daysAttended / totalWorkDays) * 100 : 0}%`,
              background: daysAttended / totalWorkDays >= 0.9 ? C.present
                        : daysAttended / totalWorkDays >= 0.7 ? C.late
                        : C.absent,
              transition: "width 0.6s ease",
            }} />
          </div>
        </div>
      </td>
      <td style={{ padding: "11px 18px" }}>
        {isPresenceStatus(status) && location
          ? <LocationChip location={location} />
          : <span style={{ fontSize: 11.5, color: C.dim, fontFamily: "'DM Sans',sans-serif" }}>—</span>
        }
      </td>
      <td style={{ padding: "11px 18px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Badge status={status} />
          {(isLate || isAbsent || isLeave) && reason && (
            <span style={{ fontSize: 11, color, fontFamily: "'DM Sans',sans-serif", fontStyle: "italic" }}>
              {reason}
            </span>
          )}
        </div>
      </td>
      <td style={{ padding: "11px 14px", width: 32 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2" strokeLinecap="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </td>
    </tr>
  );
}

// ── Employee Detail View (inline, no sidebar) ─────────────────────────────────
function EmployeeDetailView({ emp, allRecords, currentRec, daysAttended, workdaysToDate, onBack }) {
  const fullName      = emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") || "—";
  const avatarLetters = fullName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  const src           = emp.profile_picture || emp.photo || emp.avatar;
  const currentStatus = currentRec?.status || "not_marked";
  const { color: statusColor } = getSM(currentStatus);
  const currentReason   = currentRec?.reason || currentRec?.absence_reason || currentRec?.note || currentRec?.notes || "";
  const currentLocation = currentRec?.work_location || "";

  const byMonth = useMemo(() => {
    const map = {};
    allRecords.forEach(r => {
      if (!r.date) return;
      const key = r.date.slice(0, 7);
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, recs]) => {
        const [y, m] = key.split("-").map(Number);
        const label  = new Date(y, m - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
        const sorted = [...recs].sort((a, b) => b.date.localeCompare(a.date));
        const present  = recs.filter(r => isPresenceStatus(r.status)).length;
        const workDays = totalWorkdaysInMonth(y, m - 1);
        return { key, label, recs: sorted, present, workDays };
      });
  }, [allRecords]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "att-fadeIn 0.25s ease" }}>

      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "none", border: `1.5px solid ${C.border}`, borderRadius: 9,
          padding: "8px 16px", fontSize: 13, color: C.muted,
          fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
          cursor: "pointer", alignSelf: "flex-start",
          transition: "border-color 0.15s, color 0.15s, background 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.mid; e.currentTarget.style.color = C.mid; e.currentTarget.style.background = "#eff6ff"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "none"; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Attendance
      </button>

      {/* Profile header card */}
      <div style={{
        background: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "20px 18px",
        display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap",
      }}>
        {/* Avatar */}
        <div style={{
          width: 64, height: 64, borderRadius: 16, overflow: "hidden", flexShrink: 0,
          background: "linear-gradient(135deg,#0e3d82,#1a6fd4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "3px solid #eff6ff",
        }}>
          {src
            ? <img src={src} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
            : <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans',sans-serif" }}>{avatarLetters}</span>
          }
        </div>

        {/* Name / role */}
        <div style={{ flex: 1, minWidth: 140 }}>
          <h2 style={{ margin: "0 0 3px", fontSize: 18, fontWeight: 700, color: C.primary, fontFamily: "'Playfair Display',serif", lineHeight: 1.2 }}>{fullName}</h2>
          {emp.employee_number && <div style={{ fontSize: 11, color: C.dim, fontFamily: "'DM Sans',sans-serif", marginBottom: 6 }}>#{emp.employee_number}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {emp.job_title && <span style={{ fontSize: 12, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>{emp.job_title}</span>}
            {emp.department_name && <span style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Sans',sans-serif" }}>· {emp.department_name}</span>}
          </div>
        </div>

        {/* Today's snapshot — full width row when wrapped */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", width: "100%", marginTop: 4 }}>
          {/* Status pill */}
          <div style={{ flex: "1 1 140px", background: "#f8faff", borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 14px" }}>
            <div style={{ fontSize: 9.5, color: C.dim, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 5 }}>Today's Status</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge status={currentStatus} />
              {currentLocation && isPresenceStatus(currentStatus) && <LocationChip location={currentLocation} small />}
            </div>
            {currentReason && (
              <div style={{ fontSize: 11, color: statusColor, fontFamily: "'DM Sans',sans-serif", fontStyle: "italic", marginTop: 5 }}>
                {currentReason}
              </div>
            )}
          </div>

          {/* Days attended */}
          <div style={{ flex: "1 1 120px", background: "#f8faff", borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 14px" }}>
            <div style={{ fontSize: 9.5, color: C.dim, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 3 }}>Days Attended</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.primary, fontFamily: "'Playfair Display',serif", lineHeight: 1 }}>
              {daysAttended}<span style={{ fontSize: 12, fontWeight: 500, color: C.dim, fontFamily: "'DM Sans',sans-serif" }}>/{workdaysToDate}</span>
            </div>
            <div style={{ marginTop: 6, width: "100%", maxWidth: 80, height: 4, background: "#e8edf8", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99,
                width: `${workdaysToDate > 0 ? Math.min((daysAttended / workdaysToDate) * 100, 100) : 0}%`,
                background: daysAttended / workdaysToDate >= 0.9 ? C.present : daysAttended / workdaysToDate >= 0.7 ? C.late : C.absent,
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Attendance History */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, background: "#fafbff" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, fontFamily: "'DM Sans',sans-serif" }}>
            Attendance History
          </div>
          <div style={{ fontSize: 11.5, color: C.dim, fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
            {allRecords.length} record{allRecords.length !== 1 ? "s" : ""} total
          </div>
        </div>

        <div style={{ padding: "16px 16px 24px" }}>
          {byMonth.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.dim, fontFamily: "'DM Sans',sans-serif", fontSize: 14 }}>
              No attendance records found.
            </div>
          ) : byMonth.map(({ key, label, recs, present, workDays }) => (
            <div key={key} style={{ marginBottom: 28 }}>
              {/* Month header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid #eff6ff` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, fontFamily: "'DM Sans',sans-serif" }}>{label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 60, height: 4, background: "#e8edf8", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 99,
                      width: `${workDays > 0 ? (present / workDays) * 100 : 0}%`,
                      background: present / workDays >= 0.9 ? C.present : present / workDays >= 0.7 ? C.late : C.absent,
                    }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>
                    <span style={{ fontWeight: 700, color: present >= workDays * 0.9 ? C.present : present >= workDays * 0.7 ? C.late : C.absent }}>{present}</span>
                    <span style={{ color: C.dim }}>/{workDays} days</span>
                  </span>
                </div>
              </div>

              {/* Records grid — minmax uses min() so single col on narrow screens */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 8 }}>
                {recs.map(r => {
                  const { label: sLabel, bg, color } = getSM(r.status);
                  const reason   = r.reason || r.absence_reason || r.note || r.notes || "";
                  const location = r.work_location || "";
                  const dateStr  = r.date ? fmtDate(r.date, { weekday: "short", day: "numeric", month: "short" }) : "—";
                  const isPresent = isPresenceStatus(r.status);
                  return (
                    <div key={r.id || r.date} style={{
                      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                      padding: "10px 12px", borderRadius: 10,
                      background: "#fafbff", border: `1px solid ${C.border}`, gap: 10,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>{dateStr}</div>
                        {isPresent && location && (
                          <div style={{ marginTop: 4 }}>
                            <LocationChip location={location} small />
                          </div>
                        )}
                        {reason && (
                          <div style={{ fontSize: 11, color, fontFamily: "'DM Sans',sans-serif", marginTop: 3, fontStyle: "italic" }}>{reason}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, borderRadius: 20,
                        padding: "2px 9px", background: bg, color,
                        fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", flexShrink: 0,
                      }}>{sLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const {
    employees,
    attendance: todayAttendance,
    allAttendance,
    loading,
  } = useMDPortal();

  const windowWidth = useWindowWidth();
  const isMobileView  = windowWidth < 640;
  const isNarrow      = windowWidth < 400;

  const todayDate = useMemo(() => {
    const d = new Date();
    if (!isWeekday(d)) return prevWorkDay(d);
    return d;
  }, []);

  const [selDate,     setSelDate]     = useState(todayDate);
  const [attRecords,  setAttRecords]  = useState(null);
  const [loadingAtt,  setLoadingAtt]  = useState(false);
  const [activeTab,   setActiveTab]   = useState("present");
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [empAttMap,   setEmpAttMap]   = useState({});

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [locFilter,   setLocFilter]   = useState("");
  const [deptFilter,  setDeptFilter]  = useState("");

  // ── Date → attendance records ─────────────────────────────────────────────
  useEffect(() => {
    const iso = toISO(selDate);
    if (iso === toISO(todayDate)) {
      setAttRecords(todayAttendance || []);
      setLoadingAtt(false);
      return;
    }
    setLoadingAtt(true);
    setAttRecords(null);
    apiFetch(`${API}/attendance/?date=${iso}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        setAttRecords(Array.isArray(d) ? d : (d.results || []));
        setLoadingAtt(false);
      })
      .catch(() => { setAttRecords([]); setLoadingAtt(false); });
  }, [selDate, todayDate, todayAttendance]);

  // ── Monthly attendance map ────────────────────────────────────────────────
  useEffect(() => {
    if (!allAttendance) return;
    const y    = selDate.getFullYear();
    const mo   = selDate.getMonth();
    const upTo = toISO(selDate);
    const map  = {};
    allAttendance.forEach(r => {
      if (!r.employee || !r.date) return;
      const d = new Date(r.date);
      if (d.getFullYear() !== y || d.getMonth() !== mo) return;
      if (r.date > upTo) return;
      if (!map[r.employee]) map[r.employee] = 0;
      if (isPresenceStatus(r.status)) map[r.employee]++;
    });
    setEmpAttMap(map);
  }, [selDate, allAttendance]);

  // ── Open employee detail ──────────────────────────────────────────────────
  const openDetail = useCallback((emp, rec) => {
    const historyRecs = (allAttendance || []).filter(r => r.employee === emp.id);
    setSelectedEmp({ emp, rec, historyRecs });
  }, [allAttendance]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isToday        = toISO(selDate) === toISO(todayDate);
  const canGoNext      = !isToday;
  const workdaysToDate = workdaysInMonthUpTo(selDate);
  const totalMonthWork = totalWorkdaysInMonth(selDate.getFullYear(), selDate.getMonth());
  const dateLabel      = selDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // ── Categorised lists (unfiltered) ────────────────────────────────────────
  const { presentList, absentList, leaveList } = useMemo(() => {
    if (!employees || !attRecords) return { presentList: [], absentList: [], leaveList: [] };
    const recByEmp = {};
    attRecords.forEach(r => { recByEmp[r.employee] = r; });
    const presentList = [], absentList = [], leaveList = [];
    employees.filter(e => e.status === "employed").forEach(emp => {
      const rec    = recByEmp[emp.id] || null;
      const status = rec?.status || "not_marked";
      if (status === "absent")                              absentList.push({ emp, rec });
      else if (status === "on_leave" || status === "leave") leaveList.push({ emp, rec });
      else if (isPresenceStatus(status))                    presentList.push({ emp, rec });
    });
    return { presentList, absentList, leaveList };
  }, [employees, attRecords]);

  // ── Unique filter options ─────────────────────────────────────────────────
  const locationOptions = useMemo(() => {
    const locs = new Set();
    (attRecords || []).forEach(r => { if (r.work_location) locs.add(r.work_location); });
    return [...locs].sort();
  }, [attRecords]);

  const departmentOptions = useMemo(() => {
    const depts = new Set();
    (employees || []).forEach(e => { if (e.department_name) depts.add(e.department_name); });
    return [...depts].sort();
  }, [employees]);

  // ── Filtered active list ──────────────────────────────────────────────────
  const rawActiveList = activeTab === "present" ? presentList
                      : activeTab === "absent"  ? absentList
                      : leaveList;

  const activeList = useMemo(() => {
    let list = rawActiveList;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(({ emp }) => {
        const name = (emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ")).toLowerCase();
        return name.includes(q);
      });
    }
    if (locFilter)  list = list.filter(({ rec }) => rec?.work_location === locFilter);
    if (deptFilter) list = list.filter(({ emp }) => emp.department_name === deptFilter);
    return list;
  }, [rawActiveList, searchQuery, locFilter, deptFilter]);

  const isLoading = loadingAtt || loading.employees;

  const hasFilters = searchQuery.trim() || locFilter || deptFilter;
  const clearFilters = () => { setSearchQuery(""); setLocFilter(""); setDeptFilter(""); };

  // ── Stat labels: "today" vs historical ───────────────────────────────────
  const presentLabel  = isToday ? "Present today"  : "Were Present";
  const absentLabel   = isToday ? "Absent today"   : "Were Absent";
  const leaveLabel    = isToday ? "On leave today" : "Were on Leave";
  const daysStatLabel = isToday ? "Days elapsed this month" : "Days elapsed to date";

  // ── Detail view ───────────────────────────────────────────────────────────
  if (selectedEmp) {
    return (
      <>
        <style>{`
          @keyframes att-spin   { to { transform: rotate(360deg); } }
          @keyframes att-fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        `}</style>
        <EmployeeDetailView
          emp={selectedEmp.emp}
          allRecords={selectedEmp.historyRecs}
          currentRec={selectedEmp.rec}
          daysAttended={empAttMap[selectedEmp.emp.id] ?? 0}
          workdaysToDate={workdaysToDate}
          onBack={() => setSelectedEmp(null)}
        />
      </>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes att-spin   { to { transform: rotate(360deg); } }
        @keyframes att-fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

        .att-page { display:flex; flex-direction:column; gap:18px; animation:att-fadeIn 0.3s ease; }
        .att-table tr:last-child td { border-bottom:none; }

        /* Focus rings — CSS only, can't be done inline */
        .att-search-input:focus { outline:none; border-color:#1557b0 !important; box-shadow:0 0 0 3px rgba(21,87,176,0.1); }
        select:focus            { outline:none; border-color:#1557b0 !important; box-shadow:0 0 0 3px rgba(21,87,176,0.1); }

        /* Table/mobile-list visibility driven by CSS (no JS needed) */
        .att-table-wrap  { display:block; overflow-x:auto; }
        .att-mobile-list { display:none; flex-direction:column; }

        @media (max-width:639px) {
          .att-page        { gap:10px; }
          .att-table-wrap  { display:none !important; }
          .att-mobile-list { display:flex !important; }
          .att-tabs        { gap:3px !important; padding:10px 10px 0 !important; }
          .att-tabs button { padding:7px 10px !important; font-size:12px !important; }
        }
      `}</style>

      <div className="att-page">

        {/* ── Date navigation card ── */}
        <div style={{
          background: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
          padding: isMobileView ? "12px 14px" : "14px 18px",
          boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        }}>
          <div style={{
            display: "flex",
            flexDirection: isMobileView ? "column" : "row",
            alignItems: isMobileView ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: 12, flexWrap: "wrap",
          }}>
            <div>
              <h1 style={{ margin: 0, fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.primary }}>Attendance</h1>
              <div style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
                {totalMonthWork} working days in {selDate.toLocaleString("default", { month: "long", year: "numeric" })}
              </div>
            </div>

            {/* Date navigator */}
            <div style={{
              display: "flex", alignItems: "center",
              gap: isMobileView ? 5 : 8,
              flexWrap: "wrap",
              width: isMobileView ? "100%" : "auto",
            }}>
              {/* Prev */}
              <button
                onClick={() => setSelDate(d => prevWorkDay(d))}
                style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.border}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.mid; e.currentTarget.style.color = C.mid; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>

              {/* Date label */}
              <div style={{
                flex: isMobileView ? "1 1 0" : "none",
                minWidth: 0,
                padding: isMobileView ? "6px 10px" : "7px 16px",
                borderRadius: 9, background: "#f0f6ff", border: "1.5px solid #bfdbfe",
                fontSize: isNarrow ? 11 : isMobileView ? 12 : 13.5,
                fontWeight: 600, color: C.primary,
                fontFamily: "'DM Sans',sans-serif",
                textAlign: "center",
                whiteSpace: isMobileView ? "normal" : "nowrap",
                wordBreak: "break-word",
              }}>
                {isToday ? "Today — " : ""}{dateLabel}
              </div>

              {/* Next */}
              <button
                onClick={() => { if (canGoNext) setSelDate(d => nextWorkDay(d)); }}
                disabled={!canGoNext}
                style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.border}`, background: canGoNext ? "#fff" : "#f8faff", display: "flex", alignItems: "center", justifyContent: "center", cursor: canGoNext ? "pointer" : "not-allowed", color: canGoNext ? C.muted : "#cbd5e1", flexShrink: 0, transition: "all 0.15s" }}
                onMouseEnter={e => { if (canGoNext) { e.currentTarget.style.borderColor = C.mid; e.currentTarget.style.color = C.mid; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = canGoNext ? C.muted : "#cbd5e1"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>

              {/* Calendar picker */}
              <CalendarPicker value={selDate} onChange={d => setSelDate(d)} maxDate={todayDate} />

              {/* Jump to today */}
              {!isToday && (
                <button
                  onClick={() => setSelDate(todayDate)}
                  style={{ padding: "7px 14px", borderRadius: 9, border: "1.5px solid #bfdbfe", background: "#eff6ff", color: C.mid, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {/* ── Stats strip ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobileView ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
            gap: isMobileView ? 8 : 10,
            marginTop: isMobileView ? 12 : 14,
          }}>
            {[
              { label: daysStatLabel,  value: workdaysToDate,                       sub: `of ${totalMonthWork}`, color: C.mid,     bg: "#eff6ff" },
              { label: presentLabel,   value: isLoading ? "…" : presentList.length, color: C.present, bg: "#dcfce7" },
              { label: absentLabel,    value: isLoading ? "…" : absentList.length,  color: C.absent,  bg: "#fee2e2" },
              { label: leaveLabel,     value: isLoading ? "…" : leaveList.length,   color: C.leave,   bg: "#f5f3ff" },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: isMobileView ? "10px 12px" : "10px 14px" }}>
                <div style={{ fontSize: isMobileView ? 8.5 : 9.5, fontWeight: 700, color: s.color, letterSpacing: "0.7px", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", marginBottom: 3, opacity: 0.75 }}>{s.label}</div>
                <div style={{ fontSize: isNarrow ? 17 : isMobileView ? 20 : 22, fontWeight: 700, color: s.color, fontFamily: "'Playfair Display',serif", lineHeight: 1 }}>{s.value}</div>
                {s.sub && <div style={{ fontSize: isMobileView ? 9 : 10, color: s.color, opacity: 0.65, marginTop: 2, fontFamily: "'DM Sans',sans-serif" }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs + list card ── */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>

          {/* Tab bar */}
          <div className="att-tabs" style={{ display: "flex", gap: 6, padding: "12px 14px 0", borderBottom: `1px solid ${C.border}`, background: "#fafbff", overflowX: "auto", scrollbarWidth: "none" }}>
            <Tab label="Present"  count={isLoading ? "…" : presentList.length} color={C.present} active={activeTab === "present"} onClick={() => setActiveTab("present")} />
            <Tab label="Absent"   count={isLoading ? "…" : absentList.length}  color={C.absent}  active={activeTab === "absent"}  onClick={() => setActiveTab("absent")} />
            <Tab label="On Leave" count={isLoading ? "…" : leaveList.length}   color={C.leave}   active={activeTab === "leave"}   onClick={() => setActiveTab("leave")} />
          </div>

          {/* ── Filter / Search bar ── */}
          <div style={{
            display: "flex",
            flexDirection: isMobileView ? "column" : "row",
            alignItems: isMobileView ? "stretch" : "center",
            gap: 8,
            padding: isMobileView ? "10px 12px" : "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            background: "#fafcff",
          }}>

            {/* Search — always full width on mobile, grows on desktop */}
            <div style={{ position: "relative", flex: isMobileView ? "none" : "1 1 180px", minWidth: 0 }}>
              <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <input
                className="att-search-input"
                type="text"
                placeholder="Search employees…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: "100%", height: 36, paddingLeft: 32, paddingRight: searchQuery ? 30 : 12,
                  border: `1.5px solid ${searchQuery ? C.mid : C.border}`,
                  borderRadius: 9, background: searchQuery ? "#eff6ff" : "#fff",
                  color: C.text, fontSize: 12.5,
                  fontFamily: "'DM Sans',sans-serif",
                  transition: "border-color 0.15s, background 0.15s",
                  boxSizing: "border-box",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.dim, display: "flex", padding: 2 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Dropdowns — side-by-side row (both mobile and desktop) */}
            <div style={{ display: "flex", gap: 8, flex: isMobileView ? "none" : "0 0 auto", minWidth: 0 }}>
              <FilterDropdown
                label={isMobileView ? "Location" : "All Locations"}
                value={locFilter}
                options={locationOptions}
                onChange={setLocFilter}
                style={{ flex: "1 1 0", minWidth: 0 }}
                icon={
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                }
              />
              <FilterDropdown
                label={isMobileView ? "Dept" : "All Depts"}
                value={deptFilter}
                options={departmentOptions}
                onChange={setDeptFilter}
                style={{ flex: "1 1 0", minWidth: 0 }}
                icon={
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                  </svg>
                }
              />
              {/* Clear button — inline on desktop, hidden here on mobile (shown below) */}
              {hasFilters && !isMobileView && (
                <button
                  onClick={clearFilters}
                  style={{
                    height: 36, padding: "0 12px", borderRadius: 9,
                    border: "1.5px solid #fca5a5", background: "#fff1f2",
                    color: C.absent, fontSize: 12, fontWeight: 600,
                    fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5,
                    whiteSpace: "nowrap", flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fee2e2"}
                  onMouseLeave={e => e.currentTarget.style.background = "#fff1f2"}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Clear filters
                </button>
              )}
            </div>

            {/* Mobile: clear + count on their own row */}
            {hasFilters && isMobileView && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <button
                  onClick={clearFilters}
                  style={{
                    height: 34, padding: "0 12px", borderRadius: 9,
                    border: "1.5px solid #fca5a5", background: "#fff1f2",
                    color: C.absent, fontSize: 12, fontWeight: 600,
                    fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5,
                    whiteSpace: "nowrap",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Clear filters
                </button>
                {!isLoading && (
                  <span style={{ fontSize: 12, color: C.muted, fontFamily: "'DM Sans',sans-serif" }}>
                    {activeList.length} of {rawActiveList.length} shown
                  </span>
                )}
              </div>
            )}

            {/* Desktop: result count (right-aligned) */}
            {hasFilters && !isLoading && !isMobileView && (
              <span style={{ fontSize: 12, color: C.muted, fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", marginLeft: "auto" }}>
                {activeList.length} of {rawActiveList.length} shown
              </span>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 0" }}>
              <Spinner />
              <span style={{ fontSize: 13, color: C.dim, fontFamily: "'DM Sans',sans-serif" }}>Loading attendance…</span>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && activeList.length === 0 && (
            <div style={{ textAlign: "center", padding: "52px 24px", color: C.dim, fontFamily: "'DM Sans',sans-serif" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>
                {hasFilters ? "🔍" : activeTab === "present" ? "✅" : activeTab === "absent" ? "🙁" : "🏖️"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>
                {hasFilters
                  ? "No employees match your filters"
                  : activeTab === "present" ? "No employees marked present"
                  : activeTab === "absent"  ? "No employees marked absent"
                  : "No employees on leave"}
              </div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                {hasFilters
                  ? <button onClick={clearFilters} style={{ color: C.mid, background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>Clear filters</button>
                  : `for ${dateLabel}`
                }
              </div>
            </div>
          )}

          {/* Desktop table */}
          {!isLoading && activeList.length > 0 && (
            <>
              <div className="att-table-wrap">
                <table className="att-table" style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans',sans-serif" }}>
                  <thead>
                    <tr style={{ background: "#fafbff", borderBottom: `1.5px solid ${C.border}` }}>
                      {["Employee", "Job Title", "Days Attended", "Location", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: "0.8px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                      <th style={{ width: 32 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {activeList.map(({ emp, rec }) => (
                      <EmpRow
                        key={emp.id}
                        emp={emp}
                        rec={rec}
                        daysAttended={empAttMap[emp.id] ?? 0}
                        totalWorkDays={workdaysToDate}
                        onClick={() => openDetail(emp, rec)}
                        isMobile={false}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="att-mobile-list">
                {activeList.map(({ emp, rec }) => (
                  <EmpRow
                    key={emp.id}
                    emp={emp}
                    rec={rec}
                    daysAttended={empAttMap[emp.id] ?? 0}
                    totalWorkDays={workdaysToDate}
                    onClick={() => openDetail(emp, rec)}
                    isMobile={true}
                  />
                ))}
              </div>

              {/* Footer */}
              <div style={{ padding: "10px 18px", borderTop: "1px solid #f1f5f9", fontSize: 11.5, color: C.dim, fontFamily: "'DM Sans',sans-serif", textAlign: "right" }}>
                {activeList.length} employee{activeList.length !== 1 ? "s" : ""}
                {hasFilters && rawActiveList.length !== activeList.length && ` (filtered from ${rawActiveList.length})`}
                {" · tap any row to view full history"}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}