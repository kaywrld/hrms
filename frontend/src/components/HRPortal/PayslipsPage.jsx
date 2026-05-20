// src/components/HRPortal/PayslipsPage.jsx
//
// HR Payslips Page — Professional payslip viewer & PDF generator
// Features:
//  - Month navigation
//  - Search bar to filter employees
//  - Stacked payslips, one per employee
//  - Per-payslip download button + bulk download all
//  - Hours calculation: normal 07:00–17:00 = 10h; late arrival uses arrival_time
//  - Deduction reason shown in footer summary
//  - Company header (logo, name, address, contact) + Employee details on right
//  - Uses same localStorage keys as PayrollPage for deduction/bonus/reason

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { apiFetch } from "../../utils/auth";
import { useHRPortal } from "../../context/HRPortalContext";

const API = "http://127.0.0.1:8000/api";

// ── Company info ───────────────────────────────────────────────────────────────
const COMPANY = {
  name:    "JECCA",
  tagline: "Human Resources Department",
  address: "123 Business Avenue, Harare, Zimbabwe",
  phone:   "+263 77 ",
  email:   "hr@jeccaengineering.co.zw",
  logo:    "/logo.jpeg",
};

// ── Working hours constants ────────────────────────────────────────────────────
const WORK_START_H = 7;
const WORK_END_H   = 17;
const FULL_HOURS   = WORK_END_H - WORK_START_H; // 10 hours

// ── Zimbabwean public holidays ─────────────────────────────────────────────────
const ZW_RECURRING = ["01-01","02-21","04-18","05-01","05-25","08-11","08-12","12-22","12-25","12-26"];
function getZwHolidays(year, month) {
  const h = new Set();
  ZW_RECURRING.forEach(mmdd => {
    const [m, d] = mmdd.split("-").map(Number);
    if (m - 1 === month) {
      const dt = new Date(year, month, d);
      if (dt.getDay() !== 0 && dt.getDay() !== 6)
        h.add(`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    }
  });
  const a=year%19,b=Math.floor(year/100),c=year%100,d2=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const hh=(19*a+b-d2-g+15)%30,i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-hh-k)%7,m2=Math.floor((a+11*hh+22*l)/451);
  const em=Math.floor((hh+l-7*m2+114)/31)-1, ed=((hh+l-7*m2+114)%31)+1;
  [new Date(year,em,ed-2), new Date(year,em,ed+1)].forEach(dt => {
    if (dt.getMonth()===month)
      h.add(`${year}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`);
  });
  return h;
}
function isWorkingDay(dateStr) {
  const dt = new Date(dateStr); const dow = dt.getDay();
  if (dow===0||dow===6) return false;
  return !getZwHolidays(dt.getFullYear(), dt.getMonth()).has(dateStr);
}
function getWorkingDays(year, month) {
  let n=0; const days=new Date(year,month+1,0).getDate();
  for(let d=1;d<=days;d++){
    const s=`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if(isWorkingDay(s)) n++;
  }
  return n;
}

// ── Hours worked calculation ───────────────────────────────────────────────────
function hoursForRecord(rec) {
  if (!rec) return 0;
  if (rec.status === "half_day") return FULL_HOURS / 2;
  if (rec.status === "present")  return FULL_HOURS;
  if (rec.status === "late") {
    if (rec.arrival_time) {
      const parts = rec.arrival_time.split(":").map(Number);
      const arrH = parts[0] + (parts[1] || 0) / 60;
      const worked = Math.max(0, WORK_END_H - arrH);
      return Math.round(worked * 100) / 100;
    }
    return FULL_HOURS - 1;
  }
  return 0;
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmtUSD(n) {
  return `$${Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
function fmtHours(h) {
  if (!h) return "0h 0m";
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}
function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const [y,m,d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ── localStorage helpers (same keys as PayrollPage) ───────────────────────────
function lsKey(empId, year, month) {
  return `payroll_${empId}_${year}_${String(month+1).padStart(2,"0")}`;
}
function loadEdits(empId, year, month) {
  try {
    const s = localStorage.getItem(lsKey(empId, year, month));
    return s ? JSON.parse(s) : { deduction:"", bonus:"", deductionReason:"" };
  } catch { return { deduction:"", bonus:"", deductionReason:"" }; }
}

// ── PDF generation — direct download, no print dialog ─────────────────────────
async function generateAndDownloadPDF(htmlContent, filename = "payslips.pdf") {
  const { default: jsPDF }       = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  // 1. Pre-fetch logo → base64 to avoid canvas taint
  let logoDataUrl = null;
  try {
    const res  = await fetch(COMPANY.logo);
    const blob = await res.blob();
    logoDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    logoDataUrl = null;
  }

  let safeHtml = htmlContent;
  if (logoDataUrl) {
    safeHtml = safeHtml.replace(
      new RegExp(`src="${COMPANY.logo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
      `src="${logoDataUrl}"`
    );
  } else {
    safeHtml = safeHtml.replace(/<img[^>]*>/g, '');
  }

  // 2. Mount hidden off-screen container
  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:0",
    "width:794px",
    "background:#fff",
    "z-index:-9999",
    "font-family:'DM Sans',sans-serif",
  ].join(";");
  container.innerHTML = safeHtml;
  document.body.appendChild(container);

  // Allow fonts/layout to settle
  await new Promise(r => setTimeout(r, 600));

  const wrappers = container.querySelectorAll(".payslip-wrapper");
  const nodes    = wrappers.length > 0 ? Array.from(wrappers) : [container];

  const pdf     = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const A4_W    = 210;
  const A4_H    = 297;
  const MAX_PX  = 3000; // cap canvas to prevent jsPDF DataView overflow

  for (let i = 0; i < nodes.length; i++) {
    const node      = nodes[i];
    const nodeH     = node.getBoundingClientRect().height;
    const scale     = nodeH > 1200 ? 1 : 2;

    let canvas;
    try {
      canvas = await html2canvas(node, {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 794,
        width: 794,
      });
    } catch (err) {
      console.error("html2canvas failed for node", i, err);
      continue;
    }

    // Resize canvas if too large (prevents DataView RangeError in jsPDF)
    let finalCanvas = canvas;
    if (canvas.width > MAX_PX || canvas.height > MAX_PX) {
      const ratio   = Math.min(MAX_PX / canvas.width, MAX_PX / canvas.height);
      const resized = document.createElement("canvas");
      resized.width  = Math.floor(canvas.width  * ratio);
      resized.height = Math.floor(canvas.height * ratio);
      resized.getContext("2d").drawImage(canvas, 0, 0, resized.width, resized.height);
      finalCanvas = resized;
    }

    let imgData;
    try {
      imgData = finalCanvas.toDataURL("image/jpeg", 0.85);
    } catch (err) {
      console.error("toDataURL failed:", err);
      continue;
    }

    const pxPerMm    = finalCanvas.width / A4_W;
    const imgHeightMm = finalCanvas.height / pxPerMm;

    if (i > 0) pdf.addPage();

    if (imgHeightMm <= A4_H) {
      pdf.addImage(imgData, "JPEG", 0, 0, A4_W, imgHeightMm);
    } else {
      // Paginate tall payslips
      let yOffset   = 0;
      let pageIndex = 0;
      while (yOffset < imgHeightMm) {
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, -yOffset, A4_W, imgHeightMm);
        yOffset += A4_H;
        pageIndex++;
      }
    }
  }

  document.body.removeChild(container);

  // Direct download — no print dialog
  pdf.save(filename);
}

// ── Single Payslip component ───────────────────────────────────────────────────
function Payslip({ emp, year, month, attendanceRecs, payrollRecord, edits }) {
  const deduction       = parseFloat(edits?.deduction) || 0;
  const bonus           = parseFloat(edits?.bonus) || 0;
  const deductionReason = edits?.deductionReason || "";

  const workingDays = getWorkingDays(year, month);
  const basicSalary = parseFloat(payrollRecord?.basic_salary) || 0;
  const allowances  = parseFloat(payrollRecord?.allowances)   || 0;
  const dailyRate   = workingDays > 0 ? basicSalary / workingDays : 0;
  const hourlyRate  = FULL_HOURS  > 0 ? dailyRate / FULL_HOURS   : 0;

  const dayRecords = useMemo(() => {
    return attendanceRecs
      .filter(r => {
        const empId = typeof r.employee === "object" ? r.employee.id : r.employee;
        return empId === emp.id && isWorkingDay(r.date);
      })
      .sort((a,b) => a.date.localeCompare(b.date));
  }, [attendanceRecs, emp.id]);

  const presentRecs  = dayRecords.filter(r => ["present","late","half_day"].includes(r.status));
  const daysAttended = presentRecs.reduce((s,r) => s + (r.status==="half_day"?0.5:1), 0);
  const totalHours   = presentRecs.reduce((s,r) => s + hoursForRecord(r), 0);
  const lateRecs     = presentRecs.filter(r => r.status === "late");

  const grossEarnings = dailyRate * daysAttended + allowances;
  const netPay        = Math.max(0, grossEarnings - deduction + bonus);

  const fullName   = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
  const jobTitle   = emp.job_title || emp.position || "—";
  const department = emp.department_name || "—";
  const empId      = emp.employee_id || emp.emp_id || `EMP${String(emp.id).padStart(4,"0")}`;
  const bankName   = payrollRecord?.bank_name || emp.bank_name || "—";
  const bankAcct   = payrollRecord?.bank_account || emp.bank_account || "—";
  const phone      = emp.phone_number || emp.phone || "—";
  const email      = emp.email || "—";
  const joinDate   = emp.date_joined || emp.join_date || "";
  const currency   = payrollRecord?.currency || "USD";

  return (
    <div
      className="payslip-card"
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        boxShadow: "0 2px 16px rgba(10,42,94,0.07)",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* ── HEADER ── */}
      <div style={{
        background: "linear-gradient(135deg, #0a2a5e 0%, #1557b0 60%, #1a6fd4 100%)",
        padding: "22px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        {/* Left: Company */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12, background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}>
            <img
              src={COMPANY.logo}
              alt={COMPANY.name}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              onError={e => {
                e.target.style.display = "none";
                e.target.parentElement.innerHTML = `<span style="font-size:20px;font-weight:800;color:#0a2a5e;font-family:'Playfair Display',serif">${COMPANY.name[0]}</span>`;
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: "'Playfair Display', serif", letterSpacing: "0.02em" }}>
              {COMPANY.name}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1, fontWeight: 500 }}>
              {COMPANY.tagline}
            </div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", marginTop: 4, lineHeight: 1.6 }}>
              {COMPANY.address}<br />
              📞 {COMPANY.phone} &nbsp;·&nbsp; ✉ {COMPANY.email}
            </div>
          </div>
        </div>

        {/* Centre: Title */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", marginBottom: 4 }}>PAYSLIP</div>
          <div style={{
            fontSize: 16, fontWeight: 700, color: "#fff",
            background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "4px 14px",
            border: "1px solid rgba(255,255,255,0.2)",
          }}>
            {monthLabel(year, month)}
          </div>
        </div>

        {/* Right: Employee */}
        <div style={{
          background: "rgba(255,255,255,0.08)", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          padding: "12px 16px", minWidth: 200,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{fullName}</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 8px", fontSize: 10.5, color: "rgba(255,255,255,0.7)" }}>
            <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>ID</span>       <span>{empId}</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Title</span>    <span>{jobTitle}</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Dept</span>     <span>{department}</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Phone</span>    <span>{phone}</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Email</span>    <span style={{ wordBreak: "break-all" }}>{email}</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Bank</span>     <span>{bankName}</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Account</span>  <span>{bankAcct}</span>
            {joinDate && <><span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Joined</span><span>{fmtDate(joinDate)}</span></>}
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Attendance summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Working Days",  value: workingDays },
            { label: "Days Attended", value: daysAttended % 1 === 0 ? daysAttended : daysAttended.toFixed(1) },
            { label: "Total Hours",   value: fmtHours(totalHours) },
            { label: "Late Arrivals", value: lateRecs.length },
          ].map(card => (
            <div key={card.label} style={{
              background: "#f8faff", border: "1px solid #e8edf7",
              borderRadius: 10, padding: "10px 14px", textAlign: "center",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif" }}>{card.value}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{card.label}</div>
            </div>
          ))}
        </div>

        {/* Earnings / Deductions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Earnings */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              color: "#1557b0", marginBottom: 8, paddingBottom: 6, borderBottom: "2px solid #e0eaff",
            }}>Earnings</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  { label: "Basic Salary (Monthly)",                          value: fmtUSD(basicSalary) },
                  { label: `Days Attended (${daysAttended} of ${workingDays})`, value: fmtUSD(dailyRate * daysAttended) },
                  { label: "Hourly Rate",                                      value: `${fmtUSD(hourlyRate)}/hr` },
                  { label: "Total Hours Worked",                               value: fmtHours(totalHours) },
                  ...(allowances > 0 ? [{ label: "Allowances", value: fmtUSD(allowances) }] : []),
                  ...(bonus      > 0 ? [{ label: "Bonus",      value: fmtUSD(bonus), isGreen: true }] : []),
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "6px 0", fontSize: 12, color: "#475569" }}>{row.label}</td>
                    <td style={{ padding: "6px 0", fontSize: 12, fontWeight: 600, color: row.isGreen ? "#059669" : "#0f172a", textAlign: "right", fontFamily: "monospace" }}>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{
              marginTop: 8, padding: "8px 0", borderTop: "2px solid #0a2a5e",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#0a2a5e" }}>Gross Earnings</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0a2a5e", fontFamily: "monospace" }}>{fmtUSD(grossEarnings)}</span>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              color: "#dc2626", marginBottom: 8, paddingBottom: 6, borderBottom: "2px solid #fee2e2",
            }}>Deductions</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {deduction > 0 ? (
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "6px 0", fontSize: 12, color: "#475569" }}>
                      Deduction{deductionReason ? ` — ${deductionReason}` : ""}
                    </td>
                    <td style={{ padding: "6px 0", fontSize: 12, fontWeight: 600, color: "#dc2626", textAlign: "right", fontFamily: "monospace" }}>
                      -{fmtUSD(deduction)}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={2} style={{ padding: "6px 0", fontSize: 12, color: "#cbd5e1", fontStyle: "italic" }}>No deductions this period</td>
                  </tr>
                )}
              </tbody>
            </table>
            {deduction > 0 && (
              <div style={{
                marginTop: 8, padding: "8px 0", borderTop: "2px solid #dc2626",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>Total Deductions</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#dc2626", fontFamily: "monospace" }}>-{fmtUSD(deduction)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Late arrivals detail */}
        {lateRecs.length > 0 && (
          <div style={{ background: "#fff7ed", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#92400e", marginBottom: 6 }}>
              Late Arrival Details
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {lateRecs.map(r => (
                <div key={r.date} style={{
                  fontSize: 11, background: "#fef3c7", border: "1px solid #fde68a",
                  borderRadius: 6, padding: "3px 8px", color: "#92400e", fontWeight: 600,
                }}>
                  {fmtDate(r.date)}{r.arrival_time ? ` · ${r.arrival_time.slice(0,5)}` : ""} · {fmtHours(hoursForRecord(r))} worked
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Net Pay */}
        <div style={{
          background: "linear-gradient(135deg, #0a2a5e, #1557b0)",
          borderRadius: 12, padding: "16px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Net Pay ({currency})</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: "'Playfair Display',serif", marginTop: 2 }}>{fmtUSD(netPay)}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.9 }}>
            <div>Gross: {fmtUSD(grossEarnings)}</div>
            {deduction > 0 && <div>Deductions: -{fmtUSD(deduction)}</div>}
            {bonus > 0      && <div>Bonus: +{fmtUSD(bonus)}</div>}
            <div style={{ fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>Period: {monthLabel(year, month)}</div>
          </div>
        </div>

        {/* Summary note */}
        {(deduction > 0 || bonus > 0) && (
          <div style={{
            background: "#f8faff", border: "1px solid #e0eaff",
            borderRadius: 10, padding: "10px 16px",
            fontSize: 11.5, color: "#475569", lineHeight: 1.7,
          }}>
            <span style={{ fontWeight: 700, color: "#0a2a5e" }}>Summary: </span>
            {deduction > 0 && deductionReason && (
              <span>You were deducted {fmtUSD(deduction)} — {deductionReason}. </span>
            )}
            {deduction > 0 && !deductionReason && (
              <span>A deduction of {fmtUSD(deduction)} was applied this period. </span>
            )}
            {bonus > 0 && (
              <span>A bonus of {fmtUSD(bonus)} was awarded this period. </span>
            )}
          </div>
        )}

        {/* Legal footer */}
        <div style={{
          borderTop: "1px solid #f1f5f9", paddingTop: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 9.5, color: "#cbd5e1",
        }}>
          <span>Generated: {new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })}</span>
          <span>This is a computer-generated payslip and requires no signature.</span>
          <span>{COMPANY.name} · Confidential</span>
        </div>
      </div>
    </div>
  );
}

// ── Main PayslipsPage ──────────────────────────────────────────────────────────
export default function HRPayslipsPage({ showToast }) {
  const { employees: ctxEmployees, departments: ctxDepartments, loading: ctxLoading } = useHRPortal();

  const now = new Date();
  const [viewYear,    setViewYear]    = useState(now.getFullYear());
  const [viewMonth,   setViewMonth]   = useState(now.getMonth());
  const [search,      setSearch]      = useState("");
  const [payrolls,    setPayrolls]    = useState([]);
  const [attAll,      setAttAll]      = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [payrollEdits, setPayrollEdits] = useState({});
  const [generating,   setGenerating]   = useState(false);

  const monthStart = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-01`;
  const lastDay    = new Date(viewYear, viewMonth+1, 0).getDate();
  const monthEnd   = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;

  // Load payroll + attendance for the selected month
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setAttAll([]);
    const run = async () => {
      try {
        const [prRes, attRes] = await Promise.all([
          apiFetch(`${API}/payroll/`),
          apiFetch(`${API}/attendance/?date_after=${monthStart}&date_before=${monthEnd}&page_size=10000`),
        ]);
        if (cancelled) return;
        const [prData, attData] = await Promise.all([
          prRes.ok  ? prRes.json()  : [],
          attRes.ok ? attRes.json() : [],
        ]);
        if (cancelled) return;
        setPayrolls(Array.isArray(prData)  ? prData  : prData.results  || []);
        setAttAll(  Array.isArray(attData) ? attData : attData.results || []);
      } catch(e) {
        if (!cancelled) console.error("PayslipsPage:", e);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [monthStart, monthEnd]);

  // Load localStorage edits whenever employees or month changes
  useEffect(() => {
    if (!ctxEmployees) return;
    const e = {};
    ctxEmployees.forEach(emp => { e[emp.id] = loadEdits(emp.id, viewYear, viewMonth); });
    setPayrollEdits(e);
  }, [ctxEmployees, viewYear, viewMonth]);

  const payrollMap = useMemo(() => {
    const m = {};
    payrolls.forEach(p => { m[p.employee] = p; });
    return m;
  }, [payrolls]);

  const departments = ctxDepartments || [];

  const employees = useMemo(() => {
    if (!ctxEmployees) return [];
    return ctxEmployees.map(emp => ({
      ...emp,
      department_name: emp.department_name || departments.find(d => d.id === emp.department)?.name || "—",
    }));
  }, [ctxEmployees, departments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter(emp => {
      const name  = (emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ")).toLowerCase();
      const dept  = (emp.department_name || "").toLowerCase();
      const title = (emp.job_title || emp.position || "").toLowerCase();
      return !q || name.includes(q) || dept.includes(q) || title.includes(q);
    });
  }, [employees, search]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); }
    else setViewMonth(m => m-1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); }
    else setViewMonth(m => m+1);
  };
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  // Build the raw HTML string for one employee's payslip (used by PDF generator)
  const buildPayslipHTML = useCallback((emp) => {
    const payRec          = payrollMap[emp.id];
    const edits           = payrollEdits[emp.id] || {};
    const deduction       = parseFloat(edits.deduction) || 0;
    const bonus           = parseFloat(edits.bonus) || 0;
    const deductionReason = edits.deductionReason || "";

    const workingDays   = getWorkingDays(viewYear, viewMonth);
    const basicSalary   = parseFloat(payRec?.basic_salary) || 0;
    const allowances    = parseFloat(payRec?.allowances)   || 0;
    const dailyRate     = workingDays > 0 ? basicSalary / workingDays : 0;
    const hourlyRate    = FULL_HOURS  > 0 ? dailyRate / FULL_HOURS   : 0;

    const empRecs = attAll
      .filter(r => {
        const eid = typeof r.employee === "object" ? r.employee.id : r.employee;
        return eid === emp.id && isWorkingDay(r.date);
      })
      .sort((a,b) => a.date.localeCompare(b.date));

    const presentRecs   = empRecs.filter(r => ["present","late","half_day"].includes(r.status));
    const daysAttended  = presentRecs.reduce((s,r) => s + (r.status==="half_day"?0.5:1), 0);
    const totalHours    = presentRecs.reduce((s,r) => s + hoursForRecord(r), 0);
    const lateRecs      = presentRecs.filter(r => r.status === "late");
    const grossEarnings = dailyRate * daysAttended + allowances;
    const netPay        = Math.max(0, grossEarnings - deduction + bonus);

    const fullName   = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
    const jobTitle   = emp.job_title || emp.position || "—";
    const department = emp.department_name || "—";
    const empId      = emp.employee_id || emp.emp_id || `EMP${String(emp.id).padStart(4,"0")}`;
    const bankName   = payRec?.bank_name || emp.bank_name || "—";
    const bankAcct   = payRec?.bank_account || emp.bank_account || "—";
    const phone      = emp.phone_number || emp.phone || "—";
    const email      = emp.email || "—";
    const currency   = payRec?.currency || "USD";

    const lateHTML = lateRecs.length > 0 ? `
      <div style="background:#fff7ed;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin-top:12px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#92400e;margin-bottom:6px">Late Arrival Details</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${lateRecs.map(r => `
            <div style="font-size:11px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:3px 8px;color:#92400e;font-weight:600">
              ${fmtDate(r.date)}${r.arrival_time ? ` · ${r.arrival_time.slice(0,5)}` : ""} · ${fmtHours(hoursForRecord(r))} worked
            </div>`).join("")}
        </div>
      </div>` : "";

    const summaryHTML = (deduction > 0 || bonus > 0) ? `
      <div style="background:#f8faff;border:1px solid #e0eaff;border-radius:10px;padding:10px 16px;font-size:11.5px;color:#475569;line-height:1.7;margin-top:12px">
        <span style="font-weight:700;color:#0a2a5e">Summary: </span>
        ${deduction > 0 && deductionReason ? `<span>You were deducted ${fmtUSD(deduction)} — ${deductionReason}. </span>` : ""}
        ${deduction > 0 && !deductionReason ? `<span>A deduction of ${fmtUSD(deduction)} was applied this period. </span>` : ""}
        ${bonus > 0 ? `<span>A bonus of ${fmtUSD(bonus)} was awarded this period. </span>` : ""}
      </div>` : "";

    return `
<div class="payslip-wrapper" style="font-family:'DM Sans',sans-serif;background:#fff;overflow:hidden;border:1px solid #d1d5db">
  <div style="background:linear-gradient(135deg,#0a2a5e,#1557b0 60%,#1a6fd4);padding:22px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:56px;height:56px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">
        <img src="${COMPANY.logo}" alt="${COMPANY.name}" style="width:100%;height:100%;object-fit:contain"
          onerror="this.style.display='none';this.parentElement.innerHTML='<span style=font-size:20px;font-weight:800;color:#0a2a5e>${COMPANY.name[0]}</span>'" />
      </div>
      <div>
        <div style="font-size:20px;font-weight:800;color:#fff;font-family:'Playfair Display',serif">${COMPANY.name}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:1px">${COMPANY.tagline}</div>
        <div style="font-size:10.5px;color:rgba(255,255,255,.55);margin-top:4px;line-height:1.6">${COMPANY.address}<br>📞 ${COMPANY.phone} &nbsp;·&nbsp; ✉ ${COMPANY.email}</div>
      </div>
    </div>
    <div style="text-align:center;flex-shrink:0">
      <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:4px">PAYSLIP</div>
      <div style="font-size:16px;font-weight:700;color:#fff;background:rgba(255,255,255,.12);border-radius:8px;padding:4px 14px;border:1px solid rgba(255,255,255,.2)">${monthLabel(viewYear, viewMonth)}</div>
    </div>
    <div style="background:rgba(255,255,255,.08);border-radius:12px;border:1px solid rgba(255,255,255,.15);padding:12px 16px;min-width:200px">
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:8px">${fullName}</div>
      <table style="font-size:10.5px;color:rgba(255,255,255,.7);border-collapse:collapse">
        <tr><td style="color:rgba(255,255,255,.45);font-weight:600;padding-right:8px;padding-bottom:2px">ID</td><td>${empId}</td></tr>
        <tr><td style="color:rgba(255,255,255,.45);font-weight:600;padding-right:8px;padding-bottom:2px">Title</td><td>${jobTitle}</td></tr>
        <tr><td style="color:rgba(255,255,255,.45);font-weight:600;padding-right:8px;padding-bottom:2px">Dept</td><td>${department}</td></tr>
        <tr><td style="color:rgba(255,255,255,.45);font-weight:600;padding-right:8px;padding-bottom:2px">Phone</td><td>${phone}</td></tr>
        <tr><td style="color:rgba(255,255,255,.45);font-weight:600;padding-right:8px;padding-bottom:2px">Email</td><td>${email}</td></tr>
        <tr><td style="color:rgba(255,255,255,.45);font-weight:600;padding-right:8px;padding-bottom:2px">Bank</td><td>${bankName}</td></tr>
        <tr><td style="color:rgba(255,255,255,.45);font-weight:600;padding-right:8px;padding-bottom:2px">Account</td><td>${bankAcct}</td></tr>
      </table>
    </div>
  </div>
  <div style="padding:20px 28px">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
      ${[
        ["Working Days",  workingDays],
        ["Days Attended", daysAttended % 1 === 0 ? daysAttended : daysAttended.toFixed(1)],
        ["Total Hours",   fmtHours(totalHours)],
        ["Late Arrivals", lateRecs.length],
      ].map(([l,v]) => `
        <div style="background:#f8faff;border:1px solid #e8edf7;border-radius:10px;padding:10px 14px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:#0a2a5e;font-family:'Playfair Display',serif">${v}</div>
          <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">${l}</div>
        </div>`).join("")}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1557b0;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e0eaff">Earnings</div>
        <table style="width:100%;border-collapse:collapse">
          <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 0;font-size:12px;color:#475569">Basic Salary (Monthly)</td><td style="padding:6px 0;font-size:12px;font-weight:600;color:#0f172a;text-align:right;font-family:monospace">${fmtUSD(basicSalary)}</td></tr>
          <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 0;font-size:12px;color:#475569">Days Attended (${daysAttended} of ${workingDays})</td><td style="padding:6px 0;font-size:12px;font-weight:600;color:#0f172a;text-align:right;font-family:monospace">${fmtUSD(dailyRate * daysAttended)}</td></tr>
          <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 0;font-size:12px;color:#475569">Hourly Rate</td><td style="padding:6px 0;font-size:12px;font-weight:600;color:#0f172a;text-align:right;font-family:monospace">${fmtUSD(hourlyRate)}/hr</td></tr>
          <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 0;font-size:12px;color:#475569">Total Hours Worked</td><td style="padding:6px 0;font-size:12px;font-weight:600;color:#0f172a;text-align:right;font-family:monospace">${fmtHours(totalHours)}</td></tr>
          ${allowances > 0 ? `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 0;font-size:12px;color:#475569">Allowances</td><td style="padding:6px 0;font-size:12px;font-weight:600;color:#0f172a;text-align:right;font-family:monospace">${fmtUSD(allowances)}</td></tr>` : ""}
          ${bonus > 0 ? `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 0;font-size:12px;color:#475569">Bonus</td><td style="padding:6px 0;font-size:12px;font-weight:600;color:#059669;text-align:right;font-family:monospace">+${fmtUSD(bonus)}</td></tr>` : ""}
        </table>
        <div style="margin-top:8px;padding:8px 0;border-top:2px solid #0a2a5e;display:flex;justify-content:space-between">
          <span style="font-size:12px;font-weight:700;color:#0a2a5e">Gross Earnings</span>
          <span style="font-size:14px;font-weight:800;color:#0a2a5e;font-family:monospace">${fmtUSD(grossEarnings)}</span>
        </div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#dc2626;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #fee2e2">Deductions</div>
        <table style="width:100%;border-collapse:collapse">
          ${deduction > 0
            ? `<tr><td style="padding:6px 0;font-size:12px;color:#475569">Deduction${deductionReason ? ` — ${deductionReason}` : ""}</td><td style="padding:6px 0;font-size:12px;font-weight:600;color:#dc2626;text-align:right;font-family:monospace">-${fmtUSD(deduction)}</td></tr>`
            : `<tr><td colspan="2" style="padding:6px 0;font-size:12px;color:#cbd5e1;font-style:italic">No deductions this period</td></tr>`}
        </table>
        ${deduction > 0 ? `
          <div style="margin-top:8px;padding:8px 0;border-top:2px solid #dc2626;display:flex;justify-content:space-between">
            <span style="font-size:12px;font-weight:700;color:#dc2626">Total Deductions</span>
            <span style="font-size:14px;font-weight:800;color:#dc2626;font-family:monospace">-${fmtUSD(deduction)}</span>
          </div>` : ""}
      </div>
    </div>
    ${lateHTML}
    <div style="background:linear-gradient(135deg,#0a2a5e,#1557b0);border-radius:12px;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;margin-top:16px">
      <div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);font-weight:600;text-transform:uppercase;letter-spacing:.1em">Net Pay (${currency})</div>
        <div style="font-size:28px;font-weight:800;color:#fff;font-family:'Playfair Display',serif;margin-top:2px">${fmtUSD(netPay)}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:rgba(255,255,255,.55);line-height:1.9">
        <div>Gross: ${fmtUSD(grossEarnings)}</div>
        ${deduction > 0 ? `<div>Deductions: -${fmtUSD(deduction)}</div>` : ""}
        ${bonus > 0 ? `<div>Bonus: +${fmtUSD(bonus)}</div>` : ""}
        <div style="font-weight:700;color:rgba(255,255,255,.85)">Period: ${monthLabel(viewYear, viewMonth)}</div>
      </div>
    </div>
    ${summaryHTML}
    <div style="border-top:1px solid #f1f5f9;padding-top:10px;margin-top:14px;display:flex;justify-content:space-between;font-size:9.5px;color:#cbd5e1">
      <span>Generated: ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</span>
      <span>This is a computer-generated payslip and requires no signature.</span>
      <span>${COMPANY.name} · Confidential</span>
    </div>
  </div>
</div>`;
  }, [payrollMap, payrollEdits, attAll, viewYear, viewMonth]);

  // Download a single employee's payslip
  const handleDownloadOne = useCallback((emp) => {
    setGenerating(true);
    (async () => {
      try {
        const name     = (emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join("_")).replace(/\s+/g, "_");
        const monthStr = new Date(viewYear, viewMonth, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
        await generateAndDownloadPDF(buildPayslipHTML(emp), `Payslip_${name}_${monthStr}.pdf`);
      } catch(err) {
        console.error("PDF generation failed:", err);
        alert("PDF generation failed. Please try again.");
      } finally {
        setGenerating(false);
      }
    })();
  }, [buildPayslipHTML, viewYear, viewMonth]);

  // Download all visible employees' payslips in one PDF
  const handleDownloadAll = useCallback(() => {
    if (filtered.length === 0) return;
    setGenerating(true);
    (async () => {
      try {
        const html     = filtered.map(emp => buildPayslipHTML(emp)).join("\n");
        const monthStr = new Date(viewYear, viewMonth, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
        await generateAndDownloadPDF(html, `Payslips_${monthStr}.pdf`);
      } catch(err) {
        console.error("PDF generation failed:", err);
        alert("PDF generation failed. Please try again.");
      } finally {
        setGenerating(false);
      }
    })();
  }, [filtered, buildPayslipHTML, viewYear, viewMonth]);

  const loading = ctxLoading?.employees || dataLoading || !ctxEmployees;

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes spin     { to   { transform:rotate(360deg); } }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeInUp .3s ease" }}>

        {/* ── Page Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0a2a5e", fontFamily: "'Playfair Display',serif" }}>
              Payslips
            </h1>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>
              {monthLabel(viewYear, viewMonth)} · {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* Month navigator */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "4px 6px" }}>
              <button onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: "4px 8px", borderRadius: 7 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0a2a5e", fontFamily: "'DM Sans',sans-serif", minWidth: 120, textAlign: "center" }}>
                {monthLabel(viewYear, viewMonth)}
              </span>
              <button
                onClick={nextMonth}
                disabled={isCurrentMonth}
                style={{ background: "none", border: "none", cursor: isCurrentMonth ? "not-allowed" : "pointer", color: isCurrentMonth ? "#cbd5e1" : "#475569", padding: "4px 8px", borderRadius: 7 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            {/* Search */}
            <div style={{ position: "relative" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search employees…"
                style={{
                  paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                  border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13,
                  fontFamily: "'DM Sans',sans-serif", outline: "none", background: "#fff",
                  color: "#0f172a", width: 200,
                }}
              />
            </div>

            {/* Download all */}
            <button
              onClick={handleDownloadAll}
              disabled={loading || generating || filtered.length === 0}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 18px", borderRadius: 10,
                background: "linear-gradient(135deg,#0a2a5e,#1557b0)",
                border: "none", color: "#fff", fontSize: 13, fontWeight: 700,
                fontFamily: "'DM Sans',sans-serif",
                cursor: loading || generating || filtered.length === 0 ? "not-allowed" : "pointer",
                opacity: loading || generating || filtered.length === 0 ? 0.5 : 1,
                transition: "opacity .15s",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download All Payslips
            </button>
          </div>
        </div>

        {/* ── Loading state ── */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12, color: "#94a3b8", fontFamily: "'DM Sans',sans-serif" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1557b0" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Loading payslips…
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontFamily: "'DM Sans',sans-serif", fontSize: 14 }}>
            No employees found{search ? ` matching "${search}"` : ""}.
          </div>
        )}

        {/* ── Payslip cards ── */}
        {!loading && filtered.map((emp) => {
          const payRec     = payrollMap[emp.id];
          const edits      = payrollEdits[emp.id] || {};
          const empAttRecs = attAll.filter(r => {
            const eid = typeof r.employee === "object" ? r.employee.id : r.employee;
            return eid === emp.id;
          });

          return (
            <div key={emp.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* Per-payslip toolbar */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 16px", background: "#f8faff",
                border: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0",
                borderBottom: "none",
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#0a2a5e", fontFamily: "'DM Sans',sans-serif" }}>
                  {emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") || "—"}
                </span>
                <button
                  onClick={() => handleDownloadOne(emp)}
                  disabled={generating}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 14px", borderRadius: 8,
                    border: "1.5px solid #e2e8f0", background: "#fff",
                    fontSize: 12, fontWeight: 600, color: "#475569",
                    fontFamily: "'DM Sans',sans-serif",
                    cursor: generating ? "not-allowed" : "pointer",
                    opacity: generating ? 0.5 : 1,
                    transition: "border-color .15s, color .15s",
                  }}
                  onMouseEnter={e => { if (!generating) { e.currentTarget.style.borderColor="#1557b0"; e.currentTarget.style.color="#1557b0"; }}}
                  onMouseLeave={e => { e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.color="#475569"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download Payslip
                </button>
              </div>

              {/* The payslip itself */}
              <Payslip
                emp={emp}
                year={viewYear}
                month={viewMonth}
                attendanceRecs={empAttRecs}
                payrollRecord={payRec}
                edits={edits}
              />
            </div>
          );
        })}
      </div>

      {/* ── Generating overlay ── */}
      {generating && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(10,42,94,0.55)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          zIndex: 9999, gap: 16,
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <div style={{ color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 16, fontWeight: 600 }}>
            Generating PDF…
          </div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontFamily: "'DM Sans',sans-serif", fontSize: 12 }}>
            Please wait while your payslip is being prepared.
          </div>
        </div>
      )}
    </>
  );
}