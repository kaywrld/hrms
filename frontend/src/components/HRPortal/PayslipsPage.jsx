// src/components/HRPortal/PayslipsPage.jsx
//
// HR Payslips Page — Professional payslip viewer & PDF generator
// Clean letterhead-style design: white background, fine rules, no colour fills

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { apiFetch } from "../../utils/auth";
import { useHRPortal } from "../../context/HRPortalContext";

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;

// ── Company info ───────────────────────────────────────────────────────────────
const COMPANY = {
  name:    "JECCA ENGINEERING (PVT) LTD",
  tagline: "Premium Quality Engineering",
  address: "3148 Lavenham Drive, Bluffhill, Harare, Zimbabwe",
  phone:   "Cell: 071 948 2663/078 495 1117",
  email:   "info@jeccaengineering.co.zw",
  logo:    "/logo.jpeg",
  hrManager: "Brighton Mukundwi",
  hrTitle:   "Human Resource Manager, Jecca Engineering (Pvt) Ltd",
};

// ── Design tokens ──────────────────────────────────────────────────────────────
// Navy is now used only for text/rules/accents — never as a solid fill block.
const T = {
  navy:       "#0a2a5e",
  navyMid:    "#1557b0",
  navyLight:  "#1a6fd4",
  navyBg:     "#f7f9fc",   // very faint tint, used sparingly
  navyBorder: "#bfdbfe",
  red:        "#b91c1c",
  redBg:      "#fdf5f5",
  redBorder:  "#f0c4c4",
  green:      "#15803d",
  greenBg:    "#f5faf6",
  greenBorder:"#cfe8d4",
  amber:      "#b45309",
  amberBg:    "#fcf8f1",
  amberBorder:"#ecdcb8",
  ink:        "#1a2233",
  muted:      "#5b6472",
  faint:      "#94a3b8",
  line:       "#dde3ea",
  lineFaint:  "#eef1f5",
  pageBg:     "#f0f4f8",
};

// ── Working hours constants ────────────────────────────────────────────────────
const WORK_START_H = 7;
const WORK_END_H   = 17;
const FULL_HOURS   = WORK_END_H - WORK_START_H;

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
      return Math.round(Math.max(0, WORK_END_H - arrH) * 100) / 100;
    }
    return FULL_HOURS - 1;
  }
  return 0;
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmtUSD(n) {
  return `$${Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
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
function fmtDateLong(dateStr) {
  if (!dateStr) return "—";
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
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

// ─────────────────────────────────────────────────────────────────────────────
// PDF generation — renders HTML off-screen then saves via jsPDF + html2canvas
// ─────────────────────────────────────────────────────────────────────────────
async function generateAndDownloadPDF(htmlContent, filename = "payslips.pdf") {
  const { default: jsPDF }       = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  // Pre-fetch logo → base64 to avoid canvas taint
  let logoDataUrl = null;
  try {
    const res  = await fetch(COMPANY.logo);
    const blob = await res.blob();
    logoDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { logoDataUrl = null; }

  let safeHtml = htmlContent;
  if (logoDataUrl) {
    safeHtml = safeHtml.replace(
      new RegExp(`src="${COMPANY.logo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
      `src="${logoDataUrl}"`
    );
  } else {
    safeHtml = safeHtml.replace(/<img[^>]*logo[^>]*>/gi, '');
  }

  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed","left:-9999px","top:0",
    "width:794px","background:#fff","z-index:-9999",
    "font-family:'DM Sans',sans-serif",
  ].join(";");
  container.innerHTML = safeHtml;
  document.body.appendChild(container);

  await new Promise(r => setTimeout(r, 600));

  const wrappers = container.querySelectorAll(".payslip-wrapper");
  const nodes    = wrappers.length > 0 ? Array.from(wrappers) : [container];

  const pdf    = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const A4_W   = 210;
  const A4_H   = 297;
  const MAX_PX = 3000;

  for (let i = 0; i < nodes.length; i++) {
    const node   = nodes[i];
    const nodeH  = node.getBoundingClientRect().height;
    const scale  = nodeH > 1200 ? 1 : 2;

    let canvas;
    try {
      canvas = await html2canvas(node, {
        scale, useCORS: true, allowTaint: false,
        backgroundColor: "#ffffff", logging: false,
        windowWidth: 794, width: 794,
      });
    } catch (err) { console.error("html2canvas failed", i, err); continue; }

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
    try { imgData = finalCanvas.toDataURL("image/jpeg", 0.88); }
    catch (err) { console.error("toDataURL failed:", err); continue; }

    const pxPerMm     = finalCanvas.width / A4_W;
    const imgHeightMm = finalCanvas.height / pxPerMm;

    if (i > 0) pdf.addPage();

    if (imgHeightMm <= A4_H) {
      pdf.addImage(imgData, "JPEG", 0, 0, A4_W, imgHeightMm);
    } else {
      let yOffset = 0, pageIndex = 0;
      while (yOffset < imgHeightMm) {
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, -yOffset, A4_W, imgHeightMm);
        yOffset += A4_H; pageIndex++;
      }
    }
  }

  document.body.removeChild(container);
  pdf.save(filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// PayslipDocument — the clean, printable payslip card shown on screen
// ─────────────────────────────────────────────────────────────────────────────
function PayslipDocument({ emp, year, month, attendanceRecs, payrollRecord, edits }) {
  const deduction       = parseFloat(edits?.deduction)       || 0;
  const bonus           = parseFloat(edits?.bonus)           || 0;
  const deductionReason = edits?.deductionReason             || "";

  const workingDays   = getWorkingDays(year, month);
  const basicSalary   = parseFloat(payrollRecord?.basic_salary) || 0;
  const allowances    = parseFloat(payrollRecord?.allowances)   || 0;
  const dailyRate     = workingDays > 0 ? basicSalary / workingDays : 0;
  const hourlyRate    = FULL_HOURS  > 0 ? dailyRate   / FULL_HOURS  : 0;

  const dayRecords = useMemo(() => {
    return attendanceRecs
      .filter(r => {
        const empId = typeof r.employee === "object" ? r.employee.id : r.employee;
        return empId === emp.id && isWorkingDay(r.date);
      })
      .sort((a,b) => a.date.localeCompare(b.date));
  }, [attendanceRecs, emp.id]);

  const presentRecs  = dayRecords.filter(r => ["present","late","half_day"].includes(r.status));
  const absentRecs   = dayRecords.filter(r => r.status === "absent");
  const daysAttended = presentRecs.reduce((s,r) => s + (r.status==="half_day"?0.5:1), 0);
  const daysAbsent   = absentRecs.length;
  const totalHours   = presentRecs.reduce((s,r) => s + hoursForRecord(r), 0);
  const lateRecs     = presentRecs.filter(r => r.status === "late");

  // Gross = attendance-prorated salary + allowances
  const attendanceEarning = dailyRate * daysAttended;
  const grossEarnings     = attendanceEarning + allowances + bonus;
  const totalDeductions   = deduction;
  const netPay            = Math.max(0, grossEarnings - totalDeductions);

  const fullName   = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
  const jobTitle   = emp.job_title || emp.position || "—";
  const department = emp.department_name || "—";
  const empNo      = emp.employee_number || emp.employee_id || emp.emp_id || `JE-${String(emp.id).padStart(3,"0")}`;
  const currency   = payrollRecord?.currency || "USD";
  const bankName   = currency === "ZIG" ? (payrollRecord?.bank_name_zig || emp.bank_name_zig || "—") : (payrollRecord?.bank_name_usd || emp.bank_name_usd || "—");
  const bankAcct   = currency === "ZIG" ? (payrollRecord?.bank_account_zig || emp.bank_account_zig || "—") : (payrollRecord?.bank_account_usd || emp.bank_account_usd || "—");
  const natId      = emp.national_id || emp.national_id_number || "—";
  const address    = emp.address || emp.home_address || "—";
  const joinDate   = emp.date_joined || emp.join_date || "";
  const payPeriod  = monthLabel(year, month);
  const today      = fmtDateLong(new Date().toISOString().slice(0,10));

  // ── Shared cell style ──
  const th = {
    padding: "10px 4px",
    background: "#fff",
    color: T.navy,
    fontWeight: 700,
    fontSize: 10.5,
    textAlign: "left",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderBottom: `1.5px solid ${T.navy}`,
  };
  const td = (right=false, bold=false, color=T.ink) => ({
    padding: "9px 4px",
    fontSize: 12.5,
    color,
    fontWeight: bold ? 700 : 400,
    textAlign: right ? "right" : "left",
    fontFamily: right ? "monospace" : "'DM Sans',sans-serif",
    borderBottom: `1px solid ${T.lineFaint}`,
  });
  const labelCell = {
    padding: "8px 4px",
    fontSize: 10.5,
    fontWeight: 700,
    color: T.muted,
    background: "#fff",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
    width: "28%",
    borderBottom: `1px solid ${T.lineFaint}`,
  };
  const valueCell = {
    padding: "8px 4px",
    fontSize: 12.5,
    color: T.ink,
    borderBottom: `1px solid ${T.lineFaint}`,
    background: "#fff",
  };

  return (
    <div
      className="payslip-card"
      style={{
        position: "relative",
        background: "#fff",
        border: `1px solid ${T.line}`,
        borderRadius: 2,
        boxShadow: "0 4px 24px rgba(10,42,94,0.08)",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
        maxWidth: 794,
        width: "100%",
        margin: "0 auto",
        padding: "44px 48px",
      }}
    >
      {/* ── WATERMARK: centred, faint, behind all content ── */}
      <img
        src={COMPANY.logo}
        alt=""
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 380,
          height: 380,
          objectFit: "contain",
          opacity: 0.06,
          pointerEvents: "none",
          zIndex: 0,
        }}
        onError={e => { e.target.style.display = "none"; }}
      />

      {/* ── Content sits above the watermark ── */}
      <div style={{ position: "relative", zIndex: 1 }}>

      {/* ── HEADER: Logo + Company + Title ── */}
      <div style={{ paddingBottom: 18, borderBottom: `2px solid ${T.navy}`, marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 62, height: 62, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img
                src={COMPANY.logo}
                alt={COMPANY.name}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                onError={e => {
                  e.target.style.display = "none";
                  e.target.parentElement.innerHTML = `<div style="width:62px;height:62px;border:1.5px solid ${T.navy};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:${T.navy}">J</div>`;
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.navy, letterSpacing: "0.01em", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.15 }}>
                {COMPANY.name}
              </div>
              <div style={{ fontSize: 11.5, color: T.muted, fontStyle: "italic", marginTop: 2 }}>{COMPANY.tagline}</div>
              <div style={{ fontSize: 10.5, color: T.faint, marginTop: 4, lineHeight: 1.6 }}>
                {COMPANY.address} &nbsp;·&nbsp; {COMPANY.phone} &nbsp;·&nbsp; {COMPANY.email}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.navy, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Payslip
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginTop: 3 }}>
              {payPeriod}
            </div>
          </div>
        </div>
      </div>

      {/* ── EMPLOYEE DETAILS TABLE ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <tbody>
          <tr>
            <td style={labelCell}>Employee Name</td>
            <td style={{ ...valueCell, fontWeight: 700, fontSize: 13 }}>{fullName}</td>
            <td style={labelCell}>Pay Period</td>
            <td style={{ ...valueCell, fontWeight: 600 }}>{payPeriod}</td>
          </tr>
          <tr>
            <td style={labelCell}>Employee No.</td>
            <td style={valueCell}>{empNo}</td>
            <td style={labelCell}>Department</td>
            <td style={valueCell}>{department}</td>
          </tr>
          {natId !== "—" && (
            <tr>
              <td style={labelCell}>National ID</td>
              <td style={valueCell}>{natId}</td>
              <td style={labelCell}>Position</td>
              <td style={valueCell}>{jobTitle}</td>
            </tr>
          )}
          {natId === "—" && (
            <tr>
              <td style={labelCell}>Position</td>
              <td style={valueCell}>{jobTitle}</td>
              <td style={labelCell}>Date Joined</td>
              <td style={valueCell}>{joinDate ? fmtDate(joinDate) : "—"}</td>
            </tr>
          )}
          <tr>
            <td style={labelCell}>Address</td>
            <td style={valueCell}>{address}</td>
            <td style={labelCell}>Payment Method</td>
            <td style={valueCell}>
              {bankName !== "—" ? `Bank Transfer — ${bankName}` : "Cash / Bank Transfer"}
            </td>
          </tr>
          {bankAcct !== "—" && (
            <tr>
              <td style={labelCell}>Bank Account</td>
              <td style={{ ...valueCell, fontFamily: "monospace", letterSpacing: "0.04em" }}>{bankAcct}</td>
              <td style={labelCell}>Attendance</td>
              <td style={valueCell}>{daysAttended} / {workingDays} days
                {daysAbsent > 0 && <span style={{ marginLeft: 8, color: T.red, fontSize: 11 }}>({daysAbsent} absent)</span>}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── EARNINGS & DEDUCTIONS TABLE ── */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: "50%" }}>Description</th>
            <th style={{ ...th, textAlign: "right" }}>Earnings ({currency})</th>
            <th style={{ ...th, textAlign: "right" }}>Deductions ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {/* Basic salary row */}
          <tr>
            <td style={td()}>Basic Salary (Monthly)</td>
            <td style={td(true)}>{fmtUSD(basicSalary)}</td>
            <td style={td(true)}>—</td>
          </tr>
          {/* Attendance-prorated row */}
          <tr>
            <td style={td()}>
              Attendance Earnings
              <span style={{ marginLeft: 8, fontSize: 11, color: T.faint }}>
                ({daysAttended} of {workingDays} days × {fmtUSD(dailyRate)}/day)
              </span>
            </td>
            <td style={td(true)}>{fmtUSD(attendanceEarning)}</td>
            <td style={td(true)}>—</td>
          </tr>
          {/* Hours summary row */}
          <tr>
            <td style={td()}>
              Total Hours Worked
              <span style={{ marginLeft: 8, fontSize: 11, color: T.faint }}>
                ({fmtUSD(hourlyRate)}/hr)
              </span>
            </td>
            <td style={{ ...td(true), color: T.muted }}>{fmtHours(totalHours)}</td>
            <td style={td(true)}>—</td>
          </tr>
          {/* Allowances */}
          {allowances > 0 && (
            <tr>
              <td style={td()}>Allowances</td>
              <td style={td(true)}>{fmtUSD(allowances)}</td>
              <td style={td(true)}>—</td>
            </tr>
          )}
          {/* Bonus */}
          {bonus > 0 && (
            <tr>
              <td style={{ ...td(), color: T.green }}>Bonus</td>
              <td style={{ ...td(true), color: T.green, fontWeight: 700 }}>{fmtUSD(bonus)}</td>
              <td style={td(true)}>—</td>
            </tr>
          )}
          {/* Late penalties info */}
          {lateRecs.length > 0 && (
            <tr>
              <td style={{ ...td(), color: T.amber }}>
                Late Arrivals ({lateRecs.length} day{lateRecs.length > 1 ? "s" : ""})
                <span style={{ marginLeft: 6, fontSize: 11, color: T.amber }}>— hours reduced accordingly</span>
              </td>
              <td style={{ ...td(true), color: T.amber }}>—</td>
              <td style={{ ...td(true), color: T.amber }}>Note</td>
            </tr>
          )}
          {/* Deduction */}
          {deduction > 0 ? (
            <tr>
              <td style={{ ...td(), color: T.red }}>
                Deduction{deductionReason ? ` — ${deductionReason}` : ""}
              </td>
              <td style={td(true)}>—</td>
              <td style={{ ...td(true), color: T.red, fontWeight: 700 }}>{fmtUSD(deduction)}</td>
            </tr>
          ) : (
            <tr>
              <td style={{ ...td(), color: T.faint, fontStyle: "italic" }}>No deductions this period</td>
              <td style={td(true)}>—</td>
              <td style={{ ...td(true), color: T.faint }}>—</td>
            </tr>
          )}
        </tbody>
        {/* Totals footer */}
        <tfoot>
          <tr style={{ borderTop: `1.5px solid ${T.navy}` }}>
            <td style={{ padding: "12px 4px", fontWeight: 800, fontSize: 12.5, color: T.navy, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Gross Earnings
            </td>
            <td style={{ padding: "12px 4px", fontWeight: 800, fontSize: 13.5, color: T.navy, textAlign: "right", fontFamily: "monospace" }}>
              {fmtUSD(grossEarnings)}
            </td>
            <td style={{ padding: "12px 4px", fontWeight: 800, fontSize: 12.5, color: deduction > 0 ? T.red : T.faint, textAlign: "right", fontFamily: "monospace" }}>
              {deduction > 0 ? fmtUSD(deduction) : "—"}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ── NET PAY BAND ── */}
      <div style={{
        marginTop: 18,
        padding: "16px 0",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderTop: `2px solid ${T.navy}`,
        borderBottom: `2px solid ${T.navy}`,
      }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.navy, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Net Pay
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: T.navy, letterSpacing: "0.01em", fontFamily: "'DM Sans', sans-serif" }}>
          {fmtUSD(netPay)} {currency}
        </div>
      </div>

      {/* ── LATE ARRIVALS DETAIL ── */}
      {lateRecs.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.amber, marginBottom: 8 }}>
            Late Arrival Details
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {lateRecs.map(r => (
              <div key={r.date} style={{
                fontSize: 11, background: "#fff",
                border: `1px solid ${T.amberBorder}`,
                borderRadius: 4, padding: "3px 10px", color: T.amber, fontWeight: 600,
              }}>
                {fmtDate(r.date)}{r.arrival_time ? ` · in ${r.arrival_time.slice(0,5)}` : ""} · {fmtHours(hoursForRecord(r))} worked
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AUTHORISED BY ── */}
      <div style={{ marginTop: 36 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 28 }}>Authorised By:</div>
        <div style={{ borderTop: `1px solid ${T.ink}`, width: 300, paddingTop: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.navy }}>{COMPANY.hrManager}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>— {COMPANY.hrTitle}</div>
        </div>
        <div style={{
          marginTop: 28, paddingTop: 14, borderTop: `1px solid ${T.lineFaint}`,
          fontSize: 10, color: T.faint, fontStyle: "italic", textAlign: "center",
        }}>
          This payslip is computer generated and is valid without a signature. &nbsp;·&nbsp; Generated: {today} &nbsp;·&nbsp; {COMPANY.name} — Confidential
        </div>
      </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML string builder for PDF (mirrors PayslipDocument layout)
// ─────────────────────────────────────────────────────────────────────────────
function buildPayslipHTMLString({ emp, year, month, attAll, payrollRecord, edits }) {
  const deduction       = parseFloat(edits?.deduction)       || 0;
  const bonus           = parseFloat(edits?.bonus)           || 0;
  const deductionReason = edits?.deductionReason             || "";

  const workingDays       = getWorkingDays(year, month);
  const basicSalary       = parseFloat(payrollRecord?.basic_salary) || 0;
  const allowances        = parseFloat(payrollRecord?.allowances)   || 0;
  const dailyRate         = workingDays > 0 ? basicSalary / workingDays : 0;
  const hourlyRate        = FULL_HOURS  > 0 ? dailyRate   / FULL_HOURS  : 0;

  const empRecs = attAll
    .filter(r => {
      const eid = typeof r.employee === "object" ? r.employee.id : r.employee;
      return eid === emp.id && isWorkingDay(r.date);
    })
    .sort((a,b) => a.date.localeCompare(b.date));

  const presentRecs       = empRecs.filter(r => ["present","late","half_day"].includes(r.status));
  const absentRecs        = empRecs.filter(r => r.status === "absent");
  const daysAttended      = presentRecs.reduce((s,r) => s + (r.status==="half_day"?0.5:1), 0);
  const daysAbsent        = absentRecs.length;
  const totalHours        = presentRecs.reduce((s,r) => s + hoursForRecord(r), 0);
  const lateRecs          = presentRecs.filter(r => r.status === "late");
  const attendanceEarning = dailyRate * daysAttended;
  const grossEarnings     = attendanceEarning + allowances + bonus;
  const netPay            = Math.max(0, grossEarnings - deduction);

  const fullName   = emp.full_name || [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" ") || "—";
  const jobTitle   = emp.job_title || emp.position || "—";
  const department = emp.department_name || "—";
  const empNo      = emp.employee_number || emp.employee_id || emp.emp_id || `JE-${String(emp.id).padStart(3,"0")}`;
  const currency   = payrollRecord?.currency || "USD";
  const bankName   = currency === "ZIG" ? (payrollRecord?.bank_name_zig || emp.bank_name_zig || "—") : (payrollRecord?.bank_name_usd || emp.bank_name_usd || "—");
  const bankAcct   = currency === "ZIG" ? (payrollRecord?.bank_account_zig || emp.bank_account_zig || "—") : (payrollRecord?.bank_account_usd || emp.bank_account_usd || "—");
  const natId      = emp.national_id || emp.national_id_number || "";
  const address    = emp.address || emp.home_address || "—";
  const joinDate   = emp.date_joined || emp.join_date || "";
  const payPeriod  = monthLabel(year, month);
  const today      = fmtDateLong(new Date().toISOString().slice(0,10));

  const N = T.navy;
  const labelSt = `background:#fff;color:${T.muted};padding:8px 4px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;width:28%;border-bottom:1px solid ${T.lineFaint};`;
  const valueSt = `background:#fff;color:${T.ink};padding:8px 4px;font-size:12.5px;border-bottom:1px solid ${T.lineFaint};`;
  const thSt    = `background:#fff;color:${N};padding:10px 4px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-bottom:1.5px solid ${N};`;
  const tdSt    = `padding:9px 4px;font-size:12.5px;color:${T.ink};border-bottom:1px solid ${T.lineFaint};background:#fff;`;

  const lateDetailHTML = lateRecs.length > 0 ? `
    <div style="margin-top:18px">
      <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${T.amber};margin-bottom:8px">Late Arrival Details</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${lateRecs.map(r=>`<div style="font-size:11px;background:#fff;border:1px solid ${T.amberBorder};border-radius:4px;padding:3px 10px;color:${T.amber};font-weight:600">${fmtDate(r.date)}${r.arrival_time?` · in ${r.arrival_time.slice(0,5)}`:""} · ${fmtHours(hoursForRecord(r))} worked</div>`).join("")}
      </div>
    </div>` : "";

  return `
<div class="payslip-wrapper" style="position:relative;font-family:'DM Sans',Arial,sans-serif;background:#fff;overflow:hidden;border:1px solid ${T.line};max-width:794px;margin:0 auto;padding:44px 48px;box-sizing:border-box">
  <img src="${COMPANY.logo}" alt="" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:380px;height:380px;object-fit:contain;opacity:0.06;pointer-events:none;z-index:0" onerror="this.style.display='none'" />
  <div style="position:relative;z-index:1">
  <!-- HEADER -->
  <div style="padding-bottom:18px;border-bottom:2px solid ${N};margin-bottom:22px;display:flex;align-items:center;justify-content:space-between;gap:18px">
    <div style="display:flex;align-items:center;gap:16px">
      <div style="width:62px;height:62px;flex-shrink:0;display:flex;align-items:center;justify-content:center">
        <img src="${COMPANY.logo}" alt="${COMPANY.name}" style="width:100%;height:100%;object-fit:contain"
          onerror="this.style.display='none';this.parentElement.innerHTML='<div style=width:62px;height:62px;border:1.5px solid ${N};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:${N}>J</div>'" />
      </div>
      <div>
        <div style="font-size:18px;font-weight:800;color:${N};letter-spacing:.01em;line-height:1.15">${COMPANY.name}</div>
        <div style="font-size:11.5px;color:${T.muted};font-style:italic;margin-top:2px">${COMPANY.tagline}</div>
        <div style="font-size:10.5px;color:${T.faint};margin-top:4px;line-height:1.6">${COMPANY.address} &nbsp;·&nbsp; ${COMPANY.phone} &nbsp;·&nbsp; ${COMPANY.email}</div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:14px;font-weight:800;color:${N};letter-spacing:.14em;text-transform:uppercase">Payslip</div>
      <div style="font-size:12px;font-weight:600;color:${T.muted};margin-top:3px">${payPeriod}</div>
    </div>
  </div>
  <!-- EMPLOYEE DETAILS -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tbody>
      <tr>
        <td style="${labelSt}">Employee Name</td><td style="${valueSt}font-weight:700;font-size:13px">${fullName}</td>
        <td style="${labelSt}">Pay Period</td><td style="${valueSt}font-weight:600">${payPeriod}</td>
      </tr>
      <tr>
        <td style="${labelSt}">Employee No.</td><td style="${valueSt}">${empNo}</td>
        <td style="${labelSt}">Department</td><td style="${valueSt}">${department}</td>
      </tr>
      ${natId ? `<tr>
        <td style="${labelSt}">National ID</td><td style="${valueSt}">${natId}</td>
        <td style="${labelSt}">Position</td><td style="${valueSt}">${jobTitle}</td>
      </tr>` : `<tr>
        <td style="${labelSt}">Position</td><td style="${valueSt}">${jobTitle}</td>
        <td style="${labelSt}">Date Joined</td><td style="${valueSt}">${joinDate ? fmtDate(joinDate) : "—"}</td>
      </tr>`}
      <tr>
        <td style="${labelSt}">Address</td><td style="${valueSt}">${address}</td>
        <td style="${labelSt}">Payment Method</td><td style="${valueSt}">${bankName !== "—" ? `Bank Transfer — ${bankName}` : "Cash / Bank Transfer"}</td>
      </tr>
      ${bankAcct !== "—" ? `<tr>
        <td style="${labelSt}">Bank Account</td><td style="${valueSt}font-family:monospace;letter-spacing:.04em">${bankAcct}</td>
        <td style="${labelSt}">Attendance</td><td style="${valueSt}">${daysAttended} / ${workingDays} days${daysAbsent > 0 ? ` <span style="margin-left:8px;color:${T.red};font-size:11px">(${daysAbsent} absent)</span>` : ""}</td>
      </tr>` : ""}
    </tbody>
  </table>
  <!-- EARNINGS / DEDUCTIONS TABLE -->
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr>
        <th style="${thSt}width:50%">Description</th>
        <th style="${thSt}text-align:right">Earnings (${currency})</th>
        <th style="${thSt}text-align:right">Deductions (${currency})</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="${tdSt}">Basic Salary (Monthly)</td>
        <td style="${tdSt}text-align:right;font-family:monospace">${fmtUSD(basicSalary)}</td>
        <td style="${tdSt}text-align:right">—</td>
      </tr>
      <tr>
        <td style="${tdSt}">Attendance Earnings <span style="margin-left:8px;font-size:11px;color:${T.faint}">(${daysAttended} of ${workingDays} days × ${fmtUSD(dailyRate)}/day)</span></td>
        <td style="${tdSt}text-align:right;font-family:monospace">${fmtUSD(attendanceEarning)}</td>
        <td style="${tdSt}text-align:right">—</td>
      </tr>
      <tr>
        <td style="${tdSt}">Total Hours Worked <span style="margin-left:8px;font-size:11px;color:${T.faint}">(${fmtUSD(hourlyRate)}/hr)</span></td>
        <td style="${tdSt}text-align:right;color:${T.muted}">${fmtHours(totalHours)}</td>
        <td style="${tdSt}text-align:right">—</td>
      </tr>
      ${allowances > 0 ? `<tr>
        <td style="${tdSt}">Allowances</td>
        <td style="${tdSt}text-align:right;font-family:monospace">${fmtUSD(allowances)}</td>
        <td style="${tdSt}text-align:right">—</td>
      </tr>` : ""}
      ${bonus > 0 ? `<tr>
        <td style="${tdSt}color:${T.green}">Bonus</td>
        <td style="${tdSt}text-align:right;font-family:monospace;font-weight:700;color:${T.green}">${fmtUSD(bonus)}</td>
        <td style="${tdSt}text-align:right">—</td>
      </tr>` : ""}
      ${lateRecs.length > 0 ? `<tr>
        <td style="${tdSt}color:${T.amber}">Late Arrivals (${lateRecs.length} day${lateRecs.length>1?"s":""}) — hours reduced accordingly</td>
        <td style="${tdSt}text-align:right;color:${T.amber}">—</td>
        <td style="${tdSt}text-align:right;color:${T.amber}">Note</td>
      </tr>` : ""}
      ${deduction > 0 ? `<tr>
        <td style="${tdSt}color:${T.red}">Deduction${deductionReason ? ` — ${deductionReason}` : ""}</td>
        <td style="${tdSt}text-align:right">—</td>
        <td style="${tdSt}text-align:right;font-family:monospace;font-weight:700;color:${T.red}">${fmtUSD(deduction)}</td>
      </tr>` : `<tr>
        <td style="${tdSt}color:${T.faint};font-style:italic">No deductions this period</td>
        <td style="${tdSt}text-align:right">—</td>
        <td style="${tdSt}text-align:right;color:${T.faint}">—</td>
      </tr>`}
    </tbody>
    <tfoot>
      <tr style="border-top:1.5px solid ${N}">
        <td style="padding:12px 4px;font-weight:800;font-size:12.5px;color:${N};text-transform:uppercase;letter-spacing:.04em">Gross Earnings</td>
        <td style="padding:12px 4px;font-weight:800;font-size:13.5px;color:${N};text-align:right;font-family:monospace">${fmtUSD(grossEarnings)}</td>
        <td style="padding:12px 4px;font-weight:800;font-size:12.5px;color:${deduction > 0 ? T.red : T.faint};text-align:right;font-family:monospace">${deduction > 0 ? fmtUSD(deduction) : "—"}</td>
      </tr>
    </tfoot>
  </table>
  <!-- NET PAY BAND -->
  <div style="margin-top:18px;padding:16px 0;display:flex;align-items:center;justify-content:space-between;border-top:2px solid ${N};border-bottom:2px solid ${N}">
    <div style="font-size:13.5px;font-weight:700;color:${N};text-transform:uppercase;letter-spacing:.1em">Net Pay (Take Home)</div>
    <div style="font-size:24px;font-weight:800;color:${N};letter-spacing:.01em">${fmtUSD(netPay)} ${currency}</div>
  </div>
  ${lateDetailHTML}
  <!-- AUTHORISED BY -->
  <div style="margin-top:36px">
    <div style="font-size:12px;font-weight:700;color:${T.ink};margin-bottom:28px">Authorised By:</div>
    <div style="border-top:1px solid ${T.ink};width:300px;padding-top:6px">
      <div style="font-size:12.5px;font-weight:600;color:${N}">${COMPANY.hrManager}</div>
      <div style="font-size:11px;color:${T.muted};margin-top:2px">— ${COMPANY.hrTitle}</div>
    </div>
    <div style="margin-top:28px;padding-top:14px;border-top:1px solid ${T.lineFaint};font-size:10px;color:${T.faint};font-style:italic;text-align:center">
      This payslip is computer generated and is valid without a signature. &nbsp;·&nbsp; Generated: ${today} &nbsp;·&nbsp; ${COMPANY.name} — Confidential
    </div>
  </div>
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main PayslipsPage
// ─────────────────────────────────────────────────────────────────────────────
export default function HRPayslipsPage({ showToast }) {
  const { employees: ctxEmployees, departments: ctxDepartments, loading: ctxLoading } = useHRPortal();

  const now = new Date();
  const [viewYear,     setViewYear]     = useState(now.getFullYear());
  const [viewMonth,    setViewMonth]    = useState(now.getMonth());
  const [search,       setSearch]       = useState("");
  const [payrolls,     setPayrolls]     = useState([]);
  const [attAll,       setAttAll]       = useState([]);
  const [dataLoading,  setDataLoading]  = useState(true);
  const [payrollEdits, setPayrollEdits] = useState({});
  const [generating,   setGenerating]   = useState(false);

  const monthStart = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-01`;
  const lastDay    = new Date(viewYear, viewMonth+1, 0).getDate();
  const monthEnd   = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true); setAttAll([]);
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
    const viewedMonthEnd = new Date(viewYear, viewMonth + 1, 0);
    return employees.filter(emp => {
      if (emp.date_joined) {
        const [jY, jM, jD] = emp.date_joined.split("-").map(Number);
        if (new Date(jY, jM - 1, jD) > viewedMonthEnd) return false;
      }
      const name  = (emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ")).toLowerCase();
      const dept  = (emp.department_name || "").toLowerCase();
      const title = (emp.job_title || emp.position || "").toLowerCase();
      return !q || name.includes(q) || dept.includes(q) || title.includes(q);
    });
  }, [employees, search, viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); }
    else setViewMonth(m => m-1);
  };
  const nextMonth = () => {
    const nm = viewMonth === 11 ? 0 : viewMonth + 1;
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth())) return;
    setViewYear(ny); setViewMonth(nm);
  };
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const buildHTML = useCallback((emp) => {
    return buildPayslipHTMLString({
      emp,
      year: viewYear,
      month: viewMonth,
      attAll,
      payrollRecord: payrollMap[emp.id],
      edits: payrollEdits[emp.id] || {},
    });
  }, [payrollMap, payrollEdits, attAll, viewYear, viewMonth]);

  const handleDownloadOne = useCallback((emp) => {
    setGenerating(true);
    (async () => {
      try {
        const name     = (emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join("_")).replace(/\s+/g,"_");
        const monthStr = new Date(viewYear, viewMonth, 1).toLocaleString("en-US",{month:"long",year:"numeric"});
        await generateAndDownloadPDF(buildHTML(emp), `Payslip_${name}_${monthStr}.pdf`);
      } catch(err) {
        console.error("PDF generation failed:", err);
        alert("PDF generation failed. Please try again.");
      } finally { setGenerating(false); }
    })();
  }, [buildHTML, viewYear, viewMonth]);

  const handleDownloadAll = useCallback(() => {
    if (filtered.length === 0) return;
    setGenerating(true);
    (async () => {
      try {
        const html     = filtered.map(emp => buildHTML(emp)).join("\n");
        const monthStr = new Date(viewYear, viewMonth, 1).toLocaleString("en-US",{month:"long",year:"numeric"});
        await generateAndDownloadPDF(html, `Payslips_${monthStr}.pdf`);
      } catch(err) {
        console.error("PDF generation failed:", err);
        alert("PDF generation failed. Please try again.");
      } finally { setGenerating(false); }
    })();
  }, [filtered, buildHTML, viewYear, viewMonth]);

  const loading = ctxLoading?.employees || dataLoading || !ctxEmployees;

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes spin     { to   { transform:rotate(360deg); } }
        .payslip-dl-btn:hover { border-color: ${T.navyMid} !important; color: ${T.navyMid} !important; background: ${T.navyBg} !important; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeInUp .3s ease" }}>

        {/* ── Page Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
          background: "#fff", borderRadius: 14, border: `1px solid ${T.line}`,
          padding: "16px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.navy, fontFamily: "'DM Sans',sans-serif" }}>
              Payslips
            </h1>
            <div style={{ fontSize: 12, color: T.faint, marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>
              {monthLabel(viewYear, viewMonth)} · {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* Month navigator */}
            <div style={{ display: "flex", alignItems: "center", background: "#fff", border: `1.5px solid ${T.line}`, borderRadius: 10, padding: "3px 5px", gap: 2 }}>
              <button onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, padding: "5px 9px", borderRadius: 7, display: "flex" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.navy, fontFamily: "'DM Sans',sans-serif", minWidth: 128, textAlign: "center" }}>
                {monthLabel(viewYear, viewMonth)}
                {isCurrentMonth && (
                  <span style={{ marginLeft: 6, background: "#dcfce7", color: "#166534", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>Now</span>
                )}
              </span>
              <button
                onClick={nextMonth}
                disabled={isCurrentMonth}
                style={{ background: "none", border: "none", cursor: isCurrentMonth ? "not-allowed" : "pointer", color: isCurrentMonth ? T.line : T.muted, padding: "5px 9px", borderRadius: 7, display: "flex" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            {/* Search */}
            <div style={{ position: "relative" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.faint} strokeWidth="2.2" strokeLinecap="round"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search employees…"
                style={{
                  paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                  border: `1.5px solid ${T.line}`, borderRadius: 9, fontSize: 13,
                  fontFamily: "'DM Sans',sans-serif", outline: "none",
                  background: "#fafbff", color: T.ink, width: 190,
                }}
                onFocus={e => { e.target.style.borderColor = T.navyMid; e.target.style.boxShadow = "0 0 0 3px rgba(21,87,176,0.1)"; }}
                onBlur={e => { e.target.style.borderColor = T.line; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Download all */}
            <button
              onClick={handleDownloadAll}
              disabled={loading || generating || filtered.length === 0}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 18px", borderRadius: 10,
                background: `linear-gradient(135deg,${T.navy},${T.navyMid})`,
                border: "none", color: "#fff", fontSize: 13, fontWeight: 700,
                fontFamily: "'DM Sans',sans-serif",
                cursor: loading || generating || filtered.length === 0 ? "not-allowed" : "pointer",
                opacity: loading || generating || filtered.length === 0 ? 0.5 : 1,
                boxShadow: "0 2px 8px rgba(10,42,94,0.2)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {generating ? "Generating…" : `Download All (${filtered.length})`}
            </button>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"60px 0", gap:12, color:T.faint, fontFamily:"'DM Sans',sans-serif" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.navyMid} strokeWidth="2.5" strokeLinecap="round" style={{ animation:"spin 0.8s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Loading payslips…
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:"60px 0", color:T.faint, fontFamily:"'DM Sans',sans-serif", fontSize:14 }}>
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
          const empName = emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") || "—";

          return (
            <div key={emp.id} style={{ display:"flex", flexDirection:"column" }}>
              {/* Per-payslip toolbar */}
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"8px 14px",
                background: `linear-gradient(90deg, ${T.navy} 0%, ${T.navyMid} 100%)`,
                borderRadius: "12px 12px 0 0",
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{
                    width:28, height:28, borderRadius:7,
                    background:"rgba(255,255,255,0.18)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:12, fontWeight:800, color:"#fff",
                    fontFamily:"'DM Sans',sans-serif", flexShrink:0,
                  }}>
                    {empName.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:"#fff", fontFamily:"'DM Sans',sans-serif" }}>
                    {empName}
                  </span>
                  {payRec && (
                    <span style={{ fontSize:11, color:"rgba(255,255,255,0.55)", fontFamily:"'DM Sans',sans-serif" }}>
                      · {payRec.bank_name_usd || payRec.bank_name_zig || ""}
                    </span>
                  )}
                </div>
                <button
                  className="payslip-dl-btn"
                  onClick={() => handleDownloadOne(emp)}
                  disabled={generating}
                  style={{
                    display:"flex", alignItems:"center", gap:6,
                    padding:"6px 14px", borderRadius:8,
                    border:"1.5px solid rgba(255,255,255,0.35)",
                    background:"rgba(255,255,255,0.1)",
                    fontSize:12, fontWeight:600, color:"#fff",
                    fontFamily:"'DM Sans',sans-serif",
                    cursor: generating ? "not-allowed" : "pointer",
                    opacity: generating ? 0.5 : 1,
                    transition:"border-color .15s, color .15s, background .15s",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download PDF
                </button>
              </div>

              {/* Payslip document */}
              <PayslipDocument
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
          position:"fixed", inset:0, background:"rgba(10,42,94,0.6)",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          zIndex:9999, gap:14,
        }}>
          <div style={{
            background:"#fff", borderRadius:16, padding:"32px 40px",
            textAlign:"center", boxShadow:"0 24px 64px rgba(0,0,0,0.2)",
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={T.navyMid} strokeWidth="2.5" strokeLinecap="round" style={{ animation:"spin 0.8s linear infinite", marginBottom:12 }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <div style={{ color:T.navy, fontFamily:"'DM Sans',sans-serif", fontSize:16, fontWeight:700 }}>Generating PDF…</div>
            <div style={{ color:T.faint, fontFamily:"'DM Sans',sans-serif", fontSize:12, marginTop:6 }}>Please wait while your payslip is being prepared.</div>
          </div>
        </div>
      )}
    </>
  );
}