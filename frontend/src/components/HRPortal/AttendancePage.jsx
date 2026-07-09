// src/components/HRPortal/AttendancePage.jsx
// Attendance page — daily register with date-filtered stats + inline employee history view

import { useState, useEffect, useMemo } from "react";
import ExcelJS from "exceljs";
import { apiFetch } from "../../utils/auth";
import { useHRPortal } from "../../context/HRPortalContext";

// ── PDF helpers ───────────────────────────────────────────────────────────────
function buildPdfContent(title, headers, rows, meta = "") {
  const colWidths = headers.map(() => Math.floor(190 / headers.length));
  const pageW = 210, pageH = 297, margin = 10;
  const tableW = pageW - margin * 2;
  const colW = headers.map((_, i) => {
    // Give name col more room
    if (i === 0) return 50;
    if (i === headers.length - 1) return 40;
    return Math.floor((tableW - 90) / (headers.length - 2));
  });

  let y = margin;
  const lines = [];

  // Helper: escape PDF string
  const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  // Header block
  lines.push(`% PDF header`);
  lines.push(`TITLE:${title}`);
  lines.push(`META:${meta}`);
  lines.push(`HEADERS:${headers.join("|")}`);
  lines.push(`COLW:${colW.join("|")}`);
  rows.forEach(r => lines.push(`ROW:${r.join("|")}`));
  return lines.join("\n");
}

async function generateAndDownloadPDF(title, headers, rows, filename, meta = "") {
  // Load logo as base64
  let logoDataUrl = "";
  try {
    const resp = await fetch("/logo.jpeg");
    const blob = await resp.blob();
    logoDataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  } catch (_) { /* logo optional */ }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) { alert("Please allow popups to download PDF."); return; }

  const colWidths = (() => {
    const n = headers.length;
    const result = headers.map(() => `${Math.floor(100 / n)}%`);
    result[0] = "22%";
    if (n > 2) result[n - 1] = "18%";
    return result;
  })();

  const statusColors = {
    Present:      { color: "#16a34a", bg: "#dcfce7" },
    Absent:       { color: "#dc2626", bg: "#fee2e2" },
    Late:         { color: "#d97706", bg: "#fef3c7" },
    "Half Day":   { color: "#7c3aed", bg: "#f5f3ff" },
    "On Leave":   { color: "#0891b2", bg: "#e0f2fe" },
    "Not Marked": { color: "#94a3b8", bg: "#f1f5f9" },
  };

  const tableRows = rows.map((row, i) => {
    const cells = row.map((cell, ci) => {
      const sc = statusColors[cell];
      if (sc) {
        return `<td style="padding:7px 8px;font-size:10px;vertical-align:middle;">
          <span style="display:inline-block;padding:2px 8px;border-radius:20px;background:${sc.bg};color:${sc.color};font-weight:700;font-size:9px;">${cell}</span>
        </td>`;
      }
      if (ci === headers.indexOf("Marked By") && cell && cell !== "—") {
        const parts = cell.split("\n");
        return `<td style="padding:7px 8px;font-size:10px;vertical-align:middle;color:#1557b0;font-weight:600;">${parts.map((p, pi) => pi === 0 ? p : `<span style="font-size:9px;color:#64748b;font-weight:400;display:block;">${p}</span>`).join("")}</td>`;
      }
      return `<td style="padding:7px 8px;font-size:10px;vertical-align:middle;color:#334155;">${cell || "—"}</td>`;
    });
    return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f8faff"};">${cells.join("")}</tr>`;
  }).join("");

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="height:48px;width:auto;object-fit:contain;border-radius:6px;" alt="Logo"/>`
    : `<div style="width:48px;height:48px;background:#0a2a5e;border-radius:8px;display:flex;align-items:center;justify-content:center;"></div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #0f172a; padding: 20px 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 2.5px solid #0a2a5e; }
    .logo-block { display: flex; align-items: center; gap: 12px; }
    .logo-block .text h1 { font-size: 18px; font-weight: 800; color: #0a2a5e; letter-spacing: -0.5px; }
    .logo-block .text .sub { font-size: 10px; color: #64748b; margin-top: 2px; }
    .meta { text-align: right; font-size: 10px; color: #64748b; line-height: 1.8; }
    .meta strong { color: #0a2a5e; font-size: 11px; display: block; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed; }
    thead tr { background: #0a2a5e; }
    thead th { padding: 9px 8px; text-align: left; font-size: 9.5px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    tbody td { border-bottom: 1px solid #f1f5f9; overflow: hidden; text-overflow: ellipsis; }
    tfoot td { padding: 8px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
    @media print {
      body { padding: 10px 14px; }
      @page { size: A4 landscape; margin: 8mm; }
    }
  </style>
  </head><body>
  <div class="header">
    <div class="logo-block">
      ${logoHtml}
      <div class="text">
        <h1>Attendance Register</h1>
        <div class="sub">HR Management System</div>
      </div>
    </div>
    <div class="meta">
      <strong>${meta}</strong>
      Generated: ${new Date().toLocaleString("en-GB")}<br/>
      Total Records: ${rows.length}
    </div>
  </div>
  <table>
    <colgroup>${colWidths.map(w => `<col style="width:${w}"/>`).join("")}</colgroup>
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot><tr><td colspan="${headers.length}">End of report · HR Portal · ${new Date().toLocaleDateString("en-GB")}</td></tr></tfoot>
  </table>
  <script>window.onload = () => { setTimeout(() => { window.print(); }, 400); }<\/script>
  </body></html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  present:  { label: "Present",  color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  absent:   { label: "Absent",   color: "#dc2626", bg: "#fee2e2", border: "#fecaca" },
  late:     { label: "Late",     color: "#d97706", bg: "#fef3c7", border: "#fde68a" },
  half_day: { label: "Half Day", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  leave:    { label: "On Leave", color: "#0891b2", bg: "#e0f2fe", border: "#bae6fd" },
};
const STATUS_ORDER = ["present", "late", "half_day", "leave", "absent"];

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmtDateLong(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status, size = "sm" }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: size === "lg" ? "5px 14px" : "3px 10px", borderRadius: 20,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      color: cfg.color, fontSize: size === "lg" ? 12.5 : 11, fontWeight: 700,
      fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color = "#1557b0", bg = "#eff6ff", icon, clickable, onClick, active }) {
  return (
    <div
      className="att-stat-card"
      onClick={onClick}
      style={{
        background: active ? color : "#fff",
        borderRadius: 14, border: `1px solid ${active ? color : "#e2e8f0"}`,
        borderLeft: `4px solid ${color}`,
        padding: "16px 18px", display: "flex", alignItems: "center", gap: 12,
        boxShadow: active ? `0 4px 14px ${color}33` : "0 1px 4px rgba(0,0,0,0.05)",
        flex: "1 1 130px", minWidth: 120,
        cursor: clickable ? "pointer" : "default",
        transition: "all 0.15s",
      }}
    >
      <div className="att-stat-icon" style={{
        width: 40, height: 40, borderRadius: 10,
        background: active ? "rgba(255,255,255,0.2)" : bg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div className="att-stat-label" style={{ fontSize: 10, color: active ? "rgba(255,255,255,0.75)" : "#94a3b8", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
        <div className="att-stat-value" style={{ fontSize: 22, fontWeight: 700, color: active ? "#fff" : "#0a2a5e", fontFamily: "'Playfair Display',serif", lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  );
}

// ── ProfileCard wrapper ───────────────────────────────────────────────────────
function ProfileCard({ title, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #f1f5f9", background: "#fafbff" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans',sans-serif" }}>{title}</span>
      </div>
      <div className="ed-info-grid-wrap" style={{ padding: "18px 20px" }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
      <div style={{ fontSize: 13.5, color: "#0f172a", fontFamily: "'DM Sans',sans-serif", fontWeight: 500 }}>{value || "—"}</div>
    </div>
  );
}

// ── Description cell ──────────────────────────────────────────────────────────
function Description({ rec }) {
  if (!rec) return <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>;
  const parts = [];
  if (rec.status === "late" && rec.arrival_time)
    parts.push(<span key="arr" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#d97706", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Arrived {rec.arrival_time}
    </span>);
  if (rec.status === "absent" && rec.absence_reason)
    parts.push(<span key="abs" style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>{rec.absence_reason}</span>);
  if (rec.work_location)
    parts.push(<span key="loc" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      {rec.work_location}
    </span>);
  if (rec.notes && !parts.length)
    parts.push(<span key="note" style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>{rec.notes}</span>);
  if (!parts.length) return <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{parts}</div>;
}

// ── Employee Detail View (replaces the table) ─────────────────────────────────
function EmployeeDetailView({ emp, onBack, showToast }) {
  const { fetchEmployeeDetail } = useHRPortal();
  const [detail, setDetail]           = useState(null);
  const [history, setHistory]         = useState([]);
  const [loadingDetail, setLD]        = useState(true);
  const [loadingHistory, setLH]       = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [activeTab, setActiveTab]     = useState("history");

  const fullName = emp.full_name ||
    [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";

  // Full employee detail via context helper
  useEffect(() => {
    setLD(true);
    fetchEmployeeDetail(emp.id)
      .then(d => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLD(false));
  }, [emp.id, fetchEmployeeDetail]);

  // Full attendance history
  useEffect(() => {
    setLH(true);
    const dateAfter  = emp.date_joined || "2020-01-01";
    const dateBefore = toYMD(new Date());
    apiFetch(`${API}/attendance/?employee=${emp.id}&date_after=${dateAfter}&date_before=${dateBefore}&page_size=3000`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : data.results || [];
        list.sort((a, b) => b.date.localeCompare(a.date));
        setHistory(list);
      })
      .catch(() => {})
      .finally(() => setLH(false));
  }, [emp.id, emp.date_joined]);

  const grouped = useMemo(() => {
    const map = {};
    history.forEach(r => {
      const key = r.date.slice(0, 7);
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, half_day: 0, leave: 0 };
    history.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
    return c;
  }, [history]);

  function monthLabel(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
  }

  function buildRows() {
    return [...history].sort((a, b) => a.date.localeCompare(b.date)).map(r => {
      const [y, m, d] = r.date.split("-").map(Number);
      const day = new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long" });
      return [r.date, day, STATUS_CONFIG[r.status]?.label || r.status,
        r.arrival_time || "", r.absence_reason || "", r.work_location || "", r.marked_by || "", r.notes || ""];
    });
  }

  function downloadCSV() {
    setDownloading("csv");
    const headers = ["Date", "Day", "Status", "Arrival Time", "Absence Reason", "Work Location", "Marked By", "Notes"];
    const rows = buildRows().map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${fullName.replace(/ /g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setDownloading(null);
  }

  function downloadPDF() {
    setDownloading("pdf");
    const headers = ["Date", "Day", "Status", "Arrival", "Location", "Marked By", "Notes"];
    const rows = buildRows().map(r => [r[0], r[1], r[2], r[3], r[5], r[6], r[7]]);
    generateAndDownloadPDF(
      `Attendance — ${fullName}`,
      headers,
      rows,
      `attendance_${fullName.replace(/ /g, "_")}.pdf`,
      `${fullName} · ${emp.job_title || ""} · ${emp.department_name || ""}`
    ).finally(() => setDownloading(null));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, animation: "fadeInUp 0.25s ease" }}>

      {/* ── Blue header bar with back button ── */}
      <div className="ed-header" style={{
        background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
        borderRadius: 16, padding: "20px 24px", marginBottom: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            className="ed-back-btn"
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 14px", borderRadius: 9,
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
              cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back to Register
          </button>
          <div className="ed-header-divider" style={{ width: 1, height: 32, background: "rgba(255,255,255,0.2)" }} />
          <div>
            <div className="ed-header-name" style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: "#fff" }}>{fullName}</div>
            <div className="ed-header-sub" style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
              {emp.job_title || "—"} · {emp.department_name || "—"}
              {emp.employee_number && ` · #${emp.employee_number}`}
            </div>
          </div>
        </div>
        {/* History summary chips */}
        <div className="ed-chips" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_ORDER.map(s => counts[s] > 0 && (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_CONFIG[s].color }} />
              <span style={{ fontSize: 11, color: "#fff", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>{counts[s]} {STATUS_CONFIG[s].label}</span>
            </div>
          ))}
          <div style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans',sans-serif" }}>{history.length} total records</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="ed-tabs" style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #e2e8f0" }}>
        {[{ key: "history", label: "Attendance History" }, { key: "profile", label: "Employee Profile" }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="ed-tab-btn"
            style={{
              padding: "10px 20px", border: "none", background: "transparent",
              fontSize: 13.5, fontWeight: activeTab === t.key ? 700 : 500,
              color: activeTab === t.key ? "#1557b0" : "#64748b",
              fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
              borderBottom: activeTab === t.key ? "2px solid #1557b0" : "2px solid transparent",
              marginBottom: -2, transition: "color 0.15s",
            }}>{t.label}</button>
        ))}
      </div>

      {/* ── Attendance History tab ── */}
      {activeTab === "history" && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div className="ed-history-toolbar" style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
              {emp.date_joined ? `Since ${fmtDateLong(emp.date_joined)}` : "Full attendance history"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={downloadCSV} disabled={!!downloading || !history.length}
                className="ed-dl-btn"
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 12.5, fontWeight: 600, color: "#0a2a5e", fontFamily: "'DM Sans',sans-serif", cursor: history.length ? "pointer" : "not-allowed", opacity: history.length ? 1 : 0.5 }}
                onMouseEnter={e => { if (history.length) e.currentTarget.style.borderColor = "#1557b0"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {downloading === "csv" ? "Downloading…" : "CSV"}
              </button>
              <button
                onClick={downloadPDF} disabled={!!downloading || !history.length}
                className="ed-dl-btn"
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 9, border: "1.5px solid #fecaca", background: "#fff5f5", fontSize: 12.5, fontWeight: 600, color: "#dc2626", fontFamily: "'DM Sans',sans-serif", cursor: history.length ? "pointer" : "not-allowed", opacity: history.length ? 1 : 0.5 }}
                onMouseEnter={e => { if (history.length) e.currentTarget.style.borderColor = "#dc2626"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#fecaca"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                {downloading === "pdf" ? "Opening…" : "PDF"}
              </button>
            </div>
          </div>
          {loadingHistory ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
              <div style={{ width: 20, height: 20, border: "2.5px solid #e2e8f0", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Loading history…
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>No attendance records found.</div>
          ) : grouped.map(([ym, recs]) => (
            <div key={ym}>
              <div style={{ padding: "10px 24px 6px", fontSize: 10.5, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif", background: "#fafbff", borderBottom: "1px solid #f1f5f9" }}>
                {monthLabel(ym)} · {recs.length} day{recs.length !== 1 ? "s" : ""}
              </div>
              {recs.map((r, i) => {
                const [y, m, d] = r.date.split("-").map(Number);
                const dt = new Date(y, m - 1, d);
                const cfg = STATUS_CONFIG[r.status] || { color: "#64748b", bg: "#f1f5f9" };
                return (
                  <div key={r.id} className="ed-history-row" style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 24px", borderBottom: i < recs.length - 1 ? "1px solid #f8faff" : "none", background: i % 2 === 0 ? "#fff" : "#fafcff" }}>
                    <div className="ed-day-tile" style={{ width: 46, flexShrink: 0, textAlign: "center", background: cfg.bg, borderRadius: 10, padding: "6px 4px", border: `1px solid ${cfg.color}22` }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: cfg.color, fontFamily: "'Playfair Display',serif", lineHeight: 1 }}>{dt.getDate()}</div>
                      <div style={{ fontSize: 9.5, color: cfg.color, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {dt.toLocaleDateString("en-GB", { month: "short" })}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", fontFamily: "'DM Sans',sans-serif" }}>
                          {dt.toLocaleDateString("en-GB", { weekday: "long" })}
                        </span>
                        <StatusBadge status={r.status} />
                      </div>
                      {r.status === "late" && r.arrival_time && (
                        <div style={{ fontSize: 11.5, color: "#d97706", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          Arrived at {r.arrival_time}
                        </div>
                      )}
                      {r.status === "absent" && r.absence_reason && (
                        <div style={{ fontSize: 11.5, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>Reason: {r.absence_reason}</div>
                      )}
                      {r.work_location && (
                        <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {r.work_location}
                        </div>
                      )}
                      {r.marked_by && (
                        <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>Marked by: {r.marked_by}</div>
                      )}
                      {r.notes && (
                        <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>Note: {r.notes}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Employee Profile tab ── */}
      {activeTab === "profile" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {loadingDetail ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 10, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
              <div style={{ width: 20, height: 20, border: "2.5px solid #e2e8f0", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Loading profile…
            </div>
          ) : !detail ? (
            <div style={{ textAlign: "center", padding: "48px", color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>Could not load employee details.</div>
          ) : (
            <>
              <ProfileCard title="Personal Information">
                <div className="ed-info-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px 24px" }}>
                  <InfoRow label="Full Name" value={detail.full_name || [detail.first_name, detail.middle_name, detail.last_name].filter(Boolean).join(" ")} />
                  <InfoRow label="Date of Birth" value={detail.date_of_birth ? fmtDateLong(detail.date_of_birth) : null} />
                  <InfoRow label="Gender" value={detail.gender === "M" ? "Male" : detail.gender === "F" ? "Female" : detail.gender === "O" ? "Other" : detail.gender} />
                  <InfoRow label="National ID" value={detail.national_id} />
                  <InfoRow label="Phone" value={detail.phone_number} />
                  <InfoRow label="Email" value={detail.email} />
                  <InfoRow label="Address" value={detail.address} />
                </div>
              </ProfileCard>

              <ProfileCard title="Employment Details">
                <div className="ed-info-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px 24px" }}>
                  <InfoRow label="Employee Number" value={detail.employee_number} />
                  <InfoRow label="Job Title" value={detail.job_title} />
                  <InfoRow label="Department" value={detail.department_name} />
                  <InfoRow label="Employment Type" value={detail.employment_type?.replace(/_/g, " ")} />
                  <InfoRow label="Status" value={detail.status} />
                  <InfoRow label="Date Joined" value={detail.date_joined ? fmtDateLong(detail.date_joined) : null} />
                </div>
              </ProfileCard>

              {(detail.basic_salary || detail.bank_name_usd || detail.bank_name_zig) && (
                <ProfileCard title="Payroll & Banking">
                  <div className="ed-info-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px 24px" }}>
                    <InfoRow label="Basic Salary" value={detail.basic_salary ? `${detail.currency || "USD"} ${Number(detail.basic_salary).toLocaleString()}` : null} />
                    <InfoRow label="Allowances"   value={detail.allowances  ? `${detail.currency || "USD"} ${Number(detail.allowances).toLocaleString()}`  : null} />
                    <InfoRow label="Deductions"   value={detail.deductions  ? `${detail.currency || "USD"} ${Number(detail.deductions).toLocaleString()}`  : null} />
                    <InfoRow label="Net Salary"   value={detail.net_salary  ? `${detail.currency || "USD"} ${Number(detail.net_salary).toLocaleString()}`  : null} />
                    <InfoRow label="USD Bank"        value={detail.bank_name_usd} />
                    <InfoRow label="USD Account No." value={detail.bank_account_usd} />
                    <InfoRow label="ZiG Bank"        value={detail.bank_name_zig} />
                    <InfoRow label="ZiG Account No." value={detail.bank_account_zig} />
                  </div>
                </ProfileCard>
              )}

              {detail.nok_full_name && (
                <ProfileCard title="Next of Kin">
                  <div className="ed-info-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px 24px" }}>
                    <InfoRow label="Name"         value={detail.nok_full_name} />
                    <InfoRow label="Relationship" value={detail.nok_relationship} />
                    <InfoRow label="Phone"        value={detail.nok_phone} />
                    <InfoRow label="Email"        value={detail.nok_email} />
                  </div>
                </ProfileCard>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Monthly Register (Excel) ────────────────────────────────────────────────
// Builds a "JUNE DAILY REGISTER" style workbook: employees grouped by the
// actual work site (e.g. "Masons") they were marked at during the month —
// not their department — one column per day (1 = present, 0 = not), and a
// "Total days" column that sums the row via an Excel formula.
const MONTH_NAMES = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
const PRESENT_STATUSES = new Set(["present", "late", "half_day"]);

async function buildAndDownloadMonthlyRegister({ employees, records, year, month, showToast }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // recMap[employeeId][YYYY-MM-DD] = status
  const recMap = {};
  records.forEach(r => {
    const empId = typeof r.employee === "object" ? r.employee.id : r.employee;
    if (!recMap[empId]) recMap[empId] = {};
    recMap[empId][r.date] = r.status;
  });

  // Work out each employee's site for the month — the work_location they
  // were marked at most often on their attendance records. Employees with
  // no location on record for the month fall into "Unassigned".
  const siteCounts = {};
  records.forEach(r => {
    const empId = typeof r.employee === "object" ? r.employee.id : r.employee;
    const loc = (r.work_location || "").trim();
    if (!loc) return;
    if (!siteCounts[empId]) siteCounts[empId] = {};
    siteCounts[empId][loc] = (siteCounts[empId][loc] || 0) + 1;
  });
  const employeeSite = {};
  employees.forEach(emp => {
    const counts = siteCounts[emp.id];
    if (!counts) { employeeSite[emp.id] = "Unassigned"; return; }
    employeeSite[emp.id] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  });

  // Group employees by site
  const bySite = {};
  employees.forEach(emp => {
    const site = employeeSite[emp.id];
    if (!bySite[site]) bySite[site] = [];
    bySite[site].push(emp);
  });
  const siteNames = Object.keys(bySite).sort((a, b) =>
    a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${MONTH_NAMES[month]} ${year}`.slice(0, 31));

  const totalCols = 3 + daysInMonth + 1; // No. + Name + Position + days + Total days

  // ── Title row ──
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${MONTH_NAMES[month]} ${year} DAILY REGISTER [ALL SITES]`;
  titleCell.font = { bold: true, size: 14, name: "Arial" };
  titleCell.alignment = { horizontal: "center" };

  // ── Header row ──
  const headerRow = ws.getRow(2);
  headerRow.getCell(1).value = "No.";
  headerRow.getCell(2).value = "Employees Names";
  headerRow.getCell(3).value = "Position";
  for (let d = 1; d <= daysInMonth; d++) headerRow.getCell(3 + d).value = d;
  headerRow.getCell(3 + daysInMonth + 1).value = "Total days";
  headerRow.eachCell(cell => { cell.font = { bold: true, name: "Arial", size: 10 }; cell.alignment = { horizontal: "center" }; });
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow === 0 || dow === 6) headerRow.getCell(3 + d).font = { bold: true, name: "Arial", size: 10, color: { argb: "FFFF0000" } };
  }

  // ── Column widths ──
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 24;
  for (let d = 1; d <= daysInMonth; d++) ws.getColumn(3 + d).width = 4;
  ws.getColumn(3 + daysInMonth + 1).width = 12;

  // ── Site groups + employee rows ──
  let rowIdx = 3;
  siteNames.forEach(site => {
    const siteRow = ws.getRow(rowIdx);
    siteRow.getCell(2).value = site;
    siteRow.getCell(2).font = { bold: true, name: "Arial", size: 10.5 };
    for (let c = 1; c <= totalCols; c++) {
      siteRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    }
    rowIdx++;

    bySite[site].forEach((emp, i) => {
      const row = ws.getRow(rowIdx);
      row.font = { name: "Arial", size: 10 };
      const fullName = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
      row.getCell(1).value = i + 1;
      row.getCell(2).value = fullName;
      row.getCell(3).value = emp.job_title || emp.position || "";
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const status = recMap[emp.id]?.[dateStr];
        row.getCell(3 + d).value = PRESENT_STATUSES.has(status) ? 1 : 0;
        row.getCell(3 + d).alignment = { horizontal: "center" };
      }
      const totalCell = row.getCell(3 + daysInMonth + 1);
      const startCol = ws.getColumn(4).letter, endCol = ws.getColumn(3 + daysInMonth).letter;
      totalCell.value = { formula: `SUM(${startCol}${rowIdx}:${endCol}${rowIdx})` };
      totalCell.font = { bold: true, name: "Arial", size: 10 };
      rowIdx++;
    });
  });

  ws.views = [{ state: "frozen", ySplit: 2 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${MONTH_NAMES[month].toLowerCase()}_${year}_register.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast?.("Register downloaded.");
}

// ── Location helpers (mirrors DeptPortal's site picker) ────────────────────
// resolveLocation: title-cases the input (the shared registry is the single
// source of truth for known names, no client-side alias mapping needed).
function resolveLocation(raw) {
  if (!raw || !raw.trim()) return "";
  return raw.trim().replace(/\b\w/g, c => c.toUpperCase());
}
function suggestLocations(raw, registry) {
  if (!raw || raw.length < 1 || !registry) return [];
  const lower = raw.toLowerCase();
  return registry.filter(name => name.toLowerCase().includes(lower));
}

// ── Zimbabwe Public Holidays (same logic used on the Payroll page, so the
// working-day count here always matches what Payroll shows) ────────────────
const ZW_PUBLIC_HOLIDAYS_RECURRING = [
  "01-01", "02-21", "04-18", "05-01", "05-25",
  "08-11", "08-12", "12-22", "12-25", "12-26",
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
  // Easter calculation
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

// ── Bulk "Mark Register" view ───────────────────────────────────────────────
// Lets HR mark Present for any employee, across any department, for any
// number of days at once — click cells to select, then Save Register.
// Days already on record (any status) show as a read-only badge; only
// unmarked days are selectable, since there's no delete/undo endpoint to
// safely overwrite a status a HOD may have set for a reason.
function RegisterMarkingView({ employees, departments, onBack, showToast }) {
  const todayObj = new Date();
  const todayStr = toYMD(todayObj);
  const [year,  setYear]  = useState(todayObj.getFullYear());
  const [month, setMonth] = useState(todayObj.getMonth()); // 0-indexed
  const [deptFilter, setDeptFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [existing, setExisting] = useState({}); // { empId: { "YYYY-MM-DD": status } }
  const [loading, setLoading]   = useState(true);
  const [marks, setMarks]       = useState(() => new Set()); // "empId:YYYY-MM-DD" pending selections
  const [saving, setSaving]     = useState(false);
  const [saveProgress, setSaveProgress] = useState(null); // { done, total }

  // ── Per-employee "site" for the month — shared registry + free typing ──
  const [locationRegistry, setLocationRegistry] = useState([]);
  const [siteDraft, setSiteDraft] = useState({});        // { empId: "Masons" }
  const [siteSuggestions, setSiteSuggestions] = useState({});
  const [siteDropOpen, setSiteDropOpen] = useState({});

  useEffect(() => {
    apiFetch(`${API}/attendance/locations/`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = (Array.isArray(data) ? data : data.results || []).map(l => l.name);
        setLocationRegistry(list);
      })
      .catch(() => {});
  }, []);

  const registerLocation = async (name) => {
    if (!name?.trim()) return;
    const trimmed = name.trim();
    if (locationRegistry.some(l => l.toLowerCase() === trimmed.toLowerCase())) return;
    setLocationRegistry(prev => [...prev, trimmed].sort((a, b) => a.localeCompare(b)));
    try {
      const res = await apiFetch(`${API}/attendance/locations/`, { method: "POST", body: JSON.stringify({ name: trimmed }) });
      if (res.ok) {
        const saved = await res.json();
        setLocationRegistry(prev => {
          const without = prev.filter(l => l.toLowerCase() !== saved.name.toLowerCase());
          return [...without, saved.name].sort((a, b) => a.localeCompare(b));
        });
      }
    } catch (_) { /* optimistic update stays */ }
  };

  const handleSiteInput = (empId, val) => {
    setSiteDraft(d => ({ ...d, [empId]: val }));
    const sug = suggestLocations(val, locationRegistry).slice(0, 12);
    setSiteSuggestions(s => ({ ...s, [empId]: sug }));
    setSiteDropOpen(o => ({ ...o, [empId]: sug.length > 0 && val.length > 0 }));
  };
  // Called on focus — shows the full known-sites list right away (filtered
  // to whatever's already typed) so a previously-used site doesn't need to
  // be retyped from scratch each time; only narrows as HR keeps typing.
  const openSiteSuggestions = (empId) => {
    const v = siteDraft[empId] || "";
    const sug = (v ? suggestLocations(v, locationRegistry) : locationRegistry).slice(0, 12);
    setSiteSuggestions(s => ({ ...s, [empId]: sug }));
    setSiteDropOpen(o => ({ ...o, [empId]: sug.length > 0 }));
  };
  const handleSiteBlur = (empId) => {
    setTimeout(() => {
      setSiteDropOpen(o => ({ ...o, [empId]: false }));
      setSiteDraft(d => {
        const cur = d[empId] || "";
        return cur.trim() ? { ...d, [empId]: resolveLocation(cur) } : d;
      });
    }, 160);
  };
  const pickSite = (empId, loc) => {
    setSiteDraft(d => ({ ...d, [empId]: loc }));
    setSiteDropOpen(o => ({ ...o, [empId]: false }));
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd   = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  // Fetch existing records for the whole month whenever it changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMarks(new Set());
    apiFetch(`${API}/attendance/?date_after=${monthStart}&date_before=${monthEnd}&page_size=8000`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data.results || [];
        const map = {};
        list.forEach(r => {
          const empId = typeof r.employee === "object" ? r.employee.id : r.employee;
          if (!map[empId]) map[empId] = {};
          map[empId][r.date] = r.status;
        });
        setExisting(map);

        // Prefill each employee's site input with whatever work_location they
        // were marked at most often this month, so HR only has to type when
        // it's genuinely unset — never overwrites something already typed.
        const siteCounts = {};
        list.forEach(r => {
          const empId = typeof r.employee === "object" ? r.employee.id : r.employee;
          const loc = (r.work_location || "").trim();
          if (!loc) return;
          if (!siteCounts[empId]) siteCounts[empId] = {};
          siteCounts[empId][loc] = (siteCounts[empId][loc] || 0) + 1;
        });
        setSiteDraft(prev => {
          const next = { ...prev };
          // 1. Whatever was actually marked most often this month wins first —
          //    it reflects a genuine in-month reassignment.
          Object.entries(siteCounts).forEach(([empId, counts]) => {
            if (next[empId] !== undefined) return; // don't clobber a manual edit
            next[empId] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
          });
          // 2. Otherwise, fall back to the employee's assigned Site (from the
          //    Employees page) as the starting point — still just a default
          //    for this register; typing over it doesn't change their
          //    permanent assignment.
          (employees || []).forEach(emp => {
            if (next[emp.id] !== undefined) return;
            if (emp.site_name) next[emp.id] = emp.site_name;
          });
          return next;
        });
      })
      .catch(() => showToast?.("Failed to load existing attendance.", "err"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [monthStart, monthEnd, employees]);

  const activeEmployees = useMemo(() => (employees || []).filter(e => e.status === "employed"), [employees]);

  const filtered = useMemo(() => activeEmployees.filter(emp => {
    const fullName = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ");
    const q = search.toLowerCase();
    const matchSearch = !q || fullName.toLowerCase().includes(q) || (emp.job_title || "").toLowerCase().includes(q) || (emp.department_name || "").toLowerCase().includes(q);
    const matchDept = deptFilter === "all" || String(emp.department) === deptFilter;
    const empSite = resolveLocation(siteDraft[emp.id] || "");
    const matchSite = siteFilter === "all" || (siteFilter === "unassigned" ? !empSite : empSite === siteFilter);
    return matchSearch && matchDept && matchSite;
  }), [activeEmployees, search, deptFilter, siteFilter, siteDraft]);

  const dayList = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const dateStr = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const isFutureDay = (d) => dateStr(d) > todayStr;
  const holidays = useMemo(() => getZwPublicHolidays(year, month), [year, month]);
  const isHoliday = (d) => holidays.has(dateStr(d));
  const isWorkDay = (d) => {
    const dow = new Date(year, month, d).getDay();
    if (dow === 0 || dow === 6) return false;
    return !isHoliday(d);
  };
  const cellKey = (empId, d) => `${empId}:${dateStr(d)}`;

  const toggleCell = (empId, d) => {
    if (isFutureDay(d) || existing[empId]?.[dateStr(d)]) return;
    const key = cellKey(empId, d);
    setMarks(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Clicking an employee's name auto-marks their working days (Mon–Fri,
  // excluding ZW public holidays) for the month — weekends & holidays are
  // left out and can still be ticked manually on their individual cells.
  // Clicking the name again unmarks whichever of those working days are
  // currently pending (not yet saved), toggling the whole row on/off.
  const markWholeRow = (empId) => {
    const workCells = dayList.filter(d => isWorkDay(d) && !isFutureDay(d) && !existing[empId]?.[dateStr(d)]);
    if (workCells.length === 0) return;
    const allSelected = workCells.every(d => marks.has(cellKey(empId, d)));
    setMarks(prev => {
      const next = new Set(prev);
      workCells.forEach(d => {
        const key = cellKey(empId, d);
        allSelected ? next.delete(key) : next.add(key);
      });
      return next;
    });
  };

  // Clicking a day-header column is an explicit, single-day choice — so it
  // marks that day for everyone regardless of whether it's a weekend or
  // holiday. Clicking the same header again unmarks whichever of those
  // pending cells are currently selected, toggling the whole column on/off.
  const markWholeColumn = (d) => {
    if (isFutureDay(d)) return;
    const colCells = filtered.filter(emp => !existing[emp.id]?.[dateStr(d)]);
    if (colCells.length === 0) return;
    const allSelected = colCells.every(emp => marks.has(cellKey(emp.id, d)));
    setMarks(prev => {
      const next = new Set(prev);
      colCells.forEach(emp => {
        const key = cellKey(emp.id, d);
        allSelected ? next.delete(key) : next.add(key);
      });
      return next;
    });
  };

  // Top toolbar "Mark All Working Days" — marks Mon–Fri, excluding ZW public
  // holidays, for every visible employee at once (matches the working-day
  // count shown on the Payroll page). Weekends and holidays are excluded
  // here too; mark them manually via individual cells or a day-column
  // header if genuinely worked. Clicking again unmarks everything it
  // pending-marked, toggling the whole month on/off.
  const markEverythingVisible = () => {
    const allCells = [];
    filtered.forEach(emp => dayList.forEach(d => {
      if (isWorkDay(d) && !isFutureDay(d) && !existing[emp.id]?.[dateStr(d)]) allCells.push(cellKey(emp.id, d));
    }));
    if (allCells.length === 0) return;
    const allSelected = allCells.every(key => marks.has(key));
    setMarks(prev => {
      const next = new Set(prev);
      allCells.forEach(key => { allSelected ? next.delete(key) : next.add(key); });
      return next;
    });
  };

  const clearSelection = () => setMarks(new Set());

  const handleSave = async () => {
    if (marks.size === 0) return;
    setSaving(true);
    const items = Array.from(marks).map(key => {
      const [empId, date] = key.split(":");
      return { empId, date };
    });
    setSaveProgress({ done: 0, total: items.length });

    // Persist any newly-typed sites to the shared registry first
    const empIds = Array.from(new Set(items.map(i => i.empId)));
    await Promise.all(empIds.map(empId => {
      const loc = resolveLocation(siteDraft[empId] || "");
      return loc ? registerLocation(loc) : Promise.resolve();
    }));

    let succeeded = 0, failed = 0;
    const batchSize = 6;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(({ empId, date }) => {
        const work_location = resolveLocation(siteDraft[empId] || "");
        return apiFetch(`${API}/attendance/`, {
          method: "POST",
          body: JSON.stringify({ employee: Number(empId), date, status: "present", shift: null, notes: "", work_location }),
        }).then(r => r.ok).catch(() => false);
      }));
      results.forEach(ok => ok ? succeeded++ : failed++);
      setSaveProgress({ done: Math.min(i + batchSize, items.length), total: items.length });
    }

    // Refresh existing records so saved cells become read-only badges
    try {
      const res = await apiFetch(`${API}/attendance/?date_after=${monthStart}&date_before=${monthEnd}&page_size=8000`);
      const data = res.ok ? await res.json() : [];
      const list = Array.isArray(data) ? data : data.results || [];
      const map = {};
      list.forEach(r => {
        const empId = typeof r.employee === "object" ? r.employee.id : r.employee;
        if (!map[empId]) map[empId] = {};
        map[empId][r.date] = r.status;
      });
      setExisting(map);
    } catch (_) { /* non-fatal */ }

    setMarks(new Set());
    setSaving(false);
    setSaveProgress(null);
    showToast?.(failed === 0
      ? `Marked ${succeeded} attendance record${succeeded === 1 ? "" : "s"} as Present.`
      : `Saved ${succeeded}, ${failed} failed — they may already be marked.`,
      failed === 0 ? undefined : "err");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, animation: "fadeInUp 0.3s ease" }}>
      {/* ── Header ── */}
      <div className="reg-header" style={{
        background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
        borderRadius: 16, padding: "18px 22px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={onBack}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Register
          </button>
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: "#fff" }}>Mark Register</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
              Click a name or day to mark/unmark working days (weekends & ZW holidays excluded), then save
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", outline: "none", cursor: "pointer" }}>
            {MONTH_NAMES.map((m, i) => <option key={m} value={i} style={{ color: "#0a2a5e" }}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", outline: "none", cursor: "pointer" }}>
            {Array.from({ length: 6 }, (_, i) => todayObj.getFullYear() - i).map(y => <option key={y} value={y} style={{ color: "#0a2a5e" }}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="reg-toolbar" style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "14px 18px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <input type="text" placeholder="Search name, job title or department…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", outline: "none", background: "#fafbff" }}
          />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer" }}>
          <option value="all">All Departments</option>
          {(departments || []).map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </select>
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
          title="Filter to employees currently assigned to a site — sites come from the shared registry built up as registers are marked"
          style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer" }}>
          <option value="all">All Sites</option>
          {locationRegistry.map(site => <option key={site} value={site}>{site}</option>)}
          <option value="unassigned">Unassigned</option>
        </select>
        <button onClick={markEverythingVisible} disabled={loading} title="Marks working days (Mon–Fri, excl. ZW public holidays) for everyone visible below — click again to unmark"
          className="reg-btn"
          style={{ padding: "9px 14px", borderRadius: 9, border: "1.5px solid #1557b0", background: "#fff", color: "#1557b0", fontSize: 12.5, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: loading ? "not-allowed" : "pointer" }}>
          Mark All Working Days
        </button>
        {marks.size > 0 && (
          <button onClick={clearSelection}
            className="reg-btn"
            style={{ padding: "9px 14px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 12.5, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}>
            Clear ({marks.size})
          </button>
        )}
        <div className="reg-toolbar-spacer" style={{ flex: 1 }} />
        <button onClick={handleSave} disabled={marks.size === 0 || saving}
          className="reg-btn"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 18px", borderRadius: 9,
            background: "linear-gradient(135deg,#0a2a5e,#1557b0)", border: "none", color: "#fff",
            fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
            cursor: marks.size === 0 || saving ? "not-allowed" : "pointer",
            opacity: marks.size === 0 || saving ? 0.6 : 1,
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          {saving ? `Saving ${saveProgress?.done ?? 0}/${saveProgress?.total ?? 0}…` : `Save Register (${marks.size} marked Present)`}
        </button>
      </div>

      {/* ── Legend ── */}
      <div className="reg-legend" style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11.5, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "#dcfce7", border: "1.5px solid #16a34a", display: "inline-block" }} /> Selected — will be saved as Present</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "#f1f5f9", border: "1.5px solid #cbd5e1", display: "inline-block" }} /> Already on record</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "#fff", border: "1.5px dashed #e2e8f0", display: "inline-block" }} /> Unmarked — click to select</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} /> Weekend</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#d97706", display: "inline-block" }} /> Public holiday</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>Weekends & holidays are never auto-marked — click a name/day header to toggle whole row/column, or a cell to include one on purpose</span>
      </div>

      {/* ── Grid ── */}
      <div className="reg-grid-wrap" style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "auto" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 22, height: 22, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Loading attendance…
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>No employees match your filters.</div>
        ) : (
          <table style={{ borderCollapse: "collapse", fontFamily: "'DM Sans',sans-serif", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#fafbff", borderBottom: "1.5px solid #e2e8f0" }}>
                <th style={{ position: "sticky", left: 0, background: "#fafbff", padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", zIndex: 2 }}>Employee</th>
                <th style={{ padding: "10px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", minWidth: 170 }}>Site</th>
                {dayList.map(d => {
                  const dow = new Date(year, month, d).getDay();
                  const weekend = dow === 0 || dow === 6;
                  const holiday = !weekend && isHoliday(d);
                  const dayColor = weekend ? "#dc2626" : holiday ? "#d97706" : "#64748b";
                  return (
                    <th key={d} onClick={() => markWholeColumn(d)} className="reg-day-th"
                      title={isFutureDay(d) ? undefined : holiday ? `Public holiday — click to mark/unmark all visible employees on day ${d} anyway` : `Click to mark/unmark all visible employees Present on day ${d}`}
                      style={{ padding: "8px 6px", textAlign: "center", fontSize: 10.5, fontWeight: 700, color: dayColor, cursor: isFutureDay(d) ? "default" : "pointer", userSelect: "none", minWidth: 30 }}>
                      {d}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, i) => {
                const fullName = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
                const rowBg = i % 2 === 0 ? "#fff" : "#fafcff";
                return (
                  <tr key={emp.id} style={{ borderBottom: "1px solid #f1f5f9", background: rowBg }}>
                    <td onClick={() => markWholeRow(emp.id)} className="reg-name-td"
                      title="Click to mark/unmark all unmarked working days (Mon–Fri, excl. ZW public holidays) this month Present for this employee — click individual weekend/holiday cells to add those manually"
                      style={{ position: "sticky", left: 0, background: rowBg, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap", zIndex: 1 }}>
                      <span style={{ fontWeight: 600, color: "#0a2a5e", fontSize: 12.5 }}>{fullName}</span>
                      {emp.department_name && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>· {emp.department_name}</span>}
                    </td>

                    {/* Site — where this employee worked this month, autocompleted from the shared registry */}
                    <td style={{ padding: "6px 10px", verticalAlign: "middle" }} onClick={e => e.stopPropagation()}>
                      <div style={{ position: "relative" }}>
                        <input
                          value={siteDraft[emp.id] || ""}
                          onChange={ev => handleSiteInput(emp.id, ev.target.value)}
                          onFocus={() => openSiteSuggestions(emp.id)}
                          onBlur={() => handleSiteBlur(emp.id)}
                          placeholder="e.g. Masons…"
                          style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: "#334155", outline: "none", background: "#fafbff" }}
                          onFocusCapture={e => { e.target.style.borderColor = "#1557b0"; }}
                        />
                        {siteDropOpen[emp.id] && (siteSuggestions[emp.id] || []).length > 0 && (
                          <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 50, background: "#fff", border: "1.5px solid #1557b0", borderRadius: 9, boxShadow: "0 8px 24px rgba(21,87,176,0.15)", overflow: "hidden" }}>
                            {(siteSuggestions[emp.id] || []).map(s => (
                              <button key={s} onMouseDown={() => pickSite(emp.id, s)}
                                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12, color: "#334155", border: "none", background: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {dayList.map(d => {
                      const ds = dateStr(d);
                      const status = existing[emp.id]?.[ds];
                      const selected = marks.has(cellKey(emp.id, d));
                      const future = isFutureDay(d);
                      const clickable = !status && !future;
                      const holidayCell = !status && !future && isHoliday(d);
                      const cfg = status ? (STATUS_CONFIG[status] || { color: "#64748b", bg: "#f1f5f9" }) : null;
                      return (
                        <td key={d} onClick={() => toggleCell(emp.id, d)}
                          title={status ? `${STATUS_CONFIG[status]?.label || status} — already on record` : future ? "Future date" : holidayCell ? "Public holiday — click to mark Present anyway" : "Click to mark Present"}
                          style={{ padding: 4, textAlign: "center", cursor: clickable ? "pointer" : "default" }}>
                          <div style={{
                            width: 26, height: 26, margin: "0 auto", borderRadius: 6,
                            background: selected ? "#16a34a" : status ? cfg.bg : future ? "#fafbff" : holidayCell ? "#fef3c7" : "#fff",
                            border: selected ? "2px solid #16a34a" : status ? `1.5px solid ${cfg.color}` : future ? "1px solid #f1f5f9" : holidayCell ? "1.5px dashed #d97706" : "2px solid #94a3b8",
                            boxShadow: selected ? "0 2px 6px rgba(22,163,74,0.35)" : "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.1s",
                          }}>
                            {selected && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            {!selected && status && <span style={{ fontSize: 9.5, fontWeight: 800, color: cfg.color }}>{status.charAt(0).toUpperCase()}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AttendancePage({ showToast }) {
  const { employees: ctxEmployees, departments } = useHRPortal();

  const todayStr = toYMD(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [deptFilter,   setDeptFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [siteFilter,   setSiteFilter]   = useState("all");
  const [search,       setSearch]       = useState("");

  const [attendance, setAttendance] = useState([]);
  const [attLoading, setAttLoading] = useState(true);

  // Shared site registry — same source the "Mark Register" view writes to,
  // so this filter's options always line up with what HR can type there.
  const [locationRegistry, setLocationRegistry] = useState([]);
  useEffect(() => {
    apiFetch(`${API}/attendance/locations/`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = (Array.isArray(data) ? data : data.results || []).map(l => l.name);
        setLocationRegistry(list);
      })
      .catch(() => {});
  }, []);

  // Clicking a row replaces the table with the detail view
  const [selectedEmp, setSelectedEmp] = useState(null);

  // "Mark Register" replaces the table with the bulk-marking grid
  const [markingMode, setMarkingMode] = useState(false);

  // Monthly register (Excel) download — its own month/year, independent of
  // the daily register view above, so previous months can be downloaded
  // without having to navigate the daily date picker to a day in that month.
  const [registerDownloading, setRegisterDownloading] = useState(false);
  const todayObj = new Date();
  const [dlYear,  setDlYear]  = useState(todayObj.getFullYear());
  const [dlMonth, setDlMonth] = useState(todayObj.getMonth()); // 0-indexed

  const handleDownloadRegister = async () => {
    if (!ctxEmployees) return;
    setRegisterDownloading(true);
    try {
      const year = dlYear, month = dlMonth; // JS month index
      const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      const res = await apiFetch(`${API}/attendance/?date_after=${monthStart}&date_before=${monthEnd}&page_size=5000`);
      const data = res.ok ? await res.json() : [];
      const records = Array.isArray(data) ? data : data.results || [];
      const activeEmployees = ctxEmployees.filter(e => e.status === "employed");
      await buildAndDownloadMonthlyRegister({ employees: activeEmployees, records, year, month, showToast });
    } catch (e) {
      showToast?.("Failed to generate register.", "err");
    } finally {
      setRegisterDownloading(false);
    }
  };

  // Fetch attendance whenever date changes
  useEffect(() => {
    let cancelled = false;
    setAttLoading(true);
    setAttendance([]);
    apiFetch(`${API}/attendance/?date=${selectedDate}&page_size=2000`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (cancelled) return;
        setAttendance(Array.isArray(data) ? data : data.results || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAttLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const attMap = useMemo(() => {
    const m = {};
    attendance.forEach(r => {
      const id = typeof r.employee === "object" ? r.employee.id : r.employee;
      m[id] = r;
    });
    return m;
  }, [attendance]);

  const enriched = useMemo(() => {
    if (!ctxEmployees) return [];
    return ctxEmployees
      .filter(e => e.status === "employed")
      .map(emp => ({
        ...emp,
        fullName: emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—",
        attRec: attMap[emp.id] || null,
        site: (attMap[emp.id]?.work_location || "").trim(),
      }));
  }, [ctxEmployees, attMap]);

  // Stats are derived from the selected date's attendance data
  const stats = useMemo(() => {
    const s = { present: 0, absent: 0, late: 0, half_day: 0, leave: 0, unmarked: 0 };
    enriched.forEach(emp => {
      if (!emp.attRec) s.unmarked++;
      else if (s[emp.attRec.status] !== undefined) s[emp.attRec.status]++;
    });
    return s;
  }, [enriched]);

  const filtered = useMemo(() => enriched.filter(emp => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      emp.fullName.toLowerCase().includes(q) ||
      (emp.job_title || "").toLowerCase().includes(q) ||
      (emp.department_name || "").toLowerCase().includes(q);
    const matchDept   = deptFilter === "all" || String(emp.department) === deptFilter;
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "unmarked" ? !emp.attRec : emp.attRec?.status === statusFilter);
    const matchSite = siteFilter === "all" ||
      (siteFilter === "unassigned" ? !emp.site : emp.site === siteFilter);
    return matchSearch && matchDept && matchStatus && matchSite;
  }), [enriched, search, deptFilter, statusFilter, siteFilter]);

  const isToday = selectedDate === todayStr;

  // ── Render employee detail in-place ──────────────────────────────────────
  if (selectedEmp) {
    return (
      <>
        <style>{`
          @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
          @keyframes spin { to { transform: rotate(360deg); } }

          /* ── Medium/laptop screens (e.g. 1024x600) ── */
          @media (max-width: 1180px) {
            .ed-header { padding: 16px 18px !important; gap: 12px !important; }
            .ed-header-name { font-size: 16px !important; }
            .ed-header-sub { font-size: 11px !important; }
            .ed-back-btn { padding: 7px 12px !important; font-size: 12px !important; }
            .ed-chips { gap: 6px !important; }
            .ed-chips > div { padding: 3px 8px !important; }
            .ed-chips span { font-size: 10px !important; }
            .ed-tabs button { padding: 8px 14px !important; font-size: 12.5px !important; }
            .ed-history-toolbar { padding: 12px 16px !important; }
            .ed-dl-btn { padding: 7px 12px !important; font-size: 11.5px !important; }
            .ed-day-tile { width: 40px !important; padding: 5px 3px !important; }
            .ed-history-row { padding: 10px 16px !important; gap: 10px !important; }
            .ed-info-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) !important; gap: 12px 18px !important; }
          }
          @media (max-height: 700px) {
            .ed-header { padding: 14px 18px !important; margin-bottom: 14px !important; }
            .ed-history-row { padding: 9px 16px !important; }
          }
        `}</style>
        <div style={{ paddingLeft: 0 }}>
          <EmployeeDetailView emp={selectedEmp} onBack={() => setSelectedEmp(null)} showToast={showToast} />
        </div>
      </>
    );
  }

  // ── Render bulk register-marking grid in-place ───────────────────────────
  if (markingMode) {
    return (
      <>
        <style>{`
          @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
          @keyframes spin { to { transform: rotate(360deg); } }

          /* ── Medium/laptop screens (e.g. 1024x600) ── */
          @media (max-width: 1180px) {
            .reg-header { padding: 14px 16px !important; gap: 10px !important; }
            .reg-header > div:first-child > div:last-child > div:first-child { font-size: 16px !important; }
            .reg-header > div:last-child select { padding: 6px 8px !important; font-size: 11.5px !important; }
            .reg-toolbar { padding: 12px 14px !important; gap: 8px !important; }
            .reg-toolbar input, .reg-toolbar select { padding: 7px 10px !important; font-size: 12px !important; }
            .reg-btn { padding: 7px 12px !important; font-size: 11.5px !important; }
            .reg-legend { font-size: 10.5px !important; gap: 10px !important; }
            .reg-name-td { padding: 7px 12px !important; }
            .reg-name-td span { font-size: 11.5px !important; }
            .reg-day-th { min-width: 27px !important; padding: 6px 4px !important; font-size: 10px !important; }
          }
          @media (max-height: 700px) {
            .reg-header { padding: 12px 16px !important; }
            .reg-toolbar { padding: 10px 14px !important; }
            .reg-grid-wrap { max-height: 62vh !important; }
          }

          @media (max-width: 768px) {
            .reg-header { padding: 14px 16px !important; }
            .reg-toolbar { padding: 12px !important; }
            .reg-legend { font-size: 10.5px !important; gap: 10px !important; }
            .reg-name-td { padding: 8px 10px !important; }
            .reg-name-td span { font-size: 12px !important; }
            .reg-day-th { min-width: 26px !important; padding: 6px 3px !important; font-size: 10px !important; }
          }
          @media (max-width: 640px) {
            .reg-header { flex-direction: column; align-items: stretch !important; gap: 12px !important; }
            .reg-header > div:first-child { width: 100%; }
            .reg-header > div:last-child { width: 100%; flex: none !important; gap: 6px !important; }
            .reg-header > div:last-child select { flex: 1 1 auto !important; }

            .reg-toolbar { flex-direction: column; align-items: stretch !important; gap: 8px !important; }
            .reg-toolbar > * { flex: none !important; width: 100% !important; box-sizing: border-box; }
            .reg-toolbar-spacer { display: none !important; }
            .reg-btn { width: 100% !important; }

            .reg-day-th { min-width: 24px !important; }
          }
        `}</style>
        <div style={{ paddingLeft: 0 }}>
          <RegisterMarkingView
            employees={ctxEmployees}
            departments={departments}
            onBack={() => setMarkingMode(false)}
            showToast={showToast}
          />
        </div>
      </>
    );
  }

  // ── Register table view ───────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Medium/laptop screens (e.g. 1024x600) ── */
        @media (max-width: 1180px) {
          .att-page-header h1 { font-size: 19px !important; }
          .att-header-actions { gap: 6px !important; }
          .att-header-actions button,
          .att-header-actions select,
          .att-header-actions input[type="date"] { font-size: 12px !important; padding: 7px 10px !important; }
          .att-header-actions input[type="date"] { padding-left: 30px !important; }

          .att-stat-row { gap: 8px !important; justify-content: center !important; }
          .att-stat-card { padding: 12px 14px !important; gap: 8px !important; min-width: 110px !important; }
          .att-stat-icon { width: 32px !important; height: 32px !important; }
          .att-stat-icon svg { width: 15px !important; height: 15px !important; }
          .att-stat-label { font-size: 9px !important; }
          .att-stat-value { font-size: 18px !important; }

          .att-filters-row { padding: 12px 14px !important; gap: 8px !important; }
          .att-filters-row select { flex: 0 1 140px !important; }
          .att-filters-row input, .att-filters-row select { padding: 7px 10px !important; font-size: 12px !important; }

          .att-table-wrap table { font-size: 12px !important; }
          .att-table-wrap th, .att-table-wrap td { padding: 8px 10px !important; }
        }
        @media (max-height: 700px) {
          .att-stat-card { padding: 10px 12px !important; }
          .att-filters-row { padding: 10px 14px !important; }
          .att-table-wrap th, .att-table-wrap td { padding: 7px 10px !important; }
        }
        @media (max-width: 1180px) and (max-height: 700px) {
          .att-stat-row { flex-wrap: nowrap !important; overflow-x: auto !important; justify-content: flex-start !important; }
          .att-stat-card { flex: 0 0 auto !important; min-width: 128px !important; }
        }

        @media (max-width: 768px) {
          .att-page-header h1 { font-size: 19px !important; }
          .att-filters-row { padding: 12px 14px !important; }
          .att-table-wrap table { font-size: 12px !important; }
        }
        @media (max-width: 640px) {
          .att-page-header { flex-direction: column; align-items: stretch !important; gap: 10px !important; }

          .att-header-actions { flex-direction: column; align-items: stretch !important; gap: 8px !important; width: 100%; }
          .att-header-actions > * { flex: none !important; width: 100% !important; box-sizing: border-box; }
          .att-header-actions input[type="date"] { width: 100% !important; box-sizing: border-box; }
          .att-header-actions > span { align-self: flex-start; }

          .att-filters-row { flex-direction: column; align-items: stretch !important; gap: 8px !important; }
          .att-filters-row > * { flex: none !important; width: 100% !important; box-sizing: border-box; }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, animation: "fadeInUp 0.3s ease" }}>

        {/* ── Header ── */}
        <div className="att-page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif" }}>Attendance Register</h1>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
          <div className="att-header-actions" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {!isToday && (
              <button onClick={() => setSelectedDate(todayStr)}
                style={{ padding: "8px 14px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 12.5, fontWeight: 600, color: "#1557b0", fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#1557b0"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}
              >← Today</button>
            )}
            <div style={{ position: "relative" }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <input type="date" value={selectedDate} max={todayStr}
                onChange={e => setSelectedDate(e.target.value)}
                style={{ padding: "8px 12px 8px 32px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#0f172a", outline: "none", cursor: "pointer" }}
                onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
                onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            {isToday && (
              <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>Today</span>
            )}

            {/* ── Month/Year picker for register download — lets HR grab any previous month ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fafbff", border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "3px 4px" }}>
              <select value={dlMonth} onChange={e => setDlMonth(Number(e.target.value))}
                style={{ padding: "5px 8px", border: "none", background: "transparent", fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", color: "#334155", outline: "none", cursor: "pointer" }}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
              </select>
              <select value={dlYear} onChange={e => setDlYear(Number(e.target.value))}
                style={{ padding: "5px 8px", border: "none", background: "transparent", fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", color: "#334155", outline: "none", cursor: "pointer" }}>
                {Array.from({ length: 6 }, (_, i) => todayObj.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <button
              onClick={handleDownloadRegister}
              disabled={registerDownloading || !ctxEmployees}
              title={`Download the full ${MONTH_NAMES[dlMonth].charAt(0) + MONTH_NAMES[dlMonth].slice(1).toLowerCase()} ${dlYear} register, grouped by site`}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 9,
                background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
                border: "none", color: "#fff",
                fontSize: 12.5, fontWeight: 700,
                fontFamily: "'DM Sans',sans-serif",
                cursor: registerDownloading || !ctxEmployees ? "not-allowed" : "pointer",
                opacity: registerDownloading || !ctxEmployees ? 0.6 : 1,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {registerDownloading ? "Generating…" : "Download Register"}
            </button>

            <button
              onClick={() => setMarkingMode(true)}
              disabled={!ctxEmployees}
              title="Mark attendance in bulk for any employees, across any departments, for any days"
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 9,
                background: "#fff", border: "1.5px solid #1557b0",
                color: "#1557b0", fontSize: 12.5, fontWeight: 700,
                fontFamily: "'DM Sans',sans-serif",
                cursor: !ctxEmployees ? "not-allowed" : "pointer",
                opacity: !ctxEmployees ? 0.6 : 1,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Mark Register
            </button>
          </div>
        </div>

        {/* ── Date label ── */}
        <div style={{ fontSize: 13, color: "#1557b0", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
          Register for: <span style={{ color: "#0a2a5e" }}>{fmtDateLong(selectedDate)}</span>
        </div>

        {/* ── Stat cards — all keyed to selectedDate ── */}
        <div className="att-stat-row" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <StatCard label="Total Employees" value={enriched.length} color="#1557b0" bg="#eff6ff"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
          />
          {[
            { key: "present",  label: "Present",    color: "#16a34a", bg: "#dcfce7", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> },
            { key: "absent",   label: "Absent",     color: "#dc2626", bg: "#fee2e2", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> },
            { key: "late",     label: "Late",       color: "#d97706", bg: "#fef3c7", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
            { key: "half_day", label: "Half Day",   color: "#7c3aed", bg: "#f5f3ff", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 0 20z"/><circle cx="12" cy="12" r="10"/></svg> },
            { key: "leave",    label: "On Leave",   color: "#0891b2", bg: "#e0f2fe", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
            { key: "unmarked", label: "Not Marked", color: "#94a3b8", bg: "#f8faff", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
          ].map(({ key, label, color, bg, icon }) => (
            <StatCard key={key} label={label} value={stats[key]} color={color} bg={bg} icon={icon}
              clickable active={statusFilter === key}
              onClick={() => setStatusFilter(prev => prev === key ? "all" : key)}
            />
          ))}
        </div>

        {/* ── Table card ── */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>

          {/* Filters */}
          <div className="att-filters-row" style={{ padding: "16px 20px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 220px" }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" placeholder="Search name, job title or department…"
                value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 30px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", outline: "none", background: "#fafbff" }}
                onFocus={e => { e.target.style.borderColor = "#1557b0"; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
                onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer", flex: "0 1 180px" }}>
              <option value="all">All Departments</option>
              {(departments || []).map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer", flex: "0 1 160px" }}>
              <option value="all">All Statuses</option>
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              <option value="unmarked">Not Marked</option>
            </select>
            <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
              title="Filter by the site employees were marked at on this date"
              style={{ padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#334155", background: "#fafbff", outline: "none", cursor: "pointer", flex: "0 1 160px" }}>
              <option value="all">All Sites</option>
              {locationRegistry.map(site => <option key={site} value={site}>{site}</option>)}
              <option value="unassigned">Unassigned</option>
            </select>
            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>
              {filtered.length} of {enriched.length} employees
            </div>
          </div>

          {/* Table */}
          <div className="att-table-wrap" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", borderSpacing: 0, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fafbff", borderBottom: "1.5px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.8px", textTransform: "uppercase", whiteSpace: "nowrap", width: "20%" }}>Employee</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.8px", textTransform: "uppercase", whiteSpace: "nowrap", width: "20%" }}>Marked By</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.8px", textTransform: "uppercase", whiteSpace: "nowrap", width: "18%" }}>Job Title</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.8px", textTransform: "uppercase", whiteSpace: "nowrap", width: "14%" }}>Status</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.8px", textTransform: "uppercase", whiteSpace: "nowrap" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {attLoading || !ctxEmployees ? (
                  <tr><td colSpan={5} style={{ padding: "48px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#94a3b8", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                      <div style={{ width: 22, height: 22, border: "3px solid #e8edf8", borderTopColor: "#1557b0", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      Loading attendance…
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "48px", textAlign: "center", color: "#94a3b8", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                    No employees match your filters.
                  </td></tr>
                ) : filtered.map((emp, i) => (
                  <tr key={emp.id}
                    onClick={() => setSelectedEmp(emp)}
                    style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafcff", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafcff"}
                  >
                    <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                      <span style={{ fontWeight: 600, color: "#0a2a5e", fontSize: 13, display: "block" }}>{emp.fullName}</span>
                      {emp.employee_number && <span style={{ fontSize: 10.5, color: "#94a3b8", display: "block", marginTop: 1 }}>#{emp.employee_number}</span>}
                    </td>
                    <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                      {emp.attRec?.marked_by ? (
                        <>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1557b0", display: "block" }}>
                            {emp.attRec.marked_by_full_name || emp.attRec.marked_by}
                          </span>
                          {emp.attRec.marked_by_department && (
                            <span style={{
                              display: "inline-block", marginTop: 3,
                              fontSize: 9.5, fontWeight: 700,
                              color: "#0891b2", background: "#e0f2fe",
                              border: "1px solid #bae6fd", borderRadius: 20,
                              padding: "1px 8px", letterSpacing: "0.04em",
                            }}>
                              {emp.attRec.marked_by_department}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#334155", fontSize: 12.5, fontWeight: 500, verticalAlign: "middle" }}>{emp.job_title || "—"}</td>
                    <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                      {emp.attRec ? <StatusBadge status={emp.attRec.status} /> : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: "#f8faff", border: "1px dashed #cbd5e1", color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>Not Marked</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px", verticalAlign: "middle" }}><Description rec={emp.attRec} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!attLoading && filtered.length > 0 && (
            <div style={{ padding: "10px 20px", borderTop: "1px solid #f1f5f9", background: "#fafbff" }}>
              <span style={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
                Click any row to view full attendance history and employee profile
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}