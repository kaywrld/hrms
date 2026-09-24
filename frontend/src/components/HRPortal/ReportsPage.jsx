// src/components/HRPortal/ReportsPage.jsx
//
// HR Portal — Reports
//
// This page does NOT display reports. It only lists the report types; clicking
// "Download" builds the PDF in the browser and saves it.
//
//   Finance    -> live. Pulls payroll rows from /api/payroll/computed/ for the
//                 chosen month and builds the 2-page PDF (utils/financeReportPdf.js).
//   Employee   -> placeholder (coming soon)
//   Attendance -> placeholder (coming soon)

import { useState } from "react";
import { apiFetch } from "../../utils/auth";
import { useHRPortal } from "../../context/HRPortalContext";

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;

const T = {
  navy:  "#0a2a5e",
  primary: "#0e3d82",
  blue:  "#1557b0",
  sky:   "#1a6fd4",
  ink:   "#1a2233",
  muted: "#5b6472",
  line:  "#e2e8f0",
  tint:  "#eff6ff",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── ZiG exchange rate — SAME localStorage key/format as the Payroll and
// Payslips pages, so a rate set on any of them is picked up here (and vice versa).
const ZIG_RATES_STORAGE_KEY = "hr_payroll_zig_rates";
const zigMonthKey = (year, month0) => `${year}-${String(month0 + 1).padStart(2, "0")}`;
function getZigRateForMonth(year, month0) {
  try {
    const all = JSON.parse(localStorage.getItem(ZIG_RATES_STORAGE_KEY) || "{}");
    return all[zigMonthKey(year, month0)] || "";
  } catch { return ""; }
}
function saveZigRateForMonth(year, month0, rate) {
  try {
    const all = JSON.parse(localStorage.getItem(ZIG_RATES_STORAGE_KEY) || "{}");
    all[zigMonthKey(year, month0)] = rate;
    localStorage.setItem(ZIG_RATES_STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

// ── Data helpers ──────────────────────────────────────────────────────────────

// The computed endpoint is paginated (max 500 per page), so walk every page.
async function fetchAllPayrollRows(year, month) {
  const PAGE_SIZE = 500;
  let all = [];
  let p = 1;
  while (true) {
    const params = new URLSearchParams({
      year: String(year), month: String(month),
      page: String(p), page_size: String(PAGE_SIZE),
    });
    const res = await apiFetch(`${API}/payroll/computed/?${params.toString()}`);
    if (!res.ok) throw new Error(`Payroll request failed (${res.status})`);
    const data = await res.json();
    all = all.concat(data.results || []);
    if (p >= (data.total_pages || 1)) break;
    p += 1;
  }
  return all;
}

// Logo → base64 so jsPDF can embed it. The report still builds without it.
async function loadLogo(src = "/logo.jpeg") {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return { dataUrl, format: blob.type.includes("png") ? "PNG" : "JPEG" };
  } catch { return null; }
}

// ── Small UI pieces ───────────────────────────────────────────────────────────

const selectStyle = {
  width: "100%", padding: "9px 11px", borderRadius: 9,
  border: `1.5px solid ${T.line}`, background: "#fff", color: T.ink,
  fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: "none", cursor: "pointer",
};
const labelStyle = {
  display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: T.muted, marginBottom: 5,
  fontFamily: "'DM Sans',sans-serif",
};

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ReportCard({ icon, title, description, bullets, badge, children, footer }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${T.line}`, borderRadius: 16,
      boxShadow: "0 1px 3px rgba(15,23,42,0.05)", display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{ height: 4, background: badge ? "#cbd5e1" : `linear-gradient(90deg, ${T.navy}, ${T.sky})` }} />
      <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            background: badge ? "#f1f5f9" : T.tint, color: badge ? "#94a3b8" : T.blue,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: T.navy }}>
                {title}
              </div>
              {badge && (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: "#64748b", background: "#f1f5f9", border: "1px solid #e2e8f0",
                  borderRadius: 20, padding: "2px 9px", fontFamily: "'DM Sans',sans-serif",
                }}>{badge}</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55, marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>
              {description}
            </div>
          </div>
        </div>

        {bullets && (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {bullets.map((b) => (
              <li key={b} style={{ display: "flex", gap: 8, fontSize: 12.5, color: T.ink, fontFamily: "'DM Sans',sans-serif" }}>
                <span style={{ color: T.sky, fontWeight: 700 }}>&bull;</span>{b}
              </li>
            ))}
          </ul>
        )}

        {children}
        <div style={{ marginTop: "auto" }}>{footer}</div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage({ showToast }) {
  const { user } = useHRPortal();
  const now = new Date();

  const [month,    setMonth]    = useState(now.getMonth());     // 0-11
  const [year,     setYear]     = useState(now.getFullYear());
  const [currency, setCurrency] = useState("USD");
  const [zigRate,  setZigRate]  = useState(() => getZigRateForMonth(now.getFullYear(), now.getMonth()));
  const [busy,     setBusy]     = useState(false);

  // Switching month/year → recall that month's stored ZiG rate.
  const onMonthChange = (m) => { setMonth(m); setZigRate(getZigRateForMonth(year, m)); };
  const onYearChange  = (y) => { setYear(y);  setZigRate(getZigRateForMonth(y, month)); };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const onRateChange = (val) => {
    setZigRate(val);
    if (parseFloat(val) > 0) saveZigRateForMonth(year, month, val);
  };

  const downloadFinanceReport = async () => {
    if (busy) return;
    if (currency === "ZIG" && !(parseFloat(zigRate) > 0)) {
      showToast("Enter the USD to ZiG exchange rate first.", "err");
      return;
    }
    setBusy(true);
    try {
      const rows = await fetchAllPayrollRows(year, month + 1);
      if (!rows.some((r) => r.payroll_id != null)) {
        showToast(`No payroll data found for ${MONTH_NAMES[month]} ${year}.`, "err");
        return;
      }
      // Load the PDF code + logo only when needed (keeps the main bundle small).
      const [{ buildFinanceReport }, logo] = await Promise.all([
        import("../../utils/financeReportPdf"),
        loadLogo(),
      ]);
      const { doc, filename } = buildFinanceReport({
        rows, year, month: month + 1, currency,
        zigRate: parseFloat(zigRate) || 1,
        generatedBy: user?.full_name || user?.username || "",
        logo,
      });
      doc.save(filename);
      showToast("Finance report downloaded.");
    } catch (err) {
      console.error("Finance report failed:", err);
      showToast("Could not generate the finance report. Please try again.", "err");
    } finally {
      setBusy(false);
    }
  };

  const primaryBtn = {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "11px 16px", borderRadius: 10, border: "none",
    background: busy ? "#94a3b8" : `linear-gradient(135deg, ${T.primary}, ${T.sky})`,
    color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 600,
    cursor: busy ? "wait" : "pointer", boxShadow: busy ? "none" : "0 4px 12px rgba(21,87,176,0.25)",
  };
  const disabledBtn = {
    ...primaryBtn, background: "#f1f5f9", color: "#94a3b8", cursor: "not-allowed", boxShadow: "none",
    border: "1px solid #e2e8f0",
  };

  return (
    <div style={{ animation: "slideUp 0.3s ease" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: T.navy }}>
          Reports
        </div>
        <div style={{ fontSize: 13.5, color: T.muted, marginTop: 4, fontFamily: "'DM Sans',sans-serif" }}>
          Choose a report and download it as a PDF.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, alignItems: "stretch" }}>

        {/* ── Employee report (placeholder) ── */}
        <ReportCard
          badge="Coming soon"
          title="Employee Report"
          description="Headcount, departments, sites, contract types and staff movement."
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          footer={
            <button type="button" disabled style={disabledBtn}>
              <DownloadIcon /> Download Employee Report
            </button>
          }
        />

        {/* ── Finance report (live) ── */}
        <ReportCard
          title="Finance Report"
          description="Payroll summary for the month, with department and site breakdowns."
          bullets={[
            "Totals: salaries, bonuses, deductions, net payable",
            "Page 1: distribution and table by department",
            "Page 2: distribution and table by site",
          ]}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
          footer={
            <button type="button" onClick={downloadFinanceReport} disabled={busy} style={primaryBtn}>
              {busy ? (
                <>
                  <span style={{
                    width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)",
                    borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block",
                  }} />
                  Preparing report...
                </>
              ) : (
                <><DownloadIcon /> Download Finance Report (PDF)</>
              )}
            </button>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Month">
              <select value={month} onChange={(e) => onMonthChange(Number(e.target.value))} style={selectStyle} disabled={busy}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            </Field>
            <Field label="Year">
              <select value={year} onChange={(e) => onYearChange(Number(e.target.value))} style={selectStyle} disabled={busy}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Currency" style={{ gridColumn: currency === "ZIG" ? "auto" : "1 / -1" }}>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={selectStyle} disabled={busy}>
                <option value="USD">USD</option>
                <option value="ZIG">ZiG</option>
              </select>
            </Field>
            {currency === "ZIG" && (
              <Field label="1 USD = ? ZiG">
                <input
                  type="number" min="0" step="0.01" value={zigRate} disabled={busy}
                  onChange={(e) => onRateChange(e.target.value)}
                  placeholder="e.g. 26.50"
                  style={{ ...selectStyle, cursor: "text" }}
                />
              </Field>
            )}
          </div>
        </ReportCard>

        {/* ── Attendance report (placeholder) ── */}
        <ReportCard
          badge="Coming soon"
          title="Attendance Report"
          description="Attendance rates, lateness and absences by department and site."
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" /><polyline points="9 16 11 18 15 14" />
            </svg>
          }
          footer={
            <button type="button" disabled style={disabledBtn}>
              <DownloadIcon /> Download Attendance Report
            </button>
          }
        />
      </div>
    </div>
  );
}