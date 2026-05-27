// src/components/HRPortal/AttendancePage.jsx
// Attendance page — daily register with date-filtered stats + inline employee history view

import { useState, useEffect, useMemo } from "react";
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

const API = "${import.meta.env.VITE_API_BASE_URL}/api";

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
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: active ? "rgba(255,255,255,0.2)" : bg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 10, color: active ? "rgba(255,255,255,0.75)" : "#94a3b8", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif" }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: active ? "#fff" : "#0a2a5e", fontFamily: "'Playfair Display',serif", lineHeight: 1.1 }}>{value}</div>
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
      <div style={{ padding: "18px 20px" }}>{children}</div>
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
      <div style={{
        background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
        borderRadius: 16, padding: "20px 24px", marginBottom: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
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
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.2)" }} />
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: "#fff" }}>{fullName}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
              {emp.job_title || "—"} · {emp.department_name || "—"}
              {emp.employee_number && ` · #${emp.employee_number}`}
            </div>
          </div>
        </div>
        {/* History summary chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #e2e8f0" }}>
        {[{ key: "history", label: "Attendance History" }, { key: "profile", label: "Employee Profile" }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
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
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'DM Sans',sans-serif" }}>
              {emp.date_joined ? `Since ${fmtDateLong(emp.date_joined)}` : "Full attendance history"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={downloadCSV} disabled={!!downloading || !history.length}
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
                  <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 24px", borderBottom: i < recs.length - 1 ? "1px solid #f8faff" : "none", background: i % 2 === 0 ? "#fff" : "#fafcff" }}>
                    <div style={{ width: 46, flexShrink: 0, textAlign: "center", background: cfg.bg, borderRadius: 10, padding: "6px 4px", border: `1px solid ${cfg.color}22` }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px 24px" }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px 24px" }}>
                  <InfoRow label="Employee Number" value={detail.employee_number} />
                  <InfoRow label="Job Title" value={detail.job_title} />
                  <InfoRow label="Department" value={detail.department_name} />
                  <InfoRow label="Employment Type" value={detail.employment_type?.replace(/_/g, " ")} />
                  <InfoRow label="Status" value={detail.status} />
                  <InfoRow label="Date Joined" value={detail.date_joined ? fmtDateLong(detail.date_joined) : null} />
                </div>
              </ProfileCard>

              {(detail.basic_salary || detail.bank_name) && (
                <ProfileCard title="Payroll & Banking">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px 24px" }}>
                    <InfoRow label="Basic Salary" value={detail.basic_salary ? `${detail.currency || "USD"} ${Number(detail.basic_salary).toLocaleString()}` : null} />
                    <InfoRow label="Allowances"   value={detail.allowances  ? `${detail.currency || "USD"} ${Number(detail.allowances).toLocaleString()}`  : null} />
                    <InfoRow label="Deductions"   value={detail.deductions  ? `${detail.currency || "USD"} ${Number(detail.deductions).toLocaleString()}`  : null} />
                    <InfoRow label="Net Salary"   value={detail.net_salary  ? `${detail.currency || "USD"} ${Number(detail.net_salary).toLocaleString()}`  : null} />
                    <InfoRow label="Bank"         value={detail.bank_name} />
                    <InfoRow label="Account No."  value={detail.bank_account} />
                  </div>
                </ProfileCard>
              )}

              {detail.nok_full_name && (
                <ProfileCard title="Next of Kin">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px 24px" }}>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AttendancePage({ showToast }) {
  const { employees: ctxEmployees, departments } = useHRPortal();

  const todayStr = toYMD(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [deptFilter,   setDeptFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search,       setSearch]       = useState("");

  const [attendance, setAttendance] = useState([]);
  const [attLoading, setAttLoading] = useState(true);

  // Clicking a row replaces the table with the detail view
  const [selectedEmp, setSelectedEmp] = useState(null);

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
    return matchSearch && matchDept && matchStatus;
  }), [enriched, search, deptFilter, statusFilter]);

  const isToday = selectedDate === todayStr;

  // ── Render employee detail in-place ──────────────────────────────────────
  if (selectedEmp) {
    return (
      <>
        <style>{`
          @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <div style={{ paddingLeft: 0 }}>
          <EmployeeDetailView emp={selectedEmp} onBack={() => setSelectedEmp(null)} showToast={showToast} />
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
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, animation: "fadeInUp 0.3s ease" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif" }}>Attendance Register</h1>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          </div>
        </div>

        {/* ── Date label ── */}
        <div style={{ fontSize: 13, color: "#1557b0", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
          Register for: <span style={{ color: "#0a2a5e" }}>{fmtDateLong(selectedDate)}</span>
        </div>

        {/* ── Stat cards — all keyed to selectedDate ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
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
          <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>
              {filtered.length} of {enriched.length} employees
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
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